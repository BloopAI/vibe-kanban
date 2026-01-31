//! Swarm Task Routes

use axum::{
    Extension, Json, Router,
    extract::{Path, State},
    response::Json as ResponseJson,
    routing::{get, post},
};
use db::models::swarm::Swarm;
use db::models::swarm_task::{SwarmTask, SwarmTaskStatus, CreateSwarmTask, UpdateSwarmTask};
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{AppState, error::ApiError};

pub async fn list_tasks(
    Extension(swarm): Extension<Swarm>,
    State(state): State<AppState>,
) -> Result<ResponseJson<ApiResponse<Vec<SwarmTask>>>, ApiError> {
    let tasks = SwarmTask::find_by_swarm_id(&state.db_pool, swarm.id)
        .await
        ?;

    Ok(ResponseJson(ApiResponse::success(tasks)))
}

pub async fn create_task(
    Extension(swarm): Extension<Swarm>,
    State(state): State<AppState>,
    Json(payload): Json<CreateSwarmTask>,
) -> Result<ResponseJson<ApiResponse<SwarmTask>>, ApiError> {
    // Validate input sizes
    if payload.title.len() > 255 {
        return Err(ApiError::BadRequest("Title too long (max 255 chars)".to_string()));
    }
    if let Some(ref desc) = payload.description {
        if desc.len() > 10000 {
            return Err(ApiError::BadRequest("Description too long (max 10000 chars)".to_string()));
        }
    }
    if let Some(ref deps) = payload.depends_on {
        if deps.len() > 20 {
            return Err(ApiError::BadRequest("Too many dependencies (max 20)".to_string()));
        }
    }
    if let Some(ref tags) = payload.tags {
        if tags.len() > 50 {
            return Err(ApiError::BadRequest("Too many tags (max 50)".to_string()));
        }
        if tags.iter().any(|t| t.len() > 100) {
            return Err(ApiError::BadRequest("Tag too long (max 100 chars)".to_string()));
        }
    }

    let task_id = Uuid::new_v4();

    let task = SwarmTask::create(&state.db_pool, swarm.id, &payload, task_id)
        .await
        ?;

    tracing::info!("Created swarm task '{}' in swarm {}", task.title, swarm.id);

    Ok(ResponseJson(ApiResponse::success(task)))
}

pub async fn get_task(
    Extension(swarm): Extension<Swarm>,
    Path((_swarm_id, task_id)): Path<(Uuid, Uuid)>,
    State(state): State<AppState>,
) -> Result<ResponseJson<ApiResponse<SwarmTask>>, ApiError> {
    let task = SwarmTask::find_by_id(&state.db_pool, task_id)
        .await
        ?
        .ok_or_else(|| ApiError::BadRequest("Task not found".to_string()))?;

    // IDOR protection: verify task belongs to the specified swarm
    if task.swarm_id != swarm.id {
        return Err(ApiError::BadRequest("Task not found".to_string()));
    }

    Ok(ResponseJson(ApiResponse::success(task)))
}

pub async fn update_task(
    Extension(swarm): Extension<Swarm>,
    Path((_swarm_id, task_id)): Path<(Uuid, Uuid)>,
    State(state): State<AppState>,
    Json(payload): Json<UpdateSwarmTask>,
) -> Result<ResponseJson<ApiResponse<SwarmTask>>, ApiError> {
    // IDOR protection: verify task belongs to the specified swarm before updating
    let existing_task = SwarmTask::find_by_id(&state.db_pool, task_id)
        .await
        ?
        .ok_or_else(|| ApiError::BadRequest("Task not found".to_string()))?;

    if existing_task.swarm_id != swarm.id {
        return Err(ApiError::BadRequest("Task not found".to_string()));
    }

    let task = SwarmTask::update(&state.db_pool, task_id, &payload)
        .await
        ?;

    tracing::info!("Updated swarm task '{}'", task.title);

    Ok(ResponseJson(ApiResponse::success(task)))
}

pub async fn retry_task(
    Extension(swarm): Extension<Swarm>,
    Path((_swarm_id, task_id)): Path<(Uuid, Uuid)>,
    State(state): State<AppState>,
) -> Result<ResponseJson<ApiResponse<SwarmTask>>, ApiError> {
    // Find the task
    let task = SwarmTask::find_by_id(&state.db_pool, task_id)
        .await
        ?
        .ok_or_else(|| ApiError::BadRequest("Task not found".to_string()))?;

    // IDOR protection: verify task belongs to the specified swarm
    if task.swarm_id != swarm.id {
        return Err(ApiError::BadRequest("Task not found".to_string()));
    }

    // Only allow retry on failed or cancelled tasks
    if !matches!(task.status, SwarmTaskStatus::Failed | SwarmTaskStatus::Cancelled) {
        return Err(ApiError::BadRequest(
            "Can only retry failed or cancelled tasks".to_string(),
        ));
    }

    // Use the dedicated retry_task method from the model
    SwarmTask::retry_task(&state.db_pool, task_id)
        .await
        ?;

    // Fetch the updated task to return
    let updated_task = SwarmTask::find_by_id(&state.db_pool, task_id)
        .await
        ?
        .ok_or_else(|| ApiError::BadRequest("Task disappeared after retry".to_string()))?;

    tracing::info!("Retrying swarm task '{}' ({})", updated_task.title, task_id);

    Ok(ResponseJson(ApiResponse::success(updated_task)))
}

pub async fn delete_task(
    Extension(swarm): Extension<Swarm>,
    Path((_swarm_id, task_id)): Path<(Uuid, Uuid)>,
    State(state): State<AppState>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    // IDOR protection: verify task belongs to the specified swarm before deleting
    let task = SwarmTask::find_by_id(&state.db_pool, task_id)
        .await
        ?
        .ok_or_else(|| ApiError::BadRequest("Task not found".to_string()))?;

    if task.swarm_id != swarm.id {
        return Err(ApiError::BadRequest("Task not found".to_string()));
    }

    let rows = SwarmTask::delete(&state.db_pool, task_id)
        .await
        ?;

    if rows == 0 {
        return Err(ApiError::BadRequest("Task not found".to_string()));
    }

    tracing::info!("Deleted swarm task {}", task_id);

    Ok(ResponseJson(ApiResponse::success(())))
}

/// Router for routes with task_id path param (get, update, delete, retry)
pub fn task_id_router() -> Router<AppState> {
    Router::new()
        .route("/", get(get_task).patch(update_task).delete(delete_task))
        .route("/retry", post(retry_task))
}
