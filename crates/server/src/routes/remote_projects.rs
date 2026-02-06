use api_types::ListProjectsResponse;
use axum::{
    Router,
    extract::{Query, State},
    response::Json as ResponseJson,
    routing::get,
};
use serde::Deserialize;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

#[derive(Debug, Deserialize)]
pub struct ListRemoteProjectsQuery {
    pub organization_id: Uuid,
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new().route("/remote/projects", get(list_remote_projects))
}

async fn list_remote_projects(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<ListRemoteProjectsQuery>,
) -> Result<ResponseJson<ApiResponse<ListProjectsResponse>>, ApiError> {
    let client = deployment.remote_client()?;
    let response = client.list_remote_projects(query.organization_id).await?;
    Ok(ResponseJson(ApiResponse::success(response)))
}
