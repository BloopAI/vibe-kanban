use api_types::{
    CreatePullRequestIssueRequest, DeleteResponse, ListPullRequestIssuesResponse, MutationResponse,
    PullRequestIssue,
};
use axum::{
    Json,
    extract::{Extension, Path, Query, State},
    http::StatusCode,
};
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
        begin_tx, get_txid, issues::IssueRepository,
        pull_request_issues::PullRequestIssueRepository, pull_requests::PullRequestRepository,
    },
    mutation_definition::{MutationBuilder, NoUpdate},
};

#[derive(Debug, serde::Deserialize)]
pub struct ListPullRequestIssuesQuery {
    pub issue_id: Uuid,
}

pub fn mutation() -> MutationBuilder<PullRequestIssue, CreatePullRequestIssueRequest, NoUpdate> {
    MutationBuilder::new("pull_request_issues")
        .list(list_pull_request_issues)
        .get(get_pull_request_issue)
        .create(create_pull_request_issue)
        .delete(delete_pull_request_issue)
}

pub fn router() -> axum::Router<AppState> {
    mutation().router()
}

#[instrument(
    name = "pull_request_issues.list",
    skip(state, ctx),
    fields(issue_id = %query.issue_id, user_id = %ctx.user.id)
)]
async fn list_pull_request_issues(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(query): Query<ListPullRequestIssuesQuery>,
) -> Result<Json<ListPullRequestIssuesResponse>, ErrorResponse> {
    ensure_issue_access(state.pool(), ctx.user.id, query.issue_id).await?;

    let pull_request_issues =
        PullRequestIssueRepository::list_by_issue(state.pool(), query.issue_id)
            .await
            .map_err(|error| {
                tracing::error!(?error, "failed to list pull request issues");
                ErrorResponse::new(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "failed to list pull request issues",
                )
            })?;

    Ok(Json(ListPullRequestIssuesResponse {
        pull_request_issues,
    }))
}

#[instrument(
    name = "pull_request_issues.get",
    skip(state, ctx),
    fields(id = %id, user_id = %ctx.user.id)
)]
async fn get_pull_request_issue(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(id): Path<Uuid>,
) -> Result<Json<PullRequestIssue>, ErrorResponse> {
    let link = PullRequestIssueRepository::find_by_id(state.pool(), id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %id, "failed to load pull request issue");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to load pull request issue",
            )
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "pull request issue not found"))?;

    ensure_issue_access(state.pool(), ctx.user.id, link.issue_id).await?;

    Ok(Json(link))
}

#[instrument(
    name = "pull_request_issues.create",
    skip(state, ctx, payload),
    fields(issue_id = %payload.issue_id, url = %payload.url, user_id = %ctx.user.id)
)]
async fn create_pull_request_issue(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<CreatePullRequestIssueRequest>,
) -> Result<Json<MutationResponse<PullRequestIssue>>, ErrorResponse> {
    ensure_issue_access(state.pool(), ctx.user.id, payload.issue_id).await?;

    let issue = IssueRepository::find_by_id(state.pool(), payload.issue_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to find issue");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to find issue")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "issue not found"))?;

    let project_id = issue.project_id;

    let mut tx = begin_tx(state.pool()).await.map_err(|error| {
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
            Some(existing) => PullRequestRepository::update(
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
            })?,
            None => PullRequestRepository::create(
                &mut *tx,
                payload.url,
                payload.number,
                payload.status,
                payload.merged_at,
                payload.merge_commit_sha,
                payload.target_branch_name,
                project_id,
                payload.issue_id,
            )
            .await
            .map_err(|error| {
                tracing::error!(?error, "failed to create pull request");
                db_error(error, "failed to create pull request")
            })?,
        };

    let data = PullRequestIssueRepository::create(&mut *tx, pr.id, payload.issue_id, payload.id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to link pull request to issue");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?;

    IssueRepository::sync_status_from_pull_request(&mut tx, payload.issue_id, pr.status)
        .await
        .map_err(|error| {
            tracing::error!(?error, %payload.issue_id, "failed to sync issue status");
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

    Ok(Json(MutationResponse { data, txid }))
}

#[instrument(
    name = "pull_request_issues.delete",
    skip(state, ctx),
    fields(id = %id, user_id = %ctx.user.id)
)]
async fn delete_pull_request_issue(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(id): Path<Uuid>,
) -> Result<Json<DeleteResponse>, ErrorResponse> {
    let link = PullRequestIssueRepository::find_by_id(state.pool(), id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %id, "failed to load pull request issue");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to load pull request issue",
            )
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "pull request issue not found"))?;

    ensure_issue_access(state.pool(), ctx.user.id, link.issue_id).await?;

    let mut tx = begin_tx(state.pool()).await.map_err(|error| {
        tracing::error!(?error, "failed to begin transaction");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;

    PullRequestIssueRepository::delete_and_cleanup_orphan(
        &mut tx,
        link.pull_request_id,
        link.issue_id,
    )
    .await
    .map_err(|error| {
        tracing::error!(?error, "failed to delete pull request issue");
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

    Ok(Json(DeleteResponse { txid }))
}
