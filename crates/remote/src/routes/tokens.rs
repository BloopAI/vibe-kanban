use api_types::{TokenRefreshRequest, TokenRefreshResponse};
use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::post,
};
use tracing::warn;

use crate::{
    AppState,
    audit::{self, AuditAction, AuditEvent},
    auth::{TokenRefreshError, refresh_user_tokens},
};

pub fn public_router() -> Router<AppState> {
    Router::new().route("/tokens/refresh", post(refresh_token))
}

pub async fn refresh_token(
    State(state): State<AppState>,
    Json(payload): Json<TokenRefreshRequest>,
) -> Result<Response, TokenRefreshError> {
    let tokens = refresh_user_tokens(&state, &payload.refresh_token).await?;

    audit::emit(
        AuditEvent::system(AuditAction::AuthTokenRefresh)
            .user(tokens.user_id, Some(tokens.session_id))
            .resource("auth_session", Some(tokens.session_id))
            .http("POST", "/v1/tokens/refresh", 200),
    );

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
            TokenRefreshError::ProviderTokenRevoked => {
                (StatusCode::UNAUTHORIZED, "provider_token_revoked")
            }
            TokenRefreshError::ProviderValidationUnavailable(ref reason) => {
                warn!(
                    reason = reason.as_str(),
                    "Provider validation temporarily unavailable during refresh"
                );
                (
                    StatusCode::SERVICE_UNAVAILABLE,
                    "provider_validation_unavailable",
                )
            }
            TokenRefreshError::Jwt(_) => (StatusCode::UNAUTHORIZED, "invalid_token"),
            TokenRefreshError::Identity(_) => (StatusCode::UNAUTHORIZED, "identity_error"),
            TokenRefreshError::Database(ref err) => {
                tracing::error!(error = %err, "Database error during token refresh");
                (StatusCode::INTERNAL_SERVER_ERROR, "internal_error")
            }
            TokenRefreshError::SessionError(ref err) => {
                tracing::error!(error = %err, "Session error during token refresh");
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
