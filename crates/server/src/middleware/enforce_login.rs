use axum::{
    body::Body,
    extract::State,
    http::{Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use api_types::LoginStatus;

use crate::DeploymentImpl;

/// Middleware to enforce login when VK_ENFORCE_LOGIN environment variable is set to true.
/// 
/// This middleware checks if VK_ENFORCE_LOGIN is enabled and if the user is logged in.
/// If enforcement is enabled and the user is not logged in, it returns 401 Unauthorized.
pub async fn enforce_login_middleware(
    State(deployment): State<DeploymentImpl>,
    request: Request<Body>,
    next: Next,
) -> Response {
    // Check if enforce_login is enabled via environment variable
    let enforce_login = std::env::var("VK_ENFORCE_LOGIN")
        .ok()
        .and_then(|v| v.parse::<bool>().ok())
        .unwrap_or(false);

    // If not enforcing, proceed with the request
    if !enforce_login {
        return next.run(request).await;
    }

    // Check login status
    let login_status = deployment.get_login_status().await;

    match login_status {
        LoginStatus::LoggedIn { .. } => {
            // User is logged in, proceed with the request
            next.run(request).await
        }
        LoginStatus::LoggedOut => {
            // User is not logged in and enforce_login is enabled
            StatusCode::UNAUTHORIZED.into_response()
        }
    }
}
