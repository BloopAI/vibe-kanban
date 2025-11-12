use axum::{
    Json, Router,
    extract::{Extension, Path, Query, State},
    http::StatusCode,
    routing::get,
};
use serde::Deserialize;
use serde_json::Value;
use tracing::instrument;
use utils::api::projects::{ListProjectsResponse, RemoteProject};
use uuid::Uuid;

use super::{error::ErrorResponse, organization_members::ensure_member_access};
use crate::{
    AppState,
    auth::RequestContext,
    db::projects::{CreateProjectData, Project, ProjectError, ProjectRepository},
};

#[derive(Debug, Deserialize)]
struct ProjectsQuery {
    organization_id: Uuid,
}

#[derive(Debug, Deserialize)]
struct CreateProjectRequest {
    organization_id: Uuid,
    name: String,
    #[serde(default)]
    metadata: Value,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/projects", get(list_projects).post(create_project))
        .route("/projects/{project_id}", get(get_project))
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

    let projects = match ProjectRepository::list_by_organization(state.pool(), target_org).await {
        Ok(rows) => rows.into_iter().map(to_remote_project).collect(),
        Err(error) => {
            tracing::error!(?error, org_id = %target_org, "failed to list remote projects");
            return Err(ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to list projects",
            ));
        }
    };

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
) -> Result<Json<RemoteProject>, ErrorResponse> {
    let record = ProjectRepository::fetch_by_id(state.pool(), project_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %project_id, "failed to load project");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to load project")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "project not found"))?;

    ensure_member_access(state.pool(), record.organization_id, ctx.user.id).await?;

    Ok(Json(to_remote_project(record)))
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
) -> Result<Json<RemoteProject>, ErrorResponse> {
    let CreateProjectRequest {
        organization_id,
        name,
        metadata,
    } = payload;

    ensure_member_access(state.pool(), organization_id, ctx.user.id).await?;

    let mut tx = state.pool().begin().await.map_err(|error| {
        tracing::error!(?error, "failed to start transaction for project creation");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;

    let metadata = normalize_metadata(metadata).ok_or_else(|| {
        ErrorResponse::new(StatusCode::BAD_REQUEST, "metadata must be a JSON object")
    })?;

    let project = match ProjectRepository::insert(
        &mut tx,
        CreateProjectData {
            organization_id,
            name,
            metadata,
        },
    )
    .await
    {
        Ok(project) => project,
        Err(error) => {
            tx.rollback().await.ok();
            return Err(match error {
                ProjectError::Conflict(message) => {
                    tracing::warn!(?message, "remote project conflict");
                    ErrorResponse::new(StatusCode::CONFLICT, "project already exists")
                }
                ProjectError::InvalidMetadata => {
                    ErrorResponse::new(StatusCode::BAD_REQUEST, "invalid project metadata")
                }
                ProjectError::Database(err) => {
                    tracing::error!(?err, "failed to create remote project");
                    ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
                }
            });
        }
    };

    if let Err(error) = tx.commit().await {
        tracing::error!(?error, "failed to commit remote project creation");
        return Err(ErrorResponse::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal server error",
        ));
    }

    Ok(Json(to_remote_project(project)))
}

fn to_remote_project(project: Project) -> RemoteProject {
    RemoteProject {
        id: project.id,
        organization_id: project.organization_id,
        name: project.name,
        metadata: project.metadata,
        created_at: project.created_at,
    }
}

fn normalize_metadata(value: Value) -> Option<Value> {
    match value {
        Value::Null => Some(Value::Object(serde_json::Map::new())),
        Value::Object(_) => Some(value),
        _ => None,
    }
}
