use std::path::PathBuf;

use api_types::{PullRequestStatus, UpsertPullRequestRequest};
use axum::{
    Extension, Json,
    extract::{Query, State},
    response::Json as ResponseJson,
};
use db::models::{
    coding_agent_turn::CodingAgentTurn,
    execution_process::{ExecutionProcess, ExecutionProcessRunReason},
    merge::{Merge, MergeStatus},
    project::Project,
    project_repo::ProjectRepo,
    repo::{Repo, RepoError},
    session::{CreateSession, Session},
    task::{CreateTask, Task, TaskStatus},
    workspace::{CreateWorkspace, Workspace, WorkspaceError},
    workspace_repo::{CreateWorkspaceRepo, WorkspaceRepo},
};
use deployment::Deployment;
use executors::actions::{
    ExecutorAction, ExecutorActionType, coding_agent_follow_up::CodingAgentFollowUpRequest,
    coding_agent_initial::CodingAgentInitialRequest,
};
use git::{GitCliError, GitRemote, GitServiceError};
use serde::{Deserialize, Serialize};
use services::services::{
    config::DEFAULT_PR_DESCRIPTION_PROMPT,
    container::ContainerService,
    git_host::{
        self, CreatePrRequest, GitHostError, GitHostProvider, ProviderKind, UnifiedPrComment,
        github::GhCli,
    },
    remote_sync,
    workspace_manager::WorkspaceManager,
};
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

#[derive(Debug, Deserialize, Serialize, TS)]
pub struct CreatePrApiRequest {
    pub title: String,
    pub body: Option<String>,
    pub target_branch: Option<String>,
    pub draft: Option<bool>,
    pub repo_id: Uuid,
    #[serde(default)]
    pub auto_generate_description: bool,
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(tag = "type", rename_all = "snake_case")]
pub enum PrError {
    CliNotInstalled { provider: ProviderKind },
    CliNotLoggedIn { provider: ProviderKind },
    GitCliNotLoggedIn,
    GitCliNotInstalled,
    TargetBranchNotFound { branch: String },
    UnsupportedProvider,
}

#[derive(Debug, Serialize, TS)]
pub struct AttachPrResponse {
    pub pr_attached: bool,
    pub pr_url: Option<String>,
    pub pr_number: Option<i64>,
    pub pr_status: Option<MergeStatus>,
}

#[derive(Debug, Deserialize, Serialize, TS)]
pub struct AttachExistingPrRequest {
    pub repo_id: Uuid,
}

#[derive(Debug, Serialize, TS)]
pub struct PrCommentsResponse {
    pub comments: Vec<UnifiedPrComment>,
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(tag = "type", rename_all = "snake_case")]
pub enum GetPrCommentsError {
    NoPrAttached,
    CliNotInstalled { provider: ProviderKind },
    CliNotLoggedIn { provider: ProviderKind },
}

#[derive(Debug, Deserialize, TS)]
pub struct GetPrCommentsQuery {
    pub repo_id: Uuid,
}

async fn trigger_pr_description_follow_up(
    deployment: &DeploymentImpl,
    workspace: &Workspace,
    pr_number: i64,
    pr_url: &str,
) -> Result<(), ApiError> {
    // Get the custom prompt from config, or use default
    let config = deployment.config().read().await;
    let prompt_template = config
        .pr_auto_description_prompt
        .as_deref()
        .unwrap_or(DEFAULT_PR_DESCRIPTION_PROMPT);

    // Replace placeholders in prompt
    let prompt = prompt_template
        .replace("{pr_number}", &pr_number.to_string())
        .replace("{pr_url}", pr_url);

    drop(config); // Release the lock before async operations

    // Get or create a session for this follow-up
    let session =
        match Session::find_latest_by_workspace_id(&deployment.db().pool, workspace.id).await? {
            Some(s) => s,
            None => {
                Session::create(
                    &deployment.db().pool,
                    &CreateSession { executor: None },
                    Uuid::new_v4(),
                    workspace.id,
                )
                .await?
            }
        };

    // Get executor profile from the latest coding agent process in this session
    let Some(executor_profile_id) =
        ExecutionProcess::latest_executor_profile_for_session(&deployment.db().pool, session.id)
            .await?
    else {
        tracing::warn!(
            "No executor profile found for session {}, skipping PR description follow-up",
            session.id
        );
        return Ok(());
    };

    // Get latest agent turn if one exists (for coding agent continuity)
    let latest_session_info =
        CodingAgentTurn::find_latest_session_info(&deployment.db().pool, session.id).await?;

    let working_dir = workspace
        .agent_working_dir
        .as_ref()
        .filter(|dir| !dir.is_empty())
        .cloned();

    // Build the action type (follow-up if session exists, otherwise initial)
    let action_type = if let Some(info) = latest_session_info {
        ExecutorActionType::CodingAgentFollowUpRequest(CodingAgentFollowUpRequest {
            prompt,
            session_id: info.session_id,
            reset_to_message_id: None,
            executor_profile_id: executor_profile_id.clone(),
            working_dir: working_dir.clone(),
        })
    } else {
        ExecutorActionType::CodingAgentInitialRequest(CodingAgentInitialRequest {
            prompt,
            executor_profile_id: executor_profile_id.clone(),
            working_dir,
        })
    };

    let action = ExecutorAction::new(action_type, None);

    deployment
        .container()
        .start_execution(
            workspace,
            &session,
            &action,
            &ExecutionProcessRunReason::CodingAgent,
        )
        .await?;

    Ok(())
}

pub async fn create_pr(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<CreatePrApiRequest>,
) -> Result<ResponseJson<ApiResponse<String, PrError>>, ApiError> {
    let pool = &deployment.db().pool;

    let workspace_repo =
        WorkspaceRepo::find_by_workspace_and_repo_id(pool, workspace.id, request.repo_id)
            .await?
            .ok_or(RepoError::NotFound)?;

    let repo = Repo::find_by_id(pool, workspace_repo.repo_id)
        .await?
        .ok_or(RepoError::NotFound)?;

    let repo_path = repo.path.clone();
    let target_branch = if let Some(branch) = request.target_branch {
        branch
    } else {
        workspace_repo.target_branch.clone()
    };

    let container_ref = deployment
        .container()
        .ensure_container_exists(&workspace)
        .await?;
    let workspace_path = PathBuf::from(&container_ref);
    let worktree_path = workspace_path.join(&repo.name);

    let git = deployment.git();
    let push_remote = git.resolve_remote_for_branch(&repo_path, &workspace.branch)?;

    // Try to get the remote from the branch name (works for remote-tracking branches like "upstream/main").
    // Fall back to push_remote if the branch doesn't exist locally or isn't a remote-tracking branch.
    let (target_remote, base_branch) =
        match git.get_remote_from_branch_name(&repo_path, &target_branch) {
            Ok(remote) => {
                let branch = target_branch
                    .strip_prefix(&format!("{}/", remote.name))
                    .unwrap_or(&target_branch);
                (remote, branch.to_string())
            }
            Err(_) => (push_remote.clone(), target_branch.clone()),
        };

    match git.check_remote_branch_exists(&repo_path, &target_remote.url, &base_branch) {
        Ok(false) => {
            return Ok(ResponseJson(ApiResponse::error_with_data(
                PrError::TargetBranchNotFound {
                    branch: target_branch.clone(),
                },
            )));
        }
        Err(GitServiceError::GitCLI(GitCliError::AuthFailed(_))) => {
            return Ok(ResponseJson(ApiResponse::error_with_data(
                PrError::GitCliNotLoggedIn,
            )));
        }
        Err(GitServiceError::GitCLI(GitCliError::NotAvailable)) => {
            return Ok(ResponseJson(ApiResponse::error_with_data(
                PrError::GitCliNotInstalled,
            )));
        }
        Err(e) => return Err(ApiError::GitService(e)),
        Ok(true) => {}
    }

    if let Err(e) = git.push_to_remote(&worktree_path, &workspace.branch, false) {
        tracing::error!("Failed to push branch to remote: {}", e);
        match e {
            GitServiceError::GitCLI(GitCliError::AuthFailed(_)) => {
                return Ok(ResponseJson(ApiResponse::error_with_data(
                    PrError::GitCliNotLoggedIn,
                )));
            }
            GitServiceError::GitCLI(GitCliError::NotAvailable) => {
                return Ok(ResponseJson(ApiResponse::error_with_data(
                    PrError::GitCliNotInstalled,
                )));
            }
            _ => return Err(ApiError::GitService(e)),
        }
    }

    let git_host = match git_host::GitHostService::from_url(&target_remote.url) {
        Ok(host) => host,
        Err(GitHostError::UnsupportedProvider) => {
            return Ok(ResponseJson(ApiResponse::error_with_data(
                PrError::UnsupportedProvider,
            )));
        }
        Err(GitHostError::CliNotInstalled { provider }) => {
            return Ok(ResponseJson(ApiResponse::error_with_data(
                PrError::CliNotInstalled { provider },
            )));
        }
        Err(e) => return Err(ApiError::GitHost(e)),
    };

    let provider = git_host.provider_kind();

    // Create the PR
    let pr_request = CreatePrRequest {
        title: request.title.clone(),
        body: request.body.clone(),
        head_branch: workspace.branch.clone(),
        base_branch: base_branch.clone(),
        draft: request.draft,
        head_repo_url: Some(push_remote.url.clone()),
    };

    match git_host
        .create_pr(&repo_path, &target_remote.url, &pr_request)
        .await
    {
        Ok(pr_info) => {
            // Update the workspace with PR information
            if let Err(e) = Merge::create_pr(
                pool,
                workspace.id,
                workspace_repo.repo_id,
                &base_branch,
                pr_info.number,
                &pr_info.url,
            )
            .await
            {
                tracing::error!("Failed to update workspace PR status: {}", e);
            }

            if let Ok(client) = deployment.remote_client() {
                let request = UpsertPullRequestRequest {
                    url: pr_info.url.clone(),
                    number: pr_info.number as i32,
                    status: PullRequestStatus::Open,
                    merged_at: None,
                    merge_commit_sha: None,
                    target_branch_name: base_branch.clone(),
                    local_workspace_id: workspace.id,
                };
                tokio::spawn(async move {
                    remote_sync::sync_pr_to_remote(&client, request).await;
                });
            }

            // Auto-open PR in browser
            if let Err(e) = utils::browser::open_browser(&pr_info.url).await {
                tracing::warn!("Failed to open PR in browser: {}", e);
            }

            deployment
                .track_if_analytics_allowed(
                    "pr_created",
                    serde_json::json!({
                        "workspace_id": workspace.id.to_string(),
                        "provider": format!("{:?}", provider),
                    }),
                )
                .await;

            // Trigger auto-description follow-up if enabled
            if request.auto_generate_description
                && let Err(e) = trigger_pr_description_follow_up(
                    &deployment,
                    &workspace,
                    pr_info.number,
                    &pr_info.url,
                )
                .await
            {
                tracing::warn!(
                    "Failed to trigger PR description follow-up for attempt {}: {}",
                    workspace.id,
                    e
                );
            }

            Ok(ResponseJson(ApiResponse::success(pr_info.url)))
        }
        Err(e) => {
            tracing::error!(
                "Failed to create PR for attempt {} using {:?}: {}",
                workspace.id,
                provider,
                e
            );
            match &e {
                GitHostError::CliNotInstalled { provider } => Ok(ResponseJson(
                    ApiResponse::error_with_data(PrError::CliNotInstalled {
                        provider: *provider,
                    }),
                )),
                GitHostError::AuthFailed(_) => Ok(ResponseJson(ApiResponse::error_with_data(
                    PrError::CliNotLoggedIn { provider },
                ))),
                _ => Err(ApiError::GitHost(e)),
            }
        }
    }
}

pub async fn attach_existing_pr(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<AttachExistingPrRequest>,
) -> Result<ResponseJson<ApiResponse<AttachPrResponse, PrError>>, ApiError> {
    let pool = &deployment.db().pool;

    let task = workspace
        .parent_task(pool)
        .await?
        .ok_or(ApiError::Workspace(WorkspaceError::TaskNotFound))?;

    let workspace_repo =
        WorkspaceRepo::find_by_workspace_and_repo_id(pool, workspace.id, request.repo_id)
            .await?
            .ok_or(RepoError::NotFound)?;

    let repo = Repo::find_by_id(pool, workspace_repo.repo_id)
        .await?
        .ok_or(RepoError::NotFound)?;

    // Check if PR already attached for this repo
    let merges = Merge::find_by_workspace_and_repo_id(pool, workspace.id, request.repo_id).await?;
    if let Some(Merge::Pr(pr_merge)) = merges.into_iter().next() {
        return Ok(ResponseJson(ApiResponse::success(AttachPrResponse {
            pr_attached: true,
            pr_url: Some(pr_merge.pr_info.url.clone()),
            pr_number: Some(pr_merge.pr_info.number),
            pr_status: Some(pr_merge.pr_info.status.clone()),
        })));
    }

    let git = deployment.git();
    let remote = git.resolve_remote_for_branch(&repo.path, &workspace_repo.target_branch)?;

    let git_host = match git_host::GitHostService::from_url(&remote.url) {
        Ok(host) => host,
        Err(GitHostError::UnsupportedProvider) => {
            return Ok(ResponseJson(ApiResponse::error_with_data(
                PrError::UnsupportedProvider,
            )));
        }
        Err(GitHostError::CliNotInstalled { provider }) => {
            return Ok(ResponseJson(ApiResponse::error_with_data(
                PrError::CliNotInstalled { provider },
            )));
        }
        Err(e) => return Err(ApiError::GitHost(e)),
    };

    let provider = git_host.provider_kind();

    // List all PRs for branch (open, closed, and merged)
    let prs = match git_host
        .list_prs_for_branch(&repo.path, &remote.url, &workspace.branch)
        .await
    {
        Ok(prs) => prs,
        Err(GitHostError::CliNotInstalled { provider }) => {
            return Ok(ResponseJson(ApiResponse::error_with_data(
                PrError::CliNotInstalled { provider },
            )));
        }
        Err(GitHostError::AuthFailed(_)) => {
            return Ok(ResponseJson(ApiResponse::error_with_data(
                PrError::CliNotLoggedIn { provider },
            )));
        }
        Err(e) => return Err(ApiError::GitHost(e)),
    };

    // Take the first PR (prefer open, but also accept merged/closed)
    if let Some(pr_info) = prs.into_iter().next() {
        // Save PR info to database
        let merge = Merge::create_pr(
            pool,
            workspace.id,
            workspace_repo.repo_id,
            &workspace_repo.target_branch,
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

        if let Ok(client) = deployment.remote_client() {
            let pr_status = match pr_info.status {
                MergeStatus::Open => PullRequestStatus::Open,
                MergeStatus::Merged => PullRequestStatus::Merged,
                MergeStatus::Closed => PullRequestStatus::Closed,
                MergeStatus::Unknown => PullRequestStatus::Open,
            };
            let request = UpsertPullRequestRequest {
                url: pr_info.url.clone(),
                number: pr_info.number as i32,
                status: pr_status,
                merged_at: None,
                merge_commit_sha: pr_info.merge_commit_sha.clone(),
                target_branch_name: workspace_repo.target_branch.clone(),
                local_workspace_id: workspace.id,
            };
            tokio::spawn(async move {
                remote_sync::sync_pr_to_remote(&client, request).await;
            });
        }

        // If PR is merged, mark task as done and archive workspace
        if matches!(pr_info.status, MergeStatus::Merged) {
            Task::update_status(pool, task.id, TaskStatus::Done).await?;
            if !workspace.pinned
                && let Err(e) = deployment.container().archive_workspace(workspace.id).await
            {
                tracing::error!("Failed to archive workspace {}: {}", workspace.id, e);
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

pub async fn get_pr_comments(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<GetPrCommentsQuery>,
) -> Result<ResponseJson<ApiResponse<PrCommentsResponse, GetPrCommentsError>>, ApiError> {
    let pool = &deployment.db().pool;

    // Look up the specific repo using the multi-repo pattern
    let workspace_repo =
        WorkspaceRepo::find_by_workspace_and_repo_id(pool, workspace.id, query.repo_id)
            .await?
            .ok_or(RepoError::NotFound)?;

    let repo = Repo::find_by_id(pool, workspace_repo.repo_id)
        .await?
        .ok_or(RepoError::NotFound)?;

    // Find the merge/PR for this specific repo
    let merges = Merge::find_by_workspace_and_repo_id(pool, workspace.id, query.repo_id).await?;

    // Ensure there's an attached PR for this repo
    let pr_info = match merges.into_iter().next() {
        Some(Merge::Pr(pr_merge)) => pr_merge.pr_info,
        _ => {
            return Ok(ResponseJson(ApiResponse::error_with_data(
                GetPrCommentsError::NoPrAttached,
            )));
        }
    };

    let git = deployment.git();
    let remote = git.resolve_remote_for_branch(&repo.path, &workspace_repo.target_branch)?;

    let git_host = match git_host::GitHostService::from_url(&remote.url) {
        Ok(host) => host,
        Err(GitHostError::CliNotInstalled { provider }) => {
            return Ok(ResponseJson(ApiResponse::error_with_data(
                GetPrCommentsError::CliNotInstalled { provider },
            )));
        }
        Err(e) => return Err(ApiError::GitHost(e)),
    };

    let provider = git_host.provider_kind();

    match git_host
        .get_pr_comments(&repo.path, &remote.url, pr_info.number)
        .await
    {
        Ok(comments) => Ok(ResponseJson(ApiResponse::success(PrCommentsResponse {
            comments,
        }))),
        Err(e) => {
            tracing::error!(
                "Failed to fetch PR comments for attempt {}, PR #{}: {}",
                workspace.id,
                pr_info.number,
                e
            );
            match &e {
                GitHostError::CliNotInstalled { provider } => Ok(ResponseJson(
                    ApiResponse::error_with_data(GetPrCommentsError::CliNotInstalled {
                        provider: *provider,
                    }),
                )),
                GitHostError::AuthFailed(_) => Ok(ResponseJson(ApiResponse::error_with_data(
                    GetPrCommentsError::CliNotLoggedIn { provider },
                ))),
                _ => Err(ApiError::GitHost(e)),
            }
        }
    }
}

#[derive(Debug, Serialize, Deserialize, TS)]
pub struct CreateWorkspaceFromPrBody {
    pub repo_id: Uuid,
    pub pr_number: i64,
    pub pr_title: String,
    pub pr_url: String,
    pub head_branch: String,
    pub base_branch: String,
    pub run_setup: bool,
    pub remote_name: Option<String>,
}

#[derive(Debug, Serialize, TS)]
pub struct CreateWorkspaceFromPrResponse {
    pub workspace: Workspace,
    pub task: Task,
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(tag = "type", rename_all = "snake_case")]
pub enum CreateFromPrError {
    PrNotFound,
    BranchFetchFailed { message: String },
    CliNotInstalled { provider: ProviderKind },
    AuthFailed { message: String },
    UnsupportedProvider,
    RepoNotInProject,
}

/// Best-effort cleanup of partially-created workspace resources.
/// Used when workspace creation from PR fails after DB records and filesystem
/// resources have already been created.
///
/// DB records are deleted synchronously (fast). Filesystem cleanup is spawned
/// as a background task to avoid blocking the error response.
async fn cleanup_failed_pr_workspace(
    pool: &sqlx::SqlitePool,
    workspace: &Workspace,
    task_id: Uuid,
) {
    let workspace_id = workspace.id;

    // Gather data needed for background filesystem cleanup before deleting DB records
    let workspace_dir = workspace.container_ref.clone().map(PathBuf::from);
    let repositories = match WorkspaceRepo::find_repos_for_workspace(pool, workspace_id).await {
        Ok(repos) => repos,
        Err(e) => {
            tracing::warn!(
                "Failed to find repos for workspace {} during cleanup: {}",
                workspace_id,
                e
            );
            vec![]
        }
    };

    // Delete the task — cascades to workspace → workspace_repos, sessions, merges, etc.
    if let Err(e) = Task::delete(pool, task_id).await {
        tracing::warn!("Failed to delete task {} during cleanup: {}", task_id, e);
    }

    // Spawn background cleanup for filesystem resources (worktrees, workspace dir)
    if let Some(workspace_dir) = workspace_dir {
        tokio::spawn(async move {
            if let Err(e) = WorkspaceManager::cleanup_workspace(&workspace_dir, &repositories).await
            {
                tracing::error!(
                    "Background cleanup failed for workspace {} at {}: {}",
                    workspace_id,
                    workspace_dir.display(),
                    e
                );
            }
        });
    }
}

#[axum::debug_handler]
pub async fn create_workspace_from_pr(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateWorkspaceFromPrBody>,
) -> Result<ResponseJson<ApiResponse<CreateWorkspaceFromPrResponse, CreateFromPrError>>, ApiError> {
    let pool = &deployment.db().pool;

    let repo = Repo::find_by_id(pool, payload.repo_id)
        .await?
        .ok_or(RepoError::NotFound)?;

    let project_repos = ProjectRepo::find_by_repo_id(pool, payload.repo_id).await?;
    let project_id = match project_repos.first() {
        Some(project_repo) => project_repo.project_id,
        None => {
            // Repo not associated with any project — fall back to the first available project
            tracing::warn!(
                "Repo {} is not associated with any project, falling back to first project",
                payload.repo_id
            );
            let projects = Project::find_all(pool).await?;
            match projects.first() {
                Some(project) => project.id,
                None => {
                    return Ok(ResponseJson(ApiResponse::error_with_data(
                        CreateFromPrError::RepoNotInProject,
                    )));
                }
            }
        }
    };

    let remote = match payload.remote_name {
        Some(ref name) => GitRemote {
            url: deployment.git().get_remote_url(&repo.path, name)?,
            name: name.clone(),
        },
        None => deployment.git().get_default_remote(&repo.path)?,
    };

    // Use target branch initially - we'll switch to PR branch via gh pr checkout
    let target_branch_ref = format!("{}/{}", remote.name, payload.base_branch);

    let task_id = Uuid::new_v4();
    let create_task = CreateTask {
        project_id,
        title: payload.pr_title.clone(),
        description: Some(format!(
            "Created from PR #{}: {}",
            payload.pr_number, payload.pr_url
        )),
        status: Some(TaskStatus::InProgress),
        parent_workspace_id: None,
        image_ids: None,
    };
    let task = Task::create(pool, &create_task, task_id).await?;

    let agent_working_dir = Some(repo.name.clone());

    // Create workspace with target branch initially
    let workspace_id = Uuid::new_v4();
    let mut workspace = Workspace::create(
        pool,
        &CreateWorkspace {
            branch: target_branch_ref.clone(),
            agent_working_dir,
        },
        workspace_id,
        task.id,
    )
    .await?;

    WorkspaceRepo::create_many(
        pool,
        workspace.id,
        &[CreateWorkspaceRepo {
            repo_id: payload.repo_id,
            target_branch: target_branch_ref.clone(),
        }],
    )
    .await?;

    let container_ref = deployment
        .container()
        .ensure_container_exists(&workspace)
        .await?;

    // Update workspace with container_ref so start_execution can find it
    workspace.container_ref = Some(container_ref.clone());

    // Use gh pr checkout to fetch and switch to the PR branch
    // This handles SSH/HTTPS auth correctly regardless of fork URL format
    let worktree_path = PathBuf::from(&container_ref).join(&repo.name);
    match GhCli::new().get_repo_info(&remote.url, &worktree_path) {
        Ok(repo_info) => {
            if let Err(e) = GhCli::new().pr_checkout(
                &worktree_path,
                &repo_info.owner,
                &repo_info.repo_name,
                payload.pr_number,
            ) {
                tracing::error!("Failed to checkout PR branch: {e}");
                cleanup_failed_pr_workspace(pool, &workspace, task.id).await;
                return Ok(ResponseJson(ApiResponse::error_with_data(
                    CreateFromPrError::BranchFetchFailed {
                        message: e.to_string(),
                    },
                )));
            }
            // Update workspace branch to the actual PR branch
            Workspace::update_branch_name(pool, workspace.id, &payload.head_branch).await?;
            workspace.branch = payload.head_branch.clone();
        }
        Err(e) => {
            tracing::error!(
                "Failed to get repo info for PR checkout (gh CLI may not be installed): {e}"
            );
            cleanup_failed_pr_workspace(pool, &workspace, task.id).await;
            return Ok(ResponseJson(ApiResponse::error_with_data(
                CreateFromPrError::BranchFetchFailed {
                    message: format!("Failed to get repository info: {e}"),
                },
            )));
        }
    }

    Merge::create_pr(
        pool,
        workspace.id,
        payload.repo_id,
        &format!("{}/{}", remote.name, payload.base_branch),
        payload.pr_number,
        &payload.pr_url,
    )
    .await?;

    if payload.run_setup {
        let repos = WorkspaceRepo::find_repos_for_workspace(pool, workspace.id).await?;
        if let Some(setup_action) = deployment.container().setup_actions_for_repos(&repos) {
            let session = Session::create(
                pool,
                &CreateSession { executor: None },
                Uuid::new_v4(),
                workspace.id,
            )
            .await?;

            if let Err(e) = deployment
                .container()
                .start_execution(
                    &workspace,
                    &session,
                    &setup_action,
                    &ExecutionProcessRunReason::SetupScript,
                )
                .await
            {
                tracing::error!("Failed to run setup script: {}", e);
            }
        }
    }

    deployment
        .track_if_analytics_allowed(
            "workspace_created_from_pr",
            serde_json::json!({
                "task_id": task.id.to_string(),
                "workspace_id": workspace.id.to_string(),
                "project_id": project_id.to_string(),
                "pr_number": payload.pr_number,
                "run_setup": payload.run_setup,
            }),
        )
        .await;

    tracing::info!(
        "Created workspace {} from PR #{} for task {}",
        workspace.id,
        payload.pr_number,
        task.id
    );

    let workspace = Workspace::find_by_id(pool, workspace.id)
        .await?
        .ok_or(WorkspaceError::TaskNotFound)?;

    Ok(ResponseJson(ApiResponse::success(
        CreateWorkspaceFromPrResponse { workspace, task },
    )))
}
