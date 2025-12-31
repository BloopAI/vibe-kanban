use axum::{Json, Router, extract::State, response::Json as ResponseJson, routing::get};
use serde::Serialize;
use services::services::github::GitHubService;
use ts_rs::TS;
use utils::response::ApiResponse;

use crate::{DeploymentImpl, error::ApiError};

#[derive(Debug, Serialize, TS)]
pub struct GitHubUserResponse {
    pub login: String,
}

/// Get the current GitHub user from the gh CLI
pub async fn get_current_user(
    State(_deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<GitHubUserResponse>>, ApiError> {
    let github_service = GitHubService::new()?;

    let login = github_service.get_current_user().await?;

    Ok(ResponseJson(ApiResponse::success(GitHubUserResponse {
        login,
    })))
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new().nest(
        "/github",
        Router::new().route("/user", get(get_current_user)),
    )
}
