//! Google SSO authentication middleware.
//!
//! This middleware checks for a valid Google SSO session when the feature is enabled.
//! If SSO is not enabled, requests pass through unchanged.

use axum::{
    extract::{Request, State},
    http::{HeaderMap, StatusCode},
    middleware::Next,
    response::Response,
};

use crate::{routes::oauth::extract_session_cookie, DeploymentImpl};

/// Middleware that requires a valid Google SSO session when SSO is enabled.
///
/// If `GOOGLE_SSO_ENABLED` is `false`, all requests pass through.
/// If `GOOGLE_SSO_ENABLED` is `true`, requests without a valid session receive 401 Unauthorized.
pub async fn require_google_sso(
    State(deployment): State<DeploymentImpl>,
    headers: HeaderMap,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let google_sso = deployment.google_sso_service();

    // If SSO is not enabled, pass through
    if !google_sso.is_enabled() {
        return Ok(next.run(request).await);
    }

    // Extract session cookie
    let session_id = match extract_session_cookie(&headers) {
        Some(id) => id,
        None => {
            tracing::debug!("Google SSO: No session cookie found");
            return Err(StatusCode::UNAUTHORIZED);
        }
    };

    // Validate session
    if google_sso.validate_session(&session_id).is_none() {
        tracing::debug!("Google SSO: Invalid or expired session");
        return Err(StatusCode::UNAUTHORIZED);
    }

    // Session is valid, continue to the handler
    Ok(next.run(request).await)
}
