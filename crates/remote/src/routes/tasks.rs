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
use ts_rs::TS;
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
        .route("/tasks", post(create_shared_task))
        .route("/tasks/check", post(check_tasks_existence))
        .route("/tasks/{task_id}", patch(update_shared_task))
        .route("/tasks/{task_id}", delete(delete_shared_task))
        .route("/tasks/{task_id}/assign", post(assign_task))
        .route("/tasks/assignees", get(get_task_assignees_by_project))
}

#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct AssigneesQuery {
    pub project_id: Uuid,
}

#[instrument(
    name = "tasks.get_task_assignees_by_project",
    skip(state, ctx, query),
    fields(user_id = %ctx.user.id, project_id = %query.project_id, org_id = tracing::field::Empty)
)]
pub async fn get_task_assignees_by_project(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(query): Query<AssigneesQuery>,
) -> Response {
    let pool = state.pool();

    let _org_id = match ensure_project_access(pool, ctx.user.id, query.project_id).await {
        Ok(org) => {
            Span::current().record("org_id", format_args!("{org}"));
            org
        }
        Err(error) => return error.into_response(),
    };

    let user_repo = UserRepository::new(pool);
    let assignees = match user_repo.fetch_assignees_by_project(query.project_id).await {
        Ok(names) => names,
        Err(e) => {
            tracing::error!(?e, "failed to load assignees");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "failed to load assignees"})),
            )
                .into_response();
        }
    };

    (StatusCode::OK, Json(assignees)).into_response()
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
    };

    match repo.assign_task(task_id, data).await {
        Ok(task) => (StatusCode::OK, Json(SharedTaskResponse::from(task))).into_response(),
        Err(error) => task_error_response(error, "failed to transfer task assignment"),
    }
}

#[instrument(
    name = "tasks.delete_shared_task",
    skip(state, ctx),
    fields(user_id = %ctx.user.id, task_id = %task_id, org_id = tracing::field::Empty)
)]
pub async fn delete_shared_task(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(task_id): Path<Uuid>,
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

    let data = DeleteTaskData {
        acting_user_id: ctx.user.id,
    };

    match repo.delete_task(task_id, data).await {
        Ok(task) => (StatusCode::OK, Json(SharedTaskResponse::from(task))).into_response(),
        Err(error) => task_error_response(error, "failed to delete shared task"),
    }
}

#[instrument(
    name = "tasks.check_existence",
    skip(state, ctx, payload),
    fields(user_id = %ctx.user.id)
)]
pub async fn check_tasks_existence(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<CheckTasksRequest>,
) -> Response {
    let pool = state.pool();
    let repo = SharedTaskRepository::new(pool);

    match repo.check_existence(&payload.task_ids, ctx.user.id).await {
        Ok(existing_ids) => (StatusCode::OK, Json(existing_ids)).into_response(),
        Err(error) => task_error_response(error, "failed to check tasks existence"),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckTasksRequest {
    pub task_ids: Vec<Uuid>,
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssignSharedTaskRequest {
    pub new_assignee_user_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
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
