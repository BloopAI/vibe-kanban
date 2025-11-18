use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::post,
};
use tracing::warn;
use utils::api::oauth::{TokenRefreshRequest, TokenRefreshResponse};

use crate::{
    AppState,
    auth::JwtError,
    db::{
        auth::{AuthSessionError, AuthSessionRepository},
        identity_errors::IdentityError,
        users::UserRepository,
    },
};

pub fn public_router() -> Router<AppState> {
    Router::new().route("/tokens/refresh", post(refresh_token))
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
    #[error(transparent)]
    Jwt(#[from] JwtError),
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error(transparent)]
    SessionError(#[from] AuthSessionError),
    #[error(transparent)]
    Identity(#[from] IdentityError),
}

pub async fn refresh_token(
    State(state): State<AppState>,
    Json(payload): Json<TokenRefreshRequest>,
) -> Result<Response, TokenRefreshError> {
    let jwt_service = &state.jwt();
    let session_repo = AuthSessionRepository::new(state.pool());

    let token_details = match jwt_service.decode_refresh_token(&payload.refresh_token) {
        Ok(details) => details,
        Err(JwtError::TokenExpired) => return Err(TokenRefreshError::TokenExpired),
        Err(_) => return Err(TokenRefreshError::InvalidToken),
    };

    let session = session_repo.get(token_details.session_id).await?;

    if session.revoked_at.is_some() {
        return Err(TokenRefreshError::SessionRevoked);
    }

    if session.refresh_token_id != Some(token_details.refresh_token_id)
        || session_repo
            .is_refresh_token_revoked(token_details.refresh_token_id)
            .await?
    {
        // Token was reused, revoke all user sessions as a security measure
        let revoked_count = session_repo
            .revoke_all_user_sessions(token_details.user_id)
            .await?;
        warn!(
            user_id = %token_details.user_id,
            session_id = %token_details.session_id,
            revoked_sessions = revoked_count,
            "Refresh token reuse detected. Revoked all user sessions."
        );
        return Err(TokenRefreshError::TokenReuseDetected);
    }

    let user_repo = UserRepository::new(state.pool());
    let user = user_repo.fetch_user(token_details.user_id).await?;

    let tokens = jwt_service.generate_tokens(&session, &user)?;

    let old_token_id = token_details.refresh_token_id;
    let new_token_id = tokens.refresh_token_id;

    match session_repo
        .rotate_tokens(session.id, old_token_id, new_token_id)
        .await
    {
        Ok(_) => {}
        Err(AuthSessionError::TokenReuseDetected) => {
            let revoked_count = session_repo
                .revoke_all_user_sessions(token_details.user_id)
                .await?;
            warn!(
                user_id = %token_details.user_id,
                session_id = %token_details.session_id,
                revoked_sessions = revoked_count,
                "Detected concurrent refresh attempt; revoked all user sessions"
            );
            return Err(TokenRefreshError::TokenReuseDetected);
        }
        Err(error) => return Err(TokenRefreshError::SessionError(error)),
    }

    Ok(Json(TokenRefreshResponse {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
    })
    .into_response())
}

impl IntoResponse for TokenRefreshError {
    fn into_response(self) -> Response {
        let (status, error_code) = match self {
            TokenRefreshError::InvalidToken => (StatusCode::UNAUTHORIZED, "invalid_token"),
            TokenRefreshError::TokenExpired => (StatusCode::UNAUTHORIZED, "token_expired"),
            TokenRefreshError::SessionRevoked => (StatusCode::UNAUTHORIZED, "session_revoked"),
            TokenRefreshError::TokenReuseDetected => {
                (StatusCode::UNAUTHORIZED, "token_reuse_detected")
            }
            TokenRefreshError::Jwt(_) => (StatusCode::UNAUTHORIZED, "invalid_token"),
            TokenRefreshError::Identity(_) => (StatusCode::UNAUTHORIZED, "identity_error"),
            TokenRefreshError::Database(_) | TokenRefreshError::SessionError(_) => {
                (StatusCode::INTERNAL_SERVER_ERROR, "internal_error")
            }
        };

        let body = serde_json::json!({
            "error": error_code,
            "message": self.to_string()
        });

        (status, Json(body)).into_response()
    }
}
