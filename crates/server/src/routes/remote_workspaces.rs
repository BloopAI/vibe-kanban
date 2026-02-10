use api_types::Workspace;
use axum::{
    Router,
    extract::State,
    response::Json as ResponseJson,
    routing::get,
};
use utils::response::ApiResponse;

use crate::{DeploymentImpl, error::ApiError};

pub fn router() -> Router<DeploymentImpl> {
    Router::new().route("/remote/workspaces", get(list_workspaces))
}

async fn list_workspaces(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<Workspace>>>, ApiError> {
    let client = deployment.remote_client()?;
    let workspaces = client.list_workspaces().await?;
    Ok(ResponseJson(ApiResponse::success(workspaces)))
}
