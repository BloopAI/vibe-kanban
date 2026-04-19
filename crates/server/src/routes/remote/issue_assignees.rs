use api_types::{
    CreateIssueAssigneeRequest, IssueAssignee, ListIssueAssigneesResponse, MutationResponse,
};
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
pub(super) struct ListIssueAssigneesQuery {
    pub issue_id: Uuid,
}

pub(super) fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route(
            "/issue-assignees",
            get(list_issue_assignees).post(create_issue_assignee),
        )
        .route(
            "/issue-assignees/{issue_assignee_id}",
            get(get_issue_assignee).delete(delete_issue_assignee),
        )
}

async fn list_issue_assignees(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<ListIssueAssigneesQuery>,
) -> Result<ResponseJson<ApiResponse<ListIssueAssigneesResponse>>, ApiError> {
    if deployment.local_only() {
        let lr = deployment.local_remote().expect("local_remote configured");
        let response = lr.list_issue_assignees(query.issue_id).await?;
        return Ok(ResponseJson(ApiResponse::success(response)));
    }
    let client = deployment.remote_client()?;
    let response = client.list_issue_assignees(query.issue_id).await?;
    Ok(ResponseJson(ApiResponse::success(response)))
}

async fn get_issue_assignee(
    State(deployment): State<DeploymentImpl>,
    Path(issue_assignee_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<IssueAssignee>>, ApiError> {
    if deployment.local_only() {
        let lr = deployment.local_remote().expect("local_remote configured");
        let response = lr.get_issue_assignee(issue_assignee_id).await?;
        return Ok(ResponseJson(ApiResponse::success(response)));
    }
    let client = deployment.remote_client()?;
    let response = client.get_issue_assignee(issue_assignee_id).await?;
    Ok(ResponseJson(ApiResponse::success(response)))
}

async fn create_issue_assignee(
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<CreateIssueAssigneeRequest>,
) -> Result<ResponseJson<ApiResponse<MutationResponse<IssueAssignee>>>, ApiError> {
    if deployment.local_only() {
        let lr = deployment.local_remote().expect("local_remote configured");
        let response = lr.create_issue_assignee(&request).await?;
        return Ok(ResponseJson(ApiResponse::success(response)));
    }
    let client = deployment.remote_client()?;
    let response = client.create_issue_assignee(&request).await?;
    Ok(ResponseJson(ApiResponse::success(response)))
}

async fn delete_issue_assignee(
    State(deployment): State<DeploymentImpl>,
    Path(issue_assignee_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    if deployment.local_only() {
        let lr = deployment.local_remote().expect("local_remote configured");
        lr.delete_issue_assignee(issue_assignee_id).await?;
        return Ok(ResponseJson(ApiResponse::success(())));
    }
    let client = deployment.remote_client()?;
    client.delete_issue_assignee(issue_assignee_id).await?;
    Ok(ResponseJson(ApiResponse::success(())))
}
