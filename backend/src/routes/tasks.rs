use axum::{
    extract::{Extension, Path},
    http::StatusCode,
    response::Json as ResponseJson,
    routing::get,
    Json, Router,
};
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::models::{
    project::Project,
    task::{CreateTask, CreateTaskAndStart, Task, TaskWithAttemptStatus, UpdateTask},
    task_attempt::{CreateTaskAttempt, TaskAttempt},
    ApiResponse,
};

pub async fn get_project_tasks(
    Path(project_id): Path<Uuid>,
    Extension(pool): Extension<SqlitePool>,
) -> Result<ResponseJson<ApiResponse<Vec<TaskWithAttemptStatus>>>, StatusCode> {
    match Task::find_by_project_id_with_attempt_status(&pool, project_id).await {
        Ok(tasks) => Ok(ResponseJson(ApiResponse {
            success: true,
            data: Some(tasks),
            message: None,
        })),
        Err(e) => {
            tracing::error!("Failed to fetch tasks for project {}: {}", project_id, e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn get_task(
    Path((project_id, task_id)): Path<(Uuid, Uuid)>,
    Extension(pool): Extension<SqlitePool>,
) -> Result<ResponseJson<ApiResponse<Task>>, StatusCode> {
    match Task::find_by_id_and_project_id(&pool, task_id, project_id).await {
        Ok(Some(task)) => Ok(ResponseJson(ApiResponse {
            success: true,
            data: Some(task),
            message: None,
        })),
        Ok(None) => Err(StatusCode::NOT_FOUND),
        Err(e) => {
            tracing::error!(
                "Failed to fetch task {} in project {}: {}",
                task_id,
                project_id,
                e
            );
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn create_task(
    Path(project_id): Path<Uuid>,
    Extension(pool): Extension<SqlitePool>,
    Json(mut payload): Json<CreateTask>,
) -> Result<ResponseJson<ApiResponse<Task>>, StatusCode> {
    let id = Uuid::new_v4();

    // Ensure the project_id in the payload matches the path parameter
    payload.project_id = project_id;

    // Verify project exists first
    match Project::exists(&pool, project_id).await {
        Ok(false) => return Err(StatusCode::NOT_FOUND),
        Err(e) => {
            tracing::error!("Failed to check project existence: {}", e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
        Ok(true) => {}
    }

    tracing::debug!(
        "Creating task '{}' in project {}",
        payload.title,
        project_id
    );

    match Task::create(&pool, &payload, id).await {
        Ok(task) => Ok(ResponseJson(ApiResponse {
            success: true,
            data: Some(task),
            message: Some("Task created successfully".to_string()),
        })),
        Err(e) => {
            tracing::error!("Failed to create task: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn create_task_and_start(
    Path(project_id): Path<Uuid>,
    Extension(pool): Extension<SqlitePool>,
    Extension(app_state): Extension<crate::app_state::AppState>,
    Json(mut payload): Json<CreateTaskAndStart>,
) -> Result<ResponseJson<ApiResponse<Task>>, StatusCode> {
    let task_id = Uuid::new_v4();

    // Ensure the project_id in the payload matches the path parameter
    payload.project_id = project_id;

    // Verify project exists first
    match Project::exists(&pool, project_id).await {
        Ok(false) => return Err(StatusCode::NOT_FOUND),
        Err(e) => {
            tracing::error!("Failed to check project existence: {}", e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
        Ok(true) => {}
    }

    tracing::debug!(
        "Creating and starting task '{}' in project {}",
        payload.title,
        project_id
    );

    // Create the task first
    let create_task_payload = CreateTask {
        project_id: payload.project_id,
        title: payload.title.clone(),
        description: payload.description.clone(),
    };
    let task = match Task::create(&pool, &create_task_payload, task_id).await {
        Ok(task) => task,
        Err(e) => {
            tracing::error!("Failed to create task: {}", e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    // Create task attempt
    let executor_string = payload.executor.as_ref().map(|exec| match exec {
        crate::executor::ExecutorConfig::Echo => "echo".to_string(),
        crate::executor::ExecutorConfig::Claude => "claude".to_string(),
        crate::executor::ExecutorConfig::Amp => "amp".to_string(),
        crate::executor::ExecutorConfig::Gemini => "gemini".to_string(),
        crate::executor::ExecutorConfig::Opencode => "opencode".to_string(),
    });
    let attempt_payload = CreateTaskAttempt {
        executor: executor_string,
        base_branch: None, // Not supported in task creation endpoint, only in task attempts
    };

    match TaskAttempt::create(&pool, &attempt_payload, task_id).await {
        Ok(attempt) => {
            // Start execution asynchronously (don't block the response)
            let pool_clone = pool.clone();
            let app_state_clone = app_state.clone();
            let attempt_id = attempt.id;
            tokio::spawn(async move {
                if let Err(e) = TaskAttempt::start_execution(
                    &pool_clone,
                    &app_state_clone,
                    attempt_id,
                    task_id,
                    project_id,
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

            Ok(ResponseJson(ApiResponse {
                success: true,
                data: Some(task),
                message: Some("Task created and started successfully".to_string()),
            }))
        }
        Err(e) => {
            tracing::error!("Failed to create task attempt: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn update_task(
    Path((project_id, task_id)): Path<(Uuid, Uuid)>,
    Extension(pool): Extension<SqlitePool>,
    Json(payload): Json<UpdateTask>,
) -> Result<ResponseJson<ApiResponse<Task>>, StatusCode> {
    // Check if task exists in the specified project
    let existing_task = match Task::find_by_id_and_project_id(&pool, task_id, project_id).await {
        Ok(Some(task)) => task,
        Ok(None) => return Err(StatusCode::NOT_FOUND),
        Err(e) => {
            tracing::error!("Failed to check task existence: {}", e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    // Use existing values if not provided in update
    let title = payload.title.unwrap_or(existing_task.title);
    let description = payload.description.or(existing_task.description);
    let status = payload.status.unwrap_or(existing_task.status);

    match Task::update(&pool, task_id, project_id, title, description, status).await {
        Ok(task) => Ok(ResponseJson(ApiResponse {
            success: true,
            data: Some(task),
            message: Some("Task updated successfully".to_string()),
        })),
        Err(e) => {
            tracing::error!("Failed to update task: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn delete_task(
    Path((project_id, task_id)): Path<(Uuid, Uuid)>,
    Extension(pool): Extension<SqlitePool>,
) -> Result<ResponseJson<ApiResponse<()>>, StatusCode> {
    match Task::delete(&pool, task_id, project_id).await {
        Ok(rows_affected) => {
            if rows_affected == 0 {
                Err(StatusCode::NOT_FOUND)
            } else {
                Ok(ResponseJson(ApiResponse {
                    success: true,
                    data: None,
                    message: Some("Task deleted successfully".to_string()),
                }))
            }
        }
        Err(e) => {
            tracing::error!("Failed to delete task: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub fn tasks_router() -> Router {
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
        .route(
            "/projects/:project_id/tasks/:task_id",
            get(get_task).put(update_task).delete(delete_task),
        )
}
