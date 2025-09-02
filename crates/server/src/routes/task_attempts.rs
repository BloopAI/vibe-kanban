use std::path::PathBuf;

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
    image::TaskImage,
    merge::{Merge, MergeStatus, PrMerge, PullRequestInfo},
    project::{Project, ProjectError},
    task::{Task, TaskStatus},
    task_attempt::{CreateTaskAttempt, TaskAttempt, TaskAttemptError},
};
use deployment::Deployment;
use executors::{
    actions::{
        coding_agent_follow_up::CodingAgentFollowUpRequest,
        script::{ScriptContext, ScriptRequest, ScriptRequestLanguage},
        ExecutorAction, ExecutorActionType,
    },
    profile::ExecutorProfileId,
};
use futures_util::TryStreamExt;
use git2::BranchType;
use serde::{Deserialize, Serialize};
use services::services::{
    container::ContainerService,
    github_service::{CreatePrRequest, GitHubService, GitHubServiceError},
    image::ImageService,
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
    /// Executor profile specification
    pub executor_profile_id: ExecutorProfileId,
    pub base_branch: String,
}

impl CreateTaskAttemptBody {
    /// Get the executor profile ID
    pub fn get_executor_profile_id(&self) -> ExecutorProfileId {
        self.executor_profile_id.clone()
    }
}

#[axum::debug_handler]
pub async fn create_task_attempt(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateTaskAttemptBody>,
) -> Result<ResponseJson<ApiResponse<TaskAttempt>>, ApiError> {
    let executor_profile_id = payload.get_executor_profile_id();

    let task_attempt = TaskAttempt::create(
        &deployment.db().pool,
        &CreateTaskAttempt {
            executor: executor_profile_id.executor,
            base_branch: payload.base_branch.clone(),
        },
        payload.task_id,
    )
    .await?;

    let execution_process = deployment
        .container()
        .start_attempt(&task_attempt, executor_profile_id.clone())
        .await?;

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

    tracing::info!("Started execution process {}", execution_process.id);

    Ok(ResponseJson(ApiResponse::success(task_attempt)))
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateFollowUpAttempt {
    pub prompt: String,
    pub variant: Option<String>,
    pub image_ids: Option<Vec<Uuid>>,
}

pub async fn follow_up(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateFollowUpAttempt>,
) -> Result<ResponseJson<ApiResponse<ExecutionProcess>>, ApiError> {
    tracing::info!("{:?}", task_attempt);

    // Ensure worktree exists (recreate if needed for cold task support)
    deployment
        .container()
        .ensure_container_exists(&task_attempt)
        .await?;

    // Get session_id with simple query
    let session_id = ExecutionProcess::find_latest_session_id_by_task_attempt(
        &deployment.db().pool,
        task_attempt.id,
    )
    .await?
    .ok_or(ApiError::TaskAttempt(TaskAttemptError::ValidationError(
        "Couldn't find a prior CodingAgent execution that already has a session_id".to_string(),
    )))?;

    // Get ExecutionProcess for profile data
    let latest_execution_process = ExecutionProcess::find_latest_by_task_attempt_and_run_reason(
        &deployment.db().pool,
        task_attempt.id,
        &ExecutionProcessRunReason::CodingAgent,
    )
    .await?
    .ok_or(ApiError::TaskAttempt(TaskAttemptError::ValidationError(
        "Couldn't find initial coding agent process, has it run yet?".to_string(),
    )))?;
    let initial_executor_profile_id = match &latest_execution_process
        .executor_action()
        .map_err(|e| ApiError::TaskAttempt(TaskAttemptError::ValidationError(e.to_string())))?
        .typ
    {
        ExecutorActionType::CodingAgentInitialRequest(request) => {
            Ok(request.executor_profile_id.clone())
        }
        ExecutorActionType::CodingAgentFollowUpRequest(request) => {
            Ok(request.executor_profile_id.clone())
        }
        _ => Err(ApiError::TaskAttempt(TaskAttemptError::ValidationError(
            "Couldn't find profile from initial request".to_string(),
        ))),
    }?;

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

    let mut prompt = payload.prompt;
    if let Some(image_ids) = &payload.image_ids {
        TaskImage::associate_many(&deployment.db().pool, task.id, image_ids).await?;

        // Copy new images from the image cache to the worktree
        if let Some(container_ref) = &task_attempt.container_ref {
            let worktree_path = std::path::PathBuf::from(container_ref);
            deployment
                .image()
                .copy_images_by_ids_to_worktree(&worktree_path, image_ids)
                .await?;

            // Update image paths in prompt with full worktree path
            prompt = ImageService::canonicalise_image_paths(&prompt, &worktree_path);
        }
    }

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

    let follow_up_request = CodingAgentFollowUpRequest {
        prompt,
        session_id,
        executor_profile_id,
    };

    let follow_up_action = ExecutorAction::new(
        ExecutorActionType::CodingAgentFollowUpRequest(follow_up_request),
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
    // ) -> Result<ResponseJson<ApiResponse<Diff>>, ApiError> {
) -> Result<Sse<impl futures_util::Stream<Item = Result<Event, BoxError>>>, ApiError> {
    let stream = deployment.container().get_diff(&task_attempt).await?;

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

    let merge_commit_id = deployment.git().merge_changes(
        &ctx.project.git_repo_path,
        worktree_path,
        branch_name,
        &ctx.task_attempt.base_branch,
        &commit_message,
    )?;

    Merge::create_direct(
        pool,
        task_attempt.id,
        &ctx.task_attempt.base_branch,
        &merge_commit_id,
    )
    .await?;
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

pub async fn push_task_attempt_branch(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let github_config = deployment.config().read().await.github.clone();
    let Some(github_token) = github_config.token() else {
        return Err(GitHubServiceError::TokenInvalid.into());
    };

    let github_service = GitHubService::new(&github_token)?;
    github_service.check_token().await?;

    let branch_name = task_attempt.branch.as_ref().ok_or_else(|| {
        ApiError::TaskAttempt(TaskAttemptError::ValidationError(
            "No branch found for task attempt".to_string(),
        ))
    })?;
    let ws_path = PathBuf::from(
        deployment
            .container()
            .ensure_container_exists(&task_attempt)
            .await?,
    );

    deployment
        .git()
        .push_to_github(&ws_path, branch_name, &github_token)?;
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
    let project = Project::find_by_id(pool, task.project_id)
        .await?
        .ok_or(ApiError::Project(ProjectError::ProjectNotFound))?;

    // Use GitService to get the remote URL, then create GitHubRepoInfo
    let repo_info = deployment
        .git()
        .get_github_repo_info(&project.git_repo_path)?;

    // Get branch name from task attempt
    let branch_name = task_attempt.branch.as_ref().ok_or_else(|| {
        ApiError::TaskAttempt(TaskAttemptError::ValidationError(
            "No branch found for task attempt".to_string(),
        ))
    })?;
    let workspace_path = PathBuf::from(
        deployment
            .container()
            .ensure_container_exists(&task_attempt)
            .await?,
    );

    // Push the branch to GitHub first
    if let Err(e) = deployment
        .git()
        .push_to_github(&workspace_path, branch_name, &github_token)
    {
        tracing::error!("Failed to push branch to GitHub: {}", e);
        let gh_e = GitHubServiceError::from(e);
        if gh_e.is_api_data() {
            return Ok(ResponseJson(ApiResponse::error_with_data(gh_e)));
        } else {
            return Ok(ResponseJson(ApiResponse::error(
                format!("Failed to push branch to GitHub: {}", gh_e).as_str(),
            )));
        }
    }

    let norm_base_branch_name = if matches!(
        deployment
            .git()
            .find_branch_type(&project.git_repo_path, &base_branch)?,
        BranchType::Remote
    ) {
        // Remote branches are formatted as {remote}/{branch} locally.
        // For PR APIs, we must provide just the branch name.
        let remote = deployment
            .git()
            .get_remote_name_from_branch_name(&workspace_path, &base_branch)?;
        let remote_prefix = format!("{}/", remote);
        base_branch
            .strip_prefix(&remote_prefix)
            .unwrap_or(&base_branch)
            .to_string()
    } else {
        base_branch
    };
    // Create the PR using GitHub service
    let pr_request = CreatePrRequest {
        title: request.title.clone(),
        body: request.body.clone(),
        head_branch: branch_name.clone(),
        base_branch: norm_base_branch_name.clone(),
    };

    match github_service.create_pr(&repo_info, &pr_request).await {
        Ok(pr_info) => {
            // Update the task attempt with PR information
            if let Err(e) = Merge::create_pr(
                pool,
                task_attempt.id,
                &norm_base_branch_name,
                pr_info.number,
                &pr_info.url,
            )
            .await
            {
                tracing::error!("Failed to update task attempt PR status: {}", e);
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
            if e.is_api_data() {
                Ok(ResponseJson(ApiResponse::error_with_data(e)))
            } else {
                Ok(ResponseJson(ApiResponse::error(
                    format!("Failed to create PR: {}", e).as_str(),
                )))
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

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct BranchStatus {
    pub commits_behind: Option<usize>,
    pub commits_ahead: Option<usize>,
    pub has_uncommitted_changes: Option<bool>,
    pub base_branch_name: String,
    pub remote_commits_behind: Option<usize>,
    pub remote_commits_ahead: Option<usize>,
    pub merges: Vec<Merge>,
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
    let has_uncommitted_changes = deployment
        .container()
        .is_container_clean(&task_attempt)
        .await
        .ok()
        .map(|is_clean| !is_clean);

    let task_branch =
        task_attempt
            .branch
            .ok_or(ApiError::TaskAttempt(TaskAttemptError::ValidationError(
                "No branch found for task attempt".to_string(),
            )))?;
    let base_branch_type = deployment
        .git()
        .find_branch_type(&ctx.project.git_repo_path, &task_attempt.base_branch)?;

    let (commits_ahead, commits_behind) = if matches!(base_branch_type, BranchType::Local) {
        let (a, b) = deployment.git().get_branch_status(
            &ctx.project.git_repo_path,
            &task_branch,
            &task_attempt.base_branch,
        )?;
        (Some(a), Some(b))
    } else {
        (None, None)
    };
    // Fetch merges for this task attempt and add to branch status
    let merges = Merge::find_by_task_attempt_id(pool, task_attempt.id).await?;
    let mut branch_status = BranchStatus {
        commits_ahead,
        commits_behind,
        has_uncommitted_changes,
        remote_commits_ahead: None,
        remote_commits_behind: None,
        merges,
        base_branch_name: task_attempt.base_branch.clone(),
    };
    let has_open_pr = branch_status.merges.first().is_some_and(|m| {
        matches!(
            m,
            Merge::Pr(PrMerge {
                pr_info: PullRequestInfo {
                    status: MergeStatus::Open,
                    ..
                },
                ..
            })
        )
    });

    // check remote status if the attempt has an open PR or the base_branch is a remote branch
    if has_open_pr || base_branch_type == BranchType::Remote {
        let github_config = deployment.config().read().await.github.clone();
        let token = github_config
            .token()
            .ok_or(ApiError::GitHubService(GitHubServiceError::TokenInvalid))?;

        // For an attempt with a remote base branch, we compare against that
        // After opening a PR, the attempt has a remote branch itself, so we use that
        let remote_base_branch = if base_branch_type == BranchType::Remote && !has_open_pr {
            Some(task_attempt.base_branch)
        } else {
            None
        };
        let (remote_commits_ahead, remote_commits_behind) =
            deployment.git().get_remote_branch_status(
                &ctx.project.git_repo_path,
                &task_branch,
                remote_base_branch.as_deref(),
                token,
            )?;
        branch_status.remote_commits_ahead = Some(remote_commits_ahead);
        branch_status.remote_commits_behind = Some(remote_commits_behind);
    }
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

    let github_config = deployment.config().read().await.github.clone();

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

    let _new_base_commit = deployment.git().rebase_branch(
        &ctx.project.git_repo_path,
        worktree_path,
        effective_base_branch.clone().as_deref(),
        &ctx.task_attempt.base_branch.clone(),
        github_config.token(),
    )?;

    if let Some(new_base_branch) = &effective_base_branch {
        if new_base_branch != &ctx.task_attempt.base_branch {
            TaskAttempt::update_base_branch(
                &deployment.db().pool,
                task_attempt.id,
                new_base_branch,
            )
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
    let _commit_id = deployment
        .git()
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
        .route("/push", post(push_task_attempt_branch))
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
