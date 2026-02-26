use std::sync::Arc;

use sqlx::PgPool;
use tracing::{error, info, warn};
use uuid::Uuid;

use crate::{
    auth::{
        JwtService, ProviderTokenDetails,
        provider::{ProviderRegistry, TokenValidationError, VALIDATE_TOKEN_MAX_RETRIES},
    },
    db::{
        auth::AuthSessionRepository,
        oauth_accounts::{OAuthAccountError, OAuthAccountRepository},
    },
};

#[derive(Debug, thiserror::Error)]
pub enum OAuthTokenValidationError {
    #[error("failed to fetch OAuth accounts for user")]
    FetchAccountsFailed(OAuthAccountError),
    #[error("provider account no longer linked to user")]
    ProviderAccountNotLinked,
    #[error("OAuth provider token validation failed")]
    ProviderTokenValidationFailed,
    #[error("temporary failure validating provider token: {0}")]
    ValidationUnavailable(String),
}

pub struct OAuthTokenValidator {
    pool: PgPool,
    provider_registry: Arc<ProviderRegistry>,
    jwt: Arc<JwtService>,
}

impl OAuthTokenValidator {
    pub fn new(pool: PgPool, provider_registry: Arc<ProviderRegistry>, jwt: Arc<JwtService>) -> Self {
        Self {
            pool,
            provider_registry,
            jwt,
        }
    }

    // Check if the OAuth provider token is still valid, refresh if possible
    // Revoke all sessions if provider has revoked the OAuth token
    pub async fn validate(
        &self,
        provider: &str,
        user_id: Uuid,
        session_id: Uuid,
    ) -> Result<(), OAuthTokenValidationError> {
        match self.verify_inner(provider, user_id, session_id).await {
            Ok(()) => Ok(()),
            Err(err) => {
                match &err {
                    OAuthTokenValidationError::ProviderAccountNotLinked
                    | OAuthTokenValidationError::ProviderTokenValidationFailed
                    | OAuthTokenValidationError::FetchAccountsFailed(_) => {
                        let session_repo = AuthSessionRepository::new(&self.pool);
                        if let Err(e) = session_repo.revoke_all_user_sessions(user_id).await {
                            error!(
                                user_id = %user_id,
                                error = %e,
                                "Failed to revoke all user sessions after OAuth token validation failure"
                            );
                        }
                    }
                    OAuthTokenValidationError::ValidationUnavailable(_) => (),
                };
                Err(err)
            }
        }
    }

    async fn verify_inner(
        &self,
        provider_name: &str,
        user_id: Uuid,
        session_id: Uuid,
    ) -> Result<(), OAuthTokenValidationError> {
        let oauth_account_repo = OAuthAccountRepository::new(&self.pool);
        let account = match oauth_account_repo
            .get_by_user_provider(user_id, provider_name)
            .await
        {
            Ok(account) => account,
            Err(err) => {
                error!(
                    user_id = %user_id,
                    error = %err,
                    provider = %provider_name,
                    "Failed to fetch OAuth account for user"
                );
                return Err(OAuthTokenValidationError::FetchAccountsFailed(err));
            }
        };

        let Some(account) = account else {
            warn!(
                user_id = %user_id,
                provider = %provider_name,
                "Provider account no longer linked to user, revoking sessions"
            );
            return Err(OAuthTokenValidationError::ProviderAccountNotLinked);
        };

        let Some(encrypted_tokens) = account.encrypted_provider_tokens.as_deref() else {
            error!(
                user_id = %user_id,
                provider = %provider_name,
                session_id = %session_id,
                "OAuth account is missing provider token"
            );
            return Err(OAuthTokenValidationError::ProviderTokenValidationFailed);
        };

        let mut provider_token_details = match self.jwt.decrypt_provider_tokens(encrypted_tokens) {
            Ok(details) => details,
            Err(err) => {
                error!(
                    user_id = %user_id,
                    provider = %provider_name,
                    session_id = %session_id,
                    error = %err,
                    "Failed to decrypt provider token from oauth account"
                );
                return Err(OAuthTokenValidationError::ProviderTokenValidationFailed);
            }
        };

        if provider_token_details.provider != provider_name {
            error!(
                user_id = %user_id,
                provider = %provider_name,
                session_id = %session_id,
                "Provider token details did not match linked provider account"
            );
            return Err(OAuthTokenValidationError::ProviderTokenValidationFailed);
        }

        let Some(provider) = self.provider_registry.get(provider_name) else {
            error!(
                user_id = %user_id,
                provider = %provider_name,
                "OAuth provider not found in registry, revoking all sessions"
            );
            return Err(OAuthTokenValidationError::ProviderTokenValidationFailed);
        };

        match provider
            .validate_token(&provider_token_details, VALIDATE_TOKEN_MAX_RETRIES)
            .await
        {
            Ok(Some(updated_token_details)) => {
                provider_token_details = updated_token_details;
                self.persist_provider_tokens(
                    &oauth_account_repo,
                    user_id,
                    provider_name,
                    &provider_token_details,
                )
                .await?;
            }
            Ok(None) => {}
            Err(TokenValidationError::InvalidOrRevoked) => {
                info!(
                    user_id = %user_id,
                    provider = %provider_name,
                    session_id = %session_id,
                    "OAuth provider reported token as invalid or revoked"
                );
                return Err(OAuthTokenValidationError::ProviderTokenValidationFailed);
            }
            Err(TokenValidationError::Temporary(reason)) => {
                warn!(
                    user_id = %user_id,
                    provider = %provider_name,
                    session_id = %session_id,
                    error = %reason,
                    "OAuth provider validation temporarily unavailable"
                );
                return Err(OAuthTokenValidationError::ValidationUnavailable(reason));
            }
        }

        Ok(())
    }

    async fn persist_provider_tokens(
        &self,
        oauth_account_repo: &OAuthAccountRepository<'_>,
        user_id: Uuid,
        provider: &str,
        provider_token_details: &ProviderTokenDetails,
    ) -> Result<(), OAuthTokenValidationError> {
        let encrypted_provider_tokens = self
            .jwt
            .encrypt_provider_tokens(provider_token_details)
            .map_err(|err| {
                error!(
                    user_id = %user_id,
                    provider = %provider,
                    error = %err,
                    "Failed to encrypt provider token for persistence"
                );
                OAuthTokenValidationError::ValidationUnavailable(
                    "failed to encrypt provider token".to_string(),
                )
            })?;

        oauth_account_repo
            .update_encrypted_provider_tokens(user_id, provider, &encrypted_provider_tokens)
            .await
            .map_err(|err| {
                error!(
                    user_id = %user_id,
                    provider = %provider,
                    error = %err,
                    "Failed to persist provider token on oauth account"
                );
                OAuthTokenValidationError::ValidationUnavailable(
                    "failed to persist provider token".to_string(),
                )
            })?;

        Ok(())
    }
}
