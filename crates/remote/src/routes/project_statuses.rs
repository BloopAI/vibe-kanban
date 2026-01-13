use axum::{
    Json, Router,
    extract::{Extension, Path, State},
    http::StatusCode,
    routing::{get, patch},
};
use serde::{Deserialize, Serialize};
use tracing::instrument;
use uuid::Uuid;

use super::{error::ErrorResponse, organization_members::ensure_project_access};
use crate::{
    AppState,
    auth::RequestContext,
    db::project_statuses::{ProjectStatus, ProjectStatusRepository},
};

#[derive(Debug, Serialize)]
pub struct ListProjectStatusesResponse {
    pub statuses: Vec<ProjectStatus>,
}

#[derive(Debug, Deserialize)]
pub struct CreateProjectStatusRequest {
    pub name: String,
    pub color: String,
    pub sort_order: i32,
}

#[derive(Debug, Deserialize)]
pub struct UpdateProjectStatusRequest {
    pub name: String,
    pub color: String,
    pub sort_order: i32,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/projects/{project_id}/statuses",
            get(list_statuses).post(create_status),
        )
        .route(
            "/statuses/{status_id}",
            patch(update_status).delete(delete_status),
        )
}

#[instrument(
    name = "project_statuses.list_statuses",
    skip(state, ctx),
    fields(project_id = %project_id, user_id = %ctx.user.id)
)]
async fn list_statuses(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(project_id): Path<Uuid>,
) -> Result<Json<ListProjectStatusesResponse>, ErrorResponse> {
    ensure_project_access(state.pool(), ctx.user.id, project_id).await?;

    let statuses = ProjectStatusRepository::list_by_project(state.pool(), project_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %project_id, "failed to list project statuses");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to list project statuses",
            )
        })?;

    Ok(Json(ListProjectStatusesResponse { statuses }))
}

#[instrument(
    name = "project_statuses.create_status",
    skip(state, ctx, payload),
    fields(project_id = %project_id, user_id = %ctx.user.id)
)]
async fn create_status(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(project_id): Path<Uuid>,
    Json(payload): Json<CreateProjectStatusRequest>,
) -> Result<Json<ProjectStatus>, ErrorResponse> {
    ensure_project_access(state.pool(), ctx.user.id, project_id).await?;

    let status = ProjectStatusRepository::create(
        state.pool(),
        project_id,
        payload.name,
        payload.color,
        payload.sort_order,
    )
    .await
    .map_err(|error| {
        tracing::error!(?error, "failed to create project status");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;

    Ok(Json(status))
}

#[instrument(
    name = "project_statuses.update_status",
    skip(state, ctx, payload),
    fields(status_id = %status_id, user_id = %ctx.user.id)
)]
async fn update_status(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(status_id): Path<Uuid>,
    Json(payload): Json<UpdateProjectStatusRequest>,
) -> Result<Json<ProjectStatus>, ErrorResponse> {
    let status = ProjectStatusRepository::find_by_id(state.pool(), status_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %status_id, "failed to load project status");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to load project status",
            )
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "project status not found"))?;

    ensure_project_access(state.pool(), ctx.user.id, status.project_id).await?;

    let updated_status = ProjectStatusRepository::update(
        state.pool(),
        status_id,
        payload.name,
        payload.color,
        payload.sort_order,
    )
    .await
    .map_err(|error| {
        tracing::error!(?error, "failed to update project status");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;

    Ok(Json(updated_status))
}

#[instrument(
    name = "project_statuses.delete_status",
    skip(state, ctx),
    fields(status_id = %status_id, user_id = %ctx.user.id)
)]
async fn delete_status(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(status_id): Path<Uuid>,
) -> Result<StatusCode, ErrorResponse> {
    let status = ProjectStatusRepository::find_by_id(state.pool(), status_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %status_id, "failed to load project status");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to load project status",
            )
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "project status not found"))?;

    ensure_project_access(state.pool(), ctx.user.id, status.project_id).await?;

    ProjectStatusRepository::delete(state.pool(), status_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to delete project status");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?;

    Ok(StatusCode::NO_CONTENT)
}
