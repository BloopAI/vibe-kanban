use api_types::{ListPullRequestsQuery, ListPullRequestsResponse};
use axum::{
    Router,
    extract::{Query, State},
    response::Json as ResponseJson,
    routing::get,
};
use utils::response::ApiResponse;

use crate::{DeploymentImpl, error::ApiError};

pub fn router() -> Router<DeploymentImpl> {
    Router::new().route("/pull-requests", get(list_pull_requests))
}

async fn list_pull_requests(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<ListPullRequestsQuery>,
) -> Result<ResponseJson<ApiResponse<ListPullRequestsResponse>>, ApiError> {
    let client = deployment.remote_client()?;
    let response = client.list_pull_requests(query.issue_id).await?;
    Ok(ResponseJson(ApiResponse::success(response)))
}
