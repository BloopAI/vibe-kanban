use uuid::Uuid;

use super::{JwtError, OAuthTokenValidationError};
use crate::{
    AppState,
    db::{
        auth::{AuthSessionError, AuthSessionRepository},
        identity_errors::IdentityError,
        oauth_accounts::{OAuthAccountError, OAuthAccountRepository},
        users::UserRepository,
    },
};

#[derive(Debug, Clone)]
pub struct RefreshedTokens {
    pub access_token: String,
    pub refresh_token: String,
    pub user_id: Uuid,
    pub session_id: Uuid,
}

#[derive(Debug, thiserror::Error)]
pub enum TokenRefreshError {
    #[error("invalid refresh token")]
    InvalidToken,
    #[error("session has been revoked")]
    SessionRevoked,
    #[error("refresh token expired")]
    TokenExpired,
    #[error("refresh token reused - possible token theft")]
    TokenReuseDetected,
    #[error("provider token has been revoked")]
    ProviderTokenRevoked,
    #[error("temporary failure validating provider token")]
    ProviderValidationUnavailable(String),
    #[error(transparent)]
    Jwt(#[from] JwtError),
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error(transparent)]
    SessionError(#[from] AuthSessionError),
    #[error(transparent)]
    Identity(#[from] IdentityError),
}

impl From<OAuthTokenValidationError> for TokenRefreshError {
    fn from(err: OAuthTokenValidationError) -> Self {
        match err {
            OAuthTokenValidationError::ProviderAccountNotLinked
            | OAuthTokenValidationError::ProviderTokenValidationFailed => {
                TokenRefreshError::ProviderTokenRevoked
            }
            OAuthTokenValidationError::FetchAccountsFailed(inner) => match inner {
                OAuthAccountError::Database(db_err) => TokenRefreshError::Database(db_err),
            },
            OAuthTokenValidationError::ValidationUnavailable(reason) => {
                TokenRefreshError::ProviderValidationUnavailable(reason)
            }
        }
    }
}

impl From<OAuthAccountError> for TokenRefreshError {
    fn from(err: OAuthAccountError) -> Self {
        match err {
            OAuthAccountError::Database(db_err) => TokenRefreshError::Database(db_err),
        }
    }
}

pub async fn refresh_user_tokens(
    state: &AppState,
    refresh_token: &str,
) -> Result<RefreshedTokens, TokenRefreshError> {
    let jwt_service = state.jwt();
    let session_repo = AuthSessionRepository::new(state.pool());

    let token_details = match jwt_service.decode_refresh_token(refresh_token) {
        Ok(details) => details,
        Err(JwtError::TokenExpired) => return Err(TokenRefreshError::TokenExpired),
        Err(_) => return Err(TokenRefreshError::InvalidToken),
    };

    let session = match session_repo.get(token_details.session_id).await {
        Ok(session) => session,
        Err(AuthSessionError::NotFound) => return Err(TokenRefreshError::SessionRevoked),
        Err(error) => return Err(TokenRefreshError::SessionError(error)),
    };

    if session.revoked_at.is_some() {
        return Err(TokenRefreshError::SessionRevoked);
    }

    if session.refresh_token_id != Some(token_details.refresh_token_id)
        || session_repo
            .is_refresh_token_revoked(token_details.refresh_token_id)
            .await?
    {
        session_repo
            .revoke_all_user_sessions(token_details.user_id)
            .await?;
        return Err(TokenRefreshError::TokenReuseDetected);
    }

    if let Some(legacy_provider_token_details) =
        token_details.legacy_provider_token_details.as_ref()
        && let oauth_account_repo = OAuthAccountRepository::new(state.pool())
        && oauth_account_repo
            .get_by_user_provider(token_details.user_id, &token_details.provider)
            .await?
            .is_some_and(|account| account.encrypted_provider_tokens.is_none())
    {
        let encrypted_provider_tokens =
            jwt_service.encrypt_provider_tokens(legacy_provider_token_details)?;
        oauth_account_repo
            .update_encrypted_provider_tokens(
                token_details.user_id,
                &token_details.provider,
                &encrypted_provider_tokens,
            )
            .await?;
    }

    state
        .oauth_token_validator()
        .validate(
            &token_details.provider,
            token_details.user_id,
            token_details.session_id,
        )
        .await?;

    let user_repo = UserRepository::new(state.pool());
    let user = user_repo.fetch_user(token_details.user_id).await?;

    let tokens = jwt_service.generate_tokens(&session, &user, &token_details.provider)?;

    match session_repo
        .rotate_tokens(
            session.id,
            token_details.refresh_token_id,
            tokens.refresh_token_id,
        )
        .await
    {
        Ok(_) => {}
        Err(AuthSessionError::TokenReuseDetected) => {
            session_repo
                .revoke_all_user_sessions(token_details.user_id)
                .await?;
            return Err(TokenRefreshError::TokenReuseDetected);
        }
        Err(error) => return Err(TokenRefreshError::SessionError(error)),
    }

    Ok(RefreshedTokens {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        user_id: token_details.user_id,
        session_id: token_details.session_id,
    })
}
