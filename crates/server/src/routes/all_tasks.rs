use axum::{Router, extract::State, response::Json as ResponseJson, routing::get};
use db::models::all_tasks::AllTasksResponse;
use deployment::Deployment;
use utils::response::ApiResponse;

use crate::{DeploymentImpl, error::ApiError};

/// Get all tasks from all projects with project info
pub async fn get_all_tasks(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<AllTasksResponse>>, ApiError> {
    let response = AllTasksResponse::fetch(&deployment.db().pool).await?;
    Ok(ResponseJson(ApiResponse::success(response)))
}

pub fn router(_deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    Router::new().nest(
        "/tasks",
        Router::new().route("/all", get(get_all_tasks)),
    )
}
