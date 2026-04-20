use api_types::{LoginStatus, StatusResponse};
use axum::{
    Router,
    extract::State,
    http::StatusCode,
    response::Json as ResponseJson,
    routing::{get, post},
};
use utils::response::ApiResponse;

use crate::{DeploymentImpl, error::ApiError};

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/auth/status", get(status))
        .route("/auth/logout", post(logout))
}

/// Single-user mode: always return logged-in status.
async fn status(
    State(deployment): State<DeploymentImpl>,
) -> ResponseJson<ApiResponse<StatusResponse>> {
    let login_status = deployment.get_login_status().await;
    ResponseJson(ApiResponse::success(StatusResponse {
        logged_in: matches!(login_status, LoginStatus::LoggedIn { .. }),
        profile: None,
        degraded: None,
    }))
}

async fn logout(State(deployment): State<DeploymentImpl>) -> Result<StatusCode, ApiError> {
    deployment.get_login_status().await;
    Ok(StatusCode::NO_CONTENT)
}
