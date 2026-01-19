use std::path::PathBuf;

use axum::{
    Extension, Json,
    extract::{Query, State},
    response::Json as ResponseJson,
};
use db::models::{
    execution_process::{ExecutionProcess, ExecutionProcessRunReason},
    merge::{Merge, MergeStatus},
    repo::{Repo, RepoError},
    session::{CreateSession, Session},
    task::{Task, TaskStatus},
    workspace::{Workspace, WorkspaceError},
    workspace_repo::WorkspaceRepo,
};
use deployment::Deployment;
use executors::actions::{
    ExecutorAction, ExecutorActionType, coding_agent_follow_up::CodingAgentFollowUpRequest,
    coding_agent_initial::CodingAgentInitialRequest,
};
use serde::{Deserialize, Serialize};
use services::services::{
    container::ContainerService,
    git::{GitCliError, GitServiceError},
    git_host::{
        self, CreatePrRequest, GitHostError, GitHostProvider, ProviderKind, UnifiedPrComment,
    },
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

pub const DEFAULT_PR_DESCRIPTION_PROMPT: &str = r#"Update the PR that was just created with a better title and description.
The PR number is #{pr_number} and the URL is {pr_url}.

Analyze the changes in this branch and write:
1. A concise, descriptive title that summarizes the changes, postfixed with "(Vibe Kanban)"
2. A detailed description that explains:
   - What changes were made
   - Why they were made (based on the task context)
   - Any important implementation details
   - At the end, include a note: "This PR was written using [Vibe Kanban](https://vibekanban.com)"

Use the appropriate CLI tool to update the PR (gh pr edit for GitHub, az repos pr update for Azure DevOps)."#;

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

    // Get latest agent session ID if one exists (for coding agent continuity)
    let latest_agent_session_id = ExecutionProcess::find_latest_coding_agent_turn_session_id(
        &deployment.db().pool,
        session.id,
    )
    .await?;

    let working_dir = workspace
        .agent_working_dir
        .as_ref()
        .filter(|dir| !dir.is_empty())
        .cloned();

    // Build the action type (follow-up if session exists, otherwise initial)
    let action_type = if let Some(agent_session_id) = latest_agent_session_id {
        ExecutorActionType::CodingAgentFollowUpRequest(CodingAgentFollowUpRequest {
            prompt,
            session_id: agent_session_id,
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
    let push_remote = git.resolve_remote_name_for_branch(&repo_path, &workspace.branch)?;

    // Try to get the remote from the branch name (works for remote-tracking branches like "upstream/main").
    // Fall back to push_remote if the branch doesn't exist locally or isn't a remote-tracking branch.
    let (target_remote, base_branch) =
        match git.get_remote_name_from_branch_name(&repo_path, &target_branch) {
            Ok(remote) => {
                let branch = target_branch
                    .strip_prefix(&format!("{remote}/"))
                    .unwrap_or(&target_branch);
                (remote, branch.to_string())
            }
            Err(_) => (push_remote.clone(), target_branch.clone()),
        };

    let push_remote_url = git.get_remote_url(&repo_path, &push_remote)?;
    let target_remote_url = git.get_remote_url(&repo_path, &target_remote)?;

    match git.check_remote_branch_exists(&repo_path, &target_remote_url, &base_branch) {
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

    let git_host = match git_host::GitHostService::from_url(&target_remote_url) {
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
        head_repo_url: Some(push_remote_url),
    };

    match git_host
        .create_pr(&repo_path, &target_remote_url, &pr_request)
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
    let remote_url = git.get_remote_url(
        &repo.path,
        &git.resolve_remote_name_for_branch(&repo.path, &workspace_repo.target_branch)?,
    )?;

    let git_host = match git_host::GitHostService::from_url(&remote_url) {
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
        .list_prs_for_branch(&repo.path, &remote_url, &workspace.branch)
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

        // If PR is merged, mark task as done and archive workspace
        if matches!(pr_info.status, MergeStatus::Merged) {
            Task::update_status(pool, task.id, TaskStatus::Done).await?;
            if !workspace.pinned {
                Workspace::set_archived(pool, workspace.id, true).await?;
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
    let remote_url = git.get_remote_url(
        &repo.path,
        &git.resolve_remote_name_for_branch(&repo.path, &workspace_repo.target_branch)?,
    )?;

    let git_host = match git_host::GitHostService::from_url(&remote_url) {
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
        .get_pr_comments(&repo.path, &remote_url, pr_info.number)
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
