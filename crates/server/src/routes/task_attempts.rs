use axum::{
    extract::{Query, State},
    http::StatusCode,
    middleware::from_fn_with_state,
    response::{
        sse::{Event, KeepAlive},
        Json as ResponseJson, Sse,
    },
    routing::{get, post},
    BoxError, Extension, Json, Router,
};
use db::models::{
    execution_process::{ExecutionProcess, ExecutionProcessRunReason},
    executor_session::ExecutorSession,
    task::{Task, TaskStatus},
    task_attempt::{CreateTaskAttempt, TaskAttempt, TaskAttemptError},
};
use deployment::Deployment;
use executors::actions::{
    coding_agent_follow_up::CodingAgentFollowUpRequest,
    script::{ScriptContext, ScriptRequest, ScriptRequestLanguage},
    ExecutorAction, ExecutorActionKind, ExecutorActionType,
};
use futures_util::TryStreamExt;
use serde::{Deserialize, Serialize};
use services::services::{
    container::ContainerService,
    git::{BranchStatus, GitService},
    github_service::{CreatePrRequest, GitHubRepoInfo, GitHubService, GitHubServiceError},
};
use sqlx::Error as SqlxError;
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{error::ApiError, middleware::load_task_attempt_middleware, DeploymentImpl};

#[derive(Debug, Deserialize, Serialize, TS)]
pub struct RebaseTaskAttemptRequest {
    pub new_base_branch: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, TS)]
pub struct CreateGitHubPrRequest {
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
// #[derive(Debug, Serialize, TS)]
// // pub struct ProcessLogsResponse {
//     pub id: Uuid,
//     pub process_type: ExecutionProcessType,
//     pub command: String,
//     pub executor_type: Option<String>,
//     pub status: ExecutionProcessStatus,
//     pub normalized_conversation: NormalizedConversation,
// }

// // Helper to normalize logs for a process (extracted from get_execution_process_normalized_logs)
// async fn normalize_process_logs(
//     db_pool: &SqlitePool,
//     process: &ExecutionProcess,
// ) -> NormalizedConversation {
//     use crate::models::{
//         execution_process::ExecutionProcessType, executor_session::ExecutorSession,
//     };
//     let executor_session = ExecutorSession::find_by_execution_process_id(db_pool, process.id)
//         .await
//         .ok()
//         .flatten();

//     let has_stdout = process
//         .stdout
//         .as_ref()
//         .map(|s| !s.trim().is_empty())
//         .unwrap_or(false);
//     let has_stderr = process
//         .stderr
//         .as_ref()
//         .map(|s| !s.trim().is_empty())
//         .unwrap_or(false);

//     if !has_stdout && !has_stderr {
//         return NormalizedConversation {
//             entries: vec![],
//             session_id: None,
//             executor_type: process
//                 .executor_type
//                 .clone()
//                 .unwrap_or("unknown".to_string()),
//             prompt: executor_session.as_ref().and_then(|s| s.prompt.clone()),
//             summary: executor_session.as_ref().and_then(|s| s.summary.clone()),
//         };
//     }

//     // Parse stdout as JSONL using executor normalization
//     let mut stdout_entries = Vec::new();
//     if let Some(stdout) = &process.stdout {
//         if !stdout.trim().is_empty() {
//             let executor_type = process.executor_type.as_deref().unwrap_or("unknown");
//             let executor_config = if process.process_type == ExecutionProcessType::SetupScript {
//                 ExecutorConfig::SetupScript {
//                     script: executor_session
//                         .as_ref()
//                         .and_then(|s| s.prompt.clone())
//                         .unwrap_or_else(|| "setup script".to_string()),
//                 }
//             } else {
//                 match executor_type.to_string().parse() {
//                     Ok(config) => config,
//                     Err(_) => {
//                         return NormalizedConversation {
//                             entries: vec![],
//                             session_id: None,
//                             executor_type: executor_type.to_string(),
//                             prompt: executor_session.as_ref().and_then(|s| s.prompt.clone()),
//                             summary: executor_session.as_ref().and_then(|s| s.summary.clone()),
//                         };
//                     }
//                 }
//             };
//             let executor = executor_config.create_executor();
//             let working_dir_path = match std::fs::canonicalize(&process.working_directory) {
//                 Ok(canonical_path) => canonical_path.to_string_lossy().to_string(),
//                 Err(_) => process.working_directory.clone(),
//             };
//             if let Ok(normalized) = executor.normalize_logs(stdout, &working_dir_path) {
//                 stdout_entries = normalized.entries;
//             }
//         }
//     }
//     // Parse stderr chunks separated by boundary markers
//     let mut stderr_entries = Vec::new();
//     if let Some(stderr) = &process.stderr {
//         let trimmed = stderr.trim();
//         if !trimmed.is_empty() {
//             let chunks: Vec<&str> = trimmed.split("---STDERR_CHUNK_BOUNDARY---").collect();
//             for chunk in chunks {
//                 let chunk_trimmed = chunk.trim();
//                 if !chunk_trimmed.is_empty() {
//                     let filtered_content = chunk_trimmed.replace("---STDERR_CHUNK_BOUNDARY---", "");
//                     if !filtered_content.trim().is_empty() {
//                         stderr_entries.push(NormalizedEntry {
//                             timestamp: Some(chrono::Utc::now().to_rfc3339()),
//                             entry_type: NormalizedEntryType::ErrorMessage,
//                             content: filtered_content.trim().to_string(),
//                             metadata: None,
//                         });
//                     }
//                 }
//             }
//         }
//     }
//     let mut all_entries = Vec::new();
//     all_entries.extend(stdout_entries);
//     all_entries.extend(stderr_entries);
//     all_entries.sort_by(|a, b| match (&a.timestamp, &b.timestamp) {
//         (Some(a_ts), Some(b_ts)) => a_ts.cmp(b_ts),
//         (Some(_), None) => std::cmp::Ordering::Less,
//         (None, Some(_)) => std::cmp::Ordering::Greater,
//         (None, None) => std::cmp::Ordering::Equal,
//     });
//     let executor_type = if process.process_type == ExecutionProcessType::SetupScript {
//         "setup-script".to_string()
//     } else {
//         process
//             .executor_type
//             .clone()
//             .unwrap_or("unknown".to_string())
//     };
//     NormalizedConversation {
//         entries: all_entries,
//         session_id: None,
//         executor_type,
//         prompt: executor_session.as_ref().and_then(|s| s.prompt.clone()),
//         summary: executor_session.as_ref().and_then(|s| s.summary.clone()),
//     }
// }

// /// Get all normalized logs for all execution processes of a task attempt
// pub async fn get_task_attempt_all_logs(
//     Extension(_project): Extension<Project>,
//     Extension(_task): Extension<Task>,
//     Extension(task_attempt): Extension<TaskAttempt>,
//     State(app_state): State<AppState>,
// ) -> Result<Json<ApiResponse<Vec<ProcessLogsResponse>>>, StatusCode> {
//     // Fetch all execution processes for this attempt
//     let processes = match ExecutionProcess::find_by_task_attempt_id(
//         &app_state.db_pool,
//         task_attempt.id,
//     )
//     .await
//     {
//         Ok(list) => list,
//         Err(_) => return Err(StatusCode::INTERNAL_SERVER_ERROR),
//     };
//     // For each process, normalize logs
//     let mut result = Vec::new();
//     for process in processes {
//         let normalized_conversation = normalize_process_logs(&app_state.db_pool, &process).await;
//         result.push(ProcessLogsResponse {
//             id: process.id,
//             process_type: process.process_type.clone(),
//             command: process.command.clone(),
//             executor_type: process.executor_type.clone(),
//             status: process.status.clone(),
//             normalized_conversation,
//         });
//     }
//     Ok(Json(ApiResponse::success(result)))
// }

#[derive(Debug, Deserialize)]
pub struct TaskAttemptQuery {
    pub task_id: Option<Uuid>,
}

pub async fn get_task_attempts(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<TaskAttemptQuery>,
) -> Result<ResponseJson<ApiResponse<Vec<TaskAttempt>>>, ApiError> {
    let pool = &deployment.db().pool;
    let attempts = TaskAttempt::fetch_all(pool, query.task_id).await?;
    Ok(ResponseJson(ApiResponse::success(attempts)))
}

pub async fn get_task_attempt(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(_deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<TaskAttempt>>, ApiError> {
    Ok(ResponseJson(ApiResponse::success(task_attempt)))
}

#[derive(Debug, Deserialize, ts_rs::TS)]
pub struct CreateTaskAttemptBody {
    pub task_id: Uuid,
    pub profile: Option<String>,
    pub base_branch: String,
}

#[axum::debug_handler]
pub async fn create_task_attempt(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateTaskAttemptBody>,
) -> Result<ResponseJson<ApiResponse<TaskAttempt>>, ApiError> {
    let profile_label = payload
        .profile
        .unwrap_or(deployment.config().read().await.profile.to_string());

    let profile = executors::command::AgentProfiles::get_cached()
        .get_profile(&profile_label)
        .ok_or_else(|| {
            ApiError::TaskAttempt(TaskAttemptError::ValidationError(format!(
                "Profile not found: {}",
                profile_label
            )))
        })?;

    let task_attempt = TaskAttempt::create(
        &deployment.db().pool,
        &CreateTaskAttempt {
            base_coding_agent: profile.agent.to_string(),
            base_branch: payload.base_branch,
        },
        payload.task_id,
    )
    .await?;

    let execution_process = deployment
        .container()
        .start_attempt(&task_attempt, profile_label.clone())
        .await?;

    deployment
        .track_if_analytics_allowed(
            "task_attempt_started",
            serde_json::json!({
                "task_id": task_attempt.task_id.to_string(),
                "profile": &profile_label,
                "base_coding_agent": profile.agent.to_string(),
                "attempt_id": task_attempt.id.to_string(),
            }),
        )
        .await;

    tracing::info!("Started execution process {}", execution_process.id);

    Ok(ResponseJson(ApiResponse::success(task_attempt)))
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateFollowUpAttempt {
    pub prompt: String,
}

pub async fn follow_up(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateFollowUpAttempt>,
) -> Result<ResponseJson<ApiResponse<ExecutionProcess>>, ApiError> {
    tracing::info!("{:?}", task_attempt);

    // First, get the most recent execution process with executor action type = StandardCoding
    let initial_execution_process = ExecutionProcess::find_latest_by_task_attempt_and_action_type(
        &deployment.db().pool,
        task_attempt.id,
        &ExecutorActionKind::CodingAgentInitialRequest,
    )
    .await?
    .ok_or(ApiError::TaskAttempt(TaskAttemptError::ValidationError(
        "Couldn't find initial coding agent process, has it run yet?".to_string(),
    )))?;

    // Get session_id
    let session_id = ExecutorSession::find_by_execution_process_id(
        &deployment.db().pool,
        initial_execution_process.id,
    )
    .await?
    .ok_or(ApiError::TaskAttempt(TaskAttemptError::ValidationError(
        "Couldn't find related executor session for this execution process".to_string(),
    )))?
    .session_id
    .ok_or(ApiError::TaskAttempt(TaskAttemptError::ValidationError(
        "This executor session doesn't have a session_id".to_string(),
    )))?;

    let profile = match &initial_execution_process
        .executor_action()
        .map_err(|e| ApiError::TaskAttempt(TaskAttemptError::ValidationError(e.to_string())))?
        .typ
    {
        ExecutorActionType::CodingAgentInitialRequest(request) => Ok(request.profile.clone()),
        _ => Err(ApiError::TaskAttempt(TaskAttemptError::ValidationError(
            "Couldn't find profile from initial request".to_string(),
        ))),
    }?;

    // Get parent task
    let task = task_attempt
        .parent_task(&deployment.db().pool)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    // Get parent project
    let project = task
        .parent_project(&deployment.db().pool)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    let cleanup_action = project.cleanup_script.map(|script| {
        Box::new(ExecutorAction::new(
            ExecutorActionType::ScriptRequest(ScriptRequest {
                script,
                language: ScriptRequestLanguage::Bash,
                context: ScriptContext::CleanupScript,
            }),
            None,
        ))
    });

    let follow_up_action = ExecutorAction::new(
        ExecutorActionType::CodingAgentFollowUpRequest(CodingAgentFollowUpRequest {
            prompt: payload.prompt,
            session_id,
            profile,
        }),
        cleanup_action,
    );

    let execution_process = deployment
        .container()
        .start_execution(
            &task_attempt,
            &follow_up_action,
            &ExecutionProcessRunReason::CodingAgent,
        )
        .await?;

    Ok(ResponseJson(ApiResponse::success(execution_process)))
}

pub async fn get_task_attempt_diff(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
    // ) -> Result<ResponseJson<ApiResponse<WorktreeDiff>>, ApiError> {
) -> Result<Sse<impl futures_util::Stream<Item = Result<Event, BoxError>>>, axum::http::StatusCode>
{
    let stream = deployment
        .container()
        .get_diff(&task_attempt)
        .await
        .map_err(|_e| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Sse::new(stream.map_err(|e| -> BoxError { e.into() })).keep_alive(KeepAlive::default()))
}

#[axum::debug_handler]
pub async fn merge_task_attempt(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let pool = &deployment.db().pool;

    let task = task_attempt
        .parent_task(pool)
        .await?
        .ok_or(ApiError::TaskAttempt(TaskAttemptError::TaskNotFound))?;
    let ctx = TaskAttempt::load_context(pool, task_attempt.id, task.id, task.project_id).await?;

    let container_ref = deployment
        .container()
        .ensure_container_exists(&task_attempt)
        .await?;
    let worktree_path = std::path::Path::new(&container_ref);

    let task_uuid_str = task.id.to_string();
    let first_uuid_section = task_uuid_str.split('-').next().unwrap_or(&task_uuid_str);

    // Create commit message with task title and description
    let mut commit_message = format!("{} (vibe-kanban {})", ctx.task.title, first_uuid_section);

    // Add description on next line if it exists
    if let Some(description) = &ctx.task.description {
        if !description.trim().is_empty() {
            commit_message.push_str("\n\n");
            commit_message.push_str(description);
        }
    }

    // Get branch name from task attempt
    let branch_name = ctx.task_attempt.branch.as_ref().ok_or_else(|| {
        ApiError::TaskAttempt(TaskAttemptError::ValidationError(
            "No branch found for task attempt".to_string(),
        ))
    })?;

    let merge_commit_id = GitService::new().merge_changes(
        &ctx.project.git_repo_path,
        worktree_path,
        branch_name,
        &ctx.task_attempt.base_branch,
        &commit_message,
    )?;

    TaskAttempt::update_merge_commit(pool, task_attempt.id, &merge_commit_id).await?;
    Task::update_status(pool, ctx.task.id, TaskStatus::Done).await?;

    deployment
        .track_if_analytics_allowed(
            "task_attempt_merged",
            serde_json::json!({
                "task_id": ctx.task.id.to_string(),
                "project_id": ctx.project.id.to_string(),
                "attempt_id": task_attempt.id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(())))
}

pub async fn create_github_pr(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<CreateGitHubPrRequest>,
) -> Result<ResponseJson<ApiResponse<String, GitHubServiceError>>, ApiError> {
    let github_config = deployment.config().read().await.github.clone();
    let Some(github_token) = github_config.token() else {
        return Ok(ResponseJson(ApiResponse::error_with_data(
            GitHubServiceError::TokenInvalid,
        )));
    };
    // Create GitHub service instance
    let github_service = GitHubService::new(&github_token)?;
    if let Err(e) = github_service.check_token().await {
        if e.is_api_data() {
            return Ok(ResponseJson(ApiResponse::error_with_data(e)));
        } else {
            return Err(ApiError::GitHubService(e));
        }
    }
    // Get the task attempt to access the stored base branch
    let base_branch = request.base_branch.unwrap_or_else(|| {
        // Use the stored base branch from the task attempt as the default
        // Fall back to config default or "main" only if stored base branch is somehow invalid
        if !task_attempt.base_branch.trim().is_empty() {
            task_attempt.base_branch.clone()
        } else {
            github_config
                .default_pr_base
                .as_ref()
                .map_or_else(|| "main".to_string(), |b| b.to_string())
        }
    });

    let pool = &deployment.db().pool;
    let task = task_attempt
        .parent_task(pool)
        .await?
        .ok_or(ApiError::TaskAttempt(TaskAttemptError::TaskNotFound))?;
    let ctx = TaskAttempt::load_context(pool, task_attempt.id, task.id, task.project_id).await?;

    // Ensure worktree exists (recreate if needed for cold task support)
    let container_ref = deployment
        .container()
        .ensure_container_exists(&task_attempt)
        .await?;
    let worktree_path = std::path::Path::new(&container_ref);

    // Use GitService to get the remote URL, then create GitHubRepoInfo
    let (owner, repo_name) = GitService::new().get_github_repo_info(&ctx.project.git_repo_path)?;
    let repo_info = GitHubRepoInfo { owner, repo_name };

    // Get branch name from task attempt
    let branch_name = ctx.task_attempt.branch.as_ref().ok_or_else(|| {
        ApiError::TaskAttempt(TaskAttemptError::ValidationError(
            "No branch found for task attempt".to_string(),
        ))
    })?;

    // Push the branch to GitHub first
    if let Err(e) = GitService::new().push_to_github(worktree_path, branch_name, &github_token) {
        tracing::error!("Failed to push branch to GitHub: {}", e);
        let gh_e = GitHubServiceError::from(e);
        if gh_e.is_api_data() {
            return Ok(ResponseJson(ApiResponse::error_with_data(gh_e)));
        } else {
            return Ok(ResponseJson(ApiResponse::error(
                "Failed to push branch to GitHub",
            )));
        }
    }
    // Create the PR using GitHub service
    let pr_request = CreatePrRequest {
        title: request.title.clone(),
        body: request.body.clone(),
        head_branch: branch_name.clone(),
        base_branch: base_branch.clone(),
    };

    match github_service.create_pr(&repo_info, &pr_request).await {
        Ok(pr_info) => {
            // Update the task attempt with PR information
            if let Err(e) = TaskAttempt::update_pr_status(
                pool,
                task_attempt.id,
                pr_info.url.clone(),
                pr_info.number,
                pr_info.status.clone(),
            )
            .await
            {
                tracing::error!("Failed to update task attempt PR status: {}", e);
            }

            deployment
                .track_if_analytics_allowed(
                    "github_pr_created",
                    serde_json::json!({
                        "task_id": ctx.task.id.to_string(),
                        "project_id": ctx.project.id.to_string(),
                        "attempt_id": task_attempt.id.to_string(),
                    }),
                )
                .await;

            Ok(ResponseJson(ApiResponse::success(pr_info.url)))
        }
        Err(e) => {
            tracing::error!(
                "Failed to create GitHub PR for attempt {}: {}",
                task_attempt.id,
                e
            );
            if e.is_api_data() {
                Ok(ResponseJson(ApiResponse::error_with_data(e)))
            } else {
                Ok(ResponseJson(ApiResponse::error("Failed to create PR")))
            }
        }
    }
}

#[derive(serde::Deserialize)]
pub struct OpenEditorRequest {
    editor_type: Option<String>,
    file_path: Option<String>,
}

pub async fn open_task_attempt_in_editor(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<Option<OpenEditorRequest>>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    // Get the task attempt to access the worktree path
    let attempt = &task_attempt;
    let base_path = attempt.container_ref.as_ref().ok_or_else(|| {
        tracing::error!(
            "No container ref found for task attempt {}",
            task_attempt.id
        );
        ApiError::TaskAttempt(TaskAttemptError::ValidationError(
            "No container ref found".to_string(),
        ))
    })?;

    // If a specific file path is provided, use it; otherwise use the base path
    let path = if let Some(file_path) = payload.as_ref().and_then(|req| req.file_path.as_ref()) {
        std::path::Path::new(base_path).join(file_path)
    } else {
        std::path::PathBuf::from(base_path)
    };

    let editor_config = {
        let config = deployment.config().read().await;
        let editor_type_str = payload.as_ref().and_then(|req| req.editor_type.as_deref());
        config.editor.with_override(editor_type_str)
    };

    match editor_config.open_file(&path.to_string_lossy()) {
        Ok(_) => {
            tracing::info!(
                "Opened editor for task attempt {} at path: {}",
                task_attempt.id,
                path.display()
            );
            Ok(ResponseJson(ApiResponse::success(())))
        }
        Err(e) => {
            tracing::error!(
                "Failed to open editor for attempt {}: {}",
                task_attempt.id,
                e
            );
            Err(ApiError::TaskAttempt(TaskAttemptError::ValidationError(
                format!("Failed to open editor: {}", e),
            )))
        }
    }
}

pub async fn get_task_attempt_branch_status(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<BranchStatus>>, ApiError> {
    let pool = &deployment.db().pool;

    let task = task_attempt
        .parent_task(pool)
        .await?
        .ok_or(ApiError::TaskAttempt(TaskAttemptError::TaskNotFound))?;
    let ctx = TaskAttempt::load_context(pool, task_attempt.id, task.id, task.project_id).await?;

    let branch_status = GitService::new()
        .get_branch_status(
            &ctx.project.git_repo_path,
            ctx.task_attempt.branch.as_ref().ok_or_else(|| {
                ApiError::TaskAttempt(TaskAttemptError::ValidationError(
                    "No branch found for task attempt".to_string(),
                ))
            })?,
            &ctx.task_attempt.base_branch,
            ctx.task_attempt.merge_commit.is_some(),
        )
        .map_err(|e| {
            tracing::error!(
                "Failed to get branch status for task attempt {}: {}",
                task_attempt.id,
                e
            );
            ApiError::GitService(e)
        })?;

    Ok(ResponseJson(ApiResponse::success(branch_status)))
}

#[axum::debug_handler]
pub async fn rebase_task_attempt(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
    request_body: Option<Json<RebaseTaskAttemptRequest>>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    // Extract new base branch from request body if provided
    let new_base_branch = request_body.and_then(|body| body.new_base_branch.clone());

    let pool = &deployment.db().pool;

    let task = task_attempt
        .parent_task(pool)
        .await?
        .ok_or(ApiError::TaskAttempt(TaskAttemptError::TaskNotFound))?;
    let ctx = TaskAttempt::load_context(pool, task_attempt.id, task.id, task.project_id).await?;

    // Use the stored base branch if no new base branch is provided
    let effective_base_branch =
        new_base_branch.or_else(|| Some(ctx.task_attempt.base_branch.clone()));

    let container_ref = deployment
        .container()
        .ensure_container_exists(&task_attempt)
        .await?;
    let worktree_path = std::path::Path::new(&container_ref);

    let _new_base_commit = GitService::new().rebase_branch(
        &ctx.project.git_repo_path,
        worktree_path,
        effective_base_branch.clone().as_deref(),
        &ctx.task_attempt.base_branch.clone(),
    )?;

    if let Some(new_base_branch) = &effective_base_branch {
        if new_base_branch != &ctx.task_attempt.base_branch {
            // for remote branches, store the local branch name in the database
            let db_branch_name = if new_base_branch.starts_with("origin/") {
                new_base_branch.strip_prefix("origin/").unwrap()
            } else {
                new_base_branch
            };
            TaskAttempt::update_base_branch(&deployment.db().pool, task_attempt.id, db_branch_name)
                .await?;
        }
    }

    Ok(ResponseJson(ApiResponse::success(())))
}

#[derive(serde::Deserialize)]
pub struct DeleteFileQuery {
    file_path: String,
}

#[axum::debug_handler]
pub async fn delete_task_attempt_file(
    Extension(task_attempt): Extension<TaskAttempt>,
    Query(query): Query<DeleteFileQuery>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let container_ref = deployment
        .container()
        .ensure_container_exists(&task_attempt)
        .await?;
    let worktree_path = std::path::Path::new(&container_ref);

    // Use GitService to delete file and commit
    let _commit_id = GitService::new()
        .delete_file_and_commit(worktree_path, &query.file_path)
        .map_err(|e| {
            tracing::error!(
                "Failed to delete file '{}' from task attempt {}: {}",
                query.file_path,
                task_attempt.id,
                e
            );
            ApiError::GitService(e)
        })?;

    Ok(ResponseJson(ApiResponse::success(())))
}

#[axum::debug_handler]
pub async fn start_dev_server(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let pool = &deployment.db().pool;

    // Get parent task
    let task = task_attempt
        .parent_task(&deployment.db().pool)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    // Get parent project
    let project = task
        .parent_project(&deployment.db().pool)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    // Stop any existing dev servers for this project
    let existing_dev_servers =
        match ExecutionProcess::find_running_dev_servers_by_project(pool, project.id).await {
            Ok(servers) => servers,
            Err(e) => {
                tracing::error!(
                    "Failed to find running dev servers for project {}: {}",
                    project.id,
                    e
                );
                return Err(ApiError::TaskAttempt(TaskAttemptError::ValidationError(
                    e.to_string(),
                )));
            }
        };

    for dev_server in existing_dev_servers {
        tracing::info!(
            "Stopping existing dev server {} for project {}",
            dev_server.id,
            project.id
        );

        if let Err(e) = deployment.container().stop_execution(&dev_server).await {
            tracing::error!("Failed to stop dev server {}: {}", dev_server.id, e);
        }
    }

    if let Some(dev_server) = project.dev_script {
        // TODO: Derive script language from system config
        let executor_action = ExecutorAction::new(
            ExecutorActionType::ScriptRequest(ScriptRequest {
                script: dev_server,
                language: ScriptRequestLanguage::Bash,
                context: ScriptContext::DevServer,
            }),
            None,
        );

        deployment
            .container()
            .start_execution(
                &task_attempt,
                &executor_action,
                &ExecutionProcessRunReason::DevServer,
            )
            .await?
    } else {
        return Ok(ResponseJson(ApiResponse::error(
            "No dev server script configured for this project",
        )));
    };

    Ok(ResponseJson(ApiResponse::success(())))
}

// /// Find plan content with context by searching through multiple processes in the same attempt
// async fn find_plan_content_with_context(
//     pool: &SqlitePool,
//     attempt_id: Uuid,
// ) -> Result<String, StatusCode> {
//     // Get all execution processes for this attempt
//     let execution_processes =
//         match ExecutionProcess::find_by_task_attempt_id(pool, attempt_id).await {
//             Ok(processes) => processes,
//             Err(e) => {
//                 tracing::error!(
//                     "Failed to fetch execution processes for attempt {}: {}",
//                     attempt_id,
//                     e
//                 );
//                 return Err(StatusCode::INTERNAL_SERVER_ERROR);
//             }
//         };

//     // Look for claudeplan processes (most recent first)
//     for claudeplan_process in execution_processes
//         .iter()
//         .rev()
//         .filter(|p| p.executor_type.as_deref() == Some("claude-plan"))
//     {
//         if let Some(stdout) = &claudeplan_process.stdout {
//             if !stdout.trim().is_empty() {
//                 // Create executor and normalize logs
//                 let executor_config = ExecutorConfig::ClaudePlan;
//                 let executor = executor_config.create_executor();

//                 // Use working directory for normalization
//                 let working_dir_path =
//                     match std::fs::canonicalize(&claudeplan_process.working_directory) {
//                         Ok(canonical_path) => canonical_path.to_string_lossy().to_string(),
//                         Err(_) => claudeplan_process.working_directory.clone(),
//                     };

//                 // Normalize logs and extract plan content
//                 match executor.normalize_logs(stdout, &working_dir_path) {
//                     Ok(normalized_conversation) => {
//                         // Search for plan content in the normalized conversation
//                         if let Some(plan_content) = normalized_conversation
//                             .entries
//                             .iter()
//                             .rev()
//                             .find_map(|entry| {
//                                 if let NormalizedEntryType::ToolUse {
//                                     action_type: ActionType::PlanPresentation { plan },
//                                     ..
//                                 } = &entry.entry_type
//                                 {
//                                     Some(plan.clone())
//                                 } else {
//                                     None
//                                 }
//                             })
//                         {
//                             return Ok(plan_content);
//                         }
//                     }
//                     Err(_) => {
//                         continue;
//                     }
//                 }
//             }
//         }
//     }

//     tracing::error!(
//         "No claudeplan content found in any process in attempt {}",
//         attempt_id
//     );
//     Err(StatusCode::NOT_FOUND)
// }

// pub async fn approve_plan(
//     Extension(project): Extension<Project>,
//     Extension(task): Extension<Task>,
//     Extension(task_attempt): Extension<TaskAttempt>,
//     State(app_state): State<AppState>,
// ) -> Result<ResponseJson<ApiResponse<FollowUpResponse>>, StatusCode> {
//     let current_task = &task;

//     // Find plan content with context across the task hierarchy
//     let plan_content = find_plan_content_with_context(&app_state.db_pool, task_attempt.id).await?;

//     use crate::models::task::CreateTask;
//     let new_task_id = Uuid::new_v4();
//     let create_task_data = CreateTask {
//         project_id: project.id,
//         title: format!("Execute Plan: {}", current_task.title),
//         description: Some(plan_content),
//         parent_task_attempt: Some(task_attempt.id),
//     };

//     let new_task = match Task::create(&app_state.db_pool, &create_task_data, new_task_id).await {
//         Ok(task) => task,
//         Err(e) => {
//             tracing::error!("Failed to create new task: {}", e);
//             return Err(StatusCode::INTERNAL_SERVER_ERROR);
//         }
//     };

//     // Mark original task as completed since it now has children
//     if let Err(e) =
//         Task::update_status(&app_state.db_pool, task.id, project.id, TaskStatus::Done).await
//     {
//         tracing::error!("Failed to update original task status to Done: {}", e);
//         return Err(StatusCode::INTERNAL_SERVER_ERROR);
//     } else {
//         tracing::info!(
//             "Original task {} marked as Done after plan approval (has children)",
//             task.id
//         );
//     }

//     Ok(ResponseJson(ApiResponse::success(FollowUpResponse {
//         message: format!("Plan approved and new task created: {}", new_task.title),
//         actual_attempt_id: new_task_id, // Return the new task ID
//         created_new_attempt: true,
//     })))
// }

pub async fn get_task_attempt_children(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<Task>>>, StatusCode> {
    match Task::find_related_tasks_by_attempt_id(&deployment.db().pool, task_attempt.id).await {
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

// pub fn task_attempts_with_id_router(_state: AppState) -> Router<AppState> {
//     use axum::routing::post;

//     Router::new()
//         .route(
//             "/projects/:project_id/tasks/:task_id/attempts/:attempt_id/approve-plan",
//             post(approve_plan),
//         )
//         .merge(
//             Router::new()
//                 .route_layer(from_fn_with_state(_state.clone(), load_task_attempt_middleware))
//         )
// }

pub async fn stop_task_attempt_execution(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    deployment.container().try_stop(&task_attempt).await;
    Ok(ResponseJson(ApiResponse::success(())))
}

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let task_attempt_id_router = Router::new()
        .route("/", get(get_task_attempt))
        .route("/follow-up", post(follow_up))
        .route("/start-dev-server", post(start_dev_server))
        .route("/branch-status", get(get_task_attempt_branch_status))
        .route("/diff", get(get_task_attempt_diff))
        .route("/merge", post(merge_task_attempt))
        .route("/rebase", post(rebase_task_attempt))
        .route("/pr", post(create_github_pr))
        .route("/open-editor", post(open_task_attempt_in_editor))
        .route("/delete-file", post(delete_task_attempt_file))
        .route("/children", get(get_task_attempt_children))
        .route("/stop", post(stop_task_attempt_execution))
        .layer(from_fn_with_state(
            deployment.clone(),
            load_task_attempt_middleware,
        ));

    let task_attempts_router = Router::new()
        .route("/", get(get_task_attempts).post(create_task_attempt))
        .nest("/{id}", task_attempt_id_router);

    Router::new().nest("/task-attempts", task_attempts_router)
}
