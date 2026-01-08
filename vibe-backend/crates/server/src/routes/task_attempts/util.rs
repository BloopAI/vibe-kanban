use std::path::PathBuf;

use db::models::{
    execution_process::ExecutionProcess, execution_process_repo_state::ExecutionProcessRepoState,
    workspace::Workspace, workspace_repo::WorkspaceRepo,
};
use deployment::Deployment;
use services::services::{container::ContainerService, git::WorktreeResetOptions};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

/// Reset all repository worktrees to the state before the given process.
/// For each repo, finds the before_head_commit from the target process,
/// or falls back to the previous process's after_head_commit.
pub async fn restore_worktrees_to_process(
    deployment: &DeploymentImpl,
    pool: &PgPool,
    workspace: &Workspace,
    target_process_id: Uuid,
    perform_git_reset: bool,
    force_when_dirty: bool,
) -> Result<(), ApiError> {
    let repos = WorkspaceRepo::find_repos_for_workspace(pool, workspace.id).await?;

    // Get all repo states for the target process
    let repo_states =
        ExecutionProcessRepoState::find_by_execution_process_id(pool, target_process_id).await?;

    let container_ref = deployment
        .container()
        .ensure_container_exists(workspace)
        .await?;
    let workspace_dir = PathBuf::from(container_ref);

    // Check if workspace is dirty (any repo has uncommitted changes)
    let is_dirty = deployment
        .container()
        .is_container_clean(workspace)
        .await
        .map(|is_clean| !is_clean)
        .unwrap_or(false);

    // For each repository, reset to its respective commit
    for repo in &repos {
        // Find this repo's state from the target process
        let repo_state = repo_states.iter().find(|s| s.repo_id == repo.id);

        // Get before_head_commit for THIS repo, or fall back to prev process's after_head_commit
        let target_oid = match repo_state.and_then(|s| s.before_head_commit.clone()) {
            Some(oid) => Some(oid),
            None => {
                ExecutionProcess::find_prev_after_head_commit(
                    pool,
                    workspace.id,
                    target_process_id,
                    repo.id,
                )
                .await?
            }
        };

        // Calculate this repo's worktree path
        let worktree_path = workspace_dir.join(&repo.name);

        // Reset this repo's worktree
        if let Some(oid) = target_oid {
            deployment.git().reconcile_worktree_to_commit(
                &worktree_path,
                &oid,
                WorktreeResetOptions::new(
                    perform_git_reset,
                    force_when_dirty,
                    is_dirty,
                    perform_git_reset,
                ),
            );
        }
    }

    Ok(())
}
