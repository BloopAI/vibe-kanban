use axum::{
    Json, Router,
    extract::{Extension, Path, Query, State},
    http::StatusCode,
    routing::get,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tracing::instrument;
use uuid::Uuid;

use super::{error::ErrorResponse, organization_members::ensure_member_access};
use crate::{
    AppState,
    auth::RequestContext,
    db::{
        remote_projects::{RemoteProject, RemoteProjectRepository},
        types::ProjectVisibility,
    },
};

#[derive(Debug, Serialize)]
pub struct RemoteProjectResponse {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub name: String,
    pub color: String,
    pub visibility: ProjectVisibility,
    pub sprints_enabled: bool,
    pub sprint_duration_weeks: Option<i32>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct ListProjectsResponse {
    pub projects: Vec<RemoteProjectResponse>,
}

#[derive(Debug, Deserialize)]
struct ProjectsQuery {
    organization_id: Uuid,
}

#[derive(Debug, Deserialize)]
struct CreateProjectRequest {
    organization_id: Uuid,
    name: String,
    color: String,
    visibility: ProjectVisibility,
    sprints_enabled: bool,
    sprint_duration_weeks: Option<i32>,
}

#[derive(Debug, Deserialize)]
struct UpdateProjectRequest {
    name: String,
    color: String,
    visibility: ProjectVisibility,
    sprints_enabled: bool,
    sprint_duration_weeks: Option<i32>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/projects", get(list_projects).post(create_project))
        .route(
            "/projects/{project_id}",
            get(get_project)
                .patch(update_project)
                .delete(delete_project),
        )
}

#[instrument(
    name = "projects.list_projects",
    skip(state, ctx, params),
    fields(org_id = %params.organization_id, user_id = %ctx.user.id)
)]
async fn list_projects(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(params): Query<ProjectsQuery>,
) -> Result<Json<ListProjectsResponse>, ErrorResponse> {
    let target_org = params.organization_id;
    ensure_member_access(state.pool(), target_org, ctx.user.id).await?;

    let projects = RemoteProjectRepository::fetch_by_organization(state.pool(), target_org)
        .await
        .map_err(|error| {
            tracing::error!(?error, org_id = %target_org, "failed to list remote projects");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to list projects")
        })?
        .into_iter()
        .map(to_remote_project_response)
        .collect();

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
) -> Result<Json<RemoteProjectResponse>, ErrorResponse> {
    let record = RemoteProjectRepository::fetch_by_id(state.pool(), project_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %project_id, "failed to load project");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to load project")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "project not found"))?;

    ensure_member_access(state.pool(), record.organization_id, ctx.user.id).await?;

    Ok(Json(to_remote_project_response(record)))
}

#[instrument(
    name = "projects.create_project",
    skip(state, ctx, payload),
    fields(user_id = %ctx.user.id, org_id = %payload.organization_id)
)]
async fn create_project(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<CreateProjectRequest>,
) -> Result<Json<RemoteProjectResponse>, ErrorResponse> {
    let CreateProjectRequest {
        organization_id,
        name,
        color,
        visibility,
        sprints_enabled,
        sprint_duration_weeks,
    } = payload;

    ensure_member_access(state.pool(), organization_id, ctx.user.id).await?;

    let project = RemoteProjectRepository::create_with_pool(
        state.pool(),
        organization_id,
        name,
        color,
        visibility,
        sprints_enabled,
        sprint_duration_weeks,
    )
    .await
    .map_err(|error| {
        tracing::error!(?error, "failed to create remote project");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;

    Ok(Json(to_remote_project_response(project)))
}

#[instrument(
    name = "projects.update_project",
    skip(state, ctx, payload),
    fields(user_id = %ctx.user.id, project_id = %project_id)
)]
async fn update_project(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(project_id): Path<Uuid>,
    Json(payload): Json<UpdateProjectRequest>,
) -> Result<Json<RemoteProjectResponse>, ErrorResponse> {
    let record = RemoteProjectRepository::fetch_by_id(state.pool(), project_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %project_id, "failed to load project");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to load project")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "project not found"))?;

    ensure_member_access(state.pool(), record.organization_id, ctx.user.id).await?;

    let project = RemoteProjectRepository::update_with_pool(
        state.pool(),
        project_id,
        payload.name,
        payload.color,
        payload.visibility,
        payload.sprints_enabled,
        payload.sprint_duration_weeks,
    )
    .await
    .map_err(|error| {
        tracing::error!(?error, "failed to update remote project");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;

    Ok(Json(to_remote_project_response(project)))
}

#[instrument(
    name = "projects.delete_project",
    skip(state, ctx),
    fields(user_id = %ctx.user.id, project_id = %project_id)
)]
async fn delete_project(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(project_id): Path<Uuid>,
) -> Result<StatusCode, ErrorResponse> {
    let record = RemoteProjectRepository::fetch_by_id(state.pool(), project_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %project_id, "failed to load project");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to load project")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "project not found"))?;

    ensure_member_access(state.pool(), record.organization_id, ctx.user.id).await?;

    RemoteProjectRepository::delete_with_pool(state.pool(), project_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to delete remote project");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?;

    Ok(StatusCode::NO_CONTENT)
}

fn to_remote_project_response(project: RemoteProject) -> RemoteProjectResponse {
    RemoteProjectResponse {
        id: project.id,
        organization_id: project.organization_id,
        name: project.name,
        color: project.color,
        visibility: project.visibility,
        sprints_enabled: project.sprints_enabled,
        sprint_duration_weeks: project.sprint_duration_weeks,
        created_at: project.created_at,
        updated_at: project.updated_at,
    }
}
