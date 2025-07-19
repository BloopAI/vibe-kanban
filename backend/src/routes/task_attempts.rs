use axum::{
    extract::{Query, State},
    http::StatusCode,
    middleware::from_fn_with_state,
    response::Json as ResponseJson,
    routing::get,
    Extension, Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use ts_rs::TS;
use uuid::Uuid;

use crate::{
    app_state::AppState,
    executor::{
        ActionType, ExecutorConfig, NormalizedConversation, NormalizedEntry, NormalizedEntryType,
    },
    middleware::{load_execution_process_with_context_middleware, load_task_attempt_middleware},
    models::{
        config::Config,
        execution_process::{
            ExecutionProcess, ExecutionProcessStatus, ExecutionProcessSummary, ExecutionProcessType,
        },
        project::Project,
        task::{Task, TaskStatus},
        task_attempt::{
            BranchStatus, CreateFollowUpAttempt, CreatePrParams, CreateTaskAttempt, TaskAttempt,
            TaskAttemptState, WorktreeDiff,
        },
        ApiResponse,
    },
};

#[derive(Debug, Deserialize, Serialize)]
pub struct RebaseTaskAttemptRequest {
    pub new_base_branch: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct CreateGitHubPRRequest {
    pub title: String,
    pub body: Option<String>,
    pub base_branch: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct FollowUpResponse {
    pub message: String,
    pub actual_attempt_id: Uuid,
    pub created_new_attempt: bool,
}

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct ProcessLogsResponse {
    pub id: Uuid,
    pub process_type: ExecutionProcessType,
    pub command: String,
    pub executor_type: Option<String>,
    pub status: ExecutionProcessStatus,
    pub normalized_conversation: NormalizedConversation,
}

// Helper to normalize logs for a process (extracted from get_execution_process_normalized_logs)
async fn normalize_process_logs(
    db_pool: &SqlitePool,
    process: &ExecutionProcess,
) -> NormalizedConversation {
    use crate::models::{
        execution_process::ExecutionProcessType, executor_session::ExecutorSession,
    };
    let executor_session = ExecutorSession::find_by_execution_process_id(db_pool, process.id)
        .await
        .ok()
        .flatten();

    let has_stdout = process
        .stdout
        .as_ref()
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let has_stderr = process
        .stderr
        .as_ref()
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);

    if !has_stdout && !has_stderr {
        return NormalizedConversation {
            entries: vec![],
            session_id: None,
            executor_type: process
                .executor_type
                .clone()
                .unwrap_or("unknown".to_string()),
            prompt: executor_session.as_ref().and_then(|s| s.prompt.clone()),
            summary: executor_session.as_ref().and_then(|s| s.summary.clone()),
        };
    }

    // Parse stdout as JSONL using executor normalization
    let mut stdout_entries = Vec::new();
    if let Some(stdout) = &process.stdout {
        if !stdout.trim().is_empty() {
            let executor_type = process.executor_type.as_deref().unwrap_or("unknown");
            let executor_config = if process.process_type == ExecutionProcessType::SetupScript {
                ExecutorConfig::SetupScript {
                    script: executor_session
                        .as_ref()
                        .and_then(|s| s.prompt.clone())
                        .unwrap_or_else(|| "setup script".to_string()),
                }
            } else {
                match executor_type.to_string().parse() {
                    Ok(config) => config,
                    Err(_) => {
                        return NormalizedConversation {
                            entries: vec![],
                            session_id: None,
                            executor_type: executor_type.to_string(),
                            prompt: executor_session.as_ref().and_then(|s| s.prompt.clone()),
                            summary: executor_session.as_ref().and_then(|s| s.summary.clone()),
                        };
                    }
                }
            };
            let executor = executor_config.create_executor();
            let working_dir_path = match std::fs::canonicalize(&process.working_directory) {
                Ok(canonical_path) => canonical_path.to_string_lossy().to_string(),
                Err(_) => process.working_directory.clone(),
            };
            if let Ok(normalized) = executor.normalize_logs(stdout, &working_dir_path) {
                stdout_entries = normalized.entries;
            }
        }
    }
    // Parse stderr chunks separated by boundary markers
    let mut stderr_entries = Vec::new();
    if let Some(stderr) = &process.stderr {
        let trimmed = stderr.trim();
        if !trimmed.is_empty() {
            let chunks: Vec<&str> = trimmed.split("---STDERR_CHUNK_BOUNDARY---").collect();
            for chunk in chunks {
                let chunk_trimmed = chunk.trim();
                if !chunk_trimmed.is_empty() {
                    let filtered_content = chunk_trimmed.replace("---STDERR_CHUNK_BOUNDARY---", "");
                    if !filtered_content.trim().is_empty() {
                        stderr_entries.push(NormalizedEntry {
                            timestamp: Some(chrono::Utc::now().to_rfc3339()),
                            entry_type: NormalizedEntryType::ErrorMessage,
                            content: filtered_content.trim().to_string(),
                            metadata: None,
                        });
                    }
                }
            }
        }
    }
    let mut all_entries = Vec::new();
    all_entries.extend(stdout_entries);
    all_entries.extend(stderr_entries);
    all_entries.sort_by(|a, b| match (&a.timestamp, &b.timestamp) {
        (Some(a_ts), Some(b_ts)) => a_ts.cmp(b_ts),
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, Some(_)) => std::cmp::Ordering::Greater,
        (None, None) => std::cmp::Ordering::Equal,
    });
    let executor_type = if process.process_type == ExecutionProcessType::SetupScript {
        "setup-script".to_string()
    } else {
        process
            .executor_type
            .clone()
            .unwrap_or("unknown".to_string())
    };
    NormalizedConversation {
        entries: all_entries,
        session_id: None,
        executor_type,
        prompt: executor_session.as_ref().and_then(|s| s.prompt.clone()),
        summary: executor_session.as_ref().and_then(|s| s.summary.clone()),
    }
}

/// Get all normalized logs for all execution processes of a task attempt
pub async fn get_task_attempt_all_logs(
    Extension(_project): Extension<Project>,
    Extension(_task): Extension<Task>,
    Extension(task_attempt): Extension<TaskAttempt>,
    State(app_state): State<AppState>,
) -> Result<Json<ApiResponse<Vec<ProcessLogsResponse>>>, StatusCode> {
    // Fetch all execution processes for this attempt
    let processes = match ExecutionProcess::find_by_task_attempt_id(
        &app_state.db_pool,
        task_attempt.id,
    )
    .await
    {
        Ok(list) => list,
        Err(_) => return Err(StatusCode::INTERNAL_SERVER_ERROR),
    };
    // For each process, normalize logs
    let mut result = Vec::new();
    for process in processes {
        let normalized_conversation = normalize_process_logs(&app_state.db_pool, &process).await;
        result.push(ProcessLogsResponse {
            id: process.id,
            process_type: process.process_type.clone(),
            command: process.command.clone(),
            executor_type: process.executor_type.clone(),
            status: process.status.clone(),
            normalized_conversation,
        });
    }
    Ok(Json(ApiResponse::success(result)))
}

pub async fn get_task_attempts(
    Extension(_project): Extension<Project>,
    Extension(task): Extension<Task>,
    State(app_state): State<AppState>,
) -> Result<ResponseJson<ApiResponse<Vec<TaskAttempt>>>, StatusCode> {
    match TaskAttempt::find_by_task_id(&app_state.db_pool, task.id).await {
        Ok(attempts) => Ok(ResponseJson(ApiResponse::success(attempts))),
        Err(e) => {
            tracing::error!("Failed to fetch task attempts for task {}: {}", task.id, e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn create_task_attempt(
    Extension(_project): Extension<Project>,
    Extension(task): Extension<Task>,
    State(app_state): State<AppState>,
    Json(payload): Json<CreateTaskAttempt>,
) -> Result<ResponseJson<ApiResponse<TaskAttempt>>, StatusCode> {
    let executor_string = payload.executor.as_ref().map(|exec| exec.to_string());

    match TaskAttempt::create(&app_state.db_pool, &payload, task.id).await {
        Ok(attempt) => {
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
            let task_id = task.id;
            let project_id = _project.id;
            tokio::spawn(async move {
                if let Err(e) = TaskAttempt::start_execution(
                    &app_state_clone.db_pool,
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

            Ok(ResponseJson(ApiResponse::success(attempt)))
        }
        Err(e) => {
            tracing::error!("Failed to create task attempt: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn get_task_attempt_diff(
    Extension(project): Extension<Project>,
    Extension(task): Extension<Task>,
    Extension(task_attempt): Extension<TaskAttempt>,
    State(app_state): State<AppState>,
) -> Result<ResponseJson<ApiResponse<WorktreeDiff>>, StatusCode> {
    match TaskAttempt::get_diff(&app_state.db_pool, task_attempt.id, task.id, project.id).await {
        Ok(diff) => Ok(ResponseJson(ApiResponse::success(diff))),
        Err(e) => {
            tracing::error!(
                "Failed to get diff for task attempt {}: {}",
                task_attempt.id,
                e
            );
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

#[axum::debug_handler]
pub async fn merge_task_attempt(
    Extension(project): Extension<Project>,
    Extension(task): Extension<Task>,
    Extension(task_attempt): Extension<TaskAttempt>,
    State(app_state): State<AppState>,
) -> Result<ResponseJson<ApiResponse<()>>, StatusCode> {
    match TaskAttempt::merge_changes(&app_state.db_pool, task_attempt.id, task.id, project.id).await
    {
        Ok(_) => {
            // Update task status to Done
            if let Err(e) = Task::update_status(
                &app_state.db_pool,
                task.id,
                project.id,
                crate::models::task::TaskStatus::Done,
            )
            .await
            {
                tracing::error!("Failed to update task status to Done after merge: {}", e);
                return Err(StatusCode::INTERNAL_SERVER_ERROR);
            }

            // Track task attempt merged event
            app_state
                .track_analytics_event(
                    "task_attempt_merged",
                    Some(serde_json::json!({
                        "task_id": task.id.to_string(),
                        "project_id": project.id.to_string(),
                        "attempt_id": task_attempt.id.to_string(),
                    })),
                )
                .await;

            Ok(ResponseJson(ApiResponse::success(())))
        }
        Err(e) => {
            tracing::error!("Failed to merge task attempt {}: {}", task_attempt.id, e);
            Ok(ResponseJson(ApiResponse::error(&format!(
                "Failed to merge: {}",
                e
            ))))
        }
    }
}

pub async fn create_github_pr(
    Extension(project): Extension<Project>,
    Extension(task): Extension<Task>,
    Extension(task_attempt): Extension<TaskAttempt>,
    State(app_state): State<AppState>,
    Json(request): Json<CreateGitHubPRRequest>,
) -> Result<ResponseJson<ApiResponse<String>>, StatusCode> {
    // Load the user's GitHub configuration
    let config = match Config::load(&crate::utils::config_path()) {
        Ok(config) => config,
        Err(e) => {
            tracing::error!("Failed to load config: {}", e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    let github_token = match config.github.token {
        Some(token) => token,
        None => {
            return Ok(ResponseJson(ApiResponse::error(
                "GitHub authentication not configured. Please sign in with GitHub.",
            )));
        }
    };

    // Get the task attempt to access the stored base branch
    let attempt = &task_attempt;

    let base_branch = request.base_branch.unwrap_or_else(|| {
        // Use the stored base branch from the task attempt as the default
        // Fall back to config default or "main" only if stored base branch is somehow invalid
        if !attempt.base_branch.trim().is_empty() {
            attempt.base_branch.clone()
        } else {
            config
                .github
                .default_pr_base
                .unwrap_or_else(|| "main".to_string())
        }
    });

    match TaskAttempt::create_github_pr(
        &app_state.db_pool,
        CreatePrParams {
            attempt_id: task_attempt.id,
            task_id: task.id,
            project_id: project.id,
            github_token: &config.github.pat.unwrap_or(github_token),
            title: &request.title,
            body: request.body.as_deref(),
            base_branch: Some(&base_branch),
        },
    )
    .await
    {
        Ok(pr_url) => {
            app_state
                .track_analytics_event(
                    "github_pr_created",
                    Some(serde_json::json!({
                        "task_id": task.id.to_string(),
                        "project_id": project.id.to_string(),
                        "attempt_id": task_attempt.id.to_string(),
                    })),
                )
                .await;

            Ok(ResponseJson(ApiResponse::success(pr_url)))
        }
        Err(e) => {
            tracing::error!(
                "Failed to create GitHub PR for attempt {}: {}",
                task_attempt.id,
                e
            );
            let message = match &e {
                crate::models::task_attempt::TaskAttemptError::GitHubService(
                    crate::services::GitHubServiceError::TokenInvalid,
                ) => Some("github_token_invalid".to_string()),
                crate::models::task_attempt::TaskAttemptError::GitService(
                    crate::services::git_service::GitServiceError::Git(err),
                ) if err
                    .message()
                    .contains("too many redirects or authentication replays") =>
                {
                    Some("insufficient_github_permissions".to_string()) // PAT is invalid
                }
                crate::models::task_attempt::TaskAttemptError::GitService(
                    crate::services::git_service::GitServiceError::Git(err),
                ) if err.message().contains("status code: 403") => {
                    Some("insufficient_github_permissions".to_string())
                }
                crate::models::task_attempt::TaskAttemptError::GitService(
                    crate::services::git_service::GitServiceError::Git(err),
                ) if err.message().contains("status code: 404") => {
                    Some("github_repo_not_found_or_no_access".to_string())
                }
                _ => Some(format!("Failed to create PR: {}", e)),
            };
            Ok(ResponseJson(ApiResponse::error(
                message.as_deref().unwrap_or("Unknown error"),
            )))
        }
    }
}

#[derive(serde::Deserialize)]
pub struct OpenEditorRequest {
    editor_type: Option<String>,
}

pub async fn open_task_attempt_in_editor(
    Extension(_project): Extension<Project>,
    Extension(_task): Extension<Task>,
    Extension(task_attempt): Extension<TaskAttempt>,
    State(app_state): State<AppState>,
    Json(payload): Json<Option<OpenEditorRequest>>,
) -> Result<ResponseJson<ApiResponse<()>>, StatusCode> {
    // Get the task attempt to access the worktree path
    let attempt = &task_attempt;

    // Get editor command from config or override
    let editor_command = {
        let config_guard = app_state.get_config().read().await;
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
                task_attempt.id,
                attempt.worktree_path
            );
            Ok(ResponseJson(ApiResponse::success(())))
        }
        Err(e) => {
            tracing::error!(
                "Failed to open editor ({}) for attempt {}: {}",
                editor_command.join(" "),
                task_attempt.id,
                e
            );
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn get_task_attempt_branch_status(
    Extension(project): Extension<Project>,
    Extension(task): Extension<Task>,
    Extension(task_attempt): Extension<TaskAttempt>,
    State(app_state): State<AppState>,
) -> Result<ResponseJson<ApiResponse<BranchStatus>>, StatusCode> {
    match TaskAttempt::get_branch_status(&app_state.db_pool, task_attempt.id, task.id, project.id)
        .await
    {
        Ok(status) => Ok(ResponseJson(ApiResponse::success(status))),
        Err(e) => {
            tracing::error!(
                "Failed to get branch status for task attempt {}: {}",
                task_attempt.id,
                e
            );
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

#[axum::debug_handler]
pub async fn rebase_task_attempt(
    Extension(project): Extension<Project>,
    Extension(task): Extension<Task>,
    Extension(task_attempt): Extension<TaskAttempt>,
    State(app_state): State<AppState>,
    request_body: Option<Json<RebaseTaskAttemptRequest>>,
) -> Result<ResponseJson<ApiResponse<()>>, StatusCode> {
    // Extract new base branch from request body if provided
    let new_base_branch = request_body.and_then(|body| body.new_base_branch.clone());

    match TaskAttempt::rebase_attempt(
        &app_state.db_pool,
        task_attempt.id,
        task.id,
        project.id,
        new_base_branch,
    )
    .await
    {
        Ok(_new_base_commit) => Ok(ResponseJson(ApiResponse::success(()))),
        Err(e) => {
            tracing::error!("Failed to rebase task attempt {}: {}", task_attempt.id, e);
            Ok(ResponseJson(ApiResponse::error(&e.to_string())))
        }
    }
}

pub async fn get_task_attempt_execution_processes(
    Extension(_project): Extension<Project>,
    Extension(_task): Extension<Task>,
    Extension(task_attempt): Extension<TaskAttempt>,
    State(app_state): State<AppState>,
) -> Result<ResponseJson<ApiResponse<Vec<ExecutionProcessSummary>>>, StatusCode> {
    match ExecutionProcess::find_summaries_by_task_attempt_id(&app_state.db_pool, task_attempt.id)
        .await
    {
        Ok(processes) => Ok(ResponseJson(ApiResponse::success(processes))),
        Err(e) => {
            tracing::error!(
                "Failed to fetch execution processes for attempt {}: {}",
                task_attempt.id,
                e
            );
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn get_execution_process(
    Extension(execution_process): Extension<ExecutionProcess>,
) -> Result<ResponseJson<ApiResponse<ExecutionProcess>>, StatusCode> {
    Ok(ResponseJson(ApiResponse::success(execution_process)))
}

#[axum::debug_handler]
pub async fn stop_all_execution_processes(
    Extension(_project): Extension<Project>,
    Extension(_task): Extension<Task>,
    Extension(task_attempt): Extension<TaskAttempt>,
    State(app_state): State<AppState>,
) -> Result<ResponseJson<ApiResponse<()>>, StatusCode> {
    // Get all execution processes for the task attempt
    let processes = match ExecutionProcess::find_by_task_attempt_id(
        &app_state.db_pool,
        task_attempt.id,
    )
    .await
    {
        Ok(processes) => processes,
        Err(e) => {
            tracing::error!(
                "Failed to fetch execution processes for attempt {}: {}",
                task_attempt.id,
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
                    &app_state.db_pool,
                    process.id,
                    crate::models::execution_process::ExecutionProcessStatus::Killed,
                    None,
                )
                .await
                {
                    tracing::error!("Failed to update execution process status: {}", e);
                    errors.push(format!("Failed to update process {} status", process.id));
                } else {
                    // Process stopped successfully
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
        return Ok(ResponseJson(ApiResponse::error(&format!(
            "Stopped {} processes, but encountered errors: {}",
            stopped_count,
            errors.join(", ")
        ))));
    }

    if stopped_count == 0 {
        return Ok(ResponseJson(ApiResponse::success(())));
    }

    Ok(ResponseJson(ApiResponse::success(())))
}

#[axum::debug_handler]
pub async fn stop_execution_process(
    Extension(_project): Extension<Project>,
    Extension(_task): Extension<Task>,
    Extension(_task_attempt): Extension<TaskAttempt>,
    Extension(execution_process): Extension<ExecutionProcess>,
    State(app_state): State<AppState>,
) -> Result<ResponseJson<ApiResponse<()>>, StatusCode> {
    // Stop the specific execution process
    let stopped = match app_state
        .stop_running_execution_by_id(execution_process.id)
        .await
    {
        Ok(stopped) => stopped,
        Err(e) => {
            tracing::error!(
                "Failed to stop execution process {}: {}",
                execution_process.id,
                e
            );
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    if !stopped {
        return Ok(ResponseJson(ApiResponse::success(())));
    }

    // Update the execution process status in the database
    if let Err(e) = ExecutionProcess::update_completion(
        &app_state.db_pool,
        execution_process.id,
        crate::models::execution_process::ExecutionProcessStatus::Killed,
        None,
    )
    .await
    {
        tracing::error!("Failed to update execution process status: {}", e);
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }

    // Process stopped successfully

    Ok(ResponseJson(ApiResponse::success(())))
}

#[derive(serde::Deserialize)]
pub struct DeleteFileQuery {
    file_path: String,
}

#[axum::debug_handler]
pub async fn delete_task_attempt_file(
    Extension(project): Extension<Project>,
    Extension(task): Extension<Task>,
    Extension(task_attempt): Extension<TaskAttempt>,
    Query(query): Query<DeleteFileQuery>,
    State(app_state): State<AppState>,
) -> Result<ResponseJson<ApiResponse<()>>, StatusCode> {
    match TaskAttempt::delete_file(
        &app_state.db_pool,
        task_attempt.id,
        task.id,
        project.id,
        &query.file_path,
    )
    .await
    {
        Ok(_commit_id) => Ok(ResponseJson(ApiResponse::success(()))),
        Err(e) => {
            tracing::error!(
                "Failed to delete file '{}' from task attempt {}: {}",
                query.file_path,
                task_attempt.id,
                e
            );
            Ok(ResponseJson(ApiResponse::error(&e.to_string())))
        }
    }
}

pub async fn create_followup_attempt(
    Extension(project): Extension<Project>,
    Extension(task): Extension<Task>,
    Extension(task_attempt): Extension<TaskAttempt>,
    State(app_state): State<AppState>,
    Json(payload): Json<CreateFollowUpAttempt>,
) -> Result<ResponseJson<ApiResponse<FollowUpResponse>>, StatusCode> {
    // Start follow-up execution synchronously to catch errors
    match TaskAttempt::start_followup_execution(
        &app_state.db_pool,
        &app_state,
        task_attempt.id,
        task.id,
        project.id,
        &payload.prompt,
    )
    .await
    {
        Ok(actual_attempt_id) => {
            let created_new_attempt = actual_attempt_id != task_attempt.id;
            let message = if created_new_attempt {
                format!(
                    "Follow-up execution started on new attempt {} (original worktree was deleted)",
                    actual_attempt_id
                )
            } else {
                "Follow-up execution started successfully".to_string()
            };

            Ok(ResponseJson(ApiResponse::success(FollowUpResponse {
                message: message.clone(),
                actual_attempt_id,
                created_new_attempt,
            })))
        }
        Err(e) => {
            tracing::error!(
                "Failed to start follow-up execution for task attempt {}: {}",
                task_attempt.id,
                e
            );
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn start_dev_server(
    Extension(project): Extension<Project>,
    Extension(task): Extension<Task>,
    Extension(task_attempt): Extension<TaskAttempt>,
    State(app_state): State<AppState>,
) -> Result<ResponseJson<ApiResponse<()>>, StatusCode> {
    // Stop any existing dev servers for this project
    let existing_dev_servers =
        match ExecutionProcess::find_running_dev_servers_by_project(&app_state.db_pool, project.id)
            .await
        {
            Ok(servers) => servers,
            Err(e) => {
                tracing::error!(
                    "Failed to find running dev servers for project {}: {}",
                    project.id,
                    e
                );
                return Err(StatusCode::INTERNAL_SERVER_ERROR);
            }
        };

    for dev_server in existing_dev_servers {
        tracing::info!(
            "Stopping existing dev server {} for project {}",
            dev_server.id,
            project.id
        );

        // Stop the running process
        if let Err(e) = app_state.stop_running_execution_by_id(dev_server.id).await {
            tracing::error!("Failed to stop dev server {}: {}", dev_server.id, e);
        } else {
            // Update the execution process status in the database
            if let Err(e) = ExecutionProcess::update_completion(
                &app_state.db_pool,
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
    match TaskAttempt::start_dev_server(
        &app_state.db_pool,
        &app_state,
        task_attempt.id,
        task.id,
        project.id,
    )
    .await
    {
        Ok(_) => Ok(ResponseJson(ApiResponse::success(()))),
        Err(e) => {
            tracing::error!(
                "Failed to start dev server for task attempt {}: {}",
                task_attempt.id,
                e
            );
            Ok(ResponseJson(ApiResponse::error(&e.to_string())))
        }
    }
}

pub async fn get_task_attempt_execution_state(
    Extension(project): Extension<Project>,
    Extension(task): Extension<Task>,
    Extension(task_attempt): Extension<TaskAttempt>,
    State(app_state): State<AppState>,
) -> Result<ResponseJson<ApiResponse<TaskAttemptState>>, StatusCode> {
    // Get the execution state
    match TaskAttempt::get_execution_state(&app_state.db_pool, task_attempt.id, task.id, project.id)
        .await
    {
        Ok(state) => Ok(ResponseJson(ApiResponse::success(state))),
        Err(e) => {
            tracing::error!(
                "Failed to get execution state for task attempt {}: {}",
                task_attempt.id,
                e
            );
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

/// Find plan content with context by searching through multiple processes in the same attempt
async fn find_plan_content_with_context(
    pool: &SqlitePool,
    attempt_id: Uuid,
) -> Result<String, StatusCode> {
    // Get all execution processes for this attempt
    let execution_processes =
        match ExecutionProcess::find_by_task_attempt_id(pool, attempt_id).await {
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

    // Look for claudeplan processes (most recent first)
    for claudeplan_process in execution_processes
        .iter()
        .rev()
        .filter(|p| p.executor_type.as_deref() == Some("claude-plan"))
    {
        if let Some(stdout) = &claudeplan_process.stdout {
            if !stdout.trim().is_empty() {
                // Create executor and normalize logs
                let executor_config = ExecutorConfig::ClaudePlan;
                let executor = executor_config.create_executor();

                // Use working directory for normalization
                let working_dir_path =
                    match std::fs::canonicalize(&claudeplan_process.working_directory) {
                        Ok(canonical_path) => canonical_path.to_string_lossy().to_string(),
                        Err(_) => claudeplan_process.working_directory.clone(),
                    };

                // Normalize logs and extract plan content
                match executor.normalize_logs(stdout, &working_dir_path) {
                    Ok(normalized_conversation) => {
                        // Search for plan content in the normalized conversation
                        if let Some(plan_content) = normalized_conversation
                            .entries
                            .iter()
                            .rev()
                            .find_map(|entry| {
                                if let NormalizedEntryType::ToolUse {
                                    action_type: ActionType::PlanPresentation { plan },
                                    ..
                                } = &entry.entry_type
                                {
                                    Some(plan.clone())
                                } else {
                                    None
                                }
                            })
                        {
                            return Ok(plan_content);
                        }
                    }
                    Err(_) => {
                        continue;
                    }
                }
            }
        }
    }

    tracing::error!(
        "No claudeplan content found in any process in attempt {}",
        attempt_id
    );
    Err(StatusCode::NOT_FOUND)
}

pub async fn approve_plan(
    Extension(project): Extension<Project>,
    Extension(task): Extension<Task>,
    Extension(task_attempt): Extension<TaskAttempt>,
    State(app_state): State<AppState>,
) -> Result<ResponseJson<ApiResponse<FollowUpResponse>>, StatusCode> {
    let current_task = &task;

    // Find plan content with context across the task hierarchy
    let plan_content = find_plan_content_with_context(&app_state.db_pool, task_attempt.id).await?;

    use crate::models::task::CreateTask;
    let new_task_id = Uuid::new_v4();
    let create_task_data = CreateTask {
        project_id: project.id,
        title: format!("Execute Plan: {}", current_task.title),
        description: Some(plan_content),
        parent_task_attempt: Some(task_attempt.id),
    };

    let new_task = match Task::create(&app_state.db_pool, &create_task_data, new_task_id).await {
        Ok(task) => task,
        Err(e) => {
            tracing::error!("Failed to create new task: {}", e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    // Mark original task as completed since it now has children
    if let Err(e) =
        Task::update_status(&app_state.db_pool, task.id, project.id, TaskStatus::Done).await
    {
        tracing::error!("Failed to update original task status to Done: {}", e);
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    } else {
        tracing::info!(
            "Original task {} marked as Done after plan approval (has children)",
            task.id
        );
    }

    Ok(ResponseJson(ApiResponse::success(FollowUpResponse {
        message: format!("Plan approved and new task created: {}", new_task.title),
        actual_attempt_id: new_task_id, // Return the new task ID
        created_new_attempt: true,
    })))
}

pub async fn get_task_attempt_details(
    Extension(task_attempt): Extension<TaskAttempt>,
) -> Result<ResponseJson<ApiResponse<TaskAttempt>>, StatusCode> {
    Ok(ResponseJson(ApiResponse::success(task_attempt)))
}

pub async fn get_task_attempt_children(
    Extension(task_attempt): Extension<TaskAttempt>,
    Extension(project): Extension<Project>,
    State(app_state): State<AppState>,
) -> Result<ResponseJson<ApiResponse<Vec<Task>>>, StatusCode> {
    match Task::find_related_tasks_by_attempt_id(&app_state.db_pool, task_attempt.id, project.id)
        .await
    {
        Ok(related_tasks) => Ok(ResponseJson(ApiResponse::success(related_tasks))),
        Err(e) => {
            tracing::error!(
                "Failed to fetch children for task attempt {}: {}",
                task_attempt.id,
                e
            );
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub fn task_attempts_list_router(_state: AppState) -> Router<AppState> {
    Router::new().route(
        "/projects/:project_id/tasks/:task_id/attempts",
        get(get_task_attempts).post(create_task_attempt),
    )
}

pub fn task_attempts_with_id_router(_state: AppState) -> Router<AppState> {
    use axum::routing::post;

    Router::new()
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
            "/projects/:project_id/tasks/:task_id/attempts/:attempt_id/create-pr",
            post(create_github_pr),
        )
        .route(
            "/projects/:project_id/tasks/:task_id/attempts/:attempt_id/execution-processes",
            get(get_task_attempt_execution_processes),
        )
        .route(
            "/projects/:project_id/tasks/:task_id/attempts/:attempt_id/stop",
            post(stop_all_execution_processes),
        )
        .merge(
            Router::new()
                .route(
                    "/projects/:project_id/tasks/:task_id/attempts/:attempt_id/execution-processes/:process_id/stop",
                    post(stop_execution_process),
                )
                .route_layer(from_fn_with_state(_state.clone(), load_execution_process_with_context_middleware))
        )
        .route(
            "/projects/:project_id/tasks/:task_id/attempts/:attempt_id/logs",
            get(get_task_attempt_all_logs),
        )
        .route(
            "/projects/:project_id/tasks/:task_id/attempts/:attempt_id/follow-up",
            post(create_followup_attempt),
        )
        .route(
            "/projects/:project_id/tasks/:task_id/attempts/:attempt_id/start-dev-server",
            post(start_dev_server),
        )
        .route(
            "/projects/:project_id/tasks/:task_id/attempts/:attempt_id",
            get(get_task_attempt_execution_state),
        )
        .route(
            "/projects/:project_id/tasks/:task_id/attempts/:attempt_id/approve-plan",
            post(approve_plan),
        )
        .route(
            "/projects/:project_id/tasks/:task_id/attempts/:attempt_id/children",
            get(get_task_attempt_children),
        )
        .merge(
            Router::new()
                .route(
                    "/attempts/:attempt_id/details",
                    get(get_task_attempt_details),
                )
                .route_layer(from_fn_with_state(_state.clone(), load_task_attempt_middleware))
        )
}
