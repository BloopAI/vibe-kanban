use std::{fmt::Write, sync::Arc};

use anyhow::Error as AnyhowError;
use chrono::{DateTime, Duration, Utc};
use rand::{Rng, distr::Alphanumeric};
use reqwest::StatusCode;
use secrecy::ExposeSecret;
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use thiserror::Error;
use url::Url;
use uuid::Uuid;

use super::{
    ProviderRegistry,
    jwt::{JwtError, JwtService},
    provider::{AuthorizationGrant, AuthorizationProvider, ProviderUser},
};
use crate::{
    configure_user_scope,
    db::{
        auth::{AuthSessionError, AuthSessionRepository, MAX_SESSION_INACTIVITY_DURATION},
        identity_errors::IdentityError,
        oauth::{
            AuthorizationStatus, CreateOAuthHandoff, OAuthHandoff, OAuthHandoffError,
            OAuthHandoffRepository,
        },
        oauth_accounts::{OAuthAccountError, OAuthAccountInsert, OAuthAccountRepository},
        organizations::OrganizationRepository,
        users::{UpsertUser, UserRepository},
    },
};

const STATE_LENGTH: usize = 48;
const APP_CODE_LENGTH: usize = 48;
const HANDOFF_TTL: i64 = 10; // minutes
const USER_FETCH_MAX_ATTEMPTS: usize = 5;
const USER_FETCH_RETRY_DELAY_MS: u64 = 500;

#[derive(Debug, Error)]
pub enum HandoffError {
    #[error("unsupported provider `{0}`")]
    UnsupportedProvider(String),
    #[error("invalid return url `{0}`")]
    InvalidReturnUrl(String),
    #[error("invalid app verifier challenge")]
    InvalidChallenge,
    #[error("oauth handoff not found")]
    NotFound,
    #[error("oauth handoff expired")]
    Expired,
    #[error("oauth authorization denied")]
    Denied,
    #[error("oauth authorization failed: {0}")]
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
    Authorization(#[from] OAuthHandoffError),
}

#[derive(Debug, Clone)]
pub struct HandoffInitResponse {
    pub handoff_id: Uuid,
    pub authorize_url: String,
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub enum CallbackResult {
    Success {
        handoff_id: Uuid,
        return_to: String,
        app_code: String,
    },
    Error {
        handoff_id: Option<Uuid>,
        return_to: Option<String>,
        error: String,
    },
}

#[derive(Debug, Clone)]
pub struct RedeemResponse {
    pub access_token: String,
    pub refresh_token: String,
}

pub struct OAuthHandoffService {
    pool: PgPool,
    providers: Arc<ProviderRegistry>,
    jwt: Arc<JwtService>,
    public_origin: String,
}

impl OAuthHandoffService {
    pub fn new(
        pool: PgPool,
        providers: Arc<ProviderRegistry>,
        jwt: Arc<JwtService>,
        public_origin: String,
    ) -> Self {
        let trimmed_origin = public_origin.trim_end_matches('/').to_string();
        Self {
            pool,
            providers,
            jwt,
            public_origin: trimmed_origin,
        }
    }

    pub fn providers(&self) -> Arc<ProviderRegistry> {
        Arc::clone(&self.providers)
    }

    pub async fn initiate(
        &self,
        provider: &str,
        return_to: &str,
        app_challenge: &str,
    ) -> Result<HandoffInitResponse, HandoffError> {
        let provider = self
            .providers
            .get(provider)
            .ok_or_else(|| HandoffError::UnsupportedProvider(provider.to_string()))?;

        let return_to_url =
            Url::parse(return_to).map_err(|_| HandoffError::InvalidReturnUrl(return_to.into()))?;
        if !is_allowed_return_to(&return_to_url, &self.public_origin) {
            return Err(HandoffError::InvalidReturnUrl(return_to.into()));
        }

        if !is_valid_challenge(app_challenge) {
            return Err(HandoffError::InvalidChallenge);
        }

        let state = generate_state();
        let expires_at = Utc::now() + Duration::minutes(HANDOFF_TTL);
        let repo = OAuthHandoffRepository::new(&self.pool);
        let record = repo
            .create(CreateOAuthHandoff {
                provider: provider.name(),
                state: &state,
                return_to: return_to_url.as_str(),
                app_challenge,
                expires_at,
            })
            .await?;

        let authorize_url = format!(
            "{}/v1/oauth/{}/start?handoff_id={}",
            self.public_origin,
            provider.name(),
            record.id
        );

        Ok(HandoffInitResponse {
            handoff_id: record.id,
            authorize_url,
            expires_at: record.expires_at,
        })
    }

    pub async fn authorize_url(
        &self,
        provider: &str,
        handoff_id: Uuid,
    ) -> Result<String, HandoffError> {
        let provider = self
            .providers
            .get(provider)
            .ok_or_else(|| HandoffError::UnsupportedProvider(provider.to_string()))?;

        let repo = OAuthHandoffRepository::new(&self.pool);
        let record = repo.get(handoff_id).await?;

        if record.provider != provider.name() {
            return Err(HandoffError::UnsupportedProvider(record.provider));
        }

        if is_expired(&record) {
            repo.set_status(record.id, AuthorizationStatus::Expired, Some("expired"))
                .await?;
            return Err(HandoffError::Expired);
        }

        if record.status() != Some(AuthorizationStatus::Pending) {
            return Err(HandoffError::Failed("invalid_state".into()));
        }

        let redirect_uri = format!(
            "{}/v1/oauth/{}/callback",
            self.public_origin,
            provider.name()
        );

        provider
            .authorize_url(&record.state, &redirect_uri)
            .map(|url| url.into())
            .map_err(HandoffError::Provider)
    }

    pub async fn handle_callback(
        &self,
        provider_name: &str,
        state: Option<&str>,
        code: Option<&str>,
        error: Option<&str>,
    ) -> Result<CallbackResult, HandoffError> {
        let provider = self
            .providers
            .get(provider_name)
            .ok_or_else(|| HandoffError::UnsupportedProvider(provider_name.to_string()))?;

        let Some(state_value) = state else {
            return Ok(CallbackResult::Error {
                handoff_id: None,
                return_to: None,
                error: "missing_state".into(),
            });
        };

        let repo = OAuthHandoffRepository::new(&self.pool);
        let record = repo.get_by_state(state_value).await?;

        if record.provider != provider.name() {
            return Err(HandoffError::UnsupportedProvider(record.provider));
        }

        if is_expired(&record) {
            repo.set_status(record.id, AuthorizationStatus::Expired, Some("expired"))
                .await?;
            return Err(HandoffError::Expired);
        }

        if let Some(err_code) = error {
            repo.set_status(record.id, AuthorizationStatus::Error, Some(err_code))
                .await?;
            return Ok(CallbackResult::Error {
                handoff_id: Some(record.id),
                return_to: Some(record.return_to.clone()),
                error: err_code.to_string(),
            });
        }

        let code = code.ok_or_else(|| HandoffError::Failed("missing_code".into()))?;

        let redirect_uri = format!(
            "{}/v1/oauth/{}/callback",
            self.public_origin,
            provider.name()
        );

        let grant = provider
            .exchange_code(code, &redirect_uri)
            .await
            .map_err(HandoffError::Provider)?;

        let user_profile = self.fetch_user_with_retries(&provider, &grant).await?;

        let user = self.upsert_identity(&provider, &user_profile).await?;

        let provider_token_details = crate::auth::ProviderTokenDetails {
            provider: provider.name().to_string(),
            access_token: grant.access_token.expose_secret().to_string(),
            refresh_token: grant
                .refresh_token
                .as_ref()
                .map(|t| t.expose_secret().to_string()),
            expires_at: grant.expires_in.map(|d| (Utc::now() + d).timestamp()),
        };

        let session_repo = AuthSessionRepository::new(&self.pool);
        let session_record = session_repo.create(user.id, None).await?;

        let app_code = generate_app_code();
        let app_code_hash = hash_sha256_hex(&app_code);

        let encrypted_tokens = self
            .jwt
            .encrypt_provider_tokens(&provider_token_details)
            .map_err(|e| HandoffError::Failed(format!("Failed to encrypt provider token: {e}")))?;

        repo.mark_authorized(
            record.id,
            user.id,
            session_record.id,
            &app_code_hash,
            Some(encrypted_tokens),
        )
        .await?;

        configure_user_scope(user.id, user.username.as_deref(), Some(user.email.as_str()));

        Ok(CallbackResult::Success {
            handoff_id: record.id,
            return_to: record.return_to,
            app_code,
        })
    }

    pub async fn redeem(
        &self,
        handoff_id: Uuid,
        app_code: &str,
        app_verifier: &str,
    ) -> Result<RedeemResponse, HandoffError> {
        let repo = OAuthHandoffRepository::new(&self.pool);
        repo.ensure_redeemable(handoff_id).await?;

        let record = repo.get(handoff_id).await?;

        if is_expired(&record) {
            repo.set_status(record.id, AuthorizationStatus::Expired, Some("expired"))
                .await?;
            return Err(HandoffError::Expired);
        }

        let expected_code_hash = record
            .app_code_hash
            .ok_or_else(|| HandoffError::Failed("missing_app_code".into()))?;
        let provided_hash = hash_sha256_hex(app_code);
        if provided_hash != expected_code_hash {
            return Err(HandoffError::Failed("invalid_app_code".into()));
        }

        let expected_challenge = record.app_challenge;
        let provided_challenge = hash_sha256_hex(app_verifier);
        if provided_challenge != expected_challenge {
            return Err(HandoffError::Failed("invalid_app_verifier".into()));
        }

        let session_id = record
            .session_id
            .ok_or_else(|| HandoffError::Failed("missing_session".into()))?;
        let user_id = record
            .user_id
            .ok_or_else(|| HandoffError::Failed("missing_user".into()))?;
        let encrypted_provider_tokens = record
            .encrypted_provider_tokens
            .ok_or_else(|| HandoffError::Failed("missing_encrypted_provider_tokens".into()))?;

        let session_repo = AuthSessionRepository::new(&self.pool);
        let session = session_repo.get(session_id).await?;
        if session.revoked_at.is_some() {
            return Err(HandoffError::Denied);
        }

        if session.inactivity_duration(Utc::now()) > MAX_SESSION_INACTIVITY_DURATION {
            session_repo.revoke(session.id).await?;
            return Err(HandoffError::Denied);
        }

        let user_repo = UserRepository::new(&self.pool);
        let user = user_repo.fetch_user(user_id).await?;
        let org_repo = OrganizationRepository::new(&self.pool);
        let _organization = org_repo
            .ensure_personal_org_and_admin_membership(user.id, user.username.as_deref())
            .await?;

        let provider_token = self
            .jwt
            .decrypt_provider_tokens(&encrypted_provider_tokens)?;

        let tokens = self.jwt.generate_tokens(&session, &user, provider_token)?;

        session_repo
            .set_current_refresh_token(session.id, tokens.refresh_token_id)
            .await?;

        session_repo.touch(session.id).await?;
        repo.mark_redeemed(record.id).await?;

        configure_user_scope(user.id, user.username.as_deref(), Some(user.email.as_str()));

        Ok(RedeemResponse {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
        })
    }

    async fn fetch_user_with_retries(
        &self,
        provider: &Arc<dyn AuthorizationProvider>,
        grant: &AuthorizationGrant,
    ) -> Result<ProviderUser, HandoffError> {
        let mut last_error: Option<AnyhowError> = None;
        for attempt in 1..=USER_FETCH_MAX_ATTEMPTS {
            match provider.fetch_user(&grant.access_token).await {
                Ok(user) => return Ok(user),
                Err(err) => {
                    let retryable = attempt < USER_FETCH_MAX_ATTEMPTS && is_forbidden_error(&err);
                    last_error = Some(err);
                    if retryable {
                        tokio::time::sleep(std::time::Duration::from_millis(
                            USER_FETCH_RETRY_DELAY_MS,
                        ))
                        .await;
                        continue;
                    }
                    break;
                }
            }
        }

        if let Some(err) = last_error {
            Err(HandoffError::Provider(err))
        } else {
            Err(HandoffError::Failed("user_fetch_failed".into()))
        }
    }

    async fn upsert_identity(
        &self,
        provider: &Arc<dyn AuthorizationProvider>,
        profile: &ProviderUser,
    ) -> Result<IdentityUser, HandoffError> {
        let account_repo = OAuthAccountRepository::new(&self.pool);
        let user_repo = UserRepository::new(&self.pool);
        let org_repo = OrganizationRepository::new(&self.pool);

        let email = ensure_email(provider.name(), profile);
        let username = derive_username(provider.name(), profile);
        let display_name = derive_display_name(profile);

        let existing_account = account_repo
            .get_by_provider_user(provider.name(), &profile.id)
            .await?;

        let user_id = match existing_account {
            Some(account) => account.user_id,
            None => Uuid::new_v4(),
        };

        let (first_name, last_name) = split_name(profile.name.as_deref());

        let user = user_repo
            .upsert_user(UpsertUser {
                id: user_id,
                email: &email,
                first_name: first_name.as_deref(),
                last_name: last_name.as_deref(),
                username: username.as_deref(),
            })
            .await?;

        org_repo
            .ensure_personal_org_and_admin_membership(user.id, username.as_deref())
            .await?;

        account_repo
            .upsert(OAuthAccountInsert {
                user_id: user.id,
                provider: provider.name(),
                provider_user_id: &profile.id,
                email: Some(email.as_str()),
                username: username.as_deref(),
                display_name: display_name.as_deref(),
                avatar_url: profile.avatar_url.as_deref(),
            })
            .await?;

        Ok(user)
    }
}

type IdentityUser = crate::db::users::User;

fn is_expired(record: &OAuthHandoff) -> bool {
    record.expires_at <= Utc::now()
}

fn is_valid_challenge(challenge: &str) -> bool {
    !challenge.is_empty()
        && challenge.len() == 64
        && challenge.chars().all(|ch| ch.is_ascii_hexdigit())
}

fn is_allowed_return_to(url: &Url, public_origin: &str) -> bool {
    if url.scheme() == "http" && matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "[::1]"))
    {
        return true;
    }

    if url.scheme() == "https"
        && Url::parse(public_origin).ok().is_some_and(|public_url| {
            public_url.scheme() == "https"
                && public_url.host_str().is_some()
                && url.host_str() == public_url.host_str()
        })
    {
        return true;
    }

    // Log and allow web-hosted clients. Rely on PKCE for security.
    tracing::info!(%url, "allowing external redirect URL");
    true
}

fn hash_sha256_hex(input: &str) -> String {
    let digest = Sha256::digest(input.as_bytes());
    let mut output = String::with_capacity(digest.len() * 2);
    for byte in digest {
        let _ = write!(output, "{byte:02x}");
    }
    output
}

fn generate_state() -> String {
    rand::rng()
        .sample_iter(&Alphanumeric)
        .take(STATE_LENGTH)
        .map(char::from)
        .collect()
}

fn generate_app_code() -> String {
    rand::rng()
        .sample_iter(&Alphanumeric)
        .take(APP_CODE_LENGTH)
        .map(char::from)
        .collect()
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

fn is_forbidden_error(err: &AnyhowError) -> bool {
    err.chain().any(|cause| {
        cause
            .downcast_ref::<reqwest::Error>()
            .and_then(|req_err| req_err.status())
            .map(|status| status == StatusCode::FORBIDDEN)
            .unwrap_or(false)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hashes_match_hex_length() {
        let output = hash_sha256_hex("example");
        assert_eq!(output.len(), 64);
    }

    #[test]
    fn challenge_validation() {
        assert!(is_valid_challenge(
            "0d44b13d0112ff7c94f27f66a701d89f5cb9184160a95cace0bbd10b191ed257"
        ));
        assert!(!is_valid_challenge("not-hex"));
        assert!(!is_valid_challenge(""));
    }
}
