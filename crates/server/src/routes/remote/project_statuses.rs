use api_types::ListProjectStatusesResponse;
use axum::{
    Router,
    extract::{Query, State},
    response::Json as ResponseJson,
    routing::get,
};
use deployment::Deployment;
use serde::Deserialize;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

#[derive(Debug, Deserialize)]
pub(super) struct ListProjectStatusesQuery {
    pub project_id: Uuid,
}

pub(super) fn router() -> Router<DeploymentImpl> {
    Router::new().route("/project-statuses", get(list_project_statuses))
}

async fn list_project_statuses(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<ListProjectStatusesQuery>,
) -> Result<ResponseJson<ApiResponse<ListProjectStatusesResponse>>, ApiError> {
    if deployment.local_only() {
        let lr = deployment.local_remote().expect("local_remote configured");
        // Auto-seed default statuses on first request, so a freshly created
        // project always has a usable kanban.
        lr.ensure_default_statuses(query.project_id).await?;
        let response = lr.list_project_statuses(query.project_id).await?;
        return Ok(ResponseJson(ApiResponse::success(response)));
    }
    let client = deployment.remote_client()?;
    let response = client.list_project_statuses(query.project_id).await?;
    Ok(ResponseJson(ApiResponse::success(response)))
}
