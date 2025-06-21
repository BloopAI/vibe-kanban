use axum::{
    extract::{Extension, Path, Query},
    http::StatusCode,
    response::Json as ResponseJson,
    routing::get,
    Json, Router,
};
use sqlx::SqlitePool;
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::models::{
    execution_process::ExecutionProcess,
    task::Task,
    task_attempt::{BranchStatus, CreateTaskAttempt, TaskAttempt, TaskAttemptStatus, WorktreeDiff},
    task_attempt_activity::{CreateTaskAttemptActivity, TaskAttemptActivity},
    ApiResponse,
};

pub async fn get_task_attempts(
    Path((project_id, task_id)): Path<(Uuid, Uuid)>,
    Extension(pool): Extension<SqlitePool>,
) -> Result<ResponseJson<ApiResponse<Vec<TaskAttempt>>>, StatusCode> {
    // Verify task exists in project first
    match Task::exists(&pool, task_id, project_id).await {
        Ok(false) => return Err(StatusCode::NOT_FOUND),
        Err(e) => {
            tracing::error!("Failed to check task existence: {}", e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
        Ok(true) => {}
    }

    match TaskAttempt::find_by_task_id(&pool, task_id).await {
        Ok(attempts) => Ok(ResponseJson(ApiResponse {
            success: true,
            data: Some(attempts),
            message: None,
        })),
        Err(e) => {
            tracing::error!("Failed to fetch task attempts for task {}: {}", task_id, e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn get_task_attempt_activities(
    Path((project_id, task_id, attempt_id)): Path<(Uuid, Uuid, Uuid)>,
    Extension(pool): Extension<SqlitePool>,
) -> Result<ResponseJson<ApiResponse<Vec<TaskAttemptActivity>>>, StatusCode> {
    // Verify task attempt exists and belongs to the correct task
    match TaskAttempt::exists_for_task(&pool, attempt_id, task_id, project_id).await {
        Ok(false) => return Err(StatusCode::NOT_FOUND),
        Err(e) => {
            tracing::error!("Failed to check task attempt existence: {}", e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
        Ok(true) => {}
    }

    // Get all execution processes for the task attempt
    let execution_processes =
        match ExecutionProcess::find_by_task_attempt_id(&pool, attempt_id).await {
            Ok(processes) => processes,
            Err(e) => {
                tracing::error!(
                    "Failed to fetch execution processes for attempt {}: {}",
                    attempt_id,
                    e
                );
                return Err(StatusCode::INTERNAL_SERVER_ERROR);
            }
        };

    // Get activities for all execution processes
    let mut all_activities = Vec::new();
    for process in execution_processes {
        match TaskAttemptActivity::find_by_execution_process_id(&pool, process.id).await {
            Ok(mut activities) => all_activities.append(&mut activities),
            Err(e) => {
                tracing::error!(
                    "Failed to fetch activities for execution process {}: {}",
                    process.id,
                    e
                );
                return Err(StatusCode::INTERNAL_SERVER_ERROR);
            }
        }
    }

    // Sort activities by created_at
    all_activities.sort_by(|a, b| a.created_at.cmp(&b.created_at));

    match Ok::<Vec<TaskAttemptActivity>, sqlx::Error>(all_activities) {
        Ok(activities) => Ok(ResponseJson(ApiResponse {
            success: true,
            data: Some(activities),
            message: None,
        })),
        Err(e) => {
            tracing::error!(
                "Failed to fetch task attempt activities for attempt {}: {}",
                attempt_id,
                e
            );
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn create_task_attempt(
    Path((project_id, task_id)): Path<(Uuid, Uuid)>,
    Extension(pool): Extension<SqlitePool>,
    Extension(app_state): Extension<crate::app_state::AppState>,
    Json(payload): Json<CreateTaskAttempt>,
) -> Result<ResponseJson<ApiResponse<TaskAttempt>>, StatusCode> {
    // Verify task exists in project first
    match Task::exists(&pool, task_id, project_id).await {
        Ok(false) => return Err(StatusCode::NOT_FOUND),
        Err(e) => {
            tracing::error!("Failed to check task existence: {}", e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
        Ok(true) => {}
    }

    let id = Uuid::new_v4();

    match TaskAttempt::create(&pool, &payload, id, task_id).await {
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
                data: Some(attempt),
                message: Some("Task attempt created successfully".to_string()),
            }))
        }
        Err(e) => {
            tracing::error!("Failed to create task attempt: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn create_task_attempt_activity(
    Path((project_id, task_id, attempt_id)): Path<(Uuid, Uuid, Uuid)>,
    Extension(pool): Extension<SqlitePool>,
    Json(payload): Json<CreateTaskAttemptActivity>,
) -> Result<ResponseJson<ApiResponse<TaskAttemptActivity>>, StatusCode> {
    // Verify task attempt exists and belongs to the correct task
    match TaskAttempt::exists_for_task(&pool, attempt_id, task_id, project_id).await {
        Ok(false) => return Err(StatusCode::NOT_FOUND),
        Err(e) => {
            tracing::error!("Failed to check task attempt existence: {}", e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
        Ok(true) => {}
    }

    let id = Uuid::new_v4();

    // Check that execution_process_id is provided in payload
    if payload.execution_process_id == Uuid::nil() {
        return Err(StatusCode::BAD_REQUEST);
    }

    // Verify the execution process exists and belongs to this task attempt
    match ExecutionProcess::find_by_id(&pool, payload.execution_process_id).await {
        Ok(Some(process)) => {
            if process.task_attempt_id != attempt_id {
                return Err(StatusCode::BAD_REQUEST);
            }
        }
        Ok(None) => return Err(StatusCode::NOT_FOUND),
        Err(e) => {
            tracing::error!("Failed to verify execution process: {}", e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    }

    // Default to SetupRunning status if not provided
    let status = payload
        .status
        .clone()
        .unwrap_or(TaskAttemptStatus::SetupRunning);

    match TaskAttemptActivity::create(&pool, &payload, id, status).await {
        Ok(activity) => Ok(ResponseJson(ApiResponse {
            success: true,
            data: Some(activity),
            message: Some("Task attempt activity created successfully".to_string()),
        })),
        Err(e) => {
            tracing::error!("Failed to create task attempt activity: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn get_task_attempt_diff(
    Path((project_id, task_id, attempt_id)): Path<(Uuid, Uuid, Uuid)>,
    Extension(pool): Extension<SqlitePool>,
) -> Result<ResponseJson<ApiResponse<WorktreeDiff>>, StatusCode> {
    match TaskAttempt::get_diff(&pool, attempt_id, task_id, project_id).await {
        Ok(diff) => Ok(ResponseJson(ApiResponse {
            success: true,
            data: Some(diff),
            message: None,
        })),
        Err(e) => {
            tracing::error!("Failed to get diff for task attempt {}: {}", attempt_id, e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

#[axum::debug_handler]
pub async fn merge_task_attempt(
    Path((project_id, task_id, attempt_id)): Path<(Uuid, Uuid, Uuid)>,
    Extension(pool): Extension<SqlitePool>,
) -> Result<ResponseJson<ApiResponse<()>>, StatusCode> {
    // Verify task attempt exists and belongs to the correct task
    match TaskAttempt::exists_for_task(&pool, attempt_id, task_id, project_id).await {
        Ok(false) => return Err(StatusCode::NOT_FOUND),
        Err(e) => {
            tracing::error!("Failed to check task attempt existence: {}", e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
        Ok(true) => {}
    }

    match TaskAttempt::merge_changes(&pool, attempt_id, task_id, project_id).await {
        Ok(_merge_commit_id) => {
            // Update task status to Done
            if let Err(e) = Task::update_status(
                &pool,
                task_id,
                project_id,
                crate::models::task::TaskStatus::Done,
            )
            .await
            {
                tracing::error!("Failed to update task status to Done after merge: {}", e);
                return Err(StatusCode::INTERNAL_SERVER_ERROR);
            }

            Ok(ResponseJson(ApiResponse {
                success: true,
                data: None,
                message: Some("Changes merged successfully".to_string()),
            }))
        }
        Err(e) => {
            tracing::error!("Failed to merge task attempt {}: {}", attempt_id, e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn open_task_attempt_in_editor(
    Path((project_id, task_id, attempt_id)): Path<(Uuid, Uuid, Uuid)>,
    Extension(pool): Extension<SqlitePool>,
    Extension(config): Extension<Arc<RwLock<crate::models::config::Config>>>,
) -> Result<ResponseJson<ApiResponse<()>>, StatusCode> {
    // Verify task attempt exists and belongs to the correct task
    match TaskAttempt::exists_for_task(&pool, attempt_id, task_id, project_id).await {
        Ok(false) => return Err(StatusCode::NOT_FOUND),
        Err(e) => {
            tracing::error!("Failed to check task attempt existence: {}", e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
        Ok(true) => {}
    }

    // Get the task attempt to access the worktree path
    let attempt = match TaskAttempt::find_by_id(&pool, attempt_id).await {
        Ok(Some(attempt)) => attempt,
        Ok(None) => return Err(StatusCode::NOT_FOUND),
        Err(e) => {
            tracing::error!("Failed to fetch task attempt {}: {}", attempt_id, e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    // Get editor command from config
    let editor_command = {
        let config_guard = config.read().await;
        config_guard.editor.get_command()
    };

    // Open editor in the worktree directory
    let mut cmd = std::process::Command::new(&editor_command[0]);
    for arg in &editor_command[1..] {
        cmd.arg(arg);
    }
    cmd.arg(&attempt.worktree_path);

    match cmd.spawn() {
        Ok(_) => {
            tracing::info!(
                "Opened editor ({}) for task attempt {} at path: {}",
                editor_command.join(" "),
                attempt_id,
                attempt.worktree_path
            );
            Ok(ResponseJson(ApiResponse {
                success: true,
                data: None,
                message: Some("Editor opened successfully".to_string()),
            }))
        }
        Err(e) => {
            tracing::error!(
                "Failed to open editor ({}) for attempt {}: {}",
                editor_command.join(" "),
                attempt_id,
                e
            );
            Ok(ResponseJson(ApiResponse {
                success: false,
                data: None,
                message: Some(format!("Failed to open editor: {}", e)),
            }))
        }
    }
}

pub async fn get_task_attempt_branch_status(
    Path((project_id, task_id, attempt_id)): Path<(Uuid, Uuid, Uuid)>,
    Extension(pool): Extension<SqlitePool>,
) -> Result<ResponseJson<ApiResponse<BranchStatus>>, StatusCode> {
    match TaskAttempt::get_branch_status(&pool, attempt_id, task_id, project_id).await {
        Ok(status) => Ok(ResponseJson(ApiResponse {
            success: true,
            data: Some(status),
            message: None,
        })),
        Err(e) => {
            tracing::error!(
                "Failed to get branch status for task attempt {}: {}",
                attempt_id,
                e
            );
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

#[axum::debug_handler]
pub async fn rebase_task_attempt(
    Path((project_id, task_id, attempt_id)): Path<(Uuid, Uuid, Uuid)>,
    Extension(pool): Extension<SqlitePool>,
) -> Result<ResponseJson<ApiResponse<()>>, StatusCode> {
    // Verify task attempt exists and belongs to the correct task
    match TaskAttempt::exists_for_task(&pool, attempt_id, task_id, project_id).await {
        Ok(false) => return Err(StatusCode::NOT_FOUND),
        Err(e) => {
            tracing::error!("Failed to check task attempt existence: {}", e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
        Ok(true) => {}
    }

    match TaskAttempt::rebase_onto_main(&pool, attempt_id, task_id, project_id).await {
        Ok(_new_base_commit) => Ok(ResponseJson(ApiResponse {
            success: true,
            data: None,
            message: Some("Branch rebased successfully".to_string()),
        })),
        Err(e) => {
            tracing::error!("Failed to rebase task attempt {}: {}", attempt_id, e);
            Ok(ResponseJson(ApiResponse {
                success: false,
                data: None,
                message: Some(e.to_string()),
            }))
        }
    }
}

pub async fn get_task_attempt_execution_processes(
    Path((project_id, task_id, attempt_id)): Path<(Uuid, Uuid, Uuid)>,
    Extension(pool): Extension<SqlitePool>,
) -> Result<ResponseJson<ApiResponse<Vec<ExecutionProcess>>>, StatusCode> {
    // Verify task attempt exists and belongs to the correct task
    match TaskAttempt::exists_for_task(&pool, attempt_id, task_id, project_id).await {
        Ok(false) => return Err(StatusCode::NOT_FOUND),
        Err(e) => {
            tracing::error!("Failed to check task attempt existence: {}", e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
        Ok(true) => {}
    }

    match ExecutionProcess::find_by_task_attempt_id(&pool, attempt_id).await {
        Ok(processes) => Ok(ResponseJson(ApiResponse {
            success: true,
            data: Some(processes),
            message: None,
        })),
        Err(e) => {
            tracing::error!(
                "Failed to fetch execution processes for attempt {}: {}",
                attempt_id,
                e
            );
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

#[axum::debug_handler]
pub async fn stop_execution_process(
    Path((project_id, task_id, attempt_id, process_id)): Path<(Uuid, Uuid, Uuid, Uuid)>,
    Extension(pool): Extension<SqlitePool>,
    Extension(app_state): Extension<crate::app_state::AppState>,
) -> Result<ResponseJson<ApiResponse<()>>, StatusCode> {
    // Verify task attempt exists and belongs to the correct task
    match TaskAttempt::exists_for_task(&pool, attempt_id, task_id, project_id).await {
        Ok(false) => return Err(StatusCode::NOT_FOUND),
        Err(e) => {
            tracing::error!("Failed to check task attempt existence: {}", e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
        Ok(true) => {}
    }

    // Verify execution process exists and belongs to the task attempt
    let process = match ExecutionProcess::find_by_id(&pool, process_id).await {
        Ok(Some(process)) if process.task_attempt_id == attempt_id => process,
        Ok(Some(_)) => return Err(StatusCode::NOT_FOUND), // Process exists but wrong attempt
        Ok(None) => return Err(StatusCode::NOT_FOUND),
        Err(e) => {
            tracing::error!("Failed to fetch execution process {}: {}", process_id, e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    // Stop the specific execution process
    let stopped = match app_state.stop_running_execution_by_id(process_id).await {
        Ok(stopped) => stopped,
        Err(e) => {
            tracing::error!("Failed to stop execution process {}: {}", process_id, e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    if !stopped {
        return Ok(ResponseJson(ApiResponse {
            success: true,
            data: None,
            message: Some("Execution process was not running".to_string()),
        }));
    }

    // Update the execution process status in the database
    if let Err(e) = ExecutionProcess::update_completion(
        &pool,
        process_id,
        crate::models::execution_process::ExecutionProcessStatus::Killed,
        None,
    )
    .await
    {
        tracing::error!("Failed to update execution process status: {}", e);
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }

    // Create a new activity record to mark as stopped
    let activity_id = Uuid::new_v4();
    let create_activity = CreateTaskAttemptActivity {
        execution_process_id: process_id,
        status: Some(TaskAttemptStatus::ExecutorFailed),
        note: Some(format!(
            "Execution process {:?} ({}) stopped by user",
            process.process_type, process_id
        )),
    };

    if let Err(e) = TaskAttemptActivity::create(
        &pool,
        &create_activity,
        activity_id,
        TaskAttemptStatus::ExecutorFailed,
    )
    .await
    {
        tracing::error!("Failed to create stopped activity: {}", e);
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }

    Ok(ResponseJson(ApiResponse {
        success: true,
        data: None,
        message: Some(format!(
            "Execution process {} stopped successfully",
            process_id
        )),
    }))
}

#[derive(serde::Deserialize)]
pub struct DeleteFileQuery {
    file_path: String,
}

#[axum::debug_handler]
pub async fn delete_task_attempt_file(
    Path((project_id, task_id, attempt_id)): Path<(Uuid, Uuid, Uuid)>,
    Query(query): Query<DeleteFileQuery>,
    Extension(pool): Extension<SqlitePool>,
) -> Result<ResponseJson<ApiResponse<()>>, StatusCode> {
    // Verify task attempt exists and belongs to the correct task
    match TaskAttempt::exists_for_task(&pool, attempt_id, task_id, project_id).await {
        Ok(false) => return Err(StatusCode::NOT_FOUND),
        Err(e) => {
            tracing::error!("Failed to check task attempt existence: {}", e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
        Ok(true) => {}
    }

    match TaskAttempt::delete_file(&pool, attempt_id, task_id, project_id, &query.file_path).await {
        Ok(_commit_id) => Ok(ResponseJson(ApiResponse {
            success: true,
            data: None,
            message: Some(format!("File '{}' deleted successfully", query.file_path)),
        })),
        Err(e) => {
            tracing::error!(
                "Failed to delete file '{}' from task attempt {}: {}",
                query.file_path,
                attempt_id,
                e
            );
            Ok(ResponseJson(ApiResponse {
                success: false,
                data: None,
                message: Some(e.to_string()),
            }))
        }
    }
}

pub fn task_attempts_router() -> Router {
    use axum::routing::post;

    Router::new()
        .route(
            "/projects/:project_id/tasks/:task_id/attempts",
            get(get_task_attempts).post(create_task_attempt),
        )
        .route(
            "/projects/:project_id/tasks/:task_id/attempts/:attempt_id/activities",
            get(get_task_attempt_activities).post(create_task_attempt_activity),
        )

        .route(
            "/projects/:project_id/tasks/:task_id/attempts/:attempt_id/diff",
            get(get_task_attempt_diff),
        )
        .route(
            "/projects/:project_id/tasks/:task_id/attempts/:attempt_id/merge",
            post(merge_task_attempt),
        )
        .route(
            "/projects/:project_id/tasks/:task_id/attempts/:attempt_id/branch-status",
            get(get_task_attempt_branch_status),
        )
        .route(
            "/projects/:project_id/tasks/:task_id/attempts/:attempt_id/rebase",
            post(rebase_task_attempt),
        )
        .route(
            "/projects/:project_id/tasks/:task_id/attempts/:attempt_id/open-editor",
            post(open_task_attempt_in_editor),
        )
        .route(
            "/projects/:project_id/tasks/:task_id/attempts/:attempt_id/delete-file",
            post(delete_task_attempt_file),
        )
        .route(
            "/projects/:project_id/tasks/:task_id/attempts/:attempt_id/execution-processes",
            get(get_task_attempt_execution_processes),
        )
        .route(
            "/projects/:project_id/tasks/:task_id/attempts/:attempt_id/execution-processes/:process_id/stop",
            post(stop_execution_process),
        )
}
