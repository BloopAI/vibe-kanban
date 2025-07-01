use std::sync::Arc;

use axum::{
    extract::{Extension, Path, Query},
    http::StatusCode,
    response::Json as ResponseJson,
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::models::{
    execution_process::{ExecutionProcess, ExecutionProcessSummary},
    task::Task,
    task_attempt::{
        BranchStatus, CreateFollowUpAttempt, CreateTaskAttempt, TaskAttempt, TaskAttemptStatus,
        WorktreeDiff,
    },
    task_attempt_activity::{
        CreateTaskAttemptActivity, TaskAttemptActivity, TaskAttemptActivityWithPrompt,
    },
    ApiResponse,
};

#[derive(Debug, Deserialize, Serialize)]
pub struct RebaseTaskAttemptRequest {
    pub new_base_branch: Option<String>,
}

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
) -> Result<ResponseJson<ApiResponse<Vec<TaskAttemptActivityWithPrompt>>>, StatusCode> {
    // Verify task attempt exists and belongs to the correct task
    match TaskAttempt::exists_for_task(&pool, attempt_id, task_id, project_id).await {
        Ok(false) => return Err(StatusCode::NOT_FOUND),
        Err(e) => {
            tracing::error!("Failed to check task attempt existence: {}", e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
        Ok(true) => {}
    }

    // Get activities with prompts for the task attempt
    match TaskAttemptActivity::find_with_prompts_by_task_attempt_id(&pool, attempt_id).await {
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

    match TaskAttempt::create(&pool, &payload, task_id).await {
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

#[derive(serde::Deserialize)]
pub struct OpenEditorRequest {
    editor_type: Option<String>,
}

pub async fn open_task_attempt_in_editor(
    Path((project_id, task_id, attempt_id)): Path<(Uuid, Uuid, Uuid)>,
    Extension(pool): Extension<SqlitePool>,
    Extension(config): Extension<Arc<RwLock<crate::models::config::Config>>>,
    Json(payload): Json<Option<OpenEditorRequest>>,
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

    // Get editor command from config or override
    let editor_command = {
        let config_guard = config.read().await;
        if let Some(ref request) = payload {
            if let Some(ref editor_type) = request.editor_type {
                // Create a temporary editor config with the override
                use crate::models::config::{EditorConfig, EditorType};
                let override_editor_type = match editor_type.as_str() {
                    "vscode" => EditorType::VSCode,
                    "cursor" => EditorType::Cursor,
                    "windsurf" => EditorType::Windsurf,
                    "intellij" => EditorType::IntelliJ,
                    "zed" => EditorType::Zed,
                    "custom" => EditorType::Custom,
                    _ => config_guard.editor.editor_type.clone(),
                };
                let temp_config = EditorConfig {
                    editor_type: override_editor_type,
                    custom_command: config_guard.editor.custom_command.clone(),
                };
                temp_config.get_command()
            } else {
                config_guard.editor.get_command()
            }
        } else {
            config_guard.editor.get_command()
        }
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
            Err(StatusCode::INTERNAL_SERVER_ERROR)
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
    request_body: Option<Json<RebaseTaskAttemptRequest>>,
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

    // Extract new base branch from request body if provided
    let new_base_branch = request_body.and_then(|body| body.new_base_branch.clone());

    match TaskAttempt::rebase_attempt(&pool, attempt_id, task_id, project_id, new_base_branch).await
    {
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
) -> Result<ResponseJson<ApiResponse<Vec<ExecutionProcessSummary>>>, StatusCode> {
    // Verify task attempt exists and belongs to the correct task
    match TaskAttempt::exists_for_task(&pool, attempt_id, task_id, project_id).await {
        Ok(false) => return Err(StatusCode::NOT_FOUND),
        Err(e) => {
            tracing::error!("Failed to check task attempt existence: {}", e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
        Ok(true) => {}
    }

    match ExecutionProcess::find_summaries_by_task_attempt_id(&pool, attempt_id).await {
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

pub async fn get_execution_process(
    Path((project_id, process_id)): Path<(Uuid, Uuid)>,
    Extension(pool): Extension<SqlitePool>,
) -> Result<ResponseJson<ApiResponse<ExecutionProcess>>, StatusCode> {
    match ExecutionProcess::find_by_id(&pool, process_id).await {
        Ok(Some(process)) => {
            // Verify the process belongs to a task attempt in the correct project
            match TaskAttempt::find_by_id(&pool, process.task_attempt_id).await {
                Ok(Some(attempt)) => {
                    match Task::find_by_id(&pool, attempt.task_id).await {
                        Ok(Some(task)) if task.project_id == project_id => {
                            Ok(ResponseJson(ApiResponse {
                                success: true,
                                data: Some(process),
                                message: None,
                            }))
                        }
                        Ok(Some(_)) => Err(StatusCode::NOT_FOUND), // Wrong project
                        Ok(None) => Err(StatusCode::NOT_FOUND),
                        Err(e) => {
                            tracing::error!("Failed to fetch task: {}", e);
                            Err(StatusCode::INTERNAL_SERVER_ERROR)
                        }
                    }
                }
                Ok(None) => Err(StatusCode::NOT_FOUND),
                Err(e) => {
                    tracing::error!("Failed to fetch task attempt: {}", e);
                    Err(StatusCode::INTERNAL_SERVER_ERROR)
                }
            }
        }
        Ok(None) => Err(StatusCode::NOT_FOUND),
        Err(e) => {
            tracing::error!("Failed to fetch execution process {}: {}", process_id, e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

#[axum::debug_handler]
pub async fn stop_all_execution_processes(
    Path((project_id, task_id, attempt_id)): Path<(Uuid, Uuid, Uuid)>,
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

    // Get all execution processes for the task attempt
    let processes = match ExecutionProcess::find_by_task_attempt_id(&pool, attempt_id).await {
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

    let mut stopped_count = 0;
    let mut errors = Vec::new();

    // Stop all running processes
    for process in processes {
        match app_state.stop_running_execution_by_id(process.id).await {
            Ok(true) => {
                stopped_count += 1;

                // Update the execution process status in the database
                if let Err(e) = ExecutionProcess::update_completion(
                    &pool,
                    process.id,
                    crate::models::execution_process::ExecutionProcessStatus::Killed,
                    None,
                )
                .await
                {
                    tracing::error!("Failed to update execution process status: {}", e);
                    errors.push(format!("Failed to update process {} status", process.id));
                } else {
                    // Create activity record for stopped processes (skip dev servers)
                    if !matches!(
                        process.process_type,
                        crate::models::execution_process::ExecutionProcessType::DevServer
                    ) {
                        let activity_id = Uuid::new_v4();
                        let create_activity = CreateTaskAttemptActivity {
                            execution_process_id: process.id,
                            status: Some(TaskAttemptStatus::ExecutorFailed),
                            note: Some(format!(
                                "Execution process {:?} ({}) stopped by user",
                                process.process_type, process.id
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
                            errors.push(format!(
                                "Failed to create activity for process {}",
                                process.id
                            ));
                        }
                    }
                }
            }
            Ok(false) => {
                // Process was not running, which is fine
            }
            Err(e) => {
                tracing::error!("Failed to stop execution process {}: {}", process.id, e);
                errors.push(format!("Failed to stop process {}: {}", process.id, e));
            }
        }
    }

    if !errors.is_empty() {
        return Ok(ResponseJson(ApiResponse {
            success: false,
            data: None,
            message: Some(format!(
                "Stopped {} processes, but encountered errors: {}",
                stopped_count,
                errors.join(", ")
            )),
        }));
    }

    if stopped_count == 0 {
        return Ok(ResponseJson(ApiResponse {
            success: true,
            data: None,
            message: Some("No running processes found to stop".to_string()),
        }));
    }

    Ok(ResponseJson(ApiResponse {
        success: true,
        data: None,
        message: Some(format!(
            "Successfully stopped {} execution processes",
            stopped_count
        )),
    }))
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

    // Create activity record for stopped processes (skip dev servers)
    if !matches!(
        process.process_type,
        crate::models::execution_process::ExecutionProcessType::DevServer
    ) {
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

pub async fn create_followup_attempt(
    Path((project_id, task_id, attempt_id)): Path<(Uuid, Uuid, Uuid)>,
    Extension(pool): Extension<SqlitePool>,
    Extension(app_state): Extension<crate::app_state::AppState>,
    Json(payload): Json<CreateFollowUpAttempt>,
) -> Result<ResponseJson<ApiResponse<String>>, StatusCode> {
    // Verify task attempt exists
    if !TaskAttempt::exists_for_task(&pool, attempt_id, task_id, project_id)
        .await
        .map_err(|e| {
            tracing::error!("Failed to check task attempt existence: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?
    {
        return Err(StatusCode::NOT_FOUND);
    }

    // Start follow-up execution synchronously to catch errors
    match TaskAttempt::start_followup_execution(
        &pool,
        &app_state,
        attempt_id,
        task_id,
        project_id,
        &payload.prompt,
    )
    .await
    {
        Ok(_) => Ok(ResponseJson(ApiResponse {
            success: true,
            data: Some("Follow-up execution started successfully".to_string()),
            message: Some("Follow-up execution started successfully".to_string()),
        })),
        Err(e) => {
            tracing::error!(
                "Failed to start follow-up execution for task attempt {}: {}",
                attempt_id,
                e
            );
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn start_dev_server(
    Path((project_id, task_id, attempt_id)): Path<(Uuid, Uuid, Uuid)>,
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

    // Stop any existing dev servers for this project
    let existing_dev_servers =
        match ExecutionProcess::find_running_dev_servers_by_project(&pool, project_id).await {
            Ok(servers) => servers,
            Err(e) => {
                tracing::error!(
                    "Failed to find running dev servers for project {}: {}",
                    project_id,
                    e
                );
                return Err(StatusCode::INTERNAL_SERVER_ERROR);
            }
        };

    for dev_server in existing_dev_servers {
        tracing::info!(
            "Stopping existing dev server {} for project {}",
            dev_server.id,
            project_id
        );

        // Stop the running process
        if let Err(e) = app_state.stop_running_execution_by_id(dev_server.id).await {
            tracing::error!("Failed to stop dev server {}: {}", dev_server.id, e);
        } else {
            // Update the execution process status in the database
            if let Err(e) = ExecutionProcess::update_completion(
                &pool,
                dev_server.id,
                crate::models::execution_process::ExecutionProcessStatus::Killed,
                None,
            )
            .await
            {
                tracing::error!(
                    "Failed to update dev server {} status: {}",
                    dev_server.id,
                    e
                );
            }
        }
    }

    // Start dev server execution
    match TaskAttempt::start_dev_server(&pool, &app_state, attempt_id, task_id, project_id).await {
        Ok(_) => Ok(ResponseJson(ApiResponse {
            success: true,
            data: None,
            message: Some("Dev server started successfully".to_string()),
        })),
        Err(e) => {
            tracing::error!(
                "Failed to start dev server for task attempt {}: {}",
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
            "/projects/:project_id/tasks/:task_id/attempts/:attempt_id/stop",
            post(stop_all_execution_processes),
        )
        .route(
            "/projects/:project_id/tasks/:task_id/attempts/:attempt_id/execution-processes/:process_id/stop",
            post(stop_execution_process),
        )
        .route(
            "/projects/:project_id/execution-processes/:process_id",
            get(get_execution_process),
        )
        .route(
            "/projects/:project_id/tasks/:task_id/attempts/:attempt_id/follow-up",
            post(create_followup_attempt),
        )
        .route(
            "/projects/:project_id/tasks/:task_id/attempts/:attempt_id/start-dev-server",
            post(start_dev_server),
        )
}
