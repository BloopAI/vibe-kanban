use api_types::{
    CreatePullRequestApiRequest, ListPullRequestsQuery, ListPullRequestsResponse, PullRequestStatus,
};
use axum::{
    Json, Router,
    extract::{Query, State},
    response::Json as ResponseJson,
    routing::{get, post},
};
use db::models::tracked_pr::TrackedPr;
use deployment::Deployment;
use serde::{Deserialize, Serialize};
use services::services::remote_client::RemoteClientError;
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/pull-requests", get(list_pull_requests))
        .route("/pull-requests/link", post(link_pr_to_issue))
}

async fn list_pull_requests(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<ListPullRequestsQuery>,
) -> Result<ResponseJson<ApiResponse<ListPullRequestsResponse>>, ApiError> {
    let client = deployment.remote_client()?;
    let response = client.list_pull_requests(query.issue_id).await?;
    Ok(ResponseJson(ApiResponse::success(response)))
}

#[derive(Debug, Deserialize, Serialize, TS)]
pub struct LinkPrToIssueRequest {
    pub issue_id: Uuid,
    pub pr_number: i64,
    pub pr_url: String,
    pub base_branch: String,
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(tag = "type", rename_all = "snake_case")]
pub enum LinkPrError {
    NotAuthenticated,
    RemoteError { message: String },
    AlreadyLinked,
}

async fn link_pr_to_issue(
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<LinkPrToIssueRequest>,
) -> Result<ResponseJson<ApiResponse<(), LinkPrError>>, ApiError> {
    let client = match deployment.remote_client() {
        Ok(c) => c,
        Err(_) => {
            return Ok(ResponseJson(ApiResponse::error_with_data(
                LinkPrError::NotAuthenticated,
            )));
        }
    };

    let create_request = CreatePullRequestApiRequest {
        url: request.pr_url.clone(),
        number: request.pr_number as i32,
        status: PullRequestStatus::Open,
        merged_at: None,
        merge_commit_sha: None,
        target_branch_name: request.base_branch.clone(),
        issue_id: request.issue_id,
        local_workspace_id: None,
    };

    match client.create_pull_request(create_request).await {
        Ok(_) => {}
        Err(RemoteClientError::Http { status: 409, .. }) => {
            return Ok(ResponseJson(ApiResponse::error_with_data(
                LinkPrError::AlreadyLinked,
            )));
        }
        Err(e) => {
            tracing::error!("Failed to create PR on remote: {}", e);
            return Ok(ResponseJson(ApiResponse::error_with_data(
                LinkPrError::RemoteError {
                    message: e.to_string(),
                },
            )));
        }
    }

    // Track locally for PR status monitoring (INSERT OR IGNORE for idempotency)
    if let Err(e) = TrackedPr::create(
        &deployment.db().pool,
        request.issue_id,
        &request.pr_url,
        request.pr_number,
        &request.base_branch,
    )
    .await
    {
        tracing::warn!("Failed to create tracked PR record: {}", e);
    }

    Ok(ResponseJson(ApiResponse::success(())))
}
