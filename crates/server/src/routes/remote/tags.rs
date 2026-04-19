use api_types::{ListTagsResponse, Tag};
use axum::{
    Router,
    extract::{Path, Query, State},
    response::Json as ResponseJson,
    routing::get,
};
use deployment::Deployment;
use serde::Deserialize;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

#[derive(Debug, Deserialize)]
pub(super) struct ListTagsQuery {
    pub project_id: Uuid,
}

pub(super) fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/tags", get(list_tags))
        .route("/tags/{tag_id}", get(get_tag))
}

async fn list_tags(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<ListTagsQuery>,
) -> Result<ResponseJson<ApiResponse<ListTagsResponse>>, ApiError> {
    if deployment.local_only() {
        let lr = deployment.local_remote().expect("local_remote configured");
        let response = lr.list_tags(query.project_id).await?;
        return Ok(ResponseJson(ApiResponse::success(response)));
    }
    let client = deployment.remote_client()?;
    let response = client.list_tags(query.project_id).await?;
    Ok(ResponseJson(ApiResponse::success(response)))
}

async fn get_tag(
    State(deployment): State<DeploymentImpl>,
    Path(tag_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<Tag>>, ApiError> {
    if deployment.local_only() {
        let lr = deployment.local_remote().expect("local_remote configured");
        let response = lr.get_tag(tag_id).await?;
        return Ok(ResponseJson(ApiResponse::success(response)));
    }
    let client = deployment.remote_client()?;
    let response = client.get_tag(tag_id).await?;
    Ok(ResponseJson(ApiResponse::success(response)))
}
