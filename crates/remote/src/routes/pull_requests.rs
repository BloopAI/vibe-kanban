use api_types::{
    ListPullRequestsQuery, ListPullRequestsResponse, MutationResponse, PullRequest,
    PullRequestStatus, UpsertPullRequestRequest,
};
use axum::{
    Json, Router,
    extract::{Extension, Query, State},
    http::StatusCode,
    routing::get,
};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use tracing::instrument;
use uuid::Uuid;

use super::{
    error::{ErrorResponse, db_error},
    organization_members::ensure_issue_access,
};
use crate::{
    AppState,
    auth::RequestContext,
    db::{
        get_txid, issues::IssueRepository, pull_request_issues::PullRequestIssueRepository,
        pull_requests::PullRequestRepository, workspaces::WorkspaceRepository,
    },
};

/// Deprecated: use `POST /v1/pull_request_issues` instead for linking PRs to
/// issues. This endpoint is retained for backward compatibility with older
/// clients that still send the old request shape.
#[derive(Debug, Deserialize)]
struct CreatePullRequestRequest {
    pub url: String,
    pub number: i32,
    pub status: PullRequestStatus,
    pub merged_at: Option<DateTime<Utc>>,
    pub merge_commit_sha: Option<String>,
    pub target_branch_name: String,
    pub issue_id: Uuid,
    #[allow(dead_code)]
    pub local_workspace_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
struct UpdatePullRequestRequest {
    pub url: String,
    pub status: Option<PullRequestStatus>,
    pub merged_at: Option<Option<DateTime<Utc>>>,
    pub merge_commit_sha: Option<Option<String>>,
}

pub(super) fn router() -> Router<AppState> {
    Router::new().route(
        "/pull_requests",
        get(list_pull_requests)
            .post(create_pull_request)
            .patch(update_pull_request)
            .put(upsert_pull_request),
    )
}

#[instrument(
    name = "pull_requests.list_pull_requests",
    skip(state, ctx),
    fields(issue_id = %query.issue_id, user_id = %ctx.user.id)
)]
async fn list_pull_requests(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(query): Query<ListPullRequestsQuery>,
) -> Result<Json<ListPullRequestsResponse>, ErrorResponse> {
    ensure_issue_access(state.pool(), ctx.user.id, query.issue_id).await?;

    let pull_requests = PullRequestRepository::list_by_issue(state.pool(), query.issue_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to list pull requests");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to list pull requests",
            )
        })?;

    Ok(Json(ListPullRequestsResponse { pull_requests }))
}

/// Deprecated: use `POST /v1/pull_request_issues` instead.
/// Kept for backward compatibility with older clients.
#[instrument(
    name = "pull_requests.create_pull_request",
    skip(state, ctx, payload),
    fields(url = %payload.url, user_id = %ctx.user.id)
)]
async fn create_pull_request(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<CreatePullRequestRequest>,
) -> Result<Json<MutationResponse<PullRequest>>, ErrorResponse> {
    let issue_id = payload.issue_id;

    ensure_issue_access(state.pool(), ctx.user.id, issue_id).await?;

    let issue = IssueRepository::find_by_id(state.pool(), issue_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to find issue");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to find issue")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "issue not found"))?;

    let project_id = issue.project_id;

    let mut tx = state.pool().begin().await.map_err(|error| {
        tracing::error!(?error, "failed to begin transaction");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;

    let pr =
        match PullRequestRepository::find_by_url_and_project(&mut *tx, &payload.url, project_id)
            .await
            .map_err(|error| {
                tracing::error!(?error, "failed to look up existing pull request");
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
            })? {
            Some(existing) => existing,
            None => PullRequestRepository::create(
                &mut *tx,
                payload.url,
                payload.number,
                payload.status,
                payload.merged_at,
                payload.merge_commit_sha,
                payload.target_branch_name,
                project_id,
                issue_id,
            )
            .await
            .map_err(|error| {
                tracing::error!(?error, "failed to create pull request");
                db_error(error, "failed to create pull request")
            })?,
        };

    PullRequestIssueRepository::create(&mut *tx, pr.id, issue_id, None)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to link pull request to issue");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?;

    IssueRepository::sync_status_from_pull_request(&mut tx, issue_id, pr.status)
        .await
        .map_err(|error| {
            tracing::error!(?error, %issue_id, "failed to sync issue status after PR creation");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?;

    let txid = get_txid(&mut *tx).await.map_err(|error| {
        tracing::error!(?error, "failed to get txid");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;

    tx.commit().await.map_err(|error| {
        tracing::error!(?error, "failed to commit transaction");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;

    Ok(Json(MutationResponse { data: pr, txid }))
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
) -> Result<Json<MutationResponse<PullRequest>>, ErrorResponse> {
    let pull_requests =
        PullRequestRepository::list_by_url_for_user(state.pool(), &payload.url, ctx.user.id)
            .await
            .map_err(|error| {
                tracing::error!(?error, url = %payload.url, "failed to load pull requests");
                ErrorResponse::new(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "failed to load pull requests",
                )
            })?;

    if pull_requests.is_empty() {
        return Err(ErrorResponse::new(
            StatusCode::NOT_FOUND,
            "pull request not found",
        ));
    }

    let mut tx = state.pool().begin().await.map_err(|error| {
        tracing::error!(?error, "failed to begin transaction");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;

    let mut last_pr = None;
    for pull_request in &pull_requests {
        let updated = PullRequestRepository::update(
            &mut *tx,
            pull_request.id,
            payload.status,
            payload.merged_at,
            payload.merge_commit_sha.clone(),
        )
        .await
        .map_err(|error| {
            tracing::error!(?error, pr_id = %pull_request.id, "failed to update pull request");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?;
        last_pr = Some(updated);
    }

    let pr = last_pr.ok_or_else(|| {
        ErrorResponse::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "no pull requests updated",
        )
    })?;

    for pull_request in &pull_requests {
        let issue_ids = PullRequestIssueRepository::issue_ids_for_pr(&mut *tx, pull_request.id)
            .await
            .map_err(|error| {
                tracing::error!(?error, "failed to get issue ids for pull request");
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
            })?;
        for issue_id in issue_ids {
            IssueRepository::sync_status_from_pull_request(&mut tx, issue_id, pr.status)
                .await
                .map_err(|error| {
                    tracing::error!(?error, %issue_id, "failed to sync issue status after PR update");
                    ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
                })?;
        }
    }

    let txid = get_txid(&mut *tx).await.map_err(|error| {
        tracing::error!(?error, "failed to get txid");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;

    tx.commit().await.map_err(|error| {
        tracing::error!(?error, "failed to commit transaction");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;

    Ok(Json(MutationResponse { data: pr, txid }))
}

#[instrument(
    name = "pull_requests.upsert_pull_request",
    skip(state, ctx, payload),
    fields(url = %payload.url, local_workspace_id = %payload.local_workspace_id, user_id = %ctx.user.id)
)]
async fn upsert_pull_request(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<UpsertPullRequestRequest>,
) -> Result<Json<MutationResponse<PullRequest>>, ErrorResponse> {
    let workspace = WorkspaceRepository::find_by_local_id(state.pool(), payload.local_workspace_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, local_workspace_id = %payload.local_workspace_id, "failed to find workspace");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to find workspace",
            )
        })?
        .ok_or_else(|| {
            tracing::info!(local_workspace_id = %payload.local_workspace_id, "workspace not found");
            ErrorResponse::new(StatusCode::NOT_FOUND, "workspace not found")
        })?;

    let issue_id = workspace
        .issue_id
        .ok_or_else(|| ErrorResponse::new(StatusCode::BAD_REQUEST, "workspace has no issue"))?;

    ensure_issue_access(state.pool(), ctx.user.id, issue_id).await?;

    let issue = IssueRepository::find_by_id(state.pool(), issue_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to find issue");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to find issue")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "issue not found"))?;

    let project_id = issue.project_id;

    let mut tx = state.pool().begin().await.map_err(|error| {
        tracing::error!(?error, "failed to begin transaction");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;

    let existing_pr =
        PullRequestRepository::find_by_url_and_project(&mut *tx, &payload.url, project_id)
            .await
            .map_err(|error| {
                tracing::error!(?error, url = %payload.url, "failed to check for existing PR");
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
            })?;

    let pr = if let Some(existing) = existing_pr {
        PullRequestRepository::update(
            &mut *tx,
            existing.id,
            Some(payload.status),
            Some(payload.merged_at),
            Some(payload.merge_commit_sha),
        )
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to update pull request");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?
    } else {
        PullRequestRepository::create(
            &mut *tx,
            payload.url,
            payload.number,
            payload.status,
            payload.merged_at,
            payload.merge_commit_sha,
            payload.target_branch_name,
            project_id,
            issue_id,
        )
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to create pull request");
            db_error(error, "failed to create pull request")
        })?
    };

    PullRequestIssueRepository::create(&mut *tx, pr.id, issue_id, None)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to link pull request to issue");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?;

    IssueRepository::sync_status_from_pull_request(&mut tx, issue_id, pr.status)
        .await
        .map_err(|error| {
            tracing::error!(?error, %issue_id, "failed to sync issue status after PR upsert");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?;

    let txid = get_txid(&mut *tx).await.map_err(|error| {
        tracing::error!(?error, "failed to get txid");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;

    tx.commit().await.map_err(|error| {
        tracing::error!(?error, "failed to commit transaction");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;

    Ok(Json(MutationResponse { data: pr, txid }))
}
