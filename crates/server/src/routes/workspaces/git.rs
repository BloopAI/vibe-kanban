use std::{
    collections::HashMap,
    path::{Path, PathBuf},
};

use axum::{
    Extension, Json, Router,
    extract::State,
    response::{IntoResponse, Json as ResponseJson},
    routing::{get, post},
};
use db::models::{
    merge::{Merge, MergeStatus, PrMerge, PullRequestInfo},
    repo::{Repo, RepoError},
    workspace::Workspace,
    workspace_repo::WorkspaceRepo,
};
use deployment::Deployment;
use git::{ConflictOp, GitCliError, GitServiceError};
use git2::BranchType;
use serde::{Deserialize, Serialize};
use services::services::{container::ContainerService, diff_stream, remote_sync};
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use super::streams::{DiffStreamQuery, stream_workspace_diff_ws};
use crate::{DeploymentImpl, error::ApiError, middleware::signed_ws::SignedWsUpgrade};

#[derive(Debug, Deserialize, Serialize, TS)]
pub struct RebaseWorkspaceRequest {
    pub repo_id: Uuid,
    pub old_base_branch: Option<String>,
    pub new_base_branch: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, TS)]
pub struct AbortConflictsRequest {
    pub repo_id: Uuid,
}

#[derive(Debug, Deserialize, Serialize, TS)]
pub struct ContinueRebaseRequest {
    pub repo_id: Uuid,
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(tag = "type", rename_all = "snake_case")]
pub enum GitOperationError {
    MergeConflicts {
        message: String,
        op: ConflictOp,
        conflicted_files: Vec<String>,
        target_branch: String,
    },
    RebaseInProgress,
}

#[derive(Debug, Deserialize, Serialize, TS)]
pub struct MergeWorkspaceRequest {
    pub repo_id: Uuid,
}

#[derive(Debug, Deserialize, Serialize, TS)]
pub struct PushWorkspaceRequest {
    pub repo_id: Uuid,
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(tag = "type", rename_all = "snake_case")]
pub enum PushError {
    ForcePushRequired,
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
    pub is_rebase_in_progress: bool,
    pub conflict_op: Option<ConflictOp>,
    pub conflicted_files: Vec<String>,
    pub is_target_remote: bool,
}

#[derive(Debug, Clone, Serialize, TS)]
pub struct RepoBranchStatus {
    pub repo_id: Uuid,
    pub repo_name: String,
    #[serde(flatten)]
    pub status: BranchStatus,
}

#[derive(Deserialize, Debug, TS)]
pub struct ChangeTargetBranchRequest {
    pub repo_id: Uuid,
    pub new_target_branch: String,
}

#[derive(Serialize, Debug, TS)]
pub struct ChangeTargetBranchResponse {
    pub repo_id: Uuid,
    pub new_target_branch: String,
    pub status: (usize, usize),
}

#[derive(Deserialize, Debug, TS)]
pub struct RenameBranchRequest {
    pub new_branch_name: String,
}

#[derive(Serialize, Debug, TS)]
pub struct RenameBranchResponse {
    pub branch: String,
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(tag = "type", rename_all = "snake_case")]
pub enum RenameBranchError {
    EmptyBranchName,
    InvalidBranchNameFormat,
    OpenPullRequest,
    BranchAlreadyExists { repo_name: String },
    RebaseInProgress { repo_name: String },
    RenameFailed { repo_name: String, message: String },
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/status", get(get_workspace_branch_status))
        .route("/diff/ws", get(stream_diff_ws))
        .route("/merge", post(merge_workspace))
        .route("/push", post(push_workspace_branch))
        .route("/push/force", post(force_push_workspace_branch))
        .route("/rebase", post(rebase_workspace))
        .route("/rebase/continue", post(continue_workspace_rebase))
        .route("/conflicts/abort", post(abort_workspace_conflicts))
        .route("/target-branch", axum::routing::put(change_target_branch))
        .route("/branch", axum::routing::put(rename_branch))
}

async fn resolve_vibe_kanban_identifier(
    deployment: &DeploymentImpl,
    local_workspace_id: Uuid,
) -> String {
    if let Ok(client) = deployment.remote_client()
        && let Ok(remote_ws) = client.get_workspace_by_local_id(local_workspace_id).await
        && let Some(issue_id) = remote_ws.issue_id
        && let Ok(issue) = client.get_issue(issue_id).await
    {
        if !issue.simple_id.is_empty() {
            return issue.simple_id;
        }
        return issue_id.to_string();
    }
    local_workspace_id.to_string()
}

#[axum::debug_handler]
pub async fn stream_diff_ws(
    ws: SignedWsUpgrade,
    query: axum::extract::Query<DiffStreamQuery>,
    workspace: Extension<Workspace>,
    deployment: State<DeploymentImpl>,
) -> impl IntoResponse {
    stream_workspace_diff_ws(ws, query, workspace, deployment).await
}

#[axum::debug_handler]
pub async fn merge_workspace(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<MergeWorkspaceRequest>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let pool = &deployment.db().pool;

    let workspace_repo =
        WorkspaceRepo::find_by_workspace_and_repo_id(pool, workspace.id, request.repo_id)
            .await?
            .ok_or(RepoError::NotFound)?;

    let repo = Repo::find_by_id(pool, workspace_repo.repo_id)
        .await?
        .ok_or(RepoError::NotFound)?;

    let merges = Merge::find_by_workspace_and_repo_id(pool, workspace.id, request.repo_id).await?;
    let has_open_pr = merges
        .iter()
        .any(|m| matches!(m, Merge::Pr(pr) if matches!(pr.pr_info.status, MergeStatus::Open)));
    if has_open_pr {
        return Err(ApiError::BadRequest(
            "Cannot merge directly when a pull request is open for this repository.".to_string(),
        ));
    }

    let target_branch_type = deployment
        .git()
        .find_branch_type(&repo.path, &workspace_repo.target_branch)?;
    if target_branch_type == BranchType::Remote {
        return Err(ApiError::BadRequest(
            "Cannot merge directly into a remote branch. Please create a pull request instead."
                .to_string(),
        ));
    }

    let container_ref = deployment
        .container()
        .ensure_container_exists(&workspace)
        .await?;
    let workspace_path = Path::new(&container_ref);
    let worktree_path = workspace_path.join(repo.name);

    let workspace_label = workspace.name.as_deref().unwrap_or(&workspace.branch);
    let vk_id = resolve_vibe_kanban_identifier(&deployment, workspace.id).await;
    let commit_message = format!("{} (vibe-kanban {})", workspace_label, vk_id);

    let merge_commit_id = deployment.git().merge_changes(
        &repo.path,
        &worktree_path,
        &workspace.branch,
        &workspace_repo.target_branch,
        &commit_message,
    )?;

    Merge::create_direct(
        pool,
        workspace.id,
        workspace_repo.repo_id,
        &workspace_repo.target_branch,
        &merge_commit_id,
    )
    .await?;

    if let Ok(client) = deployment.remote_client() {
        let workspace_id = workspace.id;
        tokio::spawn(async move {
            remote_sync::sync_local_workspace_merge_to_remote(&client, workspace_id).await;
        });
    }

    if !workspace.pinned
        && let Err(e) = deployment.container().archive_workspace(workspace.id).await
    {
        tracing::error!("Failed to archive workspace {}: {}", workspace.id, e);
    }

    deployment
        .track_if_analytics_allowed(
            "task_attempt_merged",
            serde_json::json!({
                "workspace_id": workspace.id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(())))
}

pub async fn push_workspace_branch(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<PushWorkspaceRequest>,
) -> Result<ResponseJson<ApiResponse<(), PushError>>, ApiError> {
    let pool = &deployment.db().pool;

    let workspace_repo =
        WorkspaceRepo::find_by_workspace_and_repo_id(pool, workspace.id, request.repo_id)
            .await?
            .ok_or(RepoError::NotFound)?;

    let repo = Repo::find_by_id(pool, workspace_repo.repo_id)
        .await?
        .ok_or(RepoError::NotFound)?;

    let container_ref = deployment
        .container()
        .ensure_container_exists(&workspace)
        .await?;
    let workspace_path = Path::new(&container_ref);
    let worktree_path = workspace_path.join(&repo.name);

    match deployment
        .git()
        .push_to_remote(&worktree_path, &workspace.branch, false)
    {
        Ok(_) => {
            if let Ok(client) = deployment.remote_client() {
                let pool = deployment.db().pool.clone();
                let git = deployment.git().clone();
                let mut ws = workspace.clone();
                ws.container_ref = Some(container_ref.clone());
                tokio::spawn(async move {
                    let stats = diff_stream::compute_diff_stats(&pool, &git, &ws).await;
                    remote_sync::sync_workspace_to_remote(
                        &client,
                        ws.id,
                        None,
                        None,
                        stats.as_ref(),
                    )
                    .await;
                });
            }
            Ok(ResponseJson(ApiResponse::success(())))
        }
        Err(GitServiceError::GitCLI(GitCliError::PushRejected(_))) => Ok(ResponseJson(
            ApiResponse::error_with_data(PushError::ForcePushRequired),
        )),
        Err(e) => Err(ApiError::GitService(e)),
    }
}

pub async fn force_push_workspace_branch(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<PushWorkspaceRequest>,
) -> Result<ResponseJson<ApiResponse<(), PushError>>, ApiError> {
    let pool = &deployment.db().pool;

    let workspace_repo =
        WorkspaceRepo::find_by_workspace_and_repo_id(pool, workspace.id, request.repo_id)
            .await?
            .ok_or(RepoError::NotFound)?;

    let repo = Repo::find_by_id(pool, workspace_repo.repo_id)
        .await?
        .ok_or(RepoError::NotFound)?;

    let container_ref = deployment
        .container()
        .ensure_container_exists(&workspace)
        .await?;
    let workspace_path = Path::new(&container_ref);
    let worktree_path = workspace_path.join(&repo.name);

    deployment
        .git()
        .push_to_remote(&worktree_path, &workspace.branch, true)?;

    if let Ok(client) = deployment.remote_client() {
        let pool = deployment.db().pool.clone();
        let git = deployment.git().clone();
        let mut ws = workspace.clone();
        ws.container_ref = Some(container_ref.clone());
        tokio::spawn(async move {
            let stats = diff_stream::compute_diff_stats(&pool, &git, &ws).await;
            remote_sync::sync_workspace_to_remote(&client, ws.id, None, None, stats.as_ref()).await;
        });
    }

    Ok(ResponseJson(ApiResponse::success(())))
}

pub async fn get_workspace_branch_status(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<RepoBranchStatus>>>, ApiError> {
    let pool = &deployment.db().pool;

    let repositories = WorkspaceRepo::find_repos_for_workspace(pool, workspace.id).await?;
    let workspace_repos = WorkspaceRepo::find_by_workspace_id(pool, workspace.id).await?;
    let target_branches: HashMap<_, _> = workspace_repos
        .iter()
        .map(|wr| (wr.repo_id, wr.target_branch.clone()))
        .collect();

    let container_ref = deployment
        .container()
        .ensure_container_exists(&workspace)
        .await?;
    let workspace_dir = PathBuf::from(&container_ref);

    let all_merges = Merge::find_by_workspace_id(pool, workspace.id).await?;
    let merges_by_repo: HashMap<Uuid, Vec<Merge>> =
        all_merges
            .into_iter()
            .fold(HashMap::new(), |mut acc, merge| {
                let repo_id = match &merge {
                    Merge::Direct(dm) => dm.repo_id,
                    Merge::Pr(pm) => pm.repo_id,
                };
                acc.entry(repo_id).or_insert_with(Vec::new).push(merge);
                acc
            });

    let mut results = Vec::with_capacity(repositories.len());

    for repo in repositories {
        let Some(target_branch) = target_branches.get(&repo.id).cloned() else {
            continue;
        };

        let repo_merges = merges_by_repo.get(&repo.id).cloned().unwrap_or_default();
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

        let target_branch_type = deployment
            .git()
            .find_branch_type(&repo.path, &target_branch)?;

        let (commits_ahead, commits_behind) = match target_branch_type {
            BranchType::Local => {
                let (a, b) = deployment.git().get_branch_status(
                    &repo.path,
                    &workspace.branch,
                    &target_branch,
                )?;
                (Some(a), Some(b))
            }
            BranchType::Remote => {
                let (ahead, behind) = deployment.git().get_remote_branch_status(
                    &repo.path,
                    &workspace.branch,
                    Some(&target_branch),
                )?;
                (Some(ahead), Some(behind))
            }
        };

        let (remote_ahead, remote_behind) = if let Some(Merge::Pr(PrMerge {
            pr_info:
                PullRequestInfo {
                    status: MergeStatus::Open,
                    ..
                },
            ..
        })) = repo_merges.first()
        {
            match deployment
                .git()
                .get_remote_branch_status(&repo.path, &workspace.branch, None)
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
                merges: repo_merges,
                target_branch_name: target_branch,
                is_rebase_in_progress,
                conflict_op,
                conflicted_files,
                is_target_remote: target_branch_type == BranchType::Remote,
            },
        });
    }

    Ok(ResponseJson(ApiResponse::success(results)))
}

#[axum::debug_handler]
pub async fn change_target_branch(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<ChangeTargetBranchRequest>,
) -> Result<ResponseJson<ApiResponse<ChangeTargetBranchResponse>>, ApiError> {
    let repo_id = payload.repo_id;
    let new_target_branch = payload.new_target_branch;
    let pool = &deployment.db().pool;

    let repo = Repo::find_by_id(pool, repo_id)
        .await?
        .ok_or(RepoError::NotFound)?;

    if !deployment
        .git()
        .check_branch_exists(&repo.path, &new_target_branch)?
    {
        return Ok(ResponseJson(ApiResponse::error(
            format!(
                "Branch '{}' does not exist in repository '{}'",
                new_target_branch, repo.name
            )
            .as_str(),
        )));
    };

    WorkspaceRepo::update_target_branch(pool, workspace.id, repo_id, &new_target_branch).await?;

    let status =
        deployment
            .git()
            .get_branch_status(&repo.path, &workspace.branch, &new_target_branch)?;

    deployment
        .track_if_analytics_allowed(
            "task_attempt_target_branch_changed",
            serde_json::json!({
                "repo_id": repo_id.to_string(),
                "workspace_id": workspace.id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(
        ChangeTargetBranchResponse {
            repo_id,
            new_target_branch,
            status,
        },
    )))
}

#[axum::debug_handler]
pub async fn rename_branch(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<RenameBranchRequest>,
) -> Result<ResponseJson<ApiResponse<RenameBranchResponse, RenameBranchError>>, ApiError> {
    let new_branch_name = payload.new_branch_name.trim();

    if new_branch_name.is_empty() {
        return Ok(ResponseJson(ApiResponse::error_with_data(
            RenameBranchError::EmptyBranchName,
        )));
    }
    if !deployment.git().is_branch_name_valid(new_branch_name) {
        return Ok(ResponseJson(ApiResponse::error_with_data(
            RenameBranchError::InvalidBranchNameFormat,
        )));
    }
    if new_branch_name == workspace.branch {
        return Ok(ResponseJson(ApiResponse::success(RenameBranchResponse {
            branch: workspace.branch.clone(),
        })));
    }

    let pool = &deployment.db().pool;

    let merges = Merge::find_by_workspace_id(pool, workspace.id).await?;
    let has_open_pr = merges.into_iter().any(|merge| {
        matches!(merge, Merge::Pr(pr_merge) if matches!(pr_merge.pr_info.status, MergeStatus::Open))
    });
    if has_open_pr {
        return Ok(ResponseJson(ApiResponse::error_with_data(
            RenameBranchError::OpenPullRequest,
        )));
    }

    let repos = WorkspaceRepo::find_repos_for_workspace(pool, workspace.id).await?;
    let container_ref = deployment
        .container()
        .ensure_container_exists(&workspace)
        .await?;
    let workspace_dir = PathBuf::from(&container_ref);

    for repo in &repos {
        let worktree_path = workspace_dir.join(&repo.name);

        if deployment
            .git()
            .check_branch_exists(&repo.path, new_branch_name)?
        {
            return Ok(ResponseJson(ApiResponse::error_with_data(
                RenameBranchError::BranchAlreadyExists {
                    repo_name: repo.name.clone(),
                },
            )));
        }

        if deployment.git().is_rebase_in_progress(&worktree_path)? {
            return Ok(ResponseJson(ApiResponse::error_with_data(
                RenameBranchError::RebaseInProgress {
                    repo_name: repo.name.clone(),
                },
            )));
        }
    }

    let old_branch = workspace.branch.clone();
    let mut renamed_repos: Vec<&Repo> = Vec::new();

    for repo in &repos {
        let worktree_path = workspace_dir.join(&repo.name);

        match deployment.git().rename_local_branch(
            &worktree_path,
            &workspace.branch,
            new_branch_name,
        ) {
            Ok(()) => {
                renamed_repos.push(repo);
            }
            Err(e) => {
                for renamed_repo in &renamed_repos {
                    let rollback_path = workspace_dir.join(&renamed_repo.name);
                    if let Err(rollback_err) = deployment.git().rename_local_branch(
                        &rollback_path,
                        new_branch_name,
                        &old_branch,
                    ) {
                        tracing::error!(
                            "Failed to rollback branch rename in '{}': {}",
                            renamed_repo.name,
                            rollback_err
                        );
                    }
                }
                return Ok(ResponseJson(ApiResponse::error_with_data(
                    RenameBranchError::RenameFailed {
                        repo_name: repo.name.clone(),
                        message: e.to_string(),
                    },
                )));
            }
        }
    }

    db::models::workspace::Workspace::update_branch_name(pool, workspace.id, new_branch_name)
        .await?;
    let updated_children_count = WorkspaceRepo::update_target_branch_for_children_of_workspace(
        pool,
        workspace.id,
        &old_branch,
        new_branch_name,
    )
    .await?;

    if updated_children_count > 0 {
        tracing::info!(
            "Updated {} child workspaces to target new branch '{}'",
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
pub async fn rebase_workspace(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<RebaseWorkspaceRequest>,
) -> Result<ResponseJson<ApiResponse<(), GitOperationError>>, ApiError> {
    let pool = &deployment.db().pool;

    let workspace_repo =
        WorkspaceRepo::find_by_workspace_and_repo_id(pool, workspace.id, payload.repo_id)
            .await?
            .ok_or(RepoError::NotFound)?;

    let repo = Repo::find_by_id(pool, workspace_repo.repo_id)
        .await?
        .ok_or(RepoError::NotFound)?;

    let old_base_branch = payload
        .old_base_branch
        .unwrap_or_else(|| workspace_repo.target_branch.clone());
    let new_base_branch = payload
        .new_base_branch
        .unwrap_or_else(|| workspace_repo.target_branch.clone());

    match deployment
        .git()
        .check_branch_exists(&repo.path, &new_base_branch)?
    {
        true => {
            WorkspaceRepo::update_target_branch(
                pool,
                workspace.id,
                payload.repo_id,
                &new_base_branch,
            )
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
        .ensure_container_exists(&workspace)
        .await?;
    let workspace_path = Path::new(&container_ref);
    let worktree_path = workspace_path.join(&repo.name);

    let result = deployment.git().rebase_branch(
        &repo.path,
        &worktree_path,
        &new_base_branch,
        &old_base_branch,
        &workspace.branch.clone(),
    );
    if let Err(e) = result {
        return match e {
            GitServiceError::MergeConflicts {
                message,
                conflicted_files,
            } => Ok(ResponseJson(
                ApiResponse::<(), GitOperationError>::error_with_data(
                    GitOperationError::MergeConflicts {
                        message,
                        op: ConflictOp::Rebase,
                        conflicted_files,
                        target_branch: new_base_branch.clone(),
                    },
                ),
            )),
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
                "workspace_id": workspace.id.to_string(),
                "repo_id": payload.repo_id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(())))
}

#[axum::debug_handler]
pub async fn abort_workspace_conflicts(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<AbortConflictsRequest>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let pool = &deployment.db().pool;

    let repo = Repo::find_by_id(pool, payload.repo_id)
        .await?
        .ok_or(RepoError::NotFound)?;

    let container_ref = deployment
        .container()
        .ensure_container_exists(&workspace)
        .await?;
    let workspace_path = Path::new(&container_ref);
    let worktree_path = workspace_path.join(&repo.name);

    deployment.git().abort_conflicts(&worktree_path)?;

    Ok(ResponseJson(ApiResponse::success(())))
}

#[axum::debug_handler]
pub async fn continue_workspace_rebase(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<ContinueRebaseRequest>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let pool = &deployment.db().pool;

    let repo = Repo::find_by_id(pool, payload.repo_id)
        .await?
        .ok_or(RepoError::NotFound)?;

    let container_ref = deployment
        .container()
        .ensure_container_exists(&workspace)
        .await?;
    let workspace_path = Path::new(&container_ref);
    let worktree_path = workspace_path.join(&repo.name);

    deployment.git().continue_rebase(&worktree_path)?;

    Ok(ResponseJson(ApiResponse::success(())))
}
