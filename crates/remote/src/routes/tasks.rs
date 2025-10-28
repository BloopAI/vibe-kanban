use axum::{
    Json,
    extract::{Extension, Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde_json::json;
use uuid::Uuid;

use crate::{
    AppState,
    api::tasks::{
        AssignSharedTaskRequest, CreateSharedTaskRequest, DeleteSharedTaskRequest,
        SharedTaskResponse, UpdateSharedTaskRequest,
    },
    auth::RequestContext,
    db::{
        identity::{IdentityError, IdentityRepository},
        tasks::{
            AssignTaskData, CreateSharedTaskData, DeleteTaskData, SharedTaskError,
            SharedTaskRepository, UpdateSharedTaskData,
        },
    },
};

pub async fn create_shared_task(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<CreateSharedTaskRequest>,
) -> Response {
    let repo = SharedTaskRepository::new(state.pool());
    let identity_repo = IdentityRepository::new(state.pool(), state.clerk());
    let CreateSharedTaskRequest {
        project,
        title,
        description,
        assignee_user_id,
    } = payload;

    // Check that assignee exists and is an active member of the organization
    if let Some(assignee) = &assignee_user_id
        && assignee != &ctx.user.id
        && let Err(err) = identity_repo
            .ensure_user(&ctx.organization.id, assignee)
            .await
    {
        return identity_error_response(err, "assignee not found or inactive");
    }

    let data = CreateSharedTaskData {
        project,
        title,
        description,
        creator_user_id: ctx.user.id.clone(),
        assignee_user_id,
    };

    dbg!("Received create_shared_task request:", &data);

    match repo.create(&ctx.organization.id, data).await {
        Ok(task) => (StatusCode::CREATED, Json(SharedTaskResponse { task })).into_response(),
        Err(error) => task_error_response(error, "failed to create shared task"),
    }
}

pub async fn update_shared_task(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(task_id): Path<Uuid>,
    Json(payload): Json<UpdateSharedTaskRequest>,
) -> Response {
    let repo = SharedTaskRepository::new(state.pool());
    let existing = match repo.find_by_id(&ctx.organization.id, task_id).await {
        Ok(Some(task)) => task,
        Ok(None) => {
            return task_error_response(SharedTaskError::NotFound, "shared task not found");
        }
        Err(error) => {
            return task_error_response(error, "failed to load shared task");
        }
    };

    if existing.assignee_user_id.as_deref() != Some(&ctx.user.id) {
        return task_error_response(
            SharedTaskError::Forbidden,
            "acting user is not the task assignee",
        );
    }

    let data = UpdateSharedTaskData {
        title: payload.title,
        description: payload.description,
        status: payload.status,
        version: payload.version,
        acting_user_id: ctx.user.id.clone(),
    };

    match repo.update(&ctx.organization.id, task_id, data).await {
        Ok(task) => (StatusCode::OK, Json(SharedTaskResponse { task })).into_response(),
        Err(error) => task_error_response(error, "failed to update shared task"),
    }
}

pub async fn assign_task(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(task_id): Path<Uuid>,
    Json(payload): Json<AssignSharedTaskRequest>,
) -> Response {
    let repo = SharedTaskRepository::new(state.pool());
    let identity_repo = IdentityRepository::new(state.pool(), state.clerk());

    let existing = match repo.find_by_id(&ctx.organization.id, task_id).await {
        Ok(Some(task)) => task,
        Ok(None) => {
            return task_error_response(SharedTaskError::NotFound, "shared task not found");
        }
        Err(error) => {
            return task_error_response(error, "failed to load shared task");
        }
    };

    if existing.assignee_user_id.as_deref() != Some(&ctx.user.id) {
        return task_error_response(
            SharedTaskError::Forbidden,
            "acting user is not the task assignee",
        );
    }

    if let Some(assignee) = payload.new_assignee_user_id.as_ref()
        && assignee != &ctx.user.id
        && let Err(err) = identity_repo
            .ensure_user(&ctx.organization.id, assignee)
            .await
    {
        return identity_error_response(err, "assignee not found or inactive");
    }

    let data = AssignTaskData {
        new_assignee_user_id: payload.new_assignee_user_id,
        previous_assignee_user_id: Some(ctx.user.id.clone()),
        version: payload.version,
    };

    match repo.assign_task(&ctx.organization.id, task_id, data).await {
        Ok(task) => (StatusCode::OK, Json(SharedTaskResponse { task })).into_response(),
        Err(error) => task_error_response(error, "failed to transfer task assignment"),
    }
}

pub async fn delete_shared_task(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(task_id): Path<Uuid>,
    payload: Option<Json<DeleteSharedTaskRequest>>,
) -> Response {
    let repo = SharedTaskRepository::new(state.pool());

    let existing = match repo.find_by_id(&ctx.organization.id, task_id).await {
        Ok(Some(task)) => task,
        Ok(None) => {
            return task_error_response(SharedTaskError::NotFound, "shared task not found");
        }
        Err(error) => {
            return task_error_response(error, "failed to load shared task");
        }
    };

    if existing.assignee_user_id.as_deref() != Some(&ctx.user.id) {
        return task_error_response(
            SharedTaskError::Forbidden,
            "acting user is not the task assignee",
        );
    }

    let version = payload.as_ref().and_then(|body| body.0.version);

    let data = DeleteTaskData {
        acting_user_id: ctx.user.id.clone(),
        version,
    };

    match repo.delete_task(&ctx.organization.id, task_id, data).await {
        Ok(task) => (StatusCode::OK, Json(SharedTaskResponse { task })).into_response(),
        Err(error) => task_error_response(error, "failed to delete shared task"),
    }
}

fn task_error_response(error: SharedTaskError, context: &str) -> Response {
    match error {
        SharedTaskError::NotFound => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "task not found" })),
        ),
        SharedTaskError::Forbidden => (
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "only the assignee can modify this task" })),
        ),
        SharedTaskError::Conflict(message) => {
            (StatusCode::CONFLICT, Json(json!({ "error": message })))
        }
        SharedTaskError::Serialization(err) => {
            tracing::error!(?err, "{context}", context = context);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "failed to serialize shared task" })),
            )
        }
        SharedTaskError::Database(err) => {
            tracing::error!(?err, "{context}", context = context);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
        }
    }
    .into_response()
}

fn identity_error_response(error: IdentityError, message: &str) -> Response {
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
    .into_response()
}
