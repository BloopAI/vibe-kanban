use std::{collections::HashMap, path::PathBuf};

use axum::{Json, extract::State, response::Json as ResponseJson};
use db::models::{
    coding_agent_turn::CodingAgentTurn,
    execution_process::{ExecutionProcess, ExecutionProcessStatus},
    merge::{Merge, MergeStatus},
    workspace::Workspace,
    workspace_repo::WorkspaceRepo,
};
use deployment::Deployment;
use serde::{Deserialize, Serialize};
use services::services::git::DiffTarget;
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

/// Request for fetching workspace summaries
#[derive(Debug, Deserialize, Serialize, TS)]
pub struct WorkspaceSummaryRequest {
    pub archived: bool,
}

/// Summary info for a single workspace
#[derive(Debug, Serialize, TS)]
pub struct WorkspaceSummary {
    pub workspace_id: Uuid,
    /// Session ID of the latest execution process
    pub latest_session_id: Option<Uuid>,
    /// Is a tool approval currently pending?
    pub has_pending_approval: bool,
    /// Number of files with changes
    pub files_changed: Option<usize>,
    /// Total lines added across all files
    pub lines_added: Option<usize>,
    /// Total lines removed across all files
    pub lines_removed: Option<usize>,
    /// When the latest execution process completed
    #[ts(optional)]
    pub latest_process_completed_at: Option<chrono::DateTime<chrono::Utc>>,
    /// Status of the latest execution process
    pub latest_process_status: Option<ExecutionProcessStatus>,
    /// Is a dev server currently running?
    pub has_running_dev_server: bool,
    /// Does this workspace have unseen coding agent turns?
    pub has_unseen_turns: bool,
    /// PR status for this workspace (if any PR exists)
    pub pr_status: Option<MergeStatus>,
}

/// Response containing summaries for requested workspaces
#[derive(Debug, Serialize, TS)]
pub struct WorkspaceSummaryResponse {
    pub summaries: Vec<WorkspaceSummary>,
}

#[derive(Debug, Clone, Default, Serialize, TS)]
pub struct DiffStats {
    pub files_changed: usize,
    pub lines_added: usize,
    pub lines_removed: usize,
}

/// Fetch summary information for workspaces filtered by archived status.
/// This endpoint returns data that cannot be efficiently included in the streaming endpoint.
#[axum::debug_handler]
pub async fn get_workspace_summaries(
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<WorkspaceSummaryRequest>,
) -> Result<ResponseJson<ApiResponse<WorkspaceSummaryResponse>>, ApiError> {
    let pool = &deployment.db().pool;
    let archived = request.archived;

    // 1. Fetch all workspaces with the given archived status
    let workspaces: Vec<Workspace> = Workspace::find_all_with_status(pool, Some(archived), None)
        .await?
        .into_iter()
        .map(|ws| ws.workspace)
        .collect();

    if workspaces.is_empty() {
        return Ok(ResponseJson(ApiResponse::success(
            WorkspaceSummaryResponse { summaries: vec![] },
        )));
    }

    // 2. Fetch latest process info for workspaces with this archived status
    let latest_processes = ExecutionProcess::find_latest_for_workspaces(pool, archived).await?;

    // 3. Check which workspaces have running dev servers
    let dev_server_workspaces =
        ExecutionProcess::find_workspaces_with_running_dev_servers(pool, archived).await?;

    // 4. Check pending approvals for running processes
    let running_ep_ids: Vec<_> = latest_processes
        .values()
        .filter(|info| info.status == ExecutionProcessStatus::Running)
        .map(|info| info.execution_process_id)
        .collect();
    let pending_approval_eps = deployment
        .approvals()
        .get_pending_execution_process_ids(&running_ep_ids);

    // 5. Check which workspaces have unseen coding agent turns
    let unseen_workspaces = CodingAgentTurn::find_workspaces_with_unseen(pool, archived).await?;

    // 6. Get PR status for each workspace
    let pr_statuses = Merge::get_latest_pr_status_for_workspaces(pool, archived).await?;

    // 7. Compute diff stats for each workspace (in parallel)
    let diff_futures: Vec<_> = workspaces
        .iter()
        .map(|ws| {
            let workspace = ws.clone();
            let deployment = deployment.clone();
            async move {
                if workspace.container_ref.is_some() {
                    compute_workspace_diff_stats(&deployment, &workspace)
                        .await
                        .ok()
                        .map(|stats| (workspace.id, stats))
                } else {
                    None
                }
            }
        })
        .collect();

    let diff_results: Vec<Option<(Uuid, DiffStats)>> =
        futures_util::future::join_all(diff_futures).await;
    let diff_stats: HashMap<Uuid, DiffStats> = diff_results.into_iter().flatten().collect();

    // 8. Assemble response
    let summaries: Vec<WorkspaceSummary> = workspaces
        .iter()
        .map(|ws| {
            let id = ws.id;
            let latest = latest_processes.get(&id);
            let has_pending = latest
                .map(|p| pending_approval_eps.contains(&p.execution_process_id))
                .unwrap_or(false);
            let stats = diff_stats.get(&id);

            WorkspaceSummary {
                workspace_id: id,
                latest_session_id: latest.map(|p| p.session_id),
                has_pending_approval: has_pending,
                files_changed: stats.map(|s| s.files_changed),
                lines_added: stats.map(|s| s.lines_added),
                lines_removed: stats.map(|s| s.lines_removed),
                latest_process_completed_at: latest.and_then(|p| p.completed_at),
                latest_process_status: latest.map(|p| p.status.clone()),
                has_running_dev_server: dev_server_workspaces.contains(&id),
                has_unseen_turns: unseen_workspaces.contains(&id),
                pr_status: pr_statuses.get(&id).cloned(),
            }
        })
        .collect();

    Ok(ResponseJson(ApiResponse::success(
        WorkspaceSummaryResponse { summaries },
    )))
}

/// Compute diff stats for a workspace.
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
