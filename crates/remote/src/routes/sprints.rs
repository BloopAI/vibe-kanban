use axum::{
    Json, Router,
    extract::{Extension, Path, State},
    http::StatusCode,
    routing::{get, patch},
};
use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use tracing::instrument;
use uuid::Uuid;

use super::{error::ErrorResponse, organization_members::ensure_member_access};
use crate::{
    AppState,
    auth::RequestContext,
    db::{
        remote_projects::RemoteProjectRepository,
        sprints::{Sprint, SprintRepository},
        types::SprintStatus,
    },
};

#[derive(Debug, Serialize)]
pub struct SprintResponse {
    pub id: Uuid,
    pub project_id: Uuid,
    pub label: String,
    pub sequence_number: i32,
    pub start_date: NaiveDate,
    pub end_date: NaiveDate,
    pub status: SprintStatus,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct ListSprintsResponse {
    pub sprints: Vec<SprintResponse>,
}

#[derive(Debug, Deserialize)]
pub struct CreateSprintRequest {
    pub label: String,
    pub sequence_number: i32,
    pub start_date: NaiveDate,
    pub end_date: NaiveDate,
    pub status: SprintStatus,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSprintRequest {
    pub label: String,
    pub sequence_number: i32,
    pub start_date: NaiveDate,
    pub end_date: NaiveDate,
    pub status: SprintStatus,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/projects/{project_id}/sprints",
            get(list_sprints).post(create_sprint),
        )
        .route(
            "/sprints/{sprint_id}",
            patch(update_sprint).delete(delete_sprint),
        )
}

async fn ensure_project_access(
    state: &AppState,
    ctx: &RequestContext,
    project_id: Uuid,
) -> Result<(), ErrorResponse> {
    let project = RemoteProjectRepository::fetch_by_id(state.pool(), project_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %project_id, "failed to load project");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to load project")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "project not found"))?;

    ensure_member_access(state.pool(), project.organization_id, ctx.user.id).await?;
    Ok(())
}

#[instrument(
    name = "sprints.list_sprints",
    skip(state, ctx),
    fields(project_id = %project_id, user_id = %ctx.user.id)
)]
async fn list_sprints(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(project_id): Path<Uuid>,
) -> Result<Json<ListSprintsResponse>, ErrorResponse> {
    ensure_project_access(&state, &ctx, project_id).await?;

    let sprints = SprintRepository::fetch_by_project(state.pool(), project_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %project_id, "failed to list sprints");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to list sprints")
        })?
        .into_iter()
        .map(to_sprint_response)
        .collect();

    Ok(Json(ListSprintsResponse { sprints }))
}

#[instrument(
    name = "sprints.create_sprint",
    skip(state, ctx, payload),
    fields(project_id = %project_id, user_id = %ctx.user.id)
)]
async fn create_sprint(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(project_id): Path<Uuid>,
    Json(payload): Json<CreateSprintRequest>,
) -> Result<Json<SprintResponse>, ErrorResponse> {
    ensure_project_access(&state, &ctx, project_id).await?;

    let sprint = SprintRepository::create_with_pool(
        state.pool(),
        project_id,
        payload.label,
        payload.sequence_number,
        payload.start_date,
        payload.end_date,
        payload.status,
    )
    .await
    .map_err(|error| {
        tracing::error!(?error, "failed to create sprint");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;

    Ok(Json(to_sprint_response(sprint)))
}

#[instrument(
    name = "sprints.update_sprint",
    skip(state, ctx, payload),
    fields(sprint_id = %sprint_id, user_id = %ctx.user.id)
)]
async fn update_sprint(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(sprint_id): Path<Uuid>,
    Json(payload): Json<UpdateSprintRequest>,
) -> Result<Json<SprintResponse>, ErrorResponse> {
    let sprint = SprintRepository::fetch_by_id(state.pool(), sprint_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %sprint_id, "failed to load sprint");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to load sprint")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "sprint not found"))?;

    ensure_project_access(&state, &ctx, sprint.project_id).await?;

    let updated_sprint = SprintRepository::update_with_pool(
        state.pool(),
        sprint_id,
        payload.label,
        payload.sequence_number,
        payload.start_date,
        payload.end_date,
        payload.status,
    )
    .await
    .map_err(|error| {
        tracing::error!(?error, "failed to update sprint");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;

    Ok(Json(to_sprint_response(updated_sprint)))
}

#[instrument(
    name = "sprints.delete_sprint",
    skip(state, ctx),
    fields(sprint_id = %sprint_id, user_id = %ctx.user.id)
)]
async fn delete_sprint(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(sprint_id): Path<Uuid>,
) -> Result<StatusCode, ErrorResponse> {
    let sprint = SprintRepository::fetch_by_id(state.pool(), sprint_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %sprint_id, "failed to load sprint");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to load sprint")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "sprint not found"))?;

    ensure_project_access(&state, &ctx, sprint.project_id).await?;

    SprintRepository::delete_with_pool(state.pool(), sprint_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to delete sprint");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?;

    Ok(StatusCode::NO_CONTENT)
}

fn to_sprint_response(sprint: Sprint) -> SprintResponse {
    SprintResponse {
        id: sprint.id,
        project_id: sprint.project_id,
        label: sprint.label,
        sequence_number: sprint.sequence_number,
        start_date: sprint.start_date,
        end_date: sprint.end_date,
        status: sprint.status,
        created_at: sprint.created_at,
    }
}
