use std::{sync::Arc, time::Duration as StdDuration};

use anyhow::Error as AnyhowError;
use chrono::{Duration, Utc};
use rand::{Rng, distributions::Alphanumeric};
use reqwest::StatusCode;
use sqlx::PgPool;
use thiserror::Error;
use tokio::time::sleep;
use tracing::warn;
use uuid::Uuid;

use super::{
    ProviderRegistry,
    jwt::{JwtError, JwtService},
    provider::{DeviceAccessGrant, DeviceCodeResponse, ProviderAuthorization, ProviderUser},
};
use crate::{
    configure_user_scope,
    db::{
        auth::{AuthSessionError, AuthSessionRepository},
        identity::{IdentityError, IdentityRepository, UpsertUser},
        oauth::{
            AuthorizationStatus, CreateDeviceAuthorization, DeviceAuthorization,
            DeviceAuthorizationError, DeviceAuthorizationRepository,
        },
        oauth_accounts::{OAuthAccountError, OAuthAccountInsert, OAuthAccountRepository},
    },
};

const SESSION_SECRET_LENGTH: usize = 48;
const USER_FETCH_MAX_ATTEMPTS: usize = 5;
const USER_FETCH_RETRY_DELAY_MS: u64 = 500;

#[derive(Debug, Error)]
pub enum DeviceFlowError {
    #[error("unsupported provider `{0}`")]
    UnsupportedProvider(String),
    #[error("device authorization not found")]
    NotFound,
    #[error("device authorization expired")]
    Expired,
    #[error("device authorization denied")]
    Denied,
    #[error("device authorization failed: {0}")]
    Failed(String),
    #[error(transparent)]
    Provider(#[from] AnyhowError),
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error(transparent)]
    Identity(#[from] IdentityError),
    #[error(transparent)]
    OAuthAccount(#[from] OAuthAccountError),
    #[error(transparent)]
    Session(#[from] AuthSessionError),
    #[error(transparent)]
    Jwt(#[from] JwtError),
    #[error(transparent)]
    Authorization(#[from] DeviceAuthorizationError),
}

#[derive(Debug, Clone)]
pub struct DeviceFlowInitResponse {
    pub verification_uri: String,
    pub verification_uri_complete: Option<String>,
    pub user_code: String,
    pub handoff_id: Uuid,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DeviceFlowPollStatus {
    Pending,
    Success,
    Error,
}

#[derive(Debug, Clone)]
pub struct DeviceFlowPollResponse {
    pub status: DeviceFlowPollStatus,
    pub access_token: Option<String>,
    pub error: Option<String>,
}

pub struct DeviceFlowService {
    pool: PgPool,
    providers: Arc<ProviderRegistry>,
    jwt: Arc<JwtService>,
}

impl DeviceFlowService {
    pub fn new(pool: PgPool, providers: Arc<ProviderRegistry>, jwt: Arc<JwtService>) -> Self {
        Self {
            pool,
            providers,
            jwt,
        }
    }

    pub async fn initiate(
        &self,
        provider: &str,
    ) -> Result<DeviceFlowInitResponse, DeviceFlowError> {
        let provider = self
            .providers
            .get(provider)
            .ok_or_else(|| DeviceFlowError::UnsupportedProvider(provider.to_string()))?;

        let response = provider
            .request_device_code(provider.scopes())
            .await
            .map_err(DeviceFlowError::Provider)?;

        self.record_init(provider.name(), response).await
    }

    async fn record_init(
        &self,
        provider_name: &str,
        response: DeviceCodeResponse,
    ) -> Result<DeviceFlowInitResponse, DeviceFlowError> {
        let expires_at = Utc::now() + response.expires_in;
        let repo = DeviceAuthorizationRepository::new(&self.pool);
        let record = repo
            .create(CreateDeviceAuthorization {
                provider: provider_name,
                device_code: &response.device_code,
                user_code: &response.user_code,
                verification_uri: &response.verification_uri,
                verification_uri_complete: response.verification_uri_complete.as_deref(),
                expires_at,
                polling_interval: response.interval,
            })
            .await?;

        Ok(DeviceFlowInitResponse {
            verification_uri: record.verification_uri,
            verification_uri_complete: record.verification_uri_complete,
            user_code: record.user_code,
            handoff_id: record.id,
        })
    }

    pub async fn poll(&self, handoff_id: Uuid) -> Result<DeviceFlowPollResponse, DeviceFlowError> {
        let repo = DeviceAuthorizationRepository::new(&self.pool);
        let record = repo.get(handoff_id).await.map_err(|err| match err {
            DeviceAuthorizationError::NotFound => DeviceFlowError::NotFound,
            DeviceAuthorizationError::Database(inner) => inner.into(),
        })?;

        match record.status() {
            Some(AuthorizationStatus::Success) => self.handle_success(record).await,
            Some(AuthorizationStatus::Error) => Ok(DeviceFlowPollResponse {
                status: DeviceFlowPollStatus::Error,
                access_token: None,
                error: record.error_code,
            }),
            Some(AuthorizationStatus::Expired) => Err(DeviceFlowError::Expired),
            _ => self.advance_pending(record).await,
        }
    }

    async fn handle_success(
        &self,
        record: DeviceAuthorization,
    ) -> Result<DeviceFlowPollResponse, DeviceFlowError> {
        let session_id = record
            .session_id
            .ok_or_else(|| DeviceFlowError::Failed("authorization missing session".into()))?;

        let session_repo = AuthSessionRepository::new(&self.pool);
        let session = session_repo.get(session_id).await?;
        if session.revoked_at.is_some() {
            return Err(DeviceFlowError::Denied);
        }

        let identity_repo = IdentityRepository::new(&self.pool);
        let user = identity_repo.fetch_user(&session.user_id).await?;
        let organization = identity_repo
            .ensure_personal_org_and_admin_membership(&session.user_id, user.username.as_deref())
            .await?;

        let token = self.jwt.encode(&session, &user, &organization)?;
        session_repo.touch(session.id).await?;
        configure_user_scope(
            &user.id,
            user.username.as_deref(),
            Some(user.email.as_str()),
        );

        Ok(DeviceFlowPollResponse {
            status: DeviceFlowPollStatus::Success,
            access_token: Some(token),
            error: None,
        })
    }

    async fn advance_pending(
        &self,
        record: DeviceAuthorization,
    ) -> Result<DeviceFlowPollResponse, DeviceFlowError> {
        let repo = DeviceAuthorizationRepository::new(&self.pool);
        let now = Utc::now();
        if record.expires_at <= now {
            repo.set_status(
                record.id,
                AuthorizationStatus::Expired,
                Some("expired_token"),
            )
            .await?;
            return Err(DeviceFlowError::Expired);
        }

        if let Some(last_polled_at) = record.last_polled_at {
            let next_allowed = last_polled_at + Duration::seconds(record.polling_interval as i64);
            if now < next_allowed {
                return Ok(Self::pending_response());
            }
        }

        let provider = self
            .providers
            .get(&record.provider)
            .ok_or_else(|| DeviceFlowError::UnsupportedProvider(record.provider.clone()))?;

        match provider
            .poll_device_code(&record.device_code)
            .await
            .map_err(DeviceFlowError::Provider)?
        {
            ProviderAuthorization::Pending => {
                repo.record_poll(record.id).await?;
                Ok(Self::pending_response())
            }
            ProviderAuthorization::SlowDown(increment) => {
                repo.record_poll(record.id).await?;
                let next_interval = record.polling_interval.saturating_add(increment as i32);
                repo.update_interval(record.id, next_interval).await?;
                Ok(Self::pending_response())
            }
            ProviderAuthorization::Denied => {
                repo.set_status(record.id, AuthorizationStatus::Error, Some("access_denied"))
                    .await?;
                Err(DeviceFlowError::Denied)
            }
            ProviderAuthorization::Expired => {
                repo.set_status(
                    record.id,
                    AuthorizationStatus::Expired,
                    Some("expired_token"),
                )
                .await?;
                Err(DeviceFlowError::Expired)
            }
            ProviderAuthorization::Authorized(grant) => {
                self.complete_authorization(record, grant).await
            }
        }
    }

    fn pending_response() -> DeviceFlowPollResponse {
        DeviceFlowPollResponse {
            status: DeviceFlowPollStatus::Pending,
            access_token: None,
            error: None,
        }
    }

    async fn complete_authorization(
        &self,
        record: DeviceAuthorization,
        grant: DeviceAccessGrant,
    ) -> Result<DeviceFlowPollResponse, DeviceFlowError> {
        let provider = self
            .providers
            .get(&record.provider)
            .ok_or_else(|| DeviceFlowError::UnsupportedProvider(record.provider.clone()))?;

        let mut last_error: Option<AnyhowError> = None;
        let mut attempts_made = 0;
        let user_profile = {
            let mut profile = None;
            for attempt in 1..=USER_FETCH_MAX_ATTEMPTS {
                attempts_made = attempt;
                match provider.fetch_user(&grant.access_token).await {
                    Ok(result) => {
                        profile = Some(result);
                        break;
                    }
                    Err(err) => {
                        let retryable =
                            attempt < USER_FETCH_MAX_ATTEMPTS && Self::is_forbidden_error(&err);
                        last_error = Some(err);
                        if retryable {
                            sleep(StdDuration::from_millis(USER_FETCH_RETRY_DELAY_MS)).await;
                            continue;
                        }
                        break;
                    }
                }
            }
            profile
        };

        let user_profile = match user_profile {
            Some(profile) => profile,
            None => {
                if let Some(err) = last_error.as_ref() {
                    warn!(
                        provider = provider.name(),
                        attempts = attempts_made,
                        error = ?err,
                        "failed to fetch provider user details"
                    );
                } else {
                    warn!(
                        provider = provider.name(),
                        attempts = attempts_made,
                        "failed to fetch provider user details"
                    );
                }
                let oauth_repo = DeviceAuthorizationRepository::new(&self.pool);
                oauth_repo
                    .set_status(
                        record.id,
                        AuthorizationStatus::Error,
                        Some("user_fetch_failed"),
                    )
                    .await?;
                return Err(DeviceFlowError::Failed("user_fetch_failed".into()));
            }
        };

        let account_repo = OAuthAccountRepository::new(&self.pool);
        let identity_repo = IdentityRepository::new(&self.pool);

        let email = ensure_email(provider.name(), &user_profile);
        let username = derive_username(provider.name(), &user_profile);
        let display_name = derive_display_name(&user_profile);

        let existing_account = account_repo
            .get_by_provider_user(provider.name(), &user_profile.id)
            .await?;

        let user_id = match existing_account {
            Some(account) => account.user_id,
            None => {
                if let Some(found) = identity_repo.find_user_by_email(&email).await? {
                    found.id
                } else {
                    Uuid::new_v4().to_string()
                }
            }
        };

        let (first_name, last_name) = split_name(user_profile.name.as_deref());

        let user = identity_repo
            .upsert_user(UpsertUser {
                id: &user_id,
                email: &email,
                first_name: first_name.as_deref(),
                last_name: last_name.as_deref(),
                username: username.as_deref(),
            })
            .await?;

        let organization = identity_repo
            .ensure_personal_org_and_admin_membership(&user.id, username.as_deref())
            .await?;

        account_repo
            .upsert(OAuthAccountInsert {
                user_id: &user.id,
                provider: provider.name(),
                provider_user_id: &user_profile.id,
                email: Some(email.as_str()),
                username: username.as_deref(),
                display_name: display_name.as_deref(),
                avatar_url: user_profile.avatar_url.as_deref(),
            })
            .await?;

        let session_secret = generate_session_secret();
        let session_repo = AuthSessionRepository::new(&self.pool);
        let session = session_repo.create(&user.id, &session_secret).await?;

        let token = self.jwt.encode(&session, &user, &organization)?;
        session_repo.touch(session.id).await?;

        let oauth_repo = DeviceAuthorizationRepository::new(&self.pool);
        oauth_repo
            .mark_completed(record.id, &user.id, session.id)
            .await?;

        configure_user_scope(
            &user.id,
            user.username.as_deref(),
            Some(user.email.as_str()),
        );

        Ok(DeviceFlowPollResponse {
            status: DeviceFlowPollStatus::Success,
            access_token: Some(token),
            error: None,
        })
    }

    fn is_forbidden_error(err: &AnyhowError) -> bool {
        err.chain().any(|cause| {
            cause
                .downcast_ref::<reqwest::Error>()
                .and_then(|req_err| req_err.status())
                .map(|status| status == StatusCode::FORBIDDEN)
                .unwrap_or(false)
        })
    }
}

fn ensure_email(provider: &str, profile: &ProviderUser) -> String {
    if let Some(email) = profile.email.clone() {
        return email;
    }
    match provider {
        "github" => format!("{}@users.noreply.github.com", profile.id),
        "google" => format!("{}@users.noreply.google.com", profile.id),
        _ => format!("{}@oauth.local", profile.id),
    }
}

fn derive_username(provider: &str, profile: &ProviderUser) -> Option<String> {
    if let Some(login) = profile.login.clone() {
        return Some(login);
    }
    if let Some(email) = profile.email.as_deref() {
        return email.split('@').next().map(|part| part.to_owned());
    }
    Some(format!("{}-{}", provider, profile.id))
}

fn derive_display_name(profile: &ProviderUser) -> Option<String> {
    profile.name.clone()
}

fn split_name(name: Option<&str>) -> (Option<String>, Option<String>) {
    match name {
        Some(value) => {
            let mut iter = value.split_whitespace();
            let first = iter.next().map(|s| s.to_string());
            let remainder: Vec<&str> = iter.collect();
            let last = if remainder.is_empty() {
                None
            } else {
                Some(remainder.join(" "))
            };
            (first, last)
        }
        None => (None, None),
    }
}

fn generate_session_secret() -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(SESSION_SECRET_LENGTH)
        .map(char::from)
        .collect()
}
