use api_types::{
    CreateTagRequest, ListTagsResponse, MutationResponse, Tag, UpdateTagRequest,
};
use axum::{
    Router,
    extract::{Json, Path, Query, State},
    response::Json as ResponseJson,
    routing::get,
};
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
        .route("/tags", get(list_tags).post(create_tag))
        .route(
            "/tags/{tag_id}",
            get(get_tag).put(update_tag).delete(delete_tag),
        )
}

async fn list_tags(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<ListTagsQuery>,
) -> Result<ResponseJson<ApiResponse<ListTagsResponse>>, ApiError> {
    let client = deployment.remote_client()?;
    let response = client.list_tags(query.project_id).await?;
    Ok(ResponseJson(ApiResponse::success(response)))
}

async fn get_tag(
    State(deployment): State<DeploymentImpl>,
    Path(tag_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<Tag>>, ApiError> {
    let client = deployment.remote_client()?;
    let response = client.get_tag(tag_id).await?;
    Ok(ResponseJson(ApiResponse::success(response)))
}

async fn create_tag(
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<CreateTagRequest>,
) -> Result<ResponseJson<ApiResponse<MutationResponse<Tag>>>, ApiError> {
    let client = deployment.remote_client()?;
    let response = client.create_tag(&request).await?;
    Ok(ResponseJson(ApiResponse::success(response)))
}

async fn update_tag(
    State(deployment): State<DeploymentImpl>,
    Path(tag_id): Path<Uuid>,
    Json(request): Json<UpdateTagRequest>,
) -> Result<ResponseJson<ApiResponse<MutationResponse<Tag>>>, ApiError> {
    let client = deployment.remote_client()?;
    let response = client.update_tag(tag_id, &request).await?;
    Ok(ResponseJson(ApiResponse::success(response)))
}

async fn delete_tag(
    State(deployment): State<DeploymentImpl>,
    Path(tag_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let client = deployment.remote_client()?;
    client.delete_tag(tag_id).await?;
    Ok(ResponseJson(ApiResponse::success(())))
}
