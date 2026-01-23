use std::path::PathBuf;

use axum::{
    Router,
    extract::{Path, State},
    response::Json as ResponseJson,
    routing::get,
};
use db::models::{
    execution_process::{ExecutionProcess, ExecutionProcessRunReason, ExecutionProcessStatus},
    workspace::Workspace,
    workspace_repo::WorkspaceRepo,
};
use deployment::Deployment;
use serde::Serialize;
use services::services::git::DiffTarget;
use ts_rs::TS;
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
    Router::new().route("/{id}/status", get(get_workspace_status))
}
