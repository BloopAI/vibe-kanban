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
    db::project_statuses::{ProjectStatus, ProjectStatusRepository},
    define_mutation_router,
    entities::{
        CreateProjectStatusRequest, ListProjectStatussQuery, ListProjectStatussResponse,
        UpdateProjectStatusRequest,
    },
    mutation_types::{DeleteResponse, MutationResponse},
};

// Generate router that references handlers below
define_mutation_router!(ProjectStatus, table: "project_statuses");

#[instrument(
    name = "project_statuses.list_project_statuss",
    skip(state, ctx),
    fields(project_id = %query.project_id, user_id = %ctx.user.id)
)]
async fn list_project_statuss(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(query): Query<ListProjectStatussQuery>,
) -> Result<Json<ListProjectStatussResponse>, ErrorResponse> {
    ensure_project_access(state.pool(), ctx.user.id, query.project_id).await?;

    let project_statuss = ProjectStatusRepository::list_by_project(state.pool(), query.project_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, project_id = %query.project_id, "failed to list project statuses");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to list project statuses",
            )
        })?;

    Ok(Json(ListProjectStatussResponse { project_statuss }))
}

#[instrument(
    name = "project_statuses.get_project_status",
    skip(state, ctx),
    fields(project_status_id = %project_status_id, user_id = %ctx.user.id)
)]
async fn get_project_status(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(project_status_id): Path<Uuid>,
) -> Result<Json<ProjectStatus>, ErrorResponse> {
    let status = ProjectStatusRepository::find_by_id(state.pool(), project_status_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %project_status_id, "failed to load project status");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to load project status",
            )
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "project status not found"))?;

    ensure_project_access(state.pool(), ctx.user.id, status.project_id).await?;

    Ok(Json(status))
}

#[instrument(
    name = "project_statuses.create_project_status",
    skip(state, ctx, payload),
    fields(project_id = %payload.project_id, user_id = %ctx.user.id)
)]
async fn create_project_status(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<CreateProjectStatusRequest>,
) -> Result<Json<MutationResponse<ProjectStatus>>, ErrorResponse> {
    ensure_project_access(state.pool(), ctx.user.id, payload.project_id).await?;

    let response = ProjectStatusRepository::create(
        state.pool(),
        payload.id,
        payload.project_id,
        payload.name,
        payload.color,
        payload.sort_order,
    )
    .await
    .map_err(|error| {
        tracing::error!(?error, "failed to create project status");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;

    Ok(Json(response))
}

#[instrument(
    name = "project_statuses.update_project_status",
    skip(state, ctx, payload),
    fields(project_status_id = %project_status_id, user_id = %ctx.user.id)
)]
async fn update_project_status(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(project_status_id): Path<Uuid>,
    Json(payload): Json<UpdateProjectStatusRequest>,
) -> Result<Json<MutationResponse<ProjectStatus>>, ErrorResponse> {
    let status = ProjectStatusRepository::find_by_id(state.pool(), project_status_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %project_status_id, "failed to load project status");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to load project status",
            )
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "project status not found"))?;

    ensure_project_access(state.pool(), ctx.user.id, status.project_id).await?;

    let response = ProjectStatusRepository::update(
        state.pool(),
        project_status_id,
        payload.name,
        payload.color,
        payload.sort_order,
    )
    .await
    .map_err(|error| {
        tracing::error!(?error, "failed to update project status");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;

    Ok(Json(response))
}

#[instrument(
    name = "project_statuses.delete_project_status",
    skip(state, ctx),
    fields(project_status_id = %project_status_id, user_id = %ctx.user.id)
)]
async fn delete_project_status(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(project_status_id): Path<Uuid>,
) -> Result<Json<DeleteResponse>, ErrorResponse> {
    let status = ProjectStatusRepository::find_by_id(state.pool(), project_status_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %project_status_id, "failed to load project status");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to load project status",
            )
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "project status not found"))?;

    ensure_project_access(state.pool(), ctx.user.id, status.project_id).await?;

    let response = ProjectStatusRepository::delete(state.pool(), project_status_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to delete project status");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?;

    Ok(Json(response))
}
