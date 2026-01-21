use axum::{
    Json,
    extract::{Extension, Path, Query, State},
    http::StatusCode,
};
use tracing::instrument;
use uuid::Uuid;

use super::{error::ErrorResponse, organization_members::ensure_project_access};
use crate::{
    AppState,
    auth::RequestContext,
    db::issues::{Issue, IssueRepository},
    define_mutation_router,
    entities::{CreateIssueRequest, ListIssuesQuery, ListIssuesResponse, UpdateIssueRequest},
    mutation_types::{DeleteResponse, MutationResponse},
};

// Generate router that references handlers below
define_mutation_router!(Issue, table: "issues");

#[instrument(
    name = "issues.list_issues",
    skip(state, ctx),
    fields(project_id = %query.project_id, user_id = %ctx.user.id)
)]
async fn list_issues(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(query): Query<ListIssuesQuery>,
) -> Result<Json<ListIssuesResponse>, ErrorResponse> {
    ensure_project_access(state.pool(), ctx.user.id, query.project_id).await?;

    let issues = IssueRepository::list_by_project(state.pool(), query.project_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, project_id = %query.project_id, "failed to list issues");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to list issues")
        })?;

    Ok(Json(ListIssuesResponse { issues }))
}

#[instrument(
    name = "issues.get_issue",
    skip(state, ctx),
    fields(issue_id = %issue_id, user_id = %ctx.user.id)
)]
async fn get_issue(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(issue_id): Path<Uuid>,
) -> Result<Json<Issue>, ErrorResponse> {
    let issue = IssueRepository::find_by_id(state.pool(), issue_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %issue_id, "failed to load issue");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to load issue")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "issue not found"))?;

    ensure_project_access(state.pool(), ctx.user.id, issue.project_id).await?;

    Ok(Json(issue))
}

#[instrument(
    name = "issues.create_issue",
    skip(state, ctx, payload),
    fields(project_id = %payload.project_id, user_id = %ctx.user.id)
)]
async fn create_issue(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<CreateIssueRequest>,
) -> Result<Json<MutationResponse<Issue>>, ErrorResponse> {
    ensure_project_access(state.pool(), ctx.user.id, payload.project_id).await?;

    let response = IssueRepository::create(
        state.pool(),
        payload.id,
        payload.project_id,
        payload.status_id,
        payload.title,
        payload.description,
        payload.priority,
        payload.start_date,
        payload.target_date,
        payload.completed_at,
        payload.sort_order,
        payload.parent_issue_id,
        payload.extension_metadata,
    )
    .await
    .map_err(|error| {
        tracing::error!(?error, "failed to create issue");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;

    Ok(Json(response))
}

#[instrument(
    name = "issues.update_issue",
    skip(state, ctx, payload),
    fields(issue_id = %issue_id, user_id = %ctx.user.id)
)]
async fn update_issue(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(issue_id): Path<Uuid>,
    Json(payload): Json<UpdateIssueRequest>,
) -> Result<Json<MutationResponse<Issue>>, ErrorResponse> {
    let issue = IssueRepository::find_by_id(state.pool(), issue_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %issue_id, "failed to load issue");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to load issue")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "issue not found"))?;

    ensure_project_access(state.pool(), ctx.user.id, issue.project_id).await?;

    let response = IssueRepository::update(
        state.pool(),
        issue_id,
        payload.status_id,
        payload.title,
        payload.description,
        payload.priority,
        payload.start_date,
        payload.target_date,
        payload.completed_at,
        payload.sort_order,
        payload.parent_issue_id,
        payload.extension_metadata,
    )
    .await
    .map_err(|error| {
        tracing::error!(?error, "failed to update issue");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;

    Ok(Json(response))
}

#[instrument(
    name = "issues.delete_issue",
    skip(state, ctx),
    fields(issue_id = %issue_id, user_id = %ctx.user.id)
)]
async fn delete_issue(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(issue_id): Path<Uuid>,
) -> Result<Json<DeleteResponse>, ErrorResponse> {
    let issue = IssueRepository::find_by_id(state.pool(), issue_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %issue_id, "failed to load issue");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to load issue")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "issue not found"))?;

    ensure_project_access(state.pool(), ctx.user.id, issue.project_id).await?;

    let response = IssueRepository::delete(state.pool(), issue_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to delete issue");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?;

    Ok(Json(response))
}
