use axum::{
    Json, Router,
    extract::{Extension, State},
    http::StatusCode,
    routing::post,
};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use tracing::instrument;
use uuid::Uuid;

use super::{error::ErrorResponse, organization_members::ensure_issue_access};
use crate::{
    AppState,
    auth::RequestContext,
    db::{
        issues::IssueRepository,
        pull_requests::{PullRequest, PullRequestRepository},
        types::PullRequestStatus,
        workspaces::WorkspaceRepository,
    },
};

#[derive(Debug, Deserialize)]
pub struct CreatePullRequestRequest {
    pub url: String,
    pub number: i32,
    pub status: PullRequestStatus,
    pub merged_at: Option<DateTime<Utc>>,
    pub merge_commit_sha: Option<String>,
    pub target_branch_name: String,
    pub issue_id: Uuid,
    pub local_workspace_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePullRequestRequest {
    pub url: String,
    pub status: Option<PullRequestStatus>,
    pub merged_at: Option<Option<DateTime<Utc>>>,
    pub merge_commit_sha: Option<Option<String>>,
}

pub fn router() -> Router<AppState> {
    Router::new().route(
        "/pull_requests",
        post(create_pull_request).patch(update_pull_request),
    )
}

#[instrument(
    name = "pull_requests.create_pull_request",
    skip(state, ctx, payload),
    fields(issue_id = %payload.issue_id, local_workspace_id = ?payload.local_workspace_id, user_id = %ctx.user.id)
)]
async fn create_pull_request(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<CreatePullRequestRequest>,
) -> Result<Json<PullRequest>, ErrorResponse> {
    ensure_issue_access(state.pool(), ctx.user.id, payload.issue_id).await?;

    // Resolve local_workspace_id to remote workspace_id
    let workspace_id = match payload.local_workspace_id {
        Some(local_id) => {
            let workspace = WorkspaceRepository::find_by_local_id(state.pool(), local_id)
                .await
                .map_err(|error| {
                    tracing::error!(?error, local_workspace_id = %local_id, "failed to find workspace");
                    ErrorResponse::new(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "failed to find workspace",
                    )
                })?
                .ok_or_else(|| {
                    tracing::warn!(local_workspace_id = %local_id, "workspace not found");
                    ErrorResponse::new(StatusCode::NOT_FOUND, "workspace not found")
                })?;
            Some(workspace.id)
        }
        None => None,
    };

    let pr = PullRequestRepository::create(
        state.pool(),
        payload.url,
        payload.number,
        payload.status,
        payload.merged_at,
        payload.merge_commit_sha,
        payload.target_branch_name,
        payload.issue_id,
        workspace_id,
    )
    .await
    .map_err(|error| {
        tracing::error!(?error, "failed to create pull request");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;

    IssueRepository::sync_status_from_pull_request(state.pool(), pr.issue_id, pr.status)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to sync issue status");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?;

    Ok(Json(pr))
}

#[instrument(
    name = "pull_requests.update_pull_request",
    skip(state, ctx, payload),
    fields(url = %payload.url, user_id = %ctx.user.id)
)]
async fn update_pull_request(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<UpdatePullRequestRequest>,
) -> Result<Json<PullRequest>, ErrorResponse> {
    let pull_request = PullRequestRepository::find_by_url(state.pool(), &payload.url)
        .await
        .map_err(|error| {
            tracing::error!(?error, url = %payload.url, "failed to load pull request");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to load pull request",
            )
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "pull request not found"))?;

    ensure_issue_access(state.pool(), ctx.user.id, pull_request.issue_id).await?;

    let pr = PullRequestRepository::update(
        state.pool(),
        pull_request.id,
        payload.status,
        payload.merged_at,
        payload.merge_commit_sha,
    )
    .await
    .map_err(|error| {
        tracing::error!(?error, "failed to update pull request");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;

    IssueRepository::sync_status_from_pull_request(state.pool(), pr.issue_id, pr.status)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to sync issue status");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?;

    Ok(Json(pr))
}
