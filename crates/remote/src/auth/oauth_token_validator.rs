use std::sync::Arc;

use sqlx::PgPool;
use tracing::{info, warn};

use crate::{
    auth::{
        ProviderTokenDetails,
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
}

impl OAuthTokenValidator {
    pub fn new(pool: PgPool, provider_registry: Arc<ProviderRegistry>) -> Self {
        Self {
            pool,
            provider_registry,
        }
    }

    // Check if the OAuth provider token is still valid, refresh if possible
    // Revoke all sessions if provider has revoked the OAuth token
    pub async fn validate(
        &self,
        provider_token_details: ProviderTokenDetails,
        user_id: uuid::Uuid,
        session_id: uuid::Uuid,
    ) -> Result<ProviderTokenDetails, OAuthTokenValidationError> {
        match self
            .verify_inner(provider_token_details, user_id, session_id)
            .await
        {
            Ok(updated_token_details) => Ok(updated_token_details),
            Err(err) => {
                match &err {
                    OAuthTokenValidationError::ProviderAccountNotLinked
                    | OAuthTokenValidationError::ProviderTokenValidationFailed
                    | OAuthTokenValidationError::FetchAccountsFailed(_) => {
                        let session_repo = AuthSessionRepository::new(&self.pool);
                        if let Err(e) = session_repo.revoke_all_user_sessions(user_id).await {
                            warn!(
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
        mut provider_token_details: ProviderTokenDetails,
        user_id: uuid::Uuid,
        session_id: uuid::Uuid,
    ) -> Result<ProviderTokenDetails, OAuthTokenValidationError> {
        let oauth_account_repo = OAuthAccountRepository::new(&self.pool);
        let accounts = match oauth_account_repo.list_by_user(user_id).await {
            Ok(accounts) => accounts,
            Err(err) => {
                warn!(
                    user_id = %user_id,
                    error = %err,
                    "Failed to fetch OAuth accounts for user"
                );
                return Err(OAuthTokenValidationError::FetchAccountsFailed(err));
            }
        };

        let account_exists = accounts
            .iter()
            .any(|a| a.provider == provider_token_details.provider);

        if !account_exists {
            warn!(
                user_id = %user_id,
                provider = %provider_token_details.provider,
                "Provider account no longer linked to user, revoking sessions"
            );
            return Err(OAuthTokenValidationError::ProviderAccountNotLinked);
        }

        let Some(provider) = self.provider_registry.get(&provider_token_details.provider) else {
            warn!(
                user_id = %user_id,
                provider = %provider_token_details.provider,
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
            }
            Ok(None) => {}
            Err(TokenValidationError::InvalidOrRevoked) => {
                info!(
                    user_id = %user_id,
                    provider = %provider_token_details.provider,
                    session_id = %session_id,
                    "OAuth provider reported token as invalid or revoked"
                );
                return Err(OAuthTokenValidationError::ProviderTokenValidationFailed);
            }
            Err(TokenValidationError::Temporary(reason)) => {
                warn!(
                    user_id = %user_id,
                    provider = %provider_token_details.provider,
                    session_id = %session_id,
                    error = %reason,
                    "OAuth provider validation temporarily unavailable"
                );
                return Err(OAuthTokenValidationError::ValidationUnavailable(reason));
            }
        }

        Ok(provider_token_details)
    }
}
