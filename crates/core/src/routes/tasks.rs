use axum::{
    extract::{Query, State},
    http::StatusCode,
    middleware::from_fn_with_state,
    response::Json as ResponseJson,
    routing::get,
    Extension, Json, Router,
};
use db::models::{
    project::Project,
    task::{CreateTask, Task, TaskWithAttemptStatus, UpdateTask},
};
use deployment::Deployment;
use serde::Deserialize;
use sqlx::Error as SqlxError;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{
    error::ApiError,
    middleware::{load_project_middleware, load_task_middleware},
    DeploymentImpl,
};

#[derive(Debug, Deserialize)]
pub struct TaskQuery {
    pub project_id: Uuid,
}

pub async fn get_tasks(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<TaskQuery>,
) -> Result<ResponseJson<ApiResponse<Vec<TaskWithAttemptStatus>>>, ApiError> {
    let tasks =
        Task::find_by_project_id_with_attempt_status(&deployment.db().pool, query.project_id)
            .await?;

    Ok(ResponseJson(ApiResponse::success(tasks)))
}

pub async fn get_task(
    Extension(task): Extension<Task>,
    State(_deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Task>>, ApiError> {
    Ok(ResponseJson(ApiResponse::success(task)))
}

pub async fn create_task(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateTask>,
) -> Result<ResponseJson<ApiResponse<Task>>, ApiError> {
    let id = Uuid::new_v4();

    tracing::debug!(
        "Creating task '{}' in project {}",
        payload.title,
        payload.project_id
    );

    let task = Task::create(&deployment.db().pool, &payload, id).await?;

    // Track task creation event
    deployment
        .track_if_analytics_allowed(
            "task_created",
            serde_json::json!({
            "task_id": task.id.to_string(),
            "project_id": payload.project_id,
            "has_description": task.description.is_some(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(task)))
}

// TODO: create and start
// pub async fn create_task_and_start(
//     Extension(project): Extension<Project>,
//     State(deployment): State<DeploymentImpl>,
//     Json(mut payload): Json<CreateTaskAndStart>,
// ) -> Result<ResponseJson<ApiResponse<Task>>, StatusCode> {
//     let task_id = Uuid::new_v4();

//     // Ensure the project_id in the payload matches the project from middleware
//     payload.project_id = project.id;

//     tracing::debug!(
//         "Creating and starting task '{}' in project {}",
//         payload.title,
//         project.id
//     );

//     // Create the task first
//     let create_task_payload = CreateTask {
//         project_id: payload.project_id,
//         title: payload.title.clone(),
//         description: payload.description.clone(),
//         parent_task_attempt: payload.parent_task_attempt,
//     };
//     let task = match Task::create(
//         &deployment.db().pool,
//         &create_task_payload,
//         task_id,
//     )
//     .await
//     {
//         Ok(task) => task,
//         Err(e) => {
//             tracing::error!("Failed to create task: {}", e);
//             return Err(StatusCode::INTERNAL_SERVER_ERROR);
//         }
//     };

//     // Create task attempt
//     let executor_string = payload.executor.as_ref().map(|exec| exec.to_string());
//     let attempt_payload = CreateTaskAttempt {
//         executor: executor_string.clone(),
//         base_branch: None, // Not supported in task creation endpoint, only in task attempts
//     };

//     match TaskAttempt::create(&app_state.db_pool, &attempt_payload, task_id).await {
//         Ok(attempt) => {
//             app_state
//                 .track_analytics_event(
//                     "task_created",
//                     Some(serde_json::json!({
//                         "task_id": task.id.to_string(),
//                         "project_id": project.id.to_string(),
//                         "has_description": task.description.is_some(),
//                     })),
//                 )
//                 .await;

//             app_state
//                 .track_analytics_event(
//                     "task_attempt_started",
//                     Some(serde_json::json!({
//                         "task_id": task.id.to_string(),
//                         "executor_type": executor_string.as_deref().unwrap_or("default"),
//                         "attempt_id": attempt.id.to_string(),
//                     })),
//                 )
//                 .await;

//             // Start execution asynchronously (don't block the response)
//             let app_state_clone = app_state.clone();
//             let attempt_id = attempt.id;
//             tokio::spawn(async move {
//                 if let Err(e) = TaskAttempt::start_execution(
//                     &app_state_clone.db_pool,
//                     &app_state_clone,
//                     attempt_id,
//                     task_id,
//                     project.id,
//                 )
//                 .await
//                 {
//                     tracing::error!(
//                         "Failed to start execution for task attempt {}: {}",
//                         attempt_id,
//                         e
//                     );
//                 }
//             });

//             Ok(ResponseJson(ApiResponse::success(task)))
//         }
//         Err(e) => {
//             tracing::error!("Failed to create task attempt: {}", e);
//             Err(StatusCode::INTERNAL_SERVER_ERROR)
//         }
//     }
// }

pub async fn update_task(
    Extension(existing_task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<UpdateTask>,
) -> Result<ResponseJson<ApiResponse<Task>>, ApiError> {
    // Use existing values if not provided in update
    let title = payload.title.unwrap_or(existing_task.title);
    let description = payload.description.or(existing_task.description);
    let status = payload.status.unwrap_or(existing_task.status);
    let parent_task_attempt = payload
        .parent_task_attempt
        .or(existing_task.parent_task_attempt);

    let task = Task::update(
        &deployment.db().pool,
        existing_task.id,
        existing_task.project_id,
        title,
        description,
        status,
        parent_task_attempt,
    )
    .await?;

    Ok(ResponseJson(ApiResponse::success(task)))
}

pub async fn delete_task(
    Extension(task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    // Clean up all worktrees for this task before deletion
    // TODO: readd worktree cleanup
    // if let Err(e) =
    //     execution_monitor::cleanup_task_worktrees(&deployment.db().pool, task.id).await
    // {
    //     tracing::error!("Failed to cleanup worktrees for task {}: {}", task.id, e);
    //     // Continue with deletion even if cleanup fails
    // }

    // // Clean up all executor sessions for this task before deletion
    // match TaskAttempt::find_by_task_id(&deployment.db().pool, task.id).await {
    //     Ok(task_attempts) => {
    //         for attempt in task_attempts {
    //             if let Err(e) =
    //                 crate::models::executor_session::ExecutorSession::delete_by_task_attempt_id(
    //                     &app_state.db_pool,
    //                     attempt.id,
    //                 )
    //                 .await
    //             {
    //                 tracing::error!(
    //                     "Failed to cleanup executor sessions for task attempt {}: {}",
    //                     attempt.id,
    //                     e
    //                 );
    //                 // Continue with deletion even if session cleanup fails
    //             } else {
    //                 tracing::debug!(
    //                     "Cleaned up executor sessions for task attempt {}",
    //                     attempt.id
    //                 );
    //             }
    //         }
    //     }
    //     Err(e) => {
    //         tracing::error!("Failed to get task attempts for session cleanup: {}", e);
    //         // Continue with deletion even if we can't get task attempts
    //     }
    // }

    let rows_affected = Task::delete(&deployment.db().pool, task.id).await?;

    if rows_affected == 0 {
        Err(ApiError::Database(SqlxError::RowNotFound))
    } else {
        Ok(ResponseJson(ApiResponse::success(())))
    }
}

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let task_id_router = Router::new()
        .route("/", get(get_task).put(update_task).delete(delete_task))
        .layer(from_fn_with_state(deployment.clone(), load_task_middleware));

    let inner = Router::new()
        .route("/", get(get_tasks).post(create_task))
        // .route("/create-and-start", post(create_task_and_start))
        .nest("/{task_id}", task_id_router);

    // mount under /projects/:project_id/tasks
    Router::new().nest("/tasks", inner)
}
