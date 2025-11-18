use axum::{
    Json, Router,
    extract::{Extension, Path, State},
    http::StatusCode,
    routing::{delete, get},
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
        project_members::{ProjectMember, ProjectMemberRepository},
        remote_projects::RemoteProjectRepository,
    },
};

#[derive(Debug, Serialize)]
pub struct ProjectMemberResponse {
    pub project_id: Uuid,
    pub user_id: Uuid,
    pub joined_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct ListMembersResponse {
    pub members: Vec<ProjectMemberResponse>,
}

#[derive(Debug, Deserialize)]
pub struct AddMemberRequest {
    pub user_id: Uuid,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/projects/{project_id}/members",
            get(list_members).post(add_member),
        )
        .route(
            "/projects/{project_id}/members/{user_id}",
            delete(remove_member),
        )
}

async fn ensure_project_access(
    state: &AppState,
    ctx: &RequestContext,
    project_id: Uuid,
) -> Result<Uuid, ErrorResponse> {
    let project = RemoteProjectRepository::fetch_by_id(state.pool(), project_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %project_id, "failed to load project");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to load project")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "project not found"))?;

    ensure_member_access(state.pool(), project.organization_id, ctx.user.id).await?;
    Ok(project.organization_id)
}

#[instrument(
    name = "project_members.list_members",
    skip(state, ctx),
    fields(project_id = %project_id, user_id = %ctx.user.id)
)]
async fn list_members(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(project_id): Path<Uuid>,
) -> Result<Json<ListMembersResponse>, ErrorResponse> {
    ensure_project_access(&state, &ctx, project_id).await?;

    let members = ProjectMemberRepository::fetch_by_project(state.pool(), project_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %project_id, "failed to list project members");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to list project members",
            )
        })?
        .into_iter()
        .map(to_member_response)
        .collect();

    Ok(Json(ListMembersResponse { members }))
}

#[instrument(
    name = "project_members.add_member",
    skip(state, ctx, payload),
    fields(project_id = %project_id, user_id = %ctx.user.id)
)]
async fn add_member(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(project_id): Path<Uuid>,
    Json(payload): Json<AddMemberRequest>,
) -> Result<Json<ProjectMemberResponse>, ErrorResponse> {
    let organization_id = ensure_project_access(&state, &ctx, project_id).await?;

    // Ensure target user is a member of the organization
    ensure_member_access(state.pool(), organization_id, payload.user_id).await?;

    let member = ProjectMemberRepository::add_with_pool(state.pool(), project_id, payload.user_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to add project member");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?;

    Ok(Json(to_member_response(member)))
}

#[instrument(
    name = "project_members.remove_member",
    skip(state, ctx),
    fields(project_id = %project_id, user_id = %ctx.user.id, target_user_id = %user_id)
)]
async fn remove_member(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path((project_id, user_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, ErrorResponse> {
    ensure_project_access(&state, &ctx, project_id).await?;

    ProjectMemberRepository::remove_with_pool(state.pool(), project_id, user_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to remove project member");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?;

    Ok(StatusCode::NO_CONTENT)
}

fn to_member_response(member: ProjectMember) -> ProjectMemberResponse {
    ProjectMemberResponse {
        project_id: member.project_id,
        user_id: member.user_id,
        joined_at: member.joined_at,
    }
}
