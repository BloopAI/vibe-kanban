use axum::{
    Json,
    extract::{Extension, Path, Query, State},
    http::StatusCode,
};
use tracing::instrument;
use uuid::Uuid;

use super::{error::ErrorResponse, organization_members::ensure_member_access};
use crate::{
    AppState,
    auth::RequestContext,
    db::projects::{Project, ProjectRepository},
    define_mutation_router,
    entities::{
        CreateProjectRequest, ListProjectsQuery, ListProjectsResponse, UpdateProjectRequest,
    },
    mutation_types::{DeleteResponse, MutationResponse},
};

// Generate router that references handlers below
define_mutation_router!(Project, table: "projects");

#[instrument(
    name = "projects.list_projects",
    skip(state, ctx),
    fields(organization_id = %query.organization_id, user_id = %ctx.user.id)
)]
async fn list_projects(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(query): Query<ListProjectsQuery>,
) -> Result<Json<ListProjectsResponse>, ErrorResponse> {
    ensure_member_access(state.pool(), query.organization_id, ctx.user.id).await?;

    let projects = ProjectRepository::list_by_organization(state.pool(), query.organization_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, organization_id = %query.organization_id, "failed to list projects");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to list projects")
        })?;

    Ok(Json(ListProjectsResponse { projects }))
}

#[instrument(
    name = "projects.get_project",
    skip(state, ctx),
    fields(project_id = %project_id, user_id = %ctx.user.id)
)]
async fn get_project(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(project_id): Path<Uuid>,
) -> Result<Json<Project>, ErrorResponse> {
    let project = ProjectRepository::find_by_id(state.pool(), project_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %project_id, "failed to load project");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to load project")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "project not found"))?;

    ensure_member_access(state.pool(), project.organization_id, ctx.user.id).await?;

    Ok(Json(project))
}

#[instrument(
    name = "projects.create_project",
    skip(state, ctx, payload),
    fields(organization_id = %payload.organization_id, user_id = %ctx.user.id)
)]
async fn create_project(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<CreateProjectRequest>,
) -> Result<Json<MutationResponse<Project>>, ErrorResponse> {
    ensure_member_access(state.pool(), payload.organization_id, ctx.user.id).await?;

    let response = ProjectRepository::create_with_defaults(
        state.pool(),
        payload.id,
        payload.organization_id,
        payload.name,
        payload.color,
    )
    .await
    .map_err(|error| {
        tracing::error!(?error, "failed to create project");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;

    Ok(Json(response))
}

#[instrument(
    name = "projects.update_project",
    skip(state, ctx, payload),
    fields(project_id = %project_id, user_id = %ctx.user.id)
)]
async fn update_project(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(project_id): Path<Uuid>,
    Json(payload): Json<UpdateProjectRequest>,
) -> Result<Json<MutationResponse<Project>>, ErrorResponse> {
    let existing = ProjectRepository::find_by_id(state.pool(), project_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %project_id, "failed to load project");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to load project")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "project not found"))?;

    ensure_member_access(state.pool(), existing.organization_id, ctx.user.id).await?;

    let response = ProjectRepository::update(state.pool(), project_id, payload.name, payload.color)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to update project");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?;

    Ok(Json(response))
}

#[instrument(
    name = "projects.delete_project",
    skip(state, ctx),
    fields(project_id = %project_id, user_id = %ctx.user.id)
)]
async fn delete_project(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(project_id): Path<Uuid>,
) -> Result<Json<DeleteResponse>, ErrorResponse> {
    let project = ProjectRepository::find_by_id(state.pool(), project_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %project_id, "failed to load project");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to load project")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "project not found"))?;

    ensure_member_access(state.pool(), project.organization_id, ctx.user.id).await?;

    let response = ProjectRepository::delete(state.pool(), project_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to delete project");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?;

    Ok(Json(response))
}
