use axum::{
    Json, Router,
    extract::{Extension, Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{delete, get, patch, post},
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tracing::{Span, instrument};
use uuid::Uuid;

use super::{
    error::{identity_error_response, task_error_response},
    organization_members::{ensure_project_access, ensure_task_access},
};
use crate::{
    AppState,
    auth::RequestContext,
    db::{
        organization_members,
        tasks::{
            AssignTaskData, CreateSharedTaskData, DeleteTaskData, SharedTask, SharedTaskError,
            SharedTaskRepository, SharedTaskWithUser, TaskStatus, UpdateSharedTaskData,
            ensure_text_size,
        },
        users::{UserData, UserRepository},
    },
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/tasks/bulk", get(bulk_shared_tasks))
        .route("/tasks", post(create_shared_task))
        .route("/tasks/{task_id}", patch(update_shared_task))
        .route("/tasks/{task_id}", delete(delete_shared_task))
        .route("/tasks/{task_id}/assign", post(assign_task))
}

#[derive(Debug, Deserialize)]
pub struct BulkTasksQuery {
    pub project_id: Uuid,
}

#[instrument(
    name = "tasks.bulk_shared_tasks",
    skip(state, ctx, query),
    fields(user_id = %ctx.user.id, project_id = %query.project_id, org_id = tracing::field::Empty)
)]
pub async fn bulk_shared_tasks(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(query): Query<BulkTasksQuery>,
) -> Response {
    let pool = state.pool();
    let _organization_id = match ensure_project_access(pool, ctx.user.id, query.project_id).await {
        Ok(org_id) => {
            Span::current().record("org_id", format_args!("{org_id}"));
            org_id
        }
        Err(error) => return error.into_response(),
    };

    let repo = SharedTaskRepository::new(pool);
    match repo.bulk_fetch(query.project_id).await {
        Ok(snapshot) => (
            StatusCode::OK,
            Json(BulkSharedTasksResponse {
                tasks: snapshot.tasks,
                deleted_task_ids: snapshot.deleted_task_ids,
                latest_seq: snapshot.latest_seq,
            }),
        )
            .into_response(),
        Err(error) => match error {
            SharedTaskError::Database(err) => {
                tracing::error!(?err, "failed to load shared task snapshot");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": "failed to load shared tasks" })),
                )
                    .into_response()
            }
            other => task_error_response(other, "failed to load shared tasks"),
        },
    }
}

#[instrument(
    name = "tasks.create_shared_task",
    skip(state, ctx, payload),
    fields(user_id = %ctx.user.id, org_id = tracing::field::Empty)
)]
pub async fn create_shared_task(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<CreateSharedTaskRequest>,
) -> Response {
    let pool = state.pool();
    let repo = SharedTaskRepository::new(pool);
    let user_repo = UserRepository::new(pool);
    let CreateSharedTaskRequest {
        project_id,
        title,
        description,
        assignee_user_id,
    } = payload;

    if let Err(error) = ensure_text_size(&title, description.as_deref()) {
        return task_error_response(error, "shared task payload too large");
    }

    let organization_id = match ensure_project_access(pool, ctx.user.id, project_id).await {
        Ok(org_id) => {
            Span::current().record("org_id", format_args!("{org_id}"));
            org_id
        }
        Err(error) => return error.into_response(),
    };

    if let Some(assignee) = assignee_user_id.as_ref() {
        if let Err(err) = user_repo.fetch_user(*assignee).await {
            return identity_error_response(err, "assignee not found or inactive");
        }
        if let Err(err) =
            organization_members::assert_membership(pool, organization_id, *assignee).await
        {
            return identity_error_response(err, "assignee not part of organization");
        }
    }

    let data = CreateSharedTaskData {
        project_id,
        title,
        description,
        creator_user_id: ctx.user.id,
        assignee_user_id,
    };

    match repo.create(data).await {
        Ok(task) => (StatusCode::CREATED, Json(SharedTaskResponse::from(task))).into_response(),
        Err(error) => task_error_response(error, "failed to create shared task"),
    }
}

#[instrument(
    name = "tasks.update_shared_task",
    skip(state, ctx, payload),
    fields(user_id = %ctx.user.id, task_id = %task_id, org_id = tracing::field::Empty)
)]
pub async fn update_shared_task(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(task_id): Path<Uuid>,
    Json(payload): Json<UpdateSharedTaskRequest>,
) -> Response {
    let pool = state.pool();
    let _organization_id = match ensure_task_access(pool, ctx.user.id, task_id).await {
        Ok(org_id) => {
            Span::current().record("org_id", format_args!("{org_id}"));
            org_id
        }
        Err(error) => return error.into_response(),
    };

    let repo = SharedTaskRepository::new(pool);
    let existing = match repo.find_by_id(task_id).await {
        Ok(Some(task)) => task,
        Ok(None) => {
            return task_error_response(SharedTaskError::NotFound, "shared task not found");
        }
        Err(error) => {
            return task_error_response(error, "failed to load shared task");
        }
    };

    if existing.assignee_user_id.as_ref() != Some(&ctx.user.id) {
        return task_error_response(
            SharedTaskError::Forbidden,
            "acting user is not the task assignee",
        );
    }

    let UpdateSharedTaskRequest {
        title,
        description,
        status,
        version,
    } = payload;

    let next_title = title.as_deref().unwrap_or(existing.title.as_str());
    let next_description = description.as_deref().or(existing.description.as_deref());

    if let Err(error) = ensure_text_size(next_title, next_description) {
        return task_error_response(error, "shared task payload too large");
    }

    let data = UpdateSharedTaskData {
        title,
        description,
        status,
        version,
        acting_user_id: ctx.user.id,
    };

    match repo.update(task_id, data).await {
        Ok(task) => (StatusCode::OK, Json(SharedTaskResponse::from(task))).into_response(),
        Err(error) => task_error_response(error, "failed to update shared task"),
    }
}

#[instrument(
    name = "tasks.assign_shared_task",
    skip(state, ctx, payload),
    fields(user_id = %ctx.user.id, task_id = %task_id, org_id = tracing::field::Empty)
)]
pub async fn assign_task(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(task_id): Path<Uuid>,
    Json(payload): Json<AssignSharedTaskRequest>,
) -> Response {
    let pool = state.pool();
    let organization_id = match ensure_task_access(pool, ctx.user.id, task_id).await {
        Ok(org_id) => {
            Span::current().record("org_id", format_args!("{org_id}"));
            org_id
        }
        Err(error) => return error.into_response(),
    };

    let repo = SharedTaskRepository::new(pool);
    let user_repo = UserRepository::new(pool);

    let existing = match repo.find_by_id(task_id).await {
        Ok(Some(task)) => task,
        Ok(None) => {
            return task_error_response(SharedTaskError::NotFound, "shared task not found");
        }
        Err(error) => {
            return task_error_response(error, "failed to load shared task");
        }
    };

    if existing.assignee_user_id.as_ref() != Some(&ctx.user.id) {
        return task_error_response(
            SharedTaskError::Forbidden,
            "acting user is not the task assignee",
        );
    }

    if let Some(assignee) = payload.new_assignee_user_id.as_ref() {
        if let Err(err) = user_repo.fetch_user(*assignee).await {
            return identity_error_response(err, "assignee not found or inactive");
        }
        if let Err(err) =
            organization_members::assert_membership(pool, organization_id, *assignee).await
        {
            return identity_error_response(err, "assignee not part of organization");
        }
    }

    let data = AssignTaskData {
        new_assignee_user_id: payload.new_assignee_user_id,
        previous_assignee_user_id: Some(ctx.user.id),
        version: payload.version,
    };

    match repo.assign_task(task_id, data).await {
        Ok(task) => (StatusCode::OK, Json(SharedTaskResponse::from(task))).into_response(),
        Err(error) => task_error_response(error, "failed to transfer task assignment"),
    }
}

#[instrument(
    name = "tasks.delete_shared_task",
    skip(state, ctx, payload),
    fields(user_id = %ctx.user.id, task_id = %task_id, org_id = tracing::field::Empty)
)]
pub async fn delete_shared_task(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(task_id): Path<Uuid>,
    payload: Option<Json<DeleteSharedTaskRequest>>,
) -> Response {
    let pool = state.pool();
    let _organization_id = match ensure_task_access(pool, ctx.user.id, task_id).await {
        Ok(org_id) => {
            Span::current().record("org_id", format_args!("{org_id}"));
            org_id
        }
        Err(error) => return error.into_response(),
    };

    let repo = SharedTaskRepository::new(pool);

    let existing = match repo.find_by_id(task_id).await {
        Ok(Some(task)) => task,
        Ok(None) => {
            return task_error_response(SharedTaskError::NotFound, "shared task not found");
        }
        Err(error) => {
            return task_error_response(error, "failed to load shared task");
        }
    };

    if existing.assignee_user_id.as_ref() != Some(&ctx.user.id) {
        return task_error_response(
            SharedTaskError::Forbidden,
            "acting user is not the task assignee",
        );
    }

    let version = payload.as_ref().and_then(|body| body.0.version);

    let data = DeleteTaskData {
        acting_user_id: ctx.user.id,
        version,
    };

    match repo.delete_task(task_id, data).await {
        Ok(task) => (StatusCode::OK, Json(SharedTaskResponse::from(task))).into_response(),
        Err(error) => task_error_response(error, "failed to delete shared task"),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BulkSharedTasksResponse {
    pub tasks: Vec<crate::db::tasks::SharedTaskActivityPayload>,
    pub deleted_task_ids: Vec<Uuid>,
    pub latest_seq: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSharedTaskRequest {
    pub project_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub assignee_user_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateSharedTaskRequest {
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<TaskStatus>,
    pub version: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssignSharedTaskRequest {
    pub new_assignee_user_id: Option<Uuid>,
    pub version: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeleteSharedTaskRequest {
    pub version: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SharedTaskResponse {
    pub task: SharedTask,
    pub user: Option<UserData>,
}

impl From<SharedTaskWithUser> for SharedTaskResponse {
    fn from(v: SharedTaskWithUser) -> Self {
        Self {
            task: v.task,
            user: v.user,
        }
    }
}
