use axum::{
    extract::State, http::StatusCode, response::Json as ResponseJson, routing::get, Extension,
    Json, Router,
};
use uuid::Uuid;

use crate::{
    app_state::AppState,
    execution_monitor,
    models::{
        project::Project,
        task::{CreateTask, CreateTaskAndStart, Task, TaskWithAttemptStatus, UpdateTask},
        task_attempt::{CreateTaskAttempt, TaskAttempt},
        ApiResponse,
    },
};

pub async fn get_project_tasks(
    Extension(project): Extension<Project>,
    State(app_state): State<AppState>,
) -> Result<ResponseJson<ApiResponse<Vec<TaskWithAttemptStatus>>>, StatusCode> {
    match Task::find_by_project_id_with_attempt_status(&app_state.db_pool, project.id).await {
        Ok(tasks) => Ok(ResponseJson(ApiResponse::success(tasks))),
        Err(e) => {
            tracing::error!("Failed to fetch tasks for project {}: {}", project.id, e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn get_task(
    Extension(task): Extension<Task>,
) -> Result<ResponseJson<ApiResponse<Task>>, StatusCode> {
    Ok(ResponseJson(ApiResponse::success(task)))
}

pub async fn create_task(
    Extension(project): Extension<Project>,
    State(app_state): State<AppState>,
    Json(mut payload): Json<CreateTask>,
) -> Result<ResponseJson<ApiResponse<Task>>, StatusCode> {
    let id = Uuid::new_v4();

    // Ensure the project_id in the payload matches the project from middleware
    payload.project_id = project.id;

    tracing::debug!(
        "Creating task '{}' in project {}",
        payload.title,
        project.id
    );

    match Task::create(&app_state.db_pool, &payload, id).await {
        Ok(task) => {
            // Track task creation event
            app_state
                .track_analytics_event(
                    "task_created",
                    Some(serde_json::json!({
                    "task_id": task.id.to_string(),
                    "project_id": project.id.to_string(),
                    "has_description": task.description.is_some(),
                    })),
                )
                .await;

            Ok(ResponseJson(ApiResponse::success(task)))
        }
        Err(e) => {
            tracing::error!("Failed to create task: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn create_task_and_start(
    Extension(project): Extension<Project>,
    State(app_state): State<AppState>,
    Json(mut payload): Json<CreateTaskAndStart>,
) -> Result<ResponseJson<ApiResponse<Task>>, StatusCode> {
    let task_id = Uuid::new_v4();

    // Ensure the project_id in the payload matches the project from middleware
    payload.project_id = project.id;

    tracing::debug!(
        "Creating and starting task '{}' in project {}",
        payload.title,
        project.id
    );

    // Create the task first
    let create_task_payload = CreateTask {
        project_id: payload.project_id,
        title: payload.title.clone(),
        description: payload.description.clone(),
        parent_task_attempt: payload.parent_task_attempt,
    };
    let task = match Task::create(&app_state.db_pool, &create_task_payload, task_id).await {
        Ok(task) => task,
        Err(e) => {
            tracing::error!("Failed to create task: {}", e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    // Create task attempt
    let executor_string = payload.executor.as_ref().map(|exec| exec.to_string());
    let attempt_payload = CreateTaskAttempt {
        executor: executor_string.clone(),
        base_branch: None, // Not supported in task creation endpoint, only in task attempts
    };

    match TaskAttempt::create(&app_state.db_pool, &attempt_payload, task_id).await {
        Ok(attempt) => {
            app_state
                .track_analytics_event(
                    "task_created",
                    Some(serde_json::json!({
                        "task_id": task.id.to_string(),
                        "project_id": project.id.to_string(),
                        "has_description": task.description.is_some(),
                    })),
                )
                .await;

            app_state
                .track_analytics_event(
                    "task_attempt_started",
                    Some(serde_json::json!({
                        "task_id": task.id.to_string(),
                        "executor_type": executor_string.as_deref().unwrap_or("default"),
                        "attempt_id": attempt.id.to_string(),
                    })),
                )
                .await;

            // Start execution asynchronously (don't block the response)
            let app_state_clone = app_state.clone();
            let attempt_id = attempt.id;
            tokio::spawn(async move {
                if let Err(e) = TaskAttempt::start_execution(
                    &app_state_clone.db_pool,
                    &app_state_clone,
                    attempt_id,
                    task_id,
                    project.id,
                )
                .await
                {
                    tracing::error!(
                        "Failed to start execution for task attempt {}: {}",
                        attempt_id,
                        e
                    );
                }
            });

            Ok(ResponseJson(ApiResponse::success(task)))
        }
        Err(e) => {
            tracing::error!("Failed to create task attempt: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn update_task(
    Extension(project): Extension<Project>,
    Extension(existing_task): Extension<Task>,
    State(app_state): State<AppState>,
    Json(payload): Json<UpdateTask>,
) -> Result<ResponseJson<ApiResponse<Task>>, StatusCode> {
    // Use existing values if not provided in update
    let title = payload.title.unwrap_or(existing_task.title);
    let description = payload.description.or(existing_task.description);
    let status = payload.status.unwrap_or(existing_task.status);
    let parent_task_attempt = payload
        .parent_task_attempt
        .or(existing_task.parent_task_attempt);

    match Task::update(
        &app_state.db_pool,
        existing_task.id,
        project.id,
        title,
        description,
        status,
        parent_task_attempt,
    )
    .await
    {
        Ok(task) => Ok(ResponseJson(ApiResponse::success(task))),
        Err(e) => {
            tracing::error!("Failed to update task: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn delete_task(
    Extension(project): Extension<Project>,
    Extension(task): Extension<Task>,
    State(app_state): State<AppState>,
) -> Result<ResponseJson<ApiResponse<()>>, StatusCode> {
    // Clean up all worktrees for this task before deletion
    if let Err(e) = execution_monitor::cleanup_task_worktrees(&app_state.db_pool, task.id).await {
        tracing::error!("Failed to cleanup worktrees for task {}: {}", task.id, e);
        // Continue with deletion even if cleanup fails
    }

    // Clean up all executor sessions for this task before deletion
    match TaskAttempt::find_by_task_id(&app_state.db_pool, task.id).await {
        Ok(task_attempts) => {
            for attempt in task_attempts {
                if let Err(e) =
                    crate::models::executor_session::ExecutorSession::delete_by_task_attempt_id(
                        &app_state.db_pool,
                        attempt.id,
                    )
                    .await
                {
                    tracing::error!(
                        "Failed to cleanup executor sessions for task attempt {}: {}",
                        attempt.id,
                        e
                    );
                    // Continue with deletion even if session cleanup fails
                } else {
                    tracing::debug!(
                        "Cleaned up executor sessions for task attempt {}",
                        attempt.id
                    );
                }
            }
        }
        Err(e) => {
            tracing::error!("Failed to get task attempts for session cleanup: {}", e);
            // Continue with deletion even if we can't get task attempts
        }
    }

    match Task::delete(&app_state.db_pool, task.id, project.id).await {
        Ok(rows_affected) => {
            if rows_affected == 0 {
                Err(StatusCode::NOT_FOUND)
            } else {
                Ok(ResponseJson(ApiResponse::success(())))
            }
        }
        Err(e) => {
            tracing::error!("Failed to delete task: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub fn tasks_project_router() -> Router<AppState> {
    use axum::routing::post;

    Router::new()
        .route(
            "/projects/:project_id/tasks",
            get(get_project_tasks).post(create_task),
        )
        .route(
            "/projects/:project_id/tasks/create-and-start",
            post(create_task_and_start),
        )
}

pub fn tasks_with_id_router() -> Router<AppState> {
    Router::new().route(
        "/projects/:project_id/tasks/:task_id",
        get(get_task).put(update_task).delete(delete_task),
    )
}
