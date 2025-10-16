use axum::{
    Json,
    extract::{Extension, Path, State},
    http::StatusCode,
};
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

use crate::{
    AppState,
    auth::RequestContext,
    db::{
        identity::{IdentityError, IdentityRepository},
        tasks::{
            CreateSharedTaskData, CreateSharedTaskProjectData, SharedTaskError,
            SharedTaskRepository, TaskStatus, TransferTaskAssignmentData, UpdateSharedTaskData,
        },
    },
};

#[derive(Debug, Deserialize)]
pub struct CreateSharedTaskRequest {
    pub project_id: Uuid,
    pub project: Option<CreateSharedTaskProjectRequest>,
    pub title: String,
    pub description: Option<String>,
    pub assignee_user_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateSharedTaskProjectRequest {
    pub github_repository_id: i64,
    pub owner: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSharedTaskRequest {
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<TaskStatus>,
    pub version: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct TransferSharedTaskAssignmentRequest {
    pub new_assignee_user_id: Option<String>,
    pub previous_assignee_user_id: Option<String>,
    pub version: Option<i64>,
}

pub async fn create_shared_task(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<CreateSharedTaskRequest>,
) -> (StatusCode, Json<serde_json::Value>) {
    let repo = SharedTaskRepository::new(state.pool());
    let identity_repo = IdentityRepository::new(state.pool(), state.clerk());
    let CreateSharedTaskRequest {
        project_id,
        project,
        title,
        description,
        assignee_user_id,
    } = payload;

    if let Some(assignee) = &assignee_user_id
        && assignee != &ctx.user.id
        && let Err(err) = identity_repo
            .ensure_user(&ctx.organization.id, assignee)
            .await
    {
        return identity_error_response(err, "assignee not found or inactive");
    }

    let project_metadata = project.map(|p| CreateSharedTaskProjectData {
        github_repository_id: p.github_repository_id,
        owner: p.owner,
        name: p.name,
    });

    let data = CreateSharedTaskData {
        project_id,
        project: project_metadata,
        title,
        description,
        creator_user_id: ctx.user.id.clone(),
        assignee_user_id,
    };

    dbg!("Received create_shared_task request:", &data);

    match repo.create(&ctx.organization.id, data).await {
        Ok(task) => (StatusCode::CREATED, Json(json!({ "task": task }))),
        Err(error) => task_error_response(error, "failed to create shared task"),
    }
}

pub async fn update_shared_task(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(task_id): Path<Uuid>,
    Json(payload): Json<UpdateSharedTaskRequest>,
) -> (StatusCode, Json<serde_json::Value>) {
    let repo = SharedTaskRepository::new(state.pool());
    let data = UpdateSharedTaskData {
        title: payload.title,
        description: payload.description,
        status: payload.status,
        version: payload.version,
    };

    match repo.update(&ctx.organization.id, task_id, data).await {
        Ok(task) => (StatusCode::OK, Json(json!({ "task": task }))),
        Err(error) => task_error_response(error, "failed to update shared task"),
    }
}

pub async fn transfer_task_assignment(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(task_id): Path<Uuid>,
    Json(payload): Json<TransferSharedTaskAssignmentRequest>,
) -> (StatusCode, Json<serde_json::Value>) {
    let repo = SharedTaskRepository::new(state.pool());
    let identity_repo = IdentityRepository::new(state.pool(), state.clerk());

    if let Some(assignee) = payload.new_assignee_user_id.as_ref()
        && assignee != &ctx.user.id
        && let Err(err) = identity_repo
            .ensure_user(&ctx.organization.id, assignee)
            .await
    {
        return identity_error_response(err, "assignee not found or inactive");
    }

    let data = TransferTaskAssignmentData {
        new_assignee_user_id: payload.new_assignee_user_id,
        previous_assignee_user_id: payload.previous_assignee_user_id,
        version: payload.version,
    };

    match repo
        .transfer_task_assignment(&ctx.organization.id, task_id, data)
        .await
    {
        Ok(task) => (StatusCode::OK, Json(json!({ "task": task }))),
        Err(error) => task_error_response(error, "failed to transfer task assignment"),
    }
}

fn task_error_response(
    error: SharedTaskError,
    context: &str,
) -> (StatusCode, Json<serde_json::Value>) {
    match error {
        SharedTaskError::NotFound => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "task not found" })),
        ),
        SharedTaskError::Conflict(message) => {
            (StatusCode::CONFLICT, Json(json!({ "error": message })))
        }
        SharedTaskError::Database(err) => {
            tracing::error!(?err, "{context}", context = context);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
        }
    }
}

fn identity_error_response(
    error: IdentityError,
    message: &str,
) -> (StatusCode, Json<serde_json::Value>) {
    match error {
        IdentityError::Clerk(err) => {
            tracing::debug!(?err, "clerk refused identity lookup");
            (StatusCode::BAD_REQUEST, Json(json!({ "error": message })))
        }
        IdentityError::Database(err) => {
            tracing::error!(?err, "identity sync failed");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
        }
    }
}
