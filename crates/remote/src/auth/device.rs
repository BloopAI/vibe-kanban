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
    provider::{DeviceAccessGrant, DeviceCodeResponse, ProviderUser},
};
use crate::{
    configure_user_scope,
    db::{
        auth::{AuthSessionError, AuthSessionRepository},
        github::{GitHubAccountError, GitHubAccountRepository},
        identity::{IdentityError, IdentityRepository, UpsertUser},
        oauth::{AuthorizationStatus, DeviceAuthorizationError, DeviceAuthorizationRepository},
    },
};

const DEFAULT_SCOPE: &[&str] = &["repo", "read:user", "user:email"];
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
    GitHubAccount(#[from] GitHubAccountError),
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
            .request_device_code(DEFAULT_SCOPE)
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

        match record.status().unwrap_or(AuthorizationStatus::Pending) {
            AuthorizationStatus::Success => self.handle_success(record).await,
            AuthorizationStatus::Error => Ok(DeviceFlowPollResponse {
                status: DeviceFlowPollStatus::Error,
                access_token: None,
                error: record.error_code,
            }),
            AuthorizationStatus::Expired => Err(DeviceFlowError::Expired),
            AuthorizationStatus::Pending => self.advance_pending(record).await,
        }
    }

    async fn handle_success(
        &self,
        record: crate::db::oauth::DeviceAuthorization,
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
        record: crate::db::oauth::DeviceAuthorization,
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
            super::provider::DevicePoll::Pending => {
                let repo = DeviceAuthorizationRepository::new(&self.pool);
                repo.record_poll(record.id).await?;
                Ok(DeviceFlowPollResponse {
                    status: DeviceFlowPollStatus::Pending,
                    access_token: None,
                    error: None,
                })
            }
            super::provider::DevicePoll::SlowDown(increment) => {
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
            super::provider::DevicePoll::Denied => {
                let repo = DeviceAuthorizationRepository::new(&self.pool);
                repo.set_status(record.id, AuthorizationStatus::Error, Some("access_denied"))
                    .await?;
                Err(DeviceFlowError::Denied)
            }
            super::provider::DevicePoll::Expired => {
                let repo = DeviceAuthorizationRepository::new(&self.pool);
                repo.set_status(
                    record.id,
                    AuthorizationStatus::Expired,
                    Some("expired_token"),
                )
                .await?;
                Err(DeviceFlowError::Expired)
            }
            super::provider::DevicePoll::Authorized(grant) => {
                self.complete_authorization(record, grant).await
            }
        }
    }

    async fn complete_authorization(
        &self,
        record: crate::db::oauth::DeviceAuthorization,
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

        let user_id = user_profile.id.to_string();
        let email = ensure_email(&user_profile);
        let (first_name, last_name) = split_name(user_profile.name.as_deref());

        let identity_repo = IdentityRepository::new(&self.pool);
        let organization_id = personal_org_id(&user_id);
        let organization_slug = personal_org_slug(&user_profile.login, user_profile.id);

        identity_repo
            .ensure_personal_organization(&organization_id, &organization_slug)
            .await?;

        identity_repo
            .upsert_user(UpsertUser {
                id: &user_id,
                email: &email,
                first_name: first_name.as_deref(),
                last_name: last_name.as_deref(),
                username: Some(&user_profile.login),
            })
            .await?;

        identity_repo
            .ensure_membership(&organization_id, &user_id)
            .await?;

        let github_repo = GitHubAccountRepository::new(&self.pool);
        github_repo
            .upsert(
                &user_id,
                user_profile.id,
                &user_profile.login,
                user_profile.name.as_deref(),
                Some(&email),
                user_profile.avatar_url.as_deref(),
                &grant.access_token,
                &grant.token_type,
                &grant.scopes,
                grant.expires_in,
            )
            .await?;

        let session_secret = generate_session_secret();
        let session_repo = AuthSessionRepository::new(&self.pool);
        let session = session_repo.create(&user_id, &session_secret).await?;

        let organization = identity_repo.fetch_organization(&organization_id).await?;
        let user = identity_repo.fetch_user(&user_id).await?;
        let token = self.jwt.encode(&session, &user, &organization)?;
        session_repo.touch(session.id).await?;

        let oauth_repo = DeviceAuthorizationRepository::new(&self.pool);
        oauth_repo
            .mark_completed(record.id, &user_id, session.id)
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

fn ensure_email(profile: &ProviderUser) -> String {
    if let Some(email) = profile.email.clone() {
        return email;
    }

    format!("{}@users.noreply.github.com", profile.login)
}

fn split_name(name: Option<&str>) -> (Option<String>, Option<String>) {
    match name {
        Some(value) => {
            let mut iter = value.split_whitespace();
            let first = iter.next().map(|s| s.to_string());
            let rest: Vec<&str> = iter.collect();
            let last = if rest.is_empty() {
                None
            } else {
                Some(rest.join(" "))
            };
            (first, last)
        }
        None => (None, None),
    }
}

fn personal_org_id(user_id: &str) -> String {
    format!("org-{user_id}")
}

fn personal_org_slug(login: &str, github_id: i64) -> String {
    format!("{login}-{github_id}")
}

fn generate_session_secret() -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(SESSION_SECRET_LENGTH)
        .map(char::from)
        .collect()
}
