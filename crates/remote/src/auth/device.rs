use std::sync::Arc;

use anyhow::Error as AnyhowError;
use chrono::{Duration, Utc};
use rand::{Rng, distributions::Alphanumeric};
use sqlx::PgPool;
use thiserror::Error;
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
            AuthorizationStatus, DeviceAuthorization, DeviceAuthorizationError,
            DeviceAuthorizationRepository,
        },
        oauth_accounts::{OAuthAccountError, OAuthAccountInsert, OAuthAccountRepository},
    },
};

const SESSION_SECRET_LENGTH: usize = 48;

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
            .create(
                provider_name,
                &response.device_code,
                &response.user_code,
                &response.verification_uri,
                response.verification_uri_complete.as_deref(),
                expires_at,
                response.interval,
            )
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
        let organization_id = personal_org_id(&session.user_id);
        let organization = identity_repo.fetch_organization(&organization_id).await?;

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
        let now = Utc::now();
        if record.expires_at <= now {
            let repo = DeviceAuthorizationRepository::new(&self.pool);
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
                return Ok(DeviceFlowPollResponse {
                    status: DeviceFlowPollStatus::Pending,
                    access_token: None,
                    error: None,
                });
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
                let repo = DeviceAuthorizationRepository::new(&self.pool);
                repo.record_poll(record.id).await?;
                Ok(DeviceFlowPollResponse {
                    status: DeviceFlowPollStatus::Pending,
                    access_token: None,
                    error: None,
                })
            }
            ProviderAuthorization::SlowDown(increment) => {
                let repo = DeviceAuthorizationRepository::new(&self.pool);
                repo.record_poll(record.id).await?;
                let next_interval = record.polling_interval.saturating_add(increment as i32);
                repo.update_interval(record.id, next_interval).await?;
                Ok(DeviceFlowPollResponse {
                    status: DeviceFlowPollStatus::Pending,
                    access_token: None,
                    error: None,
                })
            }
            ProviderAuthorization::Denied => {
                let repo = DeviceAuthorizationRepository::new(&self.pool);
                repo.set_status(record.id, AuthorizationStatus::Error, Some("access_denied"))
                    .await?;
                Err(DeviceFlowError::Denied)
            }
            ProviderAuthorization::Expired => {
                let repo = DeviceAuthorizationRepository::new(&self.pool);
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

    async fn complete_authorization(
        &self,
        record: DeviceAuthorization,
        grant: DeviceAccessGrant,
    ) -> Result<DeviceFlowPollResponse, DeviceFlowError> {
        let provider = self
            .providers
            .get(&record.provider)
            .ok_or_else(|| DeviceFlowError::UnsupportedProvider(record.provider.clone()))?;

        let user_profile = provider
            .fetch_user(&grant.access_token)
            .await
            .map_err(DeviceFlowError::Provider)?;

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

        let org_id = personal_org_id(&user_id);
        let org_slug = personal_org_slug(&user_id, username.as_deref());
        identity_repo
            .ensure_personal_organization(&org_id, &org_slug)
            .await?;

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

        identity_repo.ensure_membership(&org_id, &user.id).await?;

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

        let organization = identity_repo.fetch_organization(&org_id).await?;
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

fn personal_org_id(user_id: &str) -> String {
    format!("org-{user_id}")
}

fn personal_org_slug(user_id: &str, hint: Option<&str>) -> String {
    let candidate = hint
        .and_then(|value| {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        })
        .unwrap_or(user_id);

    candidate
        .chars()
        .map(|ch| match ch {
            'A'..='Z' => ch.to_ascii_lowercase(),
            'a'..='z' | '0'..='9' | '-' => ch,
            _ => '-',
        })
        .collect()
}

fn generate_session_secret() -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(SESSION_SECRET_LENGTH)
        .map(char::from)
        .collect()
}
