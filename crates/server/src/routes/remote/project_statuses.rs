use api_types::ListProjectStatusesResponse;
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
pub struct ListProjectStatusesQuery {
    pub project_id: Uuid,
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new().route("/project-statuses", get(list_project_statuses))
}

#[utoipa::path(get, path = "/api/remote/project-statuses", tag = "Remote", params(("project_id" = Uuid, Query, description = "Project ID")), responses((status = 200, description = "Project statuses")))]
pub(crate) async fn list_project_statuses(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<ListProjectStatusesQuery>,
) -> Result<ResponseJson<ApiResponse<ListProjectStatusesResponse>>, ApiError> {
    let client = deployment.remote_client()?;
    let response = client.list_project_statuses(query.project_id).await?;
    Ok(ResponseJson(ApiResponse::success(response)))
}
