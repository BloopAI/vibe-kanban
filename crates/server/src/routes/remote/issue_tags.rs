use api_types::{CreateIssueTagRequest, IssueTag, ListIssueTagsResponse, MutationResponse};
use axum::{
    Router,
    extract::{Json, Path, Query, State},
    response::Json as ResponseJson,
    routing::get,
};
use deployment::Deployment;
use serde::Deserialize;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

#[derive(Debug, Deserialize)]
pub(super) struct ListIssueTagsQuery {
    pub issue_id: Uuid,
}

pub(super) fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/issue-tags", get(list_issue_tags).post(create_issue_tag))
        .route(
            "/issue-tags/{issue_tag_id}",
            get(get_issue_tag).delete(delete_issue_tag),
        )
}

async fn list_issue_tags(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<ListIssueTagsQuery>,
) -> Result<ResponseJson<ApiResponse<ListIssueTagsResponse>>, ApiError> {
    if deployment.local_only() {
        let lr = deployment.local_remote().expect("local_remote configured");
        let response = lr.list_issue_tags(query.issue_id).await?;
        return Ok(ResponseJson(ApiResponse::success(response)));
    }
    let client = deployment.remote_client()?;
    let response = client.list_issue_tags(query.issue_id).await?;
    Ok(ResponseJson(ApiResponse::success(response)))
}

async fn get_issue_tag(
    State(deployment): State<DeploymentImpl>,
    Path(issue_tag_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<IssueTag>>, ApiError> {
    if deployment.local_only() {
        let lr = deployment.local_remote().expect("local_remote configured");
        let response = lr.get_issue_tag(issue_tag_id).await?;
        return Ok(ResponseJson(ApiResponse::success(response)));
    }
    let client = deployment.remote_client()?;
    let response = client.get_issue_tag(issue_tag_id).await?;
    Ok(ResponseJson(ApiResponse::success(response)))
}

async fn create_issue_tag(
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<CreateIssueTagRequest>,
) -> Result<ResponseJson<ApiResponse<MutationResponse<IssueTag>>>, ApiError> {
    if deployment.local_only() {
        let lr = deployment.local_remote().expect("local_remote configured");
        let response = lr.create_issue_tag(&request).await?;
        return Ok(ResponseJson(ApiResponse::success(response)));
    }
    let client = deployment.remote_client()?;
    let response = client.create_issue_tag(&request).await?;
    Ok(ResponseJson(ApiResponse::success(response)))
}

async fn delete_issue_tag(
    State(deployment): State<DeploymentImpl>,
    Path(issue_tag_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    if deployment.local_only() {
        let lr = deployment.local_remote().expect("local_remote configured");
        lr.delete_issue_tag(issue_tag_id).await?;
        return Ok(ResponseJson(ApiResponse::success(())));
    }
    let client = deployment.remote_client()?;
    client.delete_issue_tag(issue_tag_id).await?;
    Ok(ResponseJson(ApiResponse::success(())))
}
