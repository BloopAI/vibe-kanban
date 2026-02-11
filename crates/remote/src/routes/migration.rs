use std::collections::HashSet;

use axum::{
    Json, Router,
    extract::{Extension, State},
    http::StatusCode,
    routing::post,
};
use tracing::instrument;
use api_types::{
    BulkMigrateRequest, BulkMigrateResponse, MigrateIssueRequest, MigrateProjectRequest,
    MigratePullRequestRequest, MigrateWorkspaceRequest,
};

use super::{
    error::ErrorResponse,
    organization_members::{ensure_issue_access, ensure_member_access, ensure_project_access},
};
use crate::{AppState, auth::RequestContext, db::migration::MigrationRepository};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/migration/projects", post(migrate_projects))
        .route("/migration/issues", post(migrate_issues))
        .route("/migration/pull_requests", post(migrate_pull_requests))
        .route("/migration/workspaces", post(migrate_workspaces))
}

#[instrument(name = "migration.projects", skip(state, ctx, payload))]
async fn migrate_projects(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<BulkMigrateRequest<MigrateProjectRequest>>,
) -> Result<Json<BulkMigrateResponse>, ErrorResponse> {
    let org_ids: HashSet<_> = payload
        .items
        .iter()
        .map(|item| item.organization_id)
        .collect();
    for org_id in org_ids {
        ensure_member_access(state.pool(), org_id, ctx.user.id).await?;
    }

    let ids = MigrationRepository::bulk_create_projects(state.pool(), payload.items)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to migrate projects");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, error.to_string())
        })?;

    Ok(Json(BulkMigrateResponse { ids }))
}

#[instrument(name = "migration.issues", skip(state, ctx, payload))]
async fn migrate_issues(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<BulkMigrateRequest<MigrateIssueRequest>>,
) -> Result<Json<BulkMigrateResponse>, ErrorResponse> {
    let project_ids: HashSet<_> = payload.items.iter().map(|item| item.project_id).collect();
    for project_id in project_ids {
        ensure_project_access(state.pool(), ctx.user.id, project_id).await?;
    }

    let ids = MigrationRepository::bulk_create_issues(state.pool(), payload.items)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to migrate issues");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, error.to_string())
        })?;

    Ok(Json(BulkMigrateResponse { ids }))
}

#[instrument(name = "migration.pull_requests", skip(state, ctx, payload))]
async fn migrate_pull_requests(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<BulkMigrateRequest<MigratePullRequestRequest>>,
) -> Result<Json<BulkMigrateResponse>, ErrorResponse> {
    let issue_ids: HashSet<_> = payload.items.iter().map(|item| item.issue_id).collect();
    for issue_id in issue_ids {
        ensure_issue_access(state.pool(), ctx.user.id, issue_id).await?;
    }

    let ids = MigrationRepository::bulk_create_pull_requests(state.pool(), payload.items)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to migrate pull requests");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, error.to_string())
        })?;

    Ok(Json(BulkMigrateResponse { ids }))
}

#[instrument(name = "migration.workspaces", skip(state, ctx, payload))]
async fn migrate_workspaces(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<BulkMigrateRequest<MigrateWorkspaceRequest>>,
) -> Result<Json<BulkMigrateResponse>, ErrorResponse> {
    let project_ids: HashSet<_> = payload.items.iter().map(|item| item.project_id).collect();
    for project_id in project_ids {
        ensure_project_access(state.pool(), ctx.user.id, project_id).await?;
    }

    let ids = MigrationRepository::bulk_create_workspaces(state.pool(), ctx.user.id, payload.items)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to migrate workspaces");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, error.to_string())
        })?;

    Ok(Json(BulkMigrateResponse { ids }))
}
