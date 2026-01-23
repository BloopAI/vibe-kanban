use std::path::{Path, PathBuf};

use db::models::{repo::Repo, workspace::Workspace as DbWorkspace};
use sqlx::{Pool, Sqlite};
use thiserror::Error;
use tracing::{debug, error, info, warn};
use uuid::Uuid;

use super::worktree_manager::{WorktreeCleanup, WorktreeError, WorktreeManager};

#[derive(Debug, Clone)]
pub struct RepoWorkspaceInput {
    pub repo: Repo,
    pub target_branch: String,
    /// Optional git ref (commit, tag, branch) to start the worktree from
    /// instead of the default target_branch HEAD
    pub start_from_ref: Option<String>,
}

impl RepoWorkspaceInput {
    pub fn new(repo: Repo, target_branch: String) -> Self {
        Self {
            repo,
            target_branch,
            start_from_ref: None,
        }
    }

    pub fn with_start_from_ref(repo: Repo, target_branch: String, start_from_ref: Option<String>) -> Self {
        Self {
            repo,
            target_branch,
            start_from_ref,
        }
    }
}

#[derive(Debug, Error)]
pub enum WorkspaceError {
    #[error(transparent)]
    Worktree(#[from] WorktreeError),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("No repositories provided")]
    NoRepositories,
    #[error("Partial workspace creation failed: {0}")]
    PartialCreation(String),
    #[error("Merge conflicts in repo '{repo_name}': {message}")]
    MergeConflicts { repo_name: String, message: String },
    #[error("Git error: {0}")]
    Git(String),
}

/// Result of a workspace merge operation for a single repo
#[derive(Debug, Clone)]
pub struct RepoMergeResult {
    pub repo_id: Uuid,
    pub repo_name: String,
    pub merge_commit_sha: String,
    pub target_branch: String,
}

/// Info about a single repo's worktree within a workspace
#[derive(Debug, Clone)]
pub struct RepoWorktree {
    pub repo_id: Uuid,
    pub repo_name: String,
    pub source_repo_path: PathBuf,
    pub worktree_path: PathBuf,
}

/// A container directory holding worktrees for all project repos
#[derive(Debug, Clone)]
pub struct WorktreeContainer {
    pub workspace_dir: PathBuf,
    pub worktrees: Vec<RepoWorktree>,
}

pub struct WorkspaceManager;

impl WorkspaceManager {
    /// Create a workspace with worktrees for all repositories.
    /// On failure, rolls back any already-created worktrees.
    pub async fn create_workspace(
        workspace_dir: &Path,
        repos: &[RepoWorkspaceInput],
        branch_name: &str,
    ) -> Result<WorktreeContainer, WorkspaceError> {
        if repos.is_empty() {
            return Err(WorkspaceError::NoRepositories);
        }

        info!(
            "Creating workspace at {} with {} repositories",
            workspace_dir.display(),
            repos.len()
        );

        tokio::fs::create_dir_all(workspace_dir).await?;

        let mut created_worktrees: Vec<RepoWorktree> = Vec::new();

        for input in repos {
            let worktree_path = workspace_dir.join(&input.repo.name);

            debug!(
                "Creating worktree for repo '{}' at {}",
                input.repo.name,
                worktree_path.display()
            );

            match WorktreeManager::create_worktree_with_start_ref(
                &input.repo.path,
                branch_name,
                &worktree_path,
                &input.target_branch,
                true,
                input.start_from_ref.as_deref(),
            )
            .await
            {
                Ok(()) => {
                    created_worktrees.push(RepoWorktree {
                        repo_id: input.repo.id,
                        repo_name: input.repo.name.clone(),
                        source_repo_path: input.repo.path.clone(),
                        worktree_path,
                    });
                }
                Err(e) => {
                    error!(
                        "Failed to create worktree for repo '{}': {}. Rolling back...",
                        input.repo.name, e
                    );

                    // Rollback: cleanup all worktrees we've created so far
                    Self::cleanup_created_worktrees(&created_worktrees).await;

                    // Also remove the workspace directory if it's empty
                    if let Err(cleanup_err) = tokio::fs::remove_dir(workspace_dir).await {
                        debug!(
                            "Could not remove workspace dir during rollback: {}",
                            cleanup_err
                        );
                    }

                    return Err(WorkspaceError::PartialCreation(format!(
                        "Failed to create worktree for repo '{}': {}",
                        input.repo.name, e
                    )));
                }
            }
        }

        info!(
            "Successfully created workspace with {} worktrees",
            created_worktrees.len()
        );

        Ok(WorktreeContainer {
            workspace_dir: workspace_dir.to_path_buf(),
            worktrees: created_worktrees,
        })
    }

    /// Ensure all worktrees in a workspace exist (for cold restart scenarios)
    pub async fn ensure_workspace_exists(
        workspace_dir: &Path,
        repos: &[Repo],
        branch_name: &str,
    ) -> Result<(), WorkspaceError> {
        if repos.is_empty() {
            return Err(WorkspaceError::NoRepositories);
        }

        // Try legacy migration first (single repo projects only)
        // Old layout had worktree directly at workspace_dir; new layout has it at workspace_dir/{repo_name}
        if repos.len() == 1 && Self::migrate_legacy_worktree(workspace_dir, &repos[0]).await? {
            return Ok(());
        }

        if !workspace_dir.exists() {
            tokio::fs::create_dir_all(workspace_dir).await?;
        }

        for repo in repos {
            let worktree_path = workspace_dir.join(&repo.name);

            debug!(
                "Ensuring worktree exists for repo '{}' at {}",
                repo.name,
                worktree_path.display()
            );

            WorktreeManager::ensure_worktree_exists(&repo.path, branch_name, &worktree_path)
                .await?;
        }

        Ok(())
    }

    /// Clean up all worktrees in a workspace
    pub async fn cleanup_workspace(
        workspace_dir: &Path,
        repos: &[Repo],
    ) -> Result<(), WorkspaceError> {
        info!("Cleaning up workspace at {}", workspace_dir.display());

        let cleanup_data: Vec<WorktreeCleanup> = repos
            .iter()
            .map(|repo| {
                let worktree_path = workspace_dir.join(&repo.name);
                WorktreeCleanup::new(worktree_path, Some(repo.path.clone()))
            })
            .collect();

        WorktreeManager::batch_cleanup_worktrees(&cleanup_data).await?;

        // Remove the workspace directory itself
        if workspace_dir.exists()
            && let Err(e) = tokio::fs::remove_dir_all(workspace_dir).await
        {
            debug!(
                "Could not remove workspace directory {}: {}",
                workspace_dir.display(),
                e
            );
        }

        Ok(())
    }

    /// Get the base directory for workspaces (same as worktree base dir)
    pub fn get_workspace_base_dir() -> PathBuf {
        WorktreeManager::get_worktree_base_dir()
    }

    /// Migrate a legacy single-worktree layout to the new workspace layout.
    /// Old layout: workspace_dir IS the worktree
    /// New layout: workspace_dir contains worktrees at workspace_dir/{repo_name}
    ///
    /// Returns Ok(true) if migration was performed, Ok(false) if no migration needed.
    pub async fn migrate_legacy_worktree(
        workspace_dir: &Path,
        repo: &Repo,
    ) -> Result<bool, WorkspaceError> {
        let expected_worktree_path = workspace_dir.join(&repo.name);

        // Detect old-style: workspace_dir exists AND has .git file (worktree marker)
        // AND expected new location doesn't exist
        let git_file = workspace_dir.join(".git");
        let is_old_style = workspace_dir.exists()
            && git_file.exists()
            && git_file.is_file() // .git file = worktree, .git dir = main repo
            && !expected_worktree_path.exists();

        if !is_old_style {
            return Ok(false);
        }

        info!(
            "Detected legacy worktree at {}, migrating to new layout",
            workspace_dir.display()
        );

        // Move old worktree to temp location (can't move into subdirectory of itself)
        let temp_name = format!(
            "{}-migrating",
            workspace_dir
                .file_name()
                .map(|n| n.to_string_lossy())
                .unwrap_or_default()
        );
        let temp_path = workspace_dir.with_file_name(temp_name);

        WorktreeManager::move_worktree(&repo.path, workspace_dir, &temp_path).await?;

        // Create new workspace directory
        tokio::fs::create_dir_all(workspace_dir).await?;

        // Move worktree to final location using git worktree move
        WorktreeManager::move_worktree(&repo.path, &temp_path, &expected_worktree_path).await?;

        if temp_path.exists() {
            let _ = tokio::fs::remove_dir_all(&temp_path).await;
        }

        info!(
            "Successfully migrated legacy worktree to {}",
            expected_worktree_path.display()
        );

        Ok(true)
    }

    /// Helper to cleanup worktrees during rollback
    async fn cleanup_created_worktrees(worktrees: &[RepoWorktree]) {
        for worktree in worktrees {
            let cleanup = WorktreeCleanup::new(
                worktree.worktree_path.clone(),
                Some(worktree.source_repo_path.clone()),
            );

            if let Err(e) = WorktreeManager::cleanup_worktree(&cleanup).await {
                error!(
                    "Failed to cleanup worktree '{}' during rollback: {}",
                    worktree.repo_name, e
                );
            }
        }
    }

    pub async fn cleanup_orphan_workspaces(db: &Pool<Sqlite>) {
        if std::env::var("DISABLE_WORKTREE_ORPHAN_CLEANUP").is_ok() {
            debug!(
                "Orphan workspace cleanup is disabled via DISABLE_WORKTREE_ORPHAN_CLEANUP environment variable"
            );
            return;
        }

        // Always clean up the default directory
        let default_dir = WorktreeManager::get_default_worktree_base_dir();
        Self::cleanup_orphans_in_directory(db, &default_dir).await;

        // Also clean up custom directory if it's different from the default
        let current_dir = Self::get_workspace_base_dir();
        if current_dir != default_dir {
            Self::cleanup_orphans_in_directory(db, &current_dir).await;
        }
    }

    async fn cleanup_orphans_in_directory(db: &Pool<Sqlite>, workspace_base_dir: &Path) {
        if !workspace_base_dir.exists() {
            debug!(
                "Workspace base directory {} does not exist, skipping orphan cleanup",
                workspace_base_dir.display()
            );
            return;
        }

        let entries = match std::fs::read_dir(workspace_base_dir) {
            Ok(entries) => entries,
            Err(e) => {
                error!(
                    "Failed to read workspace base directory {}: {}",
                    workspace_base_dir.display(),
                    e
                );
                return;
            }
        };

        for entry in entries {
            let entry = match entry {
                Ok(entry) => entry,
                Err(e) => {
                    warn!("Failed to read directory entry: {}", e);
                    continue;
                }
            };

            let path = entry.path();
            if !path.is_dir() {
                continue;
            }

            let workspace_path_str = path.to_string_lossy().to_string();
            if let Ok(false) = DbWorkspace::container_ref_exists(db, &workspace_path_str).await {
                info!("Found orphaned workspace: {}", workspace_path_str);
                if let Err(e) = Self::cleanup_workspace_without_repos(&path).await {
                    error!(
                        "Failed to remove orphaned workspace {}: {}",
                        workspace_path_str, e
                    );
                } else {
                    info!(
                        "Successfully removed orphaned workspace: {}",
                        workspace_path_str
                    );
                }
            }
        }
    }

    async fn cleanup_workspace_without_repos(workspace_dir: &Path) -> Result<(), WorkspaceError> {
        info!(
            "Cleaning up orphaned workspace at {}",
            workspace_dir.display()
        );

        let entries = match std::fs::read_dir(workspace_dir) {
            Ok(entries) => entries,
            Err(e) => {
                debug!(
                    "Cannot read workspace directory {}, attempting direct removal: {}",
                    workspace_dir.display(),
                    e
                );
                return tokio::fs::remove_dir_all(workspace_dir)
                    .await
                    .map_err(WorkspaceError::Io);
            }
        };

        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.is_dir()
                && let Err(e) = WorktreeManager::cleanup_suspected_worktree(&path).await
            {
                warn!("Failed to cleanup suspected worktree: {}", e);
            }
        }

        if workspace_dir.exists()
            && let Err(e) = tokio::fs::remove_dir_all(workspace_dir).await
        {
            debug!(
                "Could not remove workspace directory {}: {}",
                workspace_dir.display(),
                e
            );
        }

        Ok(())
    }

    /// Close and discard a workspace: cleanup worktrees and delete branches.
    /// This handles the git-related cleanup. Database updates (archived, container_ref)
    /// should be handled by the caller.
    ///
    /// # Arguments
    /// * `workspace_dir` - The container_ref path where worktrees are located
    /// * `repos` - List of repositories in the workspace
    /// * `branch_name` - The workspace branch to delete from each repo
    pub async fn close_workspace_discard(
        workspace_dir: &Path,
        repos: &[Repo],
        branch_name: &str,
    ) -> Result<(), WorkspaceError> {
        info!(
            "Closing workspace (discard): {} with branch '{}'",
            workspace_dir.display(),
            branch_name
        );

        // Step 1: Clean up all worktrees and the workspace directory
        Self::cleanup_workspace(workspace_dir, repos).await?;

        // Step 2: Delete the workspace branch from each repository
        let git = super::git::GitService::new();
        for repo in repos {
            debug!(
                "Deleting branch '{}' from repo '{}'",
                branch_name, repo.name
            );
            if let Err(e) = git.delete_branch(&repo.path, branch_name) {
                // Log but don't fail - branch might already be deleted or never created
                warn!(
                    "Failed to delete branch '{}' from repo '{}': {}",
                    branch_name, repo.name, e
                );
            }
        }

        info!("Successfully closed workspace (discard)");
        Ok(())
    }

    /// Close workspace with merge: merge workspace branch into target branch for each repo.
    /// Returns the merge commit SHA for each repo.
    /// Does NOT cleanup the workspace - caller should call close_workspace_discard after recording merges.
    ///
    /// # Arguments
    /// * `repos_with_targets` - List of (Repo, target_branch) pairs
    /// * `workspace_branch` - The workspace branch to merge from
    /// * `commit_message` - The merge commit message
    pub async fn close_workspace_merge(
        repos_with_targets: &[(Repo, String)],
        workspace_branch: &str,
        commit_message: &str,
    ) -> Result<Vec<RepoMergeResult>, WorkspaceError> {
        info!(
            "Merging workspace branch '{}' into target branches for {} repos",
            workspace_branch,
            repos_with_targets.len()
        );

        let git = super::git::GitService::new();
        let mut results = Vec::new();

        for (repo, target_branch) in repos_with_targets {
            debug!(
                "Merging '{}' into '{}' in repo '{}'",
                workspace_branch, target_branch, repo.name
            );

            // Perform the merge in the main repo (not the worktree)
            let merge_commit_sha = tokio::task::spawn_blocking({
                let git = git.clone();
                let repo_path = repo.path.clone();
                let target_branch = target_branch.clone();
                let workspace_branch = workspace_branch.to_string();
                let commit_message = commit_message.to_string();
                move || {
                    git.merge_into_branch(
                        &repo_path,
                        &target_branch,
                        &workspace_branch,
                        &commit_message,
                    )
                }
            })
            .await
            .map_err(|e| WorkspaceError::Git(format!("Task join error: {e}")))?
            .map_err(|e| {
                if let super::git::GitServiceError::MergeConflicts { message, .. } = e {
                    WorkspaceError::MergeConflicts {
                        repo_name: repo.name.clone(),
                        message,
                    }
                } else {
                    WorkspaceError::Git(format!("Merge failed in repo '{}': {}", repo.name, e))
                }
            })?;

            results.push(RepoMergeResult {
                repo_id: repo.id,
                repo_name: repo.name.clone(),
                merge_commit_sha,
                target_branch: target_branch.clone(),
            });
        }

        info!(
            "Successfully merged workspace branch into {} repos",
            results.len()
        );
        Ok(results)
    }
}
