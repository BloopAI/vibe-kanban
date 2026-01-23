use std::path::PathBuf;

use axum::{
    Json, Router,
    extract::{Path, State},
    response::Json as ResponseJson,
    routing::{get, post},
};
use db::models::{
    coding_agent_turn::CodingAgentTurn,
    execution_process::{ExecutionProcess, ExecutionProcessRunReason, ExecutionProcessStatus},
    merge::Merge,
    task::{Task, TaskStatus},
    workspace::Workspace,
    workspace_repo::WorkspaceRepo,
};
use deployment::Deployment;
use serde::{Deserialize, Serialize};
use services::services::git::DiffTarget;
use services::services::workspace_manager::WorkspaceManager;
use ts_rs::TS;
use utils::diff::create_unified_diff;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

/// Response for workspace status endpoint
#[derive(Debug, Serialize, TS)]
pub struct WorkspaceStatusResponse {
    pub workspace_id: String,
    /// Status of the latest coding agent execution: "running", "completed", "failed", "killed", or "none"
    pub status: String,
    /// Number of files with changes (if workspace has container_ref)
    pub files_changed: Option<usize>,
    /// Total lines added across all files
    pub lines_added: Option<usize>,
    /// Total lines removed across all files
    pub lines_removed: Option<usize>,
}

/// Response for workspace transcript endpoint
#[derive(Debug, Serialize, TS)]
pub struct WorkspaceTranscriptResponse {
    pub workspace_id: String,
    /// The prompt that was sent to the coding agent
    pub prompt: Option<String>,
    /// The agent's summary/final output
    pub summary: Option<String>,
    /// The agent session ID (e.g., Claude session ID)
    pub agent_session_id: Option<String>,
}

/// A single file's diff information
#[derive(Debug, Serialize, TS)]
pub struct FileDiff {
    /// File path (new path for added/modified, old path for deleted)
    pub path: String,
    /// Number of lines added
    pub additions: usize,
    /// Number of lines deleted
    pub deletions: usize,
    /// The unified diff content
    pub diff_content: String,
}

/// Response for workspace diff endpoint
#[derive(Debug, Serialize, TS)]
pub struct WorkspaceDiffResponse {
    pub workspace_id: String,
    /// List of file diffs
    pub files: Vec<FileDiff>,
}

/// Request body for closing a workspace
#[derive(Debug, Deserialize)]
pub struct CloseWorkspaceRequest {
    /// Strategy for closing: "merge" or "discard"
    pub strategy: String,
}

/// Response for workspace close endpoint
#[derive(Debug, Serialize, TS)]
pub struct CloseWorkspaceResponse {
    pub workspace_id: String,
    /// Whether the close operation succeeded
    pub success: bool,
    /// Message describing the result
    pub message: String,
    /// Merge commit SHA (only present for merge strategy)
    pub merge_commit_sha: Option<String>,
}

/// Get workspace execution status and diff stats.
/// Returns 404 if workspace not found.
#[axum::debug_handler]
pub async fn get_workspace_status(
    State(deployment): State<DeploymentImpl>,
    Path(workspace_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<WorkspaceStatusResponse>>, ApiError> {
    let pool = &deployment.db().pool;

    // Find workspace, return 404 if not found
    let workspace = Workspace::find_by_id(pool, workspace_id)
        .await?
        .ok_or_else(|| ApiError::NotFound(format!("Workspace {} not found", workspace_id)))?;

    // Get latest coding agent execution process status
    let latest_process = ExecutionProcess::find_latest_by_workspace_and_run_reason(
        pool,
        workspace_id,
        &ExecutionProcessRunReason::CodingAgent,
    )
    .await?;

    let status = match latest_process {
        Some(ep) => match ep.status {
            ExecutionProcessStatus::Running => "running",
            ExecutionProcessStatus::Completed => "completed",
            ExecutionProcessStatus::Failed => "failed",
            ExecutionProcessStatus::Killed => "killed",
        }
        .to_string(),
        None => "none".to_string(),
    };

    // Compute diff stats if workspace has container_ref
    let (files_changed, lines_added, lines_removed) = if workspace.container_ref.is_some() {
        match compute_workspace_diff_stats(&deployment, &workspace).await {
            Ok(stats) => (
                Some(stats.files_changed),
                Some(stats.lines_added),
                Some(stats.lines_removed),
            ),
            Err(_) => (None, None, None),
        }
    } else {
        (None, None, None)
    };

    Ok(ResponseJson(ApiResponse::success(WorkspaceStatusResponse {
        workspace_id: workspace_id.to_string(),
        status,
        files_changed,
        lines_added,
        lines_removed,
    })))
}

/// Get workspace transcript (prompt, summary, agent_session_id).
/// Returns 404 if workspace not found.
/// Returns empty fields if no coding agent turns exist.
#[axum::debug_handler]
pub async fn get_workspace_transcript(
    State(deployment): State<DeploymentImpl>,
    Path(workspace_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<WorkspaceTranscriptResponse>>, ApiError> {
    let pool = &deployment.db().pool;

    // Find workspace, return 404 if not found
    let _workspace = Workspace::find_by_id(pool, workspace_id)
        .await?
        .ok_or_else(|| ApiError::NotFound(format!("Workspace {} not found", workspace_id)))?;

    // Find the latest coding agent turn for this workspace
    let coding_agent_turn = CodingAgentTurn::find_latest_by_workspace_id(pool, workspace_id).await?;

    let response = match coding_agent_turn {
        Some(turn) => WorkspaceTranscriptResponse {
            workspace_id: workspace_id.to_string(),
            prompt: turn.prompt,
            summary: turn.summary,
            agent_session_id: turn.agent_session_id,
        },
        None => WorkspaceTranscriptResponse {
            workspace_id: workspace_id.to_string(),
            prompt: None,
            summary: None,
            agent_session_id: None,
        },
    };

    Ok(ResponseJson(ApiResponse::success(response)))
}

/// Get workspace file diffs with full diff content.
/// Returns 404 if workspace not found or has no container_ref.
#[axum::debug_handler]
pub async fn get_workspace_diff(
    State(deployment): State<DeploymentImpl>,
    Path(workspace_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<WorkspaceDiffResponse>>, ApiError> {
    let pool = &deployment.db().pool;

    // Find workspace, return 404 if not found
    let workspace = Workspace::find_by_id(pool, workspace_id)
        .await?
        .ok_or_else(|| ApiError::NotFound(format!("Workspace {} not found", workspace_id)))?;

    // Return 404 if no container_ref (workspace not active)
    let container_ref = workspace
        .container_ref
        .as_ref()
        .ok_or_else(|| ApiError::NotFound("Workspace has no active worktree".to_string()))?;

    let workspace_repos =
        WorkspaceRepo::find_repos_with_target_branch_for_workspace(pool, workspace.id).await?;

    let mut all_files: Vec<FileDiff> = Vec::new();

    for repo_with_branch in workspace_repos {
        let worktree_path = PathBuf::from(container_ref).join(&repo_with_branch.repo.name);
        let repo_path = repo_with_branch.repo.path.clone();

        // Get base commit (merge base) between workspace branch and target branch
        let base_commit_result = tokio::task::spawn_blocking({
            let git = deployment.git().clone();
            let repo_path = repo_path.clone();
            let workspace_branch = workspace.branch.clone();
            let target_branch = repo_with_branch.target_branch.clone();
            move || git.get_base_commit(&repo_path, &workspace_branch, &target_branch)
        })
        .await;

        let base_commit = match base_commit_result {
            Ok(Ok(commit)) => commit,
            _ => continue,
        };

        // Get diffs with content
        let diffs_result = tokio::task::spawn_blocking({
            let git = deployment.git().clone();
            let worktree = worktree_path.clone();
            move || {
                git.get_diffs(
                    DiffTarget::Worktree {
                        worktree_path: &worktree,
                        base_commit: &base_commit,
                    },
                    None,
                )
            }
        })
        .await;

        if let Ok(Ok(diffs)) = diffs_result {
            for diff in diffs {
                // Determine file path (prefer new_path, fall back to old_path)
                let path = diff
                    .new_path
                    .clone()
                    .or(diff.old_path.clone())
                    .unwrap_or_else(|| "unknown".to_string());

                // Compute unified diff content
                let diff_content = if diff.content_omitted {
                    "[Content omitted - file too large]".to_string()
                } else {
                    let old = diff.old_content.as_deref().unwrap_or("");
                    let new = diff.new_content.as_deref().unwrap_or("");
                    if old.is_empty() && new.is_empty() {
                        String::new()
                    } else {
                        create_unified_diff(&path, old, new)
                    }
                };

                all_files.push(FileDiff {
                    path,
                    additions: diff.additions.unwrap_or(0),
                    deletions: diff.deletions.unwrap_or(0),
                    diff_content,
                });
            }
        }
    }

    Ok(ResponseJson(ApiResponse::success(WorkspaceDiffResponse {
        workspace_id: workspace_id.to_string(),
        files: all_files,
    })))
}

/// Close a workspace with merge or discard strategy.
/// Returns 404 if workspace not found.
/// Returns 400 if workspace already closed (no container_ref) or has running processes.
/// Returns 409 on merge conflicts.
#[axum::debug_handler]
pub async fn close_workspace(
    State(deployment): State<DeploymentImpl>,
    Path(workspace_id): Path<Uuid>,
    Json(request): Json<CloseWorkspaceRequest>,
) -> Result<ResponseJson<ApiResponse<CloseWorkspaceResponse>>, ApiError> {
    let pool = &deployment.db().pool;

    // Find workspace, return 404 if not found
    let workspace = Workspace::find_by_id(pool, workspace_id)
        .await?
        .ok_or_else(|| ApiError::NotFound(format!("Workspace {} not found", workspace_id)))?;

    // Return 400 if workspace already closed (no container_ref)
    let container_ref = workspace.container_ref.as_ref().ok_or_else(|| {
        ApiError::BadRequest("Workspace already closed (no active worktree)".to_string())
    })?;

    // Check for running processes
    let has_running = ExecutionProcess::has_running_non_dev_server_processes_for_workspace(
        pool,
        workspace_id,
    )
    .await?;
    if has_running {
        return Err(ApiError::BadRequest(
            "Cannot close workspace with running processes".to_string(),
        ));
    }

    // Validate strategy
    if request.strategy != "merge" && request.strategy != "discard" {
        return Err(ApiError::BadRequest(format!(
            "Invalid strategy '{}'. Must be 'merge' or 'discard'",
            request.strategy
        )));
    }

    // Get workspace repos with target branches
    let workspace_repos =
        WorkspaceRepo::find_repos_with_target_branch_for_workspace(pool, workspace_id).await?;
    let repos: Vec<_> = workspace_repos.iter().map(|r| r.repo.clone()).collect();

    let (message, merge_commit_sha) = if request.strategy == "merge" {
        // Prepare repos with targets for merge
        let repos_with_targets: Vec<_> = workspace_repos
            .iter()
            .map(|r| (r.repo.clone(), r.target_branch.clone()))
            .collect();

        // Perform merge
        let commit_message = format!("Merge workspace branch '{}' via close", workspace.branch);
        let merge_results = WorkspaceManager::close_workspace_merge(
            &repos_with_targets,
            &workspace.branch,
            &commit_message,
        )
        .await
        .map_err(|e| {
            if let services::services::workspace_manager::WorkspaceError::MergeConflicts {
                repo_name,
                message,
            } = e
            {
                ApiError::Conflict(format!(
                    "Merge conflicts in repo '{}': {}",
                    repo_name, message
                ))
            } else {
                ApiError::BadRequest(format!("Workspace close failed: {}", e))
            }
        })?;

        // Create DirectMerge records for each repo
        for result in &merge_results {
            Merge::create_direct(
                pool,
                workspace_id,
                result.repo_id,
                &result.target_branch,
                &result.merge_commit_sha,
            )
            .await?;
        }

        // Get the first merge commit SHA for the response
        let first_sha = merge_results.first().map(|r| r.merge_commit_sha.clone());

        // Now cleanup the workspace (discard worktrees and branches)
        let workspace_dir = PathBuf::from(container_ref);
        WorkspaceManager::close_workspace_discard(&workspace_dir, &repos, &workspace.branch)
            .await
            .map_err(|e| ApiError::BadRequest(format!("Workspace cleanup failed: {}", e)))?;

        (
            format!(
                "Successfully merged workspace into {} repo(s)",
                merge_results.len()
            ),
            first_sha,
        )
    } else {
        // Discard strategy - just cleanup
        let workspace_dir = PathBuf::from(container_ref);
        WorkspaceManager::close_workspace_discard(&workspace_dir, &repos, &workspace.branch)
            .await
            .map_err(|e| ApiError::BadRequest(format!("Workspace cleanup failed: {}", e)))?;

        ("Successfully discarded workspace changes".to_string(), None)
    };

    // Update database: set archived and clear container_ref
    Workspace::set_archived(pool, workspace_id, true).await?;
    Workspace::clear_container_ref(pool, workspace_id).await?;

    // Update task status based on strategy
    let new_status = if request.strategy == "merge" {
        TaskStatus::Done
    } else {
        TaskStatus::Todo
    };
    Task::update_status(pool, workspace.task_id, new_status).await?;

    Ok(ResponseJson(ApiResponse::success(CloseWorkspaceResponse {
        workspace_id: workspace_id.to_string(),
        success: true,
        message,
        merge_commit_sha,
    })))
}

/// Diff stats for a workspace
#[derive(Debug, Clone, Default)]
struct DiffStats {
    files_changed: usize,
    lines_added: usize,
    lines_removed: usize,
}

/// Compute diff stats for a workspace.
/// Reuses logic from workspace_summary.rs
async fn compute_workspace_diff_stats(
    deployment: &DeploymentImpl,
    workspace: &Workspace,
) -> Result<DiffStats, ApiError> {
    let pool = &deployment.db().pool;

    let container_ref = workspace
        .container_ref
        .as_ref()
        .ok_or_else(|| ApiError::BadRequest("No container ref".to_string()))?;

    let workspace_repos =
        WorkspaceRepo::find_repos_with_target_branch_for_workspace(pool, workspace.id).await?;

    let mut stats = DiffStats::default();

    for repo_with_branch in workspace_repos {
        let worktree_path = PathBuf::from(container_ref).join(&repo_with_branch.repo.name);
        let repo_path = repo_with_branch.repo.path.clone();

        // Get base commit (merge base) between workspace branch and target branch
        let base_commit_result = tokio::task::spawn_blocking({
            let git = deployment.git().clone();
            let repo_path = repo_path.clone();
            let workspace_branch = workspace.branch.clone();
            let target_branch = repo_with_branch.target_branch.clone();
            move || git.get_base_commit(&repo_path, &workspace_branch, &target_branch)
        })
        .await;

        let base_commit = match base_commit_result {
            Ok(Ok(commit)) => commit,
            _ => continue,
        };

        // Get diffs
        let diffs_result = tokio::task::spawn_blocking({
            let git = deployment.git().clone();
            let worktree = worktree_path.clone();
            move || {
                git.get_diffs(
                    DiffTarget::Worktree {
                        worktree_path: &worktree,
                        base_commit: &base_commit,
                    },
                    None,
                )
            }
        })
        .await;

        if let Ok(Ok(diffs)) = diffs_result {
            for diff in diffs {
                stats.files_changed += 1;
                stats.lines_added += diff.additions.unwrap_or(0);
                stats.lines_removed += diff.deletions.unwrap_or(0);
            }
        }
    }

    Ok(stats)
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/{id}/status", get(get_workspace_status))
        .route("/{id}/transcript", get(get_workspace_transcript))
        .route("/{id}/diff", get(get_workspace_diff))
        .route("/{id}/close", post(close_workspace))
}
