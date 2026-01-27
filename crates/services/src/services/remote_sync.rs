use std::path::PathBuf;

use db::models::{workspace::Workspace, workspace_repo::WorkspaceRepo};
use git::{DiffTarget, GitService};
use sqlx::SqlitePool;
use tracing::{debug, error};
use uuid::Uuid;

use super::remote_client::{RemoteClient, RemoteClientError};

#[derive(Debug, Clone, Default)]
pub struct DiffStats {
    pub files_changed: usize,
    pub lines_added: usize,
    pub lines_removed: usize,
}

/// Computes diff stats for a workspace by comparing against target branches.
pub async fn compute_diff_stats(
    pool: &SqlitePool,
    git: &GitService,
    workspace: &Workspace,
) -> Option<DiffStats> {
    let container_ref = workspace.container_ref.as_ref()?;

    let workspace_repos =
        WorkspaceRepo::find_repos_with_target_branch_for_workspace(pool, workspace.id)
            .await
            .ok()?;

    let mut stats = DiffStats::default();

    for repo_with_branch in workspace_repos {
        let worktree_path = PathBuf::from(container_ref).join(&repo_with_branch.repo.name);
        let repo_path = repo_with_branch.repo.path.clone();

        let base_commit_result = tokio::task::spawn_blocking({
            let git = git.clone();
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

        let diffs_result = tokio::task::spawn_blocking({
            let git = git.clone();
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

    Some(stats)
}

/// Syncs workspace data to the remote server.
/// If the workspace doesn't exist on remote (404), logs debug and returns.
pub async fn sync_workspace_to_remote(
    client: &RemoteClient,
    workspace_id: Uuid,
    archived: Option<bool>,
    stats: Option<&DiffStats>,
) {
    match client
        .update_workspace(
            workspace_id,
            archived,
            stats.map(|s| s.files_changed as i32),
            stats.map(|s| s.lines_added as i32),
            stats.map(|s| s.lines_removed as i32),
        )
        .await
    {
        Ok(()) => {
            debug!("Synced workspace {} to remote", workspace_id);
        }
        Err(RemoteClientError::Http { status: 404, .. }) => {
            debug!(
                "Workspace {} not found on remote, skipping sync",
                workspace_id
            );
        }
        Err(e) => {
            error!("Failed to sync workspace {} to remote: {}", workspace_id, e);
        }
    }
}
