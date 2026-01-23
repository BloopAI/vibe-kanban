use axum::{
    Json, Router,
    extract::{Extension, Path, State},
    http::StatusCode,
    routing::{delete, post},
};
use serde::Deserialize;
use tracing::instrument;
use uuid::Uuid;

use super::{error::ErrorResponse, organization_members::ensure_project_access};
use crate::{
    AppState,
    auth::RequestContext,
    db::{
        issues::IssueRepository,
        workspaces::{CreateWorkspaceParams, Workspace, WorkspaceRepository},
    },
};

#[derive(Debug, Deserialize)]
pub struct CreateWorkspaceRequest {
    pub project_id: Uuid,
    pub local_workspace_id: Option<Uuid>,
    pub issue_id: Option<Uuid>,
    pub archived: Option<bool>,
    pub files_changed: Option<i32>,
    pub lines_added: Option<i32>,
    pub lines_removed: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateWorkspaceRequest {
    pub local_workspace_id: Uuid,
    pub archived: Option<bool>,
    pub files_changed: Option<Option<i32>>,
    pub lines_added: Option<Option<i32>>,
    pub lines_removed: Option<Option<i32>>,
}

#[derive(Debug, Deserialize)]
pub struct DeleteWorkspaceRequest {
    pub local_workspace_id: Uuid,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/workspaces",
            post(create_workspace)
                .patch(update_workspace)
                .delete(delete_workspace),
        )
        .route("/workspaces/{workspace_id}", delete(unlink_workspace))
}

#[instrument(
    name = "workspaces.create_workspace",
    skip(state, ctx, payload),
    fields(project_id = %payload.project_id, user_id = %ctx.user.id)
)]
async fn create_workspace(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<CreateWorkspaceRequest>,
) -> Result<Json<Workspace>, ErrorResponse> {
    ensure_project_access(state.pool(), ctx.user.id, payload.project_id).await?;

    let workspace = WorkspaceRepository::create(
        state.pool(),
        CreateWorkspaceParams {
            project_id: payload.project_id,
            owner_user_id: ctx.user.id,
            local_workspace_id: payload.local_workspace_id,
            issue_id: payload.issue_id,
            archived: payload.archived,
            files_changed: payload.files_changed,
            lines_added: payload.lines_added,
            lines_removed: payload.lines_removed,
        },
    )
    .await
    .map_err(|error| {
        tracing::error!(?error, "failed to create workspace");
        ErrorResponse::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "failed to create workspace",
        )
    })?;

    if let Some(issue_id) = payload.issue_id
        && let Err(error) =
            IssueRepository::sync_status_from_workspace_created(state.pool(), issue_id).await
    {
        tracing::warn!(
            ?error,
            "failed to sync issue status from workspace creation"
        );
    }

    Ok(Json(workspace))
}

#[instrument(
    name = "workspaces.update_workspace",
    skip(state, ctx, payload),
    fields(local_workspace_id = %payload.local_workspace_id, user_id = %ctx.user.id)
)]
async fn update_workspace(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<UpdateWorkspaceRequest>,
) -> Result<Json<Workspace>, ErrorResponse> {
    let workspace = WorkspaceRepository::find_by_local_id(state.pool(), payload.local_workspace_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, local_workspace_id = %payload.local_workspace_id, "failed to find workspace");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to find workspace")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "workspace not found"))?;

    ensure_project_access(state.pool(), ctx.user.id, workspace.project_id).await?;

    let updated = WorkspaceRepository::update(
        state.pool(),
        workspace.id,
        payload.archived,
        payload.files_changed,
        payload.lines_added,
        payload.lines_removed,
    )
    .await
    .map_err(|error| {
        tracing::error!(?error, "failed to update workspace");
        ErrorResponse::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "failed to update workspace",
        )
    })?;

    Ok(Json(updated))
}

#[instrument(
    name = "workspaces.delete_workspace",
    skip(state, ctx, payload),
    fields(local_workspace_id = %payload.local_workspace_id, user_id = %ctx.user.id)
)]
async fn delete_workspace(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<DeleteWorkspaceRequest>,
) -> Result<StatusCode, ErrorResponse> {
    let workspace = WorkspaceRepository::find_by_local_id(state.pool(), payload.local_workspace_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to find workspace");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to find workspace",
            )
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "workspace not found"))?;

    ensure_project_access(state.pool(), ctx.user.id, workspace.project_id).await?;

    WorkspaceRepository::delete_by_local_id(state.pool(), payload.local_workspace_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to delete workspace");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to delete workspace",
            )
        })?;

    Ok(StatusCode::NO_CONTENT)
}

#[instrument(
    name = "workspaces.unlink_workspace",
    skip(state, ctx),
    fields(workspace_id = %workspace_id, user_id = %ctx.user.id)
)]
async fn unlink_workspace(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(workspace_id): Path<Uuid>,
) -> Result<StatusCode, ErrorResponse> {
    let workspace = WorkspaceRepository::find_by_id(state.pool(), workspace_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to find workspace");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to find workspace",
            )
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "workspace not found"))?;

    ensure_project_access(state.pool(), ctx.user.id, workspace.project_id).await?;

    WorkspaceRepository::delete(state.pool(), workspace_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to delete workspace");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to delete workspace",
            )
        })?;

    Ok(StatusCode::NO_CONTENT)
}
