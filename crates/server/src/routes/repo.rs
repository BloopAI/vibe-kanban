use std::path::Path;

use axum::{
    Router,
    extract::{Query, State},
    response::Json as ResponseJson,
    routing::get,
};
use deployment::Deployment;
use serde::Deserialize;
use services::services::git::GitBranch;
use utils::response::ApiResponse;

use crate::{DeploymentImpl, error::ApiError};

#[derive(Debug, Deserialize)]
pub struct GetBranchesQuery {
    path: String,
}

pub async fn get_repo_branches(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<GetBranchesQuery>,
) -> Result<ResponseJson<ApiResponse<Vec<GitBranch>>>, ApiError> {
    let path = Path::new(&query.path);
    let branches = deployment.git().get_all_branches(path)?;
    Ok(ResponseJson(ApiResponse::success(branches)))
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new().route("/repo/branches", get(get_repo_branches))
}
