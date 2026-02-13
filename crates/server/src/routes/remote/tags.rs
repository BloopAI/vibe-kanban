use api_types::ListTagsResponse;
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
pub struct ListTagsQuery {
    pub project_id: Uuid,
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new().route("/tags", get(list_tags))
}

async fn list_tags(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<ListTagsQuery>,
) -> Result<ResponseJson<ApiResponse<ListTagsResponse>>, ApiError> {
    let client = deployment.remote_client()?;
    let response = client.list_tags(query.project_id).await?;
    Ok(ResponseJson(ApiResponse::success(response)))
}
