pub mod codex_setup;
pub mod cursor_setup;
pub mod gh_cli_setup;
pub mod images;
pub mod queue;
pub mod util;

use std::collections::HashMap;

use axum::{
    Extension, Json, Router,
    extract::{
        Query, State,
        ws::{WebSocket, WebSocketUpgrade},
    },
    http::StatusCode,
    middleware::from_fn_with_state,
    response::{IntoResponse, Json as ResponseJson},
    routing::{get, post},
};
use db::models::{
    attempt_repo::{AttemptRepo, CreateAttemptRepo},
    execution_process::{ExecutionProcess, ExecutionProcessRunReason, ExecutionProcessStatus},
    merge::{Merge, MergeStatus, PrMerge, PullRequestInfo},
    project::{Project, ProjectError},
    project_repo::ProjectRepo,
    repo::{Repo, RepoError},
    scratch::{Scratch, ScratchType},
    task::{Task, TaskRelationships, TaskStatus},
    task_attempt::{CreateTaskAttempt, TaskAttempt, TaskAttemptError},
};
use deployment::Deployment;
use executors::{
    actions::{
        ExecutorAction, ExecutorActionType,
        coding_agent_follow_up::CodingAgentFollowUpRequest,
        script::{ScriptContext, ScriptRequest, ScriptRequestLanguage},
    },
    executors::{CodingAgent, ExecutorError},
    profile::{ExecutorConfigs, ExecutorProfileId},
};
use serde::{Deserialize, Serialize};
use services::services::{
    container::ContainerService,
    git::{ConflictOp, GitBranchId, GitCliError, GitServiceError},
    github::{CreatePrRequest, GitHubService, GitHubServiceError},
};
use sqlx::Error as SqlxError;
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{
    DeploymentImpl,
    error::ApiError,
    middleware::load_task_attempt_middleware,
    routes::task_attempts::{gh_cli_setup::GhCliSetupError, util::restore_worktrees_to_process},
};

// TODO: refactor for proper multi-repo support
/// Get the first repository path for a project
async fn get_first_repo_path(
    pool: &sqlx::SqlitePool,
    project_id: Uuid,
) -> Result<std::path::PathBuf, ApiError> {
    let repos = ProjectRepo::find_repos_for_project(pool, project_id).await?;
    repos
        .first()
        .map(|r| r.path.clone())
        .ok_or_else(|| ApiError::BadRequest("Project has no repositories configured".to_string()))
}

// TODO: refactor for proper multi-repo support
/// Get the first target branch ref for an attempt
async fn get_first_target_branch(
    pool: &sqlx::SqlitePool,
    attempt_id: Uuid,
) -> Result<GitBranchId, ApiError> {
    let attempt_repos = AttemptRepo::find_by_attempt_id(pool, attempt_id).await?;
    let branch_ref = attempt_repos
        .first()
        .map(|r| r.target_branch_ref.clone())
        .ok_or_else(|| {
            ApiError::BadRequest("Attempt has no repositories configured".to_string())
        })?;
    let git_branch = GitBranchId::from_ref(branch_ref)?;
    Ok(git_branch)
}

#[derive(Debug, Deserialize, Serialize, TS)]
pub struct RebaseTaskAttemptRequest {
    pub old_base_branch_ref: Option<String>,
    pub new_base_branch_ref: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(tag = "type", rename_all = "snake_case")]
pub enum GitOperationError {
    MergeConflicts { message: String, op: ConflictOp },
    RebaseInProgress,
}

#[derive(Debug, Deserialize, Serialize, TS)]
pub struct CreateGitHubPrRequest {
    pub title: String,
    pub body: Option<String>,
    pub repo_id: Uuid,
    pub target_branch_ref: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct TaskAttemptQuery {
    pub task_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct DiffStreamQuery {
    #[serde(default)]
    pub stats_only: bool,
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

#[derive(Debug, Serialize, Deserialize, ts_rs::TS)]
pub struct CreateTaskAttemptBody {
    pub task_id: Uuid,
    /// Executor profile specification
    pub executor_profile_id: ExecutorProfileId,
    /// Full git ref for the base branch, e.g., "refs/remotes/origin/main"
    pub base_branch_ref: String,
}

impl CreateTaskAttemptBody {
    /// Get the executor profile ID
    pub fn get_executor_profile_id(&self) -> ExecutorProfileId {
        self.executor_profile_id.clone()
    }
}

#[derive(Debug, Deserialize, Serialize, TS)]
pub struct RunAgentSetupRequest {
    pub executor_profile_id: ExecutorProfileId,
}

#[derive(Debug, Serialize, TS)]
pub struct RunAgentSetupResponse {}

#[axum::debug_handler]
pub async fn create_task_attempt(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateTaskAttemptBody>,
) -> Result<ResponseJson<ApiResponse<TaskAttempt>>, ApiError> {
    let executor_profile_id = payload.get_executor_profile_id();
    let task = Task::find_by_id(&deployment.db().pool, payload.task_id)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    let project = task
        .parent_project(&deployment.db().pool)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    let repositories =
        ProjectRepo::find_repos_for_project(&deployment.db().pool, project.id).await?;

    let attempt_id = Uuid::new_v4();
    let git_branch_name = deployment
        .container()
        .git_branch_from_task_attempt(&attempt_id, &task.title)
        .await;

    let task_attempt = TaskAttempt::create(
        &deployment.db().pool,
        &CreateTaskAttempt {
            executor: executor_profile_id.executor,
            branch: git_branch_name.clone(),
        },
        attempt_id,
        payload.task_id,
    )
    .await?;

    let attempt_repos: Vec<_> = repositories
        .iter()
        .map(|repo| CreateAttemptRepo {
            repo_id: repo.id,
            target_branch_ref: payload.base_branch_ref.clone(),
        })
        .collect();
    AttemptRepo::create_many(&deployment.db().pool, task_attempt.id, &attempt_repos).await?;

    if let Err(err) = deployment
        .container()
        .start_attempt(&task_attempt, executor_profile_id.clone())
        .await
    {
        tracing::error!("Failed to start task attempt: {}", err);
    }

    deployment
        .track_if_analytics_allowed(
            "task_attempt_started",
            serde_json::json!({
                "task_id": task_attempt.task_id.to_string(),
                "variant": &executor_profile_id.variant,
                "executor": &executor_profile_id.executor,
                "attempt_id": task_attempt.id.to_string(),
            }),
        )
        .await;

    tracing::info!("Created attempt for task {}", task.id);

    Ok(ResponseJson(ApiResponse::success(task_attempt)))
}

#[axum::debug_handler]
pub async fn run_agent_setup(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<RunAgentSetupRequest>,
) -> Result<ResponseJson<ApiResponse<RunAgentSetupResponse>>, ApiError> {
    let executor_profile_id = payload.executor_profile_id;
    let config = ExecutorConfigs::get_cached();
    let coding_agent = config.get_coding_agent_or_default(&executor_profile_id);
    match coding_agent {
        CodingAgent::CursorAgent(_) => {
            cursor_setup::run_cursor_setup(&deployment, &task_attempt).await?;
        }
        CodingAgent::Codex(codex) => {
            codex_setup::run_codex_setup(&deployment, &task_attempt, &codex).await?;
        }
        _ => return Err(ApiError::Executor(ExecutorError::SetupHelperNotSupported)),
    }

    deployment
        .track_if_analytics_allowed(
            "agent_setup_script_executed",
            serde_json::json!({
                "executor_profile_id": executor_profile_id.to_string(),
                "attempt_id": task_attempt.id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(RunAgentSetupResponse {})))
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateFollowUpAttempt {
    pub prompt: String,
    pub variant: Option<String>,
    pub retry_process_id: Option<Uuid>,
    pub force_when_dirty: Option<bool>,
    pub perform_git_reset: Option<bool>,
}

pub async fn follow_up(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateFollowUpAttempt>,
) -> Result<ResponseJson<ApiResponse<ExecutionProcess>>, ApiError> {
    tracing::info!("{:?}", task_attempt);

    deployment
        .container()
        .ensure_container_exists(&task_attempt)
        .await?;

    // Get executor profile data from the latest CodingAgent process
    let initial_executor_profile_id = ExecutionProcess::latest_executor_profile_for_attempt(
        &deployment.db().pool,
        task_attempt.id,
    )
    .await?;

    let executor_profile_id = ExecutorProfileId {
        executor: initial_executor_profile_id.executor,
        variant: payload.variant,
    };

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

    // If retry settings provided, perform replace-logic before proceeding
    if let Some(proc_id) = payload.retry_process_id {
        let pool = &deployment.db().pool;
        // Validate process belongs to attempt
        let process =
            ExecutionProcess::find_by_id(pool, proc_id)
                .await?
                .ok_or(ApiError::TaskAttempt(TaskAttemptError::ValidationError(
                    "Process not found".to_string(),
                )))?;
        if process.task_attempt_id != task_attempt.id {
            return Err(ApiError::TaskAttempt(TaskAttemptError::ValidationError(
                "Process does not belong to this attempt".to_string(),
            )));
        }

        // Reset all repository worktrees to the state before the target process
        let force_when_dirty = payload.force_when_dirty.unwrap_or(false);
        let perform_git_reset = payload.perform_git_reset.unwrap_or(true);
        restore_worktrees_to_process(
            &deployment,
            pool,
            &task_attempt,
            project.id,
            proc_id,
            perform_git_reset,
            force_when_dirty,
        )
        .await?;

        // Stop any running processes for this attempt
        deployment.container().try_stop(&task_attempt).await;

        // Soft-drop the target process and all later processes
        let _ = ExecutionProcess::drop_at_and_after(pool, task_attempt.id, proc_id).await?;
    }

    let latest_session_id = ExecutionProcess::find_latest_session_id_by_task_attempt(
        &deployment.db().pool,
        task_attempt.id,
    )
    .await?;

    let prompt = payload.prompt;

    let cleanup_action = deployment
        .container()
        .cleanup_action(project.cleanup_script);

    let action_type = if let Some(session_id) = latest_session_id {
        ExecutorActionType::CodingAgentFollowUpRequest(CodingAgentFollowUpRequest {
            prompt: prompt.clone(),
            session_id,
            executor_profile_id: executor_profile_id.clone(),
        })
    } else {
        ExecutorActionType::CodingAgentInitialRequest(
            executors::actions::coding_agent_initial::CodingAgentInitialRequest {
                prompt,
                executor_profile_id: executor_profile_id.clone(),
            },
        )
    };

    let action = ExecutorAction::new(action_type, cleanup_action);

    let execution_process = deployment
        .container()
        .start_execution(
            &task_attempt,
            &action,
            &ExecutionProcessRunReason::CodingAgent,
        )
        .await?;

    // Clear the draft follow-up scratch on successful spawn
    // This ensures the scratch is wiped even if the user navigates away quickly
    if let Err(e) = Scratch::delete(
        &deployment.db().pool,
        task_attempt.id,
        &ScratchType::DraftFollowUp,
    )
    .await
    {
        // Log but don't fail the request - scratch deletion is best-effort
        tracing::debug!(
            "Failed to delete draft follow-up scratch for attempt {}: {}",
            task_attempt.id,
            e
        );
    }

    Ok(ResponseJson(ApiResponse::success(execution_process)))
}

#[axum::debug_handler]
pub async fn stream_task_attempt_diff_ws(
    ws: WebSocketUpgrade,
    Query(params): Query<DiffStreamQuery>,
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
) -> impl IntoResponse {
    let stats_only = params.stats_only;
    ws.on_upgrade(move |socket| async move {
        if let Err(e) =
            handle_task_attempt_diff_ws(socket, deployment, task_attempt, stats_only).await
        {
            tracing::warn!("diff WS closed: {}", e);
        }
    })
}

async fn handle_task_attempt_diff_ws(
    socket: WebSocket,
    deployment: DeploymentImpl,
    task_attempt: TaskAttempt,
    stats_only: bool,
) -> anyhow::Result<()> {
    use futures_util::{SinkExt, StreamExt, TryStreamExt};
    use utils::log_msg::LogMsg;

    let stream = deployment
        .container()
        .stream_diff(&task_attempt, stats_only)
        .await?;

    let mut stream = stream.map_ok(|msg: LogMsg| msg.to_ws_message_unchecked());

    let (mut sender, mut receiver) = socket.split();

    loop {
        tokio::select! {
            // Wait for next stream item
            item = stream.next() => {
                match item {
                    Some(Ok(msg)) => {
                        if sender.send(msg).await.is_err() {
                            break;
                        }
                    }
                    Some(Err(e)) => {
                        tracing::error!("stream error: {}", e);
                        break;
                    }
                    None => break,
                }
            }
            // Detect client disconnection
            msg = receiver.next() => {
                if msg.is_none() {
                    break;
                }
            }
        }
    }
    Ok(())
}

#[derive(Debug, Serialize, TS)]
pub struct CommitCompareResult {
    pub subject: String,
    pub head_oid: String,
    pub target_oid: String,
    pub ahead_from_head: usize,
    pub behind_from_head: usize,
    pub is_linear: bool,
}

pub async fn compare_commit_to_head(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<ResponseJson<ApiResponse<CommitCompareResult>>, ApiError> {
    let Some(target_oid) = params.get("sha").cloned() else {
        return Err(ApiError::TaskAttempt(TaskAttemptError::ValidationError(
            "Missing sha param".to_string(),
        )));
    };
    let container_ref = deployment
        .container()
        .ensure_container_exists(&task_attempt)
        .await?;
    let wt = std::path::Path::new(&container_ref);
    // TODO: this needs a worktree path, not a workspace path
    let subject = deployment.git().get_commit_subject(wt, &target_oid)?;
    let head_info = deployment.git().get_head_info(wt)?;
    let (ahead_from_head, behind_from_head) =
        deployment
            .git()
            .ahead_behind_commits_by_oid(wt, &head_info.oid, &target_oid)?;
    let is_linear = behind_from_head == 0;
    Ok(ResponseJson(ApiResponse::success(CommitCompareResult {
        subject,
        head_oid: head_info.oid,
        target_oid,
        ahead_from_head,
        behind_from_head,
        is_linear,
    })))
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
    let workspace_path = std::path::Path::new(&container_ref);

    let task_uuid_str = task.id.to_string();
    let first_uuid_section = task_uuid_str.split('-').next().unwrap_or(&task_uuid_str);

    // Create commit message with task title and description
    let mut commit_message = format!("{} (vibe-kanban {})", ctx.task.title, first_uuid_section);

    // Add description on next line if it exists
    if let Some(description) = &ctx.task.description
        && !description.trim().is_empty()
    {
        commit_message.push_str("\n\n");
        commit_message.push_str(description);
    }

    let repo_path = get_first_repo_path(pool, ctx.project.id).await?;
    let target_branch = get_first_target_branch(pool, task_attempt.id).await?;
    let task_branch_id = GitBranchId::from_local_name(task_attempt.branch);
    // TODO: this needs a worktree path, not a workspace path
    let merge_commit_id = deployment.git().merge_changes(
        &repo_path,
        workspace_path,
        &task_branch_id,
        &target_branch,
        &commit_message,
    )?;

    Merge::create_direct(
        pool,
        task_attempt.id,
        &target_branch.branch_name(),
        &merge_commit_id,
    )
    .await?;
    Task::update_status(pool, ctx.task.id, TaskStatus::Done).await?;

    // Stop any running dev servers for this task attempt
    let dev_servers =
        ExecutionProcess::find_running_dev_servers_by_task_attempt(pool, task_attempt.id).await?;

    for dev_server in dev_servers {
        tracing::info!(
            "Stopping dev server {} for completed task attempt {}",
            dev_server.id,
            task_attempt.id
        );

        if let Err(e) = deployment
            .container()
            .stop_execution(&dev_server, ExecutionProcessStatus::Killed)
            .await
        {
            tracing::error!(
                "Failed to stop dev server {} for task attempt {}: {}",
                dev_server.id,
                task_attempt.id,
                e
            );
        }
    }

    // Try broadcast update to other users in organization
    if let Ok(publisher) = deployment.share_publisher() {
        if let Err(err) = publisher.update_shared_task_by_id(ctx.task.id).await {
            tracing::warn!(
                ?err,
                "Failed to propagate shared task update for {}",
                ctx.task.id
            );
        }
    } else {
        tracing::debug!(
            "Share publisher unavailable; skipping remote update for {}",
            ctx.task.id
        );
    }

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

pub async fn push_task_attempt_branch(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<(), PushError>>, ApiError> {
    let github_service = GitHubService::new()?;
    github_service.check_token().await?;

    let container_ref = deployment
        .container()
        .ensure_container_exists(&task_attempt)
        .await?;
    let workspace_path = std::path::PathBuf::from(&container_ref);
    let task_branch_id = GitBranchId::from_local_name(task_attempt.branch);

    // TODO: this needs a worktree path, not a workspace path
    match deployment
        .git()
        .push_to_github(&workspace_path, &task_branch_id, false)
    {
        Ok(_) => Ok(ResponseJson(ApiResponse::success(()))),
        Err(GitServiceError::GitCLI(GitCliError::PushRejected(_))) => Ok(ResponseJson(
            ApiResponse::error_with_data(PushError::ForcePushRequired),
        )),
        Err(e) => Err(ApiError::GitService(e)),
    }
}

pub async fn force_push_task_attempt_branch(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<(), PushError>>, ApiError> {
    let github_service = GitHubService::new()?;
    github_service.check_token().await?;

    let container_ref = deployment
        .container()
        .ensure_container_exists(&task_attempt)
        .await?;
    let workspace_path = std::path::PathBuf::from(&container_ref);

    // TODO: this needs a worktree path, not a workspace path
    let task_branch_id = GitBranchId::from_local_name(task_attempt.branch);
    deployment
        .git()
        .push_to_github(&workspace_path, &task_branch_id, true)?;
    Ok(ResponseJson(ApiResponse::success(())))
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(tag = "type", rename_all = "snake_case")]
pub enum PushError {
    ForcePushRequired,
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(tag = "type", rename_all = "snake_case")]
pub enum CreatePrError {
    GithubCliNotInstalled,
    GithubCliNotLoggedIn,
    GitCliNotLoggedIn,
    GitCliNotInstalled,
    TargetBranchNotFound { branch: String },
}

pub async fn create_github_pr(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<CreateGitHubPrRequest>,
) -> Result<ResponseJson<ApiResponse<String, CreatePrError>>, ApiError> {
    let pool = &deployment.db().pool;

    let task = task_attempt
        .parent_task(pool)
        .await?
        .ok_or(ApiError::TaskAttempt(TaskAttemptError::TaskNotFound))?;
    let project = Project::find_by_id(pool, task.project_id)
        .await?
        .ok_or(ApiError::Project(ProjectError::ProjectNotFound))?;

    let attempt_repo =
        AttemptRepo::find_by_attempt_and_repo_id(pool, task_attempt.id, request.repo_id)
            .await?
            .ok_or(RepoError::NotFound)?;

    let repo = Repo::find_by_id(pool, attempt_repo.repo_id)
        .await?
        .ok_or(RepoError::NotFound)?;

    let repo_path = repo.path;
    // Get the target branch ref: from request, or from attempt repo
    let target_branch_ref = if let Some(ref_str) = request.target_branch_ref {
        ref_str
    } else {
        attempt_repo.target_branch_ref.clone()
    };
    let target_branch = GitBranchId::from_ref(target_branch_ref)?;

    let container_ref = deployment
        .container()
        .ensure_container_exists(&task_attempt)
        .await?;
    let workspace_path = std::path::PathBuf::from(&container_ref);
    let worktree_path = workspace_path.join(repo.name);

    // For remote refs, check that the branch exists
    if target_branch.is_remote() {
        // Extract the short form for checking (e.g., "origin/main" from "refs/remotes/origin/main")
        match deployment
            .git()
            .check_remote_branch_exists(&repo_path, &target_branch)
        {
            Ok(false) => {
                return Ok(ResponseJson(ApiResponse::error_with_data(
                    CreatePrError::TargetBranchNotFound {
                        branch: target_branch.branch_name().to_string(),
                    },
                )));
            }
            Err(GitServiceError::GitCLI(GitCliError::AuthFailed(_))) => {
                return Ok(ResponseJson(ApiResponse::error_with_data(
                    CreatePrError::GitCliNotLoggedIn,
                )));
            }
            Err(GitServiceError::GitCLI(GitCliError::NotAvailable)) => {
                return Ok(ResponseJson(ApiResponse::error_with_data(
                    CreatePrError::GitCliNotInstalled,
                )));
            }
            Err(e) => return Err(ApiError::GitService(e)),
            Ok(true) => {}
        }
    }

    let task_branch_id = GitBranchId::from_local_name(task_attempt.branch);
    // Push the branch to GitHub first
    if let Err(e) = deployment
        .git()
        .push_to_github(&worktree_path, &task_branch_id, false)
    {
        tracing::error!("Failed to push branch to GitHub: {}", e);
        match e {
            GitServiceError::GitCLI(GitCliError::AuthFailed(_)) => {
                return Ok(ResponseJson(ApiResponse::error_with_data(
                    CreatePrError::GitCliNotLoggedIn,
                )));
            }
            GitServiceError::GitCLI(GitCliError::NotAvailable) => {
                return Ok(ResponseJson(ApiResponse::error_with_data(
                    CreatePrError::GitCliNotInstalled,
                )));
            }
            _ => return Err(ApiError::GitService(e)),
        }
    }
    // Create the PR using GitHub service
    let pr_request = CreatePrRequest {
        title: request.title.clone(),
        body: request.body.clone(),
        head_branch: task_branch_id.ref_name().to_string(),
        base_branch: target_branch.ref_name().to_string(),
    };
    // Use GitService to get the remote URL, then create GitHubRepoInfo
    let repo_info = deployment.git().get_github_repo_info(&repo_path)?;

    // Use GitHubService to create the PR
    let github_service = GitHubService::new()?;
    match github_service.create_pr(&repo_info, &pr_request).await {
        Ok(pr_info) => {
            // Update the task attempt with PR information
            if let Err(e) = Merge::create_pr(
                pool,
                task_attempt.id,
                &target_branch.branch_name(),
                pr_info.number,
                &pr_info.url,
            )
            .await
            {
                tracing::error!("Failed to update task attempt PR status: {}", e);
            }

            // Auto-open PR in browser
            if let Err(e) = utils::browser::open_browser(&pr_info.url).await {
                tracing::warn!("Failed to open PR in browser: {}", e);
            }
            deployment
                .track_if_analytics_allowed(
                    "github_pr_created",
                    serde_json::json!({
                        "task_id": task.id.to_string(),
                        "project_id": project.id.to_string(),
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
            match &e {
                GitHubServiceError::GhCliNotInstalled(_) => Ok(ResponseJson(
                    ApiResponse::error_with_data(CreatePrError::GithubCliNotInstalled),
                )),
                GitHubServiceError::AuthFailed(_) => Ok(ResponseJson(
                    ApiResponse::error_with_data(CreatePrError::GithubCliNotLoggedIn),
                )),
                _ => Err(ApiError::GitHubService(e)),
            }
        }
    }
}

#[derive(serde::Deserialize, TS)]
pub struct OpenEditorRequest {
    editor_type: Option<String>,
    file_path: Option<String>,
}

#[derive(Debug, Serialize, TS)]
pub struct OpenEditorResponse {
    pub url: Option<String>,
}

pub async fn open_task_attempt_in_editor(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<OpenEditorRequest>,
) -> Result<ResponseJson<ApiResponse<OpenEditorResponse>>, ApiError> {
    let container_ref = deployment
        .container()
        .ensure_container_exists(&task_attempt)
        .await?;
    let workspace_path = std::path::Path::new(&container_ref);

    // If a specific file path is provided, use it; otherwise use the base path
    let path = if let Some(file_path) = payload.file_path.as_ref() {
        workspace_path.join(file_path)
    } else {
        workspace_path.to_path_buf()
    };

    let editor_config = {
        let config = deployment.config().read().await;
        let editor_type_str = payload.editor_type.as_deref();
        config.editor.with_override(editor_type_str)
    };

    match editor_config.open_file(path.as_path()).await {
        Ok(url) => {
            tracing::info!(
                "Opened editor for task attempt {} at path: {}{}",
                task_attempt.id,
                path.display(),
                if url.is_some() { " (remote mode)" } else { "" }
            );

            deployment
                .track_if_analytics_allowed(
                    "task_attempt_editor_opened",
                    serde_json::json!({
                        "attempt_id": task_attempt.id.to_string(),
                        "editor_type": payload.editor_type.as_ref(),
                        "remote_mode": url.is_some(),
                    }),
                )
                .await;

            Ok(ResponseJson(ApiResponse::success(OpenEditorResponse {
                url,
            })))
        }
        Err(e) => {
            tracing::error!(
                "Failed to open editor for attempt {}: {:?}",
                task_attempt.id,
                e
            );
            Err(ApiError::EditorOpen(e))
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct BranchStatus {
    pub commits_behind: Option<usize>,
    pub commits_ahead: Option<usize>,
    pub has_uncommitted_changes: Option<bool>,
    pub head_oid: Option<String>,
    pub uncommitted_count: Option<usize>,
    pub untracked_count: Option<usize>,
    pub target_branch_name: String,
    pub remote_commits_behind: Option<usize>,
    pub remote_commits_ahead: Option<usize>,
    pub merges: Vec<Merge>,
    /// True if a `git rebase` is currently in progress in this worktree
    pub is_rebase_in_progress: bool,
    /// Current conflict operation if any
    pub conflict_op: Option<ConflictOp>,
    /// List of files currently in conflicted (unmerged) state
    pub conflicted_files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, TS)]
pub struct RepoBranchStatus {
    pub repo_id: Uuid,
    pub repo_name: String,
    #[serde(flatten)]
    pub status: BranchStatus,
}

pub async fn get_task_attempt_branch_status(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<RepoBranchStatus>>>, ApiError> {
    let pool = &deployment.db().pool;

    let task = task_attempt
        .parent_task(pool)
        .await?
        .ok_or(ApiError::TaskAttempt(TaskAttemptError::TaskNotFound))?;

    let repositories = ProjectRepo::find_repos_for_project(pool, task.project_id).await?;
    let attempt_repos = AttemptRepo::find_by_attempt_id(pool, task_attempt.id).await?;
    let target_branch_refs: HashMap<_, _> = attempt_repos
        .iter()
        .map(|ar| (ar.repo_id, ar.target_branch_ref.clone()))
        .collect();

    let container_ref = deployment
        .container()
        .ensure_container_exists(&task_attempt)
        .await?;
    let workspace_dir = std::path::PathBuf::from(&container_ref);
    let merges = Merge::find_by_task_attempt_id(pool, task_attempt.id).await?;
    let task_branch_id = GitBranchId::from_local_name(task_attempt.branch);

    let mut results = Vec::with_capacity(repositories.len());

    for repo in repositories {
        let Some(target_branch_ref) = target_branch_refs.get(&repo.id).cloned() else {
            continue;
        };
        let target_branch = GitBranchId::from_ref(target_branch_ref.clone())?;
        let worktree_path = workspace_dir.join(&repo.name);

        let head_oid = deployment
            .git()
            .get_head_info(&worktree_path)
            .ok()
            .map(|h| h.oid);

        let (is_rebase_in_progress, conflicted_files, conflict_op) = {
            let in_rebase = deployment
                .git()
                .is_rebase_in_progress(&worktree_path)
                .unwrap_or(false);
            let conflicts = deployment
                .git()
                .get_conflicted_files(&worktree_path)
                .unwrap_or_default();
            let op = if conflicts.is_empty() {
                None
            } else {
                deployment
                    .git()
                    .detect_conflict_op(&worktree_path)
                    .unwrap_or(None)
            };
            (in_rebase, conflicts, op)
        };

        let (uncommitted_count, untracked_count) =
            match deployment.git().get_worktree_change_counts(&worktree_path) {
                Ok((a, b)) => (Some(a), Some(b)),
                Err(_) => (None, None),
            };

        let has_uncommitted_changes = uncommitted_count.map(|c| c > 0);

        // Determine branch comparison based on ref type
        let (commits_ahead, commits_behind) = if target_branch.is_remote() {
            // For remote refs, use the short form (e.g., "origin/main")
            let (ahead, behind) = deployment.git().get_remote_branch_status(
                &repo.path,
                &task_branch_id,
                Some(&target_branch),
            )?;
            (Some(ahead), Some(behind))
        } else {
            // For local refs, use just the branch name
            let (a, b) =
                deployment
                    .git()
                    .get_branch_status(&repo.path, &task_branch_id, &target_branch)?;
            (Some(a), Some(b))
        };

        let (remote_ahead, remote_behind) = if let Some(Merge::Pr(PrMerge {
            pr_info:
                PullRequestInfo {
                    status: MergeStatus::Open,
                    ..
                },
            ..
        })) = merges.first()
        {
            match deployment
                .git()
                .get_remote_branch_status(&repo.path, &task_branch_id, None)
            {
                Ok((ahead, behind)) => (Some(ahead), Some(behind)),
                Err(_) => (None, None),
            }
        } else {
            (None, None)
        };

        results.push(RepoBranchStatus {
            repo_id: repo.id,
            repo_name: repo.name,
            status: BranchStatus {
                commits_ahead,
                commits_behind,
                has_uncommitted_changes,
                head_oid,
                uncommitted_count,
                untracked_count,
                remote_commits_ahead: remote_ahead,
                remote_commits_behind: remote_behind,
                merges: merges.clone(),
                target_branch_name: target_branch.branch_name().to_string(),
                is_rebase_in_progress,
                conflict_op,
                conflicted_files,
            },
        });
    }

    Ok(ResponseJson(ApiResponse::success(results)))
}

#[derive(serde::Deserialize, Debug, TS)]
pub struct ChangeTargetBranchRefRequest {
    pub new_target_branch_ref: String,
}

#[derive(serde::Serialize, Debug, TS)]
pub struct ChangeTargetBranchRefResponse {
    pub new_target_branch_ref: String,
    pub status: (usize, usize),
}

#[derive(serde::Deserialize, Debug, TS)]
pub struct RenameBranchRequest {
    pub new_branch_name: String,
}

#[derive(serde::Serialize, Debug, TS)]
pub struct RenameBranchResponse {
    pub branch: String,
}

#[axum::debug_handler]
pub async fn change_target_branch_ref(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<ChangeTargetBranchRefRequest>,
) -> Result<ResponseJson<ApiResponse<ChangeTargetBranchRefResponse>>, ApiError> {
    let new_target_branch_ref = payload.new_target_branch_ref;
    // let new_target_branch_name = GitService::ref_to_branch_name(&new_target_branch_ref);
    let new_target_branch_id = GitBranchId::from_ref(new_target_branch_ref.clone())?;
    let task = task_attempt
        .parent_task(&deployment.db().pool)
        .await?
        .ok_or(ApiError::TaskAttempt(TaskAttemptError::TaskNotFound))?;
    let pool = &deployment.db().pool;
    let project = Project::find_by_id(pool, task.project_id)
        .await?
        .ok_or(ApiError::Project(ProjectError::ProjectNotFound))?;
    let repo_path = get_first_repo_path(pool, project.id).await?;

    // Check branch exists based on ref type
    let branch_exists = if new_target_branch_id.is_remote() {
        deployment
            .git()
            .check_remote_branch_exists(&repo_path, &new_target_branch_id)?
    } else {
        deployment
            .git()
            .check_branch_exists(&repo_path, &new_target_branch_id)?
    };

    if branch_exists {
        AttemptRepo::update_all_target_branch_refs(pool, task_attempt.id, &new_target_branch_ref)
            .await?;
    } else {
        return Ok(ResponseJson(ApiResponse::error(
            format!(
                "Branch '{}' does not exist in the repository",
                new_target_branch_id.branch_name()
            )
            .as_str(),
        )));
    }
    let task_branch_id = GitBranchId::from_local_name(task_attempt.branch);

    let status =
        deployment
            .git()
            .get_branch_status(&repo_path, &task_branch_id, &new_target_branch_id)?;

    deployment
        .track_if_analytics_allowed(
            "task_attempt_target_branch_changed",
            serde_json::json!({
                "attempt_id": task_attempt.id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(
        ChangeTargetBranchRefResponse {
            new_target_branch_ref,
            status,
        },
    )))
}

#[axum::debug_handler]
pub async fn rename_branch(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<RenameBranchRequest>,
) -> Result<ResponseJson<ApiResponse<RenameBranchResponse>>, ApiError> {
    let new_branch_name = payload.new_branch_name.trim();

    if new_branch_name.is_empty() {
        return Ok(ResponseJson(ApiResponse::error(
            "Branch name cannot be empty",
        )));
    }

    if new_branch_name == task_attempt.branch {
        return Ok(ResponseJson(ApiResponse::success(RenameBranchResponse {
            branch: task_attempt.branch.clone(),
        })));
    }

    if !git2::Branch::name_is_valid(new_branch_name)? {
        return Ok(ResponseJson(ApiResponse::error(
            "Invalid branch name format",
        )));
    }
    let new_branch_id = GitBranchId::from_local_name(new_branch_name.to_string());
    let old_branch_id = GitBranchId::from_local_name(task_attempt.branch.clone());

    let pool = &deployment.db().pool;
    let task = task_attempt
        .parent_task(pool)
        .await?
        .ok_or(ApiError::TaskAttempt(TaskAttemptError::TaskNotFound))?;

    let project = Project::find_by_id(pool, task.project_id)
        .await?
        .ok_or(ApiError::Project(ProjectError::ProjectNotFound))?;
    let repo_path = get_first_repo_path(pool, project.id).await?;

    if deployment
        .git()
        .check_branch_exists(&repo_path, &new_branch_id)?
    {
        return Ok(ResponseJson(ApiResponse::error(
            "A branch with this name already exists",
        )));
    }

    let container_ref = deployment
        .container()
        .ensure_container_exists(&task_attempt)
        .await?;
    let workspace_path = std::path::Path::new(&container_ref);

    // TODO: this needs a worktree path, not a workspace path

    if deployment.git().is_rebase_in_progress(workspace_path)? {
        return Ok(ResponseJson(ApiResponse::error(
            "Cannot rename branch while rebase is in progress. Please complete or abort the rebase first.",
        )));
    }

    if let Some(merge) = Merge::find_latest_by_task_attempt_id(pool, task_attempt.id).await?
        && let Merge::Pr(pr_merge) = merge
        && matches!(pr_merge.pr_info.status, MergeStatus::Open)
    {
        return Ok(ResponseJson(ApiResponse::error(
            "Cannot rename branch with an open pull request. Please close the PR first or create a new attempt.",
        )));
    }

    deployment
        .git()
        .rename_local_branch(workspace_path, &old_branch_id, &new_branch_id)?;

    // TODO: should be in a transaction
    TaskAttempt::update_branch_name(pool, task_attempt.id, new_branch_name).await?;
    let updated_children_count = AttemptRepo::update_target_branch_ref_for_children_of_attempt(
        pool,
        task_attempt.id,
        &old_branch_id.ref_name(),
        &new_branch_id.ref_name(),
    )
    .await?;

    if updated_children_count > 0 {
        tracing::info!(
            "Updated {} child task attempts to target new branch '{}'",
            updated_children_count,
            new_branch_name
        );
    }

    deployment
        .track_if_analytics_allowed(
            "task_attempt_branch_renamed",
            serde_json::json!({
                "updated_children": updated_children_count,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(RenameBranchResponse {
        branch: new_branch_name.to_string(),
    })))
}

#[axum::debug_handler]
pub async fn rebase_task_attempt(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<RebaseTaskAttemptRequest>,
) -> Result<ResponseJson<ApiResponse<(), GitOperationError>>, ApiError> {
    let pool = &deployment.db().pool;

    let task = task_attempt
        .parent_task(pool)
        .await?
        .ok_or(ApiError::TaskAttempt(TaskAttemptError::TaskNotFound))?;
    let ctx = TaskAttempt::load_context(pool, task_attempt.id, task.id, task.project_id).await?;

    let current_target_branch = ctx
        .attempt_repos
        .first()
        .map(|r| r.target_branch_ref.clone())
        .unwrap_or_default();

    let old_base_branch = payload
        .old_base_branch_ref
        .unwrap_or(current_target_branch.clone());
    let new_base_branch = payload.new_base_branch_ref.unwrap_or(current_target_branch);
    // todo: make sure this is a ref
    let new_base_branch_id = GitBranchId::from_ref(new_base_branch.clone())?;
    let old_base_branch_id = GitBranchId::from_ref(old_base_branch.clone())?;
    let task_branch_id = GitBranchId::from_local_name(task_attempt.branch.clone());

    let repo_path = get_first_repo_path(pool, ctx.project.id).await?;
    match deployment
        .git()
        .check_branch_exists(&repo_path, &new_base_branch_id)?
    {
        true => {
            AttemptRepo::update_all_target_branch_refs(pool, task_attempt.id, &new_base_branch)
                .await?;
        }
        false => {
            return Ok(ResponseJson(ApiResponse::error(
                format!(
                    "Branch '{}' does not exist in the repository",
                    new_base_branch
                )
                .as_str(),
            )));
        }
    }

    let container_ref = deployment
        .container()
        .ensure_container_exists(&task_attempt)
        .await?;
    let workspace_path = std::path::Path::new(&container_ref);

    // TODO: this needs a worktree path, not a workspace path

    let result = deployment.git().rebase_branch(
        &repo_path,
        workspace_path,
        &new_base_branch_id,
        &old_base_branch_id,
        &task_branch_id,
    );
    if let Err(e) = result {
        use services::services::git::GitServiceError;
        return match e {
            GitServiceError::MergeConflicts(msg) => Ok(ResponseJson(ApiResponse::<
                (),
                GitOperationError,
            >::error_with_data(
                GitOperationError::MergeConflicts {
                    message: msg,
                    op: ConflictOp::Rebase,
                },
            ))),
            GitServiceError::RebaseInProgress => Ok(ResponseJson(ApiResponse::<
                (),
                GitOperationError,
            >::error_with_data(
                GitOperationError::RebaseInProgress,
            ))),
            other => Err(ApiError::GitService(other)),
        };
    }

    deployment
        .track_if_analytics_allowed(
            "task_attempt_rebased",
            serde_json::json!({
                "task_id": task.id.to_string(),
                "project_id": ctx.project.id.to_string(),
                "attempt_id": task_attempt.id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(())))
}

#[axum::debug_handler]
pub async fn abort_conflicts_task_attempt(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    // Resolve worktree path for this attempt
    let container_ref = deployment
        .container()
        .ensure_container_exists(&task_attempt)
        .await?;
    let workspace_path = std::path::Path::new(&container_ref);

    // TODO: this needs a worktree path, not a workspace path

    deployment.git().abort_conflicts(workspace_path)?;

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

        if let Err(e) = deployment
            .container()
            .stop_execution(&dev_server, ExecutionProcessStatus::Killed)
            .await
        {
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

    deployment
        .track_if_analytics_allowed(
            "dev_server_started",
            serde_json::json!({
                "task_id": task.id.to_string(),
                "project_id": project.id.to_string(),
                "attempt_id": task_attempt.id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(())))
}

pub async fn get_task_attempt_children(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<TaskRelationships>>, StatusCode> {
    match Task::find_relationships_for_attempt(&deployment.db().pool, &task_attempt).await {
        Ok(relationships) => {
            deployment
                .track_if_analytics_allowed(
                    "task_attempt_children_viewed",
                    serde_json::json!({
                        "attempt_id": task_attempt.id.to_string(),
                        "children_count": relationships.children.len(),
                        "parent_count": if relationships.parent_task.is_some() { 1 } else { 0 },
                    }),
                )
                .await;

            Ok(ResponseJson(ApiResponse::success(relationships)))
        }
        Err(e) => {
            tracing::error!(
                "Failed to fetch relationships for task attempt {}: {}",
                task_attempt.id,
                e
            );
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn stop_task_attempt_execution(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    deployment.container().try_stop(&task_attempt).await;

    deployment
        .track_if_analytics_allowed(
            "task_attempt_stopped",
            serde_json::json!({
                "attempt_id": task_attempt.id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(())))
}

#[derive(Debug, Serialize, TS)]
pub struct AttachPrResponse {
    pub pr_attached: bool,
    pub pr_url: Option<String>,
    pub pr_number: Option<i64>,
    pub pr_status: Option<MergeStatus>,
}

pub async fn attach_existing_pr(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<AttachPrResponse>>, ApiError> {
    let pool = &deployment.db().pool;

    // Check if PR already attached
    if let Some(Merge::Pr(pr_merge)) =
        Merge::find_latest_by_task_attempt_id(pool, task_attempt.id).await?
    {
        return Ok(ResponseJson(ApiResponse::success(AttachPrResponse {
            pr_attached: true,
            pr_url: Some(pr_merge.pr_info.url.clone()),
            pr_number: Some(pr_merge.pr_info.number),
            pr_status: Some(pr_merge.pr_info.status.clone()),
        })));
    }

    // Get project and repo info
    let Some(task) = task_attempt.parent_task(pool).await? else {
        return Err(ApiError::TaskAttempt(TaskAttemptError::TaskNotFound));
    };
    let Some(project) = Project::find_by_id(pool, task.project_id).await? else {
        return Err(ApiError::Project(ProjectError::ProjectNotFound));
    };
    let repo_path = get_first_repo_path(pool, project.id).await?;
    let target_branch = get_first_target_branch(pool, task_attempt.id).await?;

    let github_service = GitHubService::new()?;
    let repo_info = deployment.git().get_github_repo_info(&repo_path)?;

    // List all PRs for branch (open, closed, and merged)
    let prs = github_service
        .list_all_prs_for_branch(&repo_info, &task_attempt.branch)
        .await?;

    // Take the first PR (prefer open, but also accept merged/closed)
    if let Some(pr_info) = prs.into_iter().next() {
        // Save PR info to database
        let merge = Merge::create_pr(
            pool,
            task_attempt.id,
            &target_branch.branch_name(),
            pr_info.number,
            &pr_info.url,
        )
        .await?;

        // Update status if not open
        if !matches!(pr_info.status, MergeStatus::Open) {
            Merge::update_status(
                pool,
                merge.id,
                pr_info.status.clone(),
                pr_info.merge_commit_sha.clone(),
            )
            .await?;
        }

        // If PR is merged, mark task as done
        if matches!(pr_info.status, MergeStatus::Merged) {
            Task::update_status(pool, task.id, TaskStatus::Done).await?;

            // Try broadcast update to other users in organization
            if let Ok(publisher) = deployment.share_publisher() {
                if let Err(err) = publisher.update_shared_task_by_id(task.id).await {
                    tracing::warn!(
                        ?err,
                        "Failed to propagate shared task update for {}",
                        task.id
                    );
                }
            } else {
                tracing::debug!(
                    "Share publisher unavailable; skipping remote update for {}",
                    task.id
                );
            }
        }

        Ok(ResponseJson(ApiResponse::success(AttachPrResponse {
            pr_attached: true,
            pr_url: Some(pr_info.url),
            pr_number: Some(pr_info.number),
            pr_status: Some(pr_info.status),
        })))
    } else {
        Ok(ResponseJson(ApiResponse::success(AttachPrResponse {
            pr_attached: false,
            pr_url: None,
            pr_number: None,
            pr_status: None,
        })))
    }
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(tag = "type", rename_all = "snake_case")]
pub enum RunScriptError {
    NoScriptConfigured,
    ProcessAlreadyRunning,
}

#[axum::debug_handler]
pub async fn run_setup_script(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<ExecutionProcess, RunScriptError>>, ApiError> {
    // Check if any non-dev-server processes are already running
    if ExecutionProcess::has_running_non_dev_server_processes(
        &deployment.db().pool,
        task_attempt.id,
    )
    .await?
    {
        return Ok(ResponseJson(ApiResponse::error_with_data(
            RunScriptError::ProcessAlreadyRunning,
        )));
    }

    deployment
        .container()
        .ensure_container_exists(&task_attempt)
        .await?;

    // Get parent task and project
    let task = task_attempt
        .parent_task(&deployment.db().pool)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    let project = task
        .parent_project(&deployment.db().pool)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    // Check if setup script is configured
    let Some(setup_script) = project.setup_script else {
        return Ok(ResponseJson(ApiResponse::error_with_data(
            RunScriptError::NoScriptConfigured,
        )));
    };

    // Create and execute the setup script action
    let executor_action = ExecutorAction::new(
        ExecutorActionType::ScriptRequest(ScriptRequest {
            script: setup_script,
            language: ScriptRequestLanguage::Bash,
            context: ScriptContext::SetupScript,
        }),
        None,
    );

    let execution_process = deployment
        .container()
        .start_execution(
            &task_attempt,
            &executor_action,
            &ExecutionProcessRunReason::SetupScript,
        )
        .await?;

    deployment
        .track_if_analytics_allowed(
            "setup_script_executed",
            serde_json::json!({
                "task_id": task.id.to_string(),
                "project_id": project.id.to_string(),
                "attempt_id": task_attempt.id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(execution_process)))
}

#[axum::debug_handler]
pub async fn run_cleanup_script(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<ExecutionProcess, RunScriptError>>, ApiError> {
    // Check if any non-dev-server processes are already running
    if ExecutionProcess::has_running_non_dev_server_processes(
        &deployment.db().pool,
        task_attempt.id,
    )
    .await?
    {
        return Ok(ResponseJson(ApiResponse::error_with_data(
            RunScriptError::ProcessAlreadyRunning,
        )));
    }

    deployment
        .container()
        .ensure_container_exists(&task_attempt)
        .await?;

    // Get parent task and project
    let task = task_attempt
        .parent_task(&deployment.db().pool)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    let project = task
        .parent_project(&deployment.db().pool)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    // Check if cleanup script is configured
    let Some(cleanup_script) = project.cleanup_script else {
        return Ok(ResponseJson(ApiResponse::error_with_data(
            RunScriptError::NoScriptConfigured,
        )));
    };

    // Create and execute the cleanup script action
    let executor_action = ExecutorAction::new(
        ExecutorActionType::ScriptRequest(ScriptRequest {
            script: cleanup_script,
            language: ScriptRequestLanguage::Bash,
            context: ScriptContext::CleanupScript,
        }),
        None,
    );

    let execution_process = deployment
        .container()
        .start_execution(
            &task_attempt,
            &executor_action,
            &ExecutionProcessRunReason::CleanupScript,
        )
        .await?;

    deployment
        .track_if_analytics_allowed(
            "cleanup_script_executed",
            serde_json::json!({
                "task_id": task.id.to_string(),
                "project_id": project.id.to_string(),
                "attempt_id": task_attempt.id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(execution_process)))
}

#[axum::debug_handler]
pub async fn gh_cli_setup_handler(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<ExecutionProcess, GhCliSetupError>>, ApiError> {
    match gh_cli_setup::run_gh_cli_setup(&deployment, &task_attempt).await {
        Ok(execution_process) => {
            deployment
                .track_if_analytics_allowed(
                    "gh_cli_setup_executed",
                    serde_json::json!({
                        "attempt_id": task_attempt.id.to_string(),
                    }),
                )
                .await;

            Ok(ResponseJson(ApiResponse::success(execution_process)))
        }
        Err(ApiError::Executor(ExecutorError::ExecutableNotFound { program }))
            if program == "brew" =>
        {
            Ok(ResponseJson(ApiResponse::error_with_data(
                GhCliSetupError::BrewMissing,
            )))
        }
        Err(ApiError::Executor(ExecutorError::SetupHelperNotSupported)) => Ok(ResponseJson(
            ApiResponse::error_with_data(GhCliSetupError::SetupHelperNotSupported),
        )),
        Err(ApiError::Executor(err)) => Ok(ResponseJson(ApiResponse::error_with_data(
            GhCliSetupError::Other {
                message: err.to_string(),
            },
        ))),
        Err(err) => Err(err),
    }
}

pub async fn get_task_attempt_repos(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<Repo>>>, ApiError> {
    let pool = &deployment.db().pool;

    let repos = Repo::find_by_attempt_id(pool, task_attempt.id).await?;

    Ok(ResponseJson(ApiResponse::success(repos)))
}

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let task_attempt_id_router = Router::new()
        .route("/", get(get_task_attempt))
        .route("/follow-up", post(follow_up))
        .route("/run-agent-setup", post(run_agent_setup))
        .route("/gh-cli-setup", post(gh_cli_setup_handler))
        .route("/commit-compare", get(compare_commit_to_head))
        .route("/start-dev-server", post(start_dev_server))
        .route("/run-setup-script", post(run_setup_script))
        .route("/run-cleanup-script", post(run_cleanup_script))
        .route("/branch-status", get(get_task_attempt_branch_status))
        .route("/diff/ws", get(stream_task_attempt_diff_ws))
        .route("/merge", post(merge_task_attempt))
        .route("/push", post(push_task_attempt_branch))
        .route("/push/force", post(force_push_task_attempt_branch))
        .route("/rebase", post(rebase_task_attempt))
        .route("/conflicts/abort", post(abort_conflicts_task_attempt))
        .route("/pr", post(create_github_pr))
        .route("/pr/attach", post(attach_existing_pr))
        .route("/open-editor", post(open_task_attempt_in_editor))
        .route("/children", get(get_task_attempt_children))
        .route("/stop", post(stop_task_attempt_execution))
        .route("/change-target-branch", post(change_target_branch_ref))
        .route("/rename-branch", post(rename_branch))
        .route("/repos", get(get_task_attempt_repos))
        .layer(from_fn_with_state(
            deployment.clone(),
            load_task_attempt_middleware,
        ));

    let task_attempts_router = Router::new()
        .route("/", get(get_task_attempts).post(create_task_attempt))
        .nest("/{id}", task_attempt_id_router)
        .nest("/{id}/images", images::router(deployment))
        .nest("/{id}/queue", queue::router(deployment));

    Router::new().nest("/task-attempts", task_attempts_router)
}
