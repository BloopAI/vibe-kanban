use axum::{
    Json,
    extract::{Extension, Path, Query, State},
    http::StatusCode,
    routing::post,
};
use serde::{Deserialize, Serialize};
use tracing::instrument;
use api_types::{
    CreateIssueRequest, Issue, ListIssuesQuery, ListIssuesResponse, UpdateIssueRequest,
};
use uuid::Uuid;

use super::{
    error::{ErrorResponse, db_error},
    organization_members::ensure_project_access,
};
use api_types::{DeleteResponse, MutationResponse};
use crate::{
    AppState,
    auth::RequestContext,
    db::{get_txid, issues::IssueRepository},
    mutation_definition::MutationBuilder,
};

/// Mutation definition for Issue - provides both router and TypeScript metadata.
pub fn mutation() -> MutationBuilder<Issue, CreateIssueRequest, UpdateIssueRequest> {
    MutationBuilder::new("issues")
        .list(list_issues)
        .get(get_issue)
        .create(create_issue)
        .update(update_issue)
        .delete(delete_issue)
}

/// Router for issue endpoints including bulk update
pub fn router() -> axum::Router<AppState> {
    mutation()
        .router()
        .route("/issues/bulk", post(bulk_update_issues))
}

#[utoipa::path(
    get, path = "/v1/issues",
    tag = "Issues",
    params(("project_id" = Uuid, Query, description = "Project ID")),
    responses(
        (status = 200, description = "List of issues"),
        (status = 403, description = "Forbidden")
    ),
    security(("bearer_auth" = []))
)]
#[instrument(
    name = "issues.list_issues",
    skip(state, ctx),
    fields(project_id = %query.project_id, user_id = %ctx.user.id)
)]
pub(crate) async fn list_issues(
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

#[utoipa::path(
    get, path = "/v1/issues/{id}",
    tag = "Issues",
    params(("id" = Uuid, Path, description = "Issue ID")),
    responses(
        (status = 200, description = "Issue found"),
        (status = 404, description = "Issue not found"),
        (status = 403, description = "Forbidden")
    ),
    security(("bearer_auth" = []))
)]
#[instrument(
    name = "issues.get_issue",
    skip(state, ctx),
    fields(issue_id = %issue_id, user_id = %ctx.user.id)
)]
pub(crate) async fn get_issue(
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

#[utoipa::path(
    post, path = "/v1/issues",
    tag = "Issues",
    request_body = CreateIssueRequest,
    responses(
        (status = 200, description = "Issue created"),
        (status = 403, description = "Forbidden")
    ),
    security(("bearer_auth" = []))
)]
#[instrument(
    name = "issues.create_issue",
    skip(state, ctx, payload),
    fields(project_id = %payload.project_id, user_id = %ctx.user.id)
)]
pub(crate) async fn create_issue(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<CreateIssueRequest>,
) -> Result<Json<MutationResponse<Issue>>, ErrorResponse> {
    let organization_id =
        ensure_project_access(state.pool(), ctx.user.id, payload.project_id).await?;

    let has_parent = payload.parent_issue_id.is_some();
    let has_description = payload.description.is_some();
    let priority = payload.priority;
    let parent_issue_id = payload.parent_issue_id;

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
        payload.parent_issue_sort_order,
        payload.extension_metadata,
        ctx.user.id,
    )
    .await
    .map_err(|error| {
        tracing::error!(?error, "failed to create issue");
        db_error(error, "failed to create issue")
    })?;

    if let Some(analytics) = state.analytics() {
        analytics.track(
            ctx.user.id,
            "issue_created",
            serde_json::json!({
                "issue_id": response.data.id,
                "project_id": response.data.project_id,
                "organization_id": organization_id,
                "has_description": has_description,
                "has_parent": has_parent,
                "priority": format!("{:?}", priority),
            }),
        );

        if let Some(parent_id) = parent_issue_id {
            analytics.track(
                ctx.user.id,
                "subtask_created",
                serde_json::json!({
                    "issue_id": response.data.id,
                    "parent_issue_id": parent_id,
                    "project_id": response.data.project_id,
                    "organization_id": organization_id,
                }),
            );
        }
    }

    Ok(Json(response))
}

#[utoipa::path(
    patch, path = "/v1/issues/{id}",
    tag = "Issues",
    params(("id" = Uuid, Path, description = "Issue ID")),
    request_body = UpdateIssueRequest,
    responses(
        (status = 200, description = "Issue updated"),
        (status = 404, description = "Issue not found"),
        (status = 403, description = "Forbidden")
    ),
    security(("bearer_auth" = []))
)]
#[instrument(
    name = "issues.update_issue",
    skip(state, ctx, payload),
    fields(issue_id = %issue_id, user_id = %ctx.user.id)
)]
pub(crate) async fn update_issue(
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

    let mut tx = state.pool().begin().await.map_err(|error| {
        tracing::error!(?error, "failed to begin transaction");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;

    let data = IssueRepository::update(
        &mut *tx,
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
        payload.parent_issue_sort_order,
        payload.extension_metadata,
    )
    .await
    .map_err(|error| {
        tracing::error!(?error, "failed to update issue");
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

#[utoipa::path(
    delete, path = "/v1/issues/{id}",
    tag = "Issues",
    params(("id" = Uuid, Path, description = "Issue ID")),
    responses(
        (status = 200, description = "Issue deleted"),
        (status = 404, description = "Issue not found"),
        (status = 403, description = "Forbidden")
    ),
    security(("bearer_auth" = []))
)]
#[instrument(
    name = "issues.delete_issue",
    skip(state, ctx),
    fields(issue_id = %issue_id, user_id = %ctx.user.id)
)]
pub(crate) async fn delete_issue(
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

// =============================================================================
// Bulk Update
// =============================================================================

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct BulkUpdateIssueItem {
    pub id: Uuid,
    #[serde(flatten)]
    pub changes: UpdateIssueRequest,
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct BulkUpdateIssuesRequest {
    pub updates: Vec<BulkUpdateIssueItem>,
}

#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct BulkUpdateIssuesResponse {
    pub data: Vec<Issue>,
    pub txid: i64,
}

#[utoipa::path(
    post, path = "/v1/issues/bulk",
    tag = "Issues",
    request_body = BulkUpdateIssuesRequest,
    responses(
        (status = 200, description = "Issues updated"),
        (status = 400, description = "Bad request"),
        (status = 403, description = "Forbidden")
    ),
    security(("bearer_auth" = []))
)]
#[instrument(
    name = "issues.bulk_update",
    skip(state, ctx, payload),
    fields(user_id = %ctx.user.id, count = payload.updates.len())
)]
pub(crate) async fn bulk_update_issues(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<BulkUpdateIssuesRequest>,
) -> Result<Json<BulkUpdateIssuesResponse>, ErrorResponse> {
    if payload.updates.is_empty() {
        return Ok(Json(BulkUpdateIssuesResponse {
            data: vec![],
            txid: 0,
        }));
    }

    // Get first issue to determine project_id for access check
    let first_issue = IssueRepository::find_by_id(state.pool(), payload.updates[0].id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to find first issue");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to find issue")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "issue not found"))?;

    let project_id = first_issue.project_id;
    ensure_project_access(state.pool(), ctx.user.id, project_id).await?;

    let mut tx = state.pool().begin().await.map_err(|error| {
        tracing::error!(?error, "failed to begin transaction");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;

    let mut results = Vec::with_capacity(payload.updates.len());

    for item in payload.updates {
        // Verify issue belongs to the same project
        let issue = IssueRepository::find_by_id(&mut *tx, item.id)
            .await
            .map_err(|error| {
                tracing::error!(?error, issue_id = %item.id, "failed to find issue");
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to find issue")
            })?
            .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "issue not found"))?;

        if issue.project_id != project_id {
            return Err(ErrorResponse::new(
                StatusCode::BAD_REQUEST,
                "all issues must belong to the same project",
            ));
        }

        // Update the issue
        let updated = IssueRepository::update(
            &mut *tx,
            item.id,
            item.changes.status_id,
            item.changes.title,
            item.changes.description,
            item.changes.priority,
            item.changes.start_date,
            item.changes.target_date,
            item.changes.completed_at,
            item.changes.sort_order,
            item.changes.parent_issue_id,
            item.changes.parent_issue_sort_order,
            item.changes.extension_metadata,
        )
        .await
        .map_err(|error| {
            tracing::error!(?error, issue_id = %item.id, "failed to update issue");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to update issue")
        })?;

        results.push(updated);
    }

    let txid = get_txid(&mut *tx).await.map_err(|error| {
        tracing::error!(?error, "failed to get txid");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;
    tx.commit().await.map_err(|error| {
        tracing::error!(?error, "failed to commit transaction");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;

    Ok(Json(BulkUpdateIssuesResponse {
        data: results,
        txid,
    }))
}
