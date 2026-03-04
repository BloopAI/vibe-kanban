use std::path::{Path, PathBuf};

use db::{
    DBService,
    models::{
        image::WorkspaceImage,
        repo::{Repo, RepoError},
        session::Session,
        workspace::{
            CreateWorkspace as DbCreateWorkspace, Workspace as DbWorkspace,
            WorkspaceError as DbWorkspaceError,
        },
        workspace_repo::{CreateWorkspaceRepo, WorkspaceRepo},
    },
};
use git::GitService;
use services::services::worktree_manager::{WorktreeCleanup, WorktreeError, WorktreeManager};
use thiserror::Error;
use tracing::{debug, error, info, warn};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct RepoWorkspaceInput {
    pub repo: Repo,
    pub target_branch: String,
}

impl RepoWorkspaceInput {
    pub fn new(repo: Repo, target_branch: String) -> Self {
        Self {
            repo,
            target_branch,
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

#[derive(Debug, Clone)]
pub struct WorkspaceDeletionContext {
    pub workspace_id: Uuid,
    pub branch_name: String,
    pub workspace_dir: Option<PathBuf>,
    pub repositories: Vec<Repo>,
    pub repo_paths: Vec<PathBuf>,
    pub session_ids: Vec<Uuid>,
}

#[derive(Clone)]
pub struct WorkspaceManager {
    db: DBService,
}

impl WorkspaceManager {
    pub fn new(db: DBService) -> Self {
        Self { db }
    }

    /// Resolve the agent working directory for a workspace.
    /// For single-repo workspaces, this is `{repo_name}/{default_working_dir?}`.
    /// For multi-repo workspaces, this is `None`.
    pub async fn resolve_agent_working_dir(
        &self,
        repos: &[CreateWorkspaceRepo],
    ) -> Result<Option<String>, RepoError> {
        let Some(repo_ref) = repos.first() else {
            return Ok(None);
        };

        if repos.len() > 1 {
            return Ok(None);
        }

        let repo = Repo::find_by_id(&self.db.pool, repo_ref.repo_id)
            .await?
            .ok_or(RepoError::NotFound)?;

        let path = match repo.default_working_dir {
            Some(subdir) => PathBuf::from(&repo.name).join(subdir),
            None => PathBuf::from(&repo.name),
        };

        Ok(Some(path.to_string_lossy().to_string()))
    }

    /// Create the workspace DB record and apply optional display name.
    pub async fn create_workspace_record(
        &self,
        workspace_id: Uuid,
        branch_name: String,
        agent_working_dir: Option<String>,
        workspace_name: Option<&str>,
    ) -> Result<DbWorkspace, DbWorkspaceError> {
        let mut workspace = DbWorkspace::create(
            &self.db.pool,
            &DbCreateWorkspace {
                branch: branch_name,
                agent_working_dir,
            },
            workspace_id,
        )
        .await?;

        if let Some(name) = workspace_name {
            DbWorkspace::update(&self.db.pool, workspace.id, None, None, Some(name)).await?;
            workspace.name = Some(name.to_string());
        }

        Ok(workspace)
    }

    pub async fn attach_repositories(
        &self,
        workspace_id: Uuid,
        repos: &[CreateWorkspaceRepo],
    ) -> Result<(), sqlx::Error> {
        WorkspaceRepo::create_many(&self.db.pool, workspace_id, repos)
            .await
            .map(|_| ())
    }

    pub async fn associate_images(
        &self,
        workspace_id: Uuid,
        image_ids: &[Uuid],
    ) -> Result<(), sqlx::Error> {
        if image_ids.is_empty() {
            return Ok(());
        }

        WorkspaceImage::associate_many_dedup(&self.db.pool, workspace_id, image_ids).await
    }

    pub async fn prepare_workspace_deletion(
        &self,
        workspace: &DbWorkspace,
    ) -> Result<WorkspaceDeletionContext, sqlx::Error> {
        let repositories =
            WorkspaceRepo::find_repos_for_workspace(&self.db.pool, workspace.id).await?;
        let session_ids = Session::find_by_workspace_id(&self.db.pool, workspace.id)
            .await?
            .into_iter()
            .map(|session| session.id)
            .collect::<Vec<_>>();
        let repo_paths = repositories
            .iter()
            .map(|repo| repo.path.clone())
            .collect::<Vec<_>>();

        Ok(WorkspaceDeletionContext {
            workspace_id: workspace.id,
            branch_name: workspace.branch.clone(),
            workspace_dir: workspace.container_ref.clone().map(PathBuf::from),
            repositories,
            repo_paths,
            session_ids,
        })
    }

    pub async fn delete_workspace_record(&self, workspace_id: Uuid) -> Result<u64, sqlx::Error> {
        DbWorkspace::delete(&self.db.pool, workspace_id).await
    }

    pub fn spawn_workspace_deletion_cleanup(
        context: WorkspaceDeletionContext,
        delete_branches: bool,
    ) {
        tokio::spawn(async move {
            let WorkspaceDeletionContext {
                workspace_id,
                branch_name,
                workspace_dir,
                repositories,
                repo_paths,
                session_ids,
            } = context;

            for session_id in session_ids {
                if let Err(e) =
                    services::services::execution_process::remove_session_process_logs(session_id)
                        .await
                {
                    warn!(
                        "Failed to remove filesystem process logs for session {}: {}",
                        session_id, e
                    );
                }
            }

            if let Some(workspace_dir) = workspace_dir {
                info!(
                    "Starting background cleanup for workspace {} at {}",
                    workspace_id,
                    workspace_dir.display()
                );

                if let Err(e) = Self::cleanup_workspace(&workspace_dir, &repositories).await {
                    error!(
                        "Background workspace cleanup failed for {} at {}: {}",
                        workspace_id,
                        workspace_dir.display(),
                        e
                    );
                } else {
                    info!(
                        "Background cleanup completed for workspace {}",
                        workspace_id
                    );
                }
            }

            if delete_branches {
                let git_service = GitService::new();
                for repo_path in repo_paths {
                    match git_service.delete_branch(&repo_path, &branch_name) {
                        Ok(()) => {
                            info!("Deleted branch '{}' from repo {:?}", branch_name, repo_path);
                        }
                        Err(e) => {
                            warn!(
                                "Failed to delete branch '{}' from repo {:?}: {}",
                                branch_name, repo_path, e
                            );
                        }
                    }
                }
            }
        });
    }

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

            match WorktreeManager::create_worktree(
                &input.repo.path,
                branch_name,
                &worktree_path,
                &input.target_branch,
                true,
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

    pub async fn cleanup_orphan_workspaces(&self) {
        if std::env::var("DISABLE_WORKTREE_CLEANUP").is_ok() {
            info!(
                "Orphan workspace cleanup is disabled via DISABLE_WORKTREE_CLEANUP environment variable"
            );
            return;
        }

        // Always clean up the default directory
        let default_dir = WorktreeManager::get_default_worktree_base_dir();
        self.cleanup_orphans_in_directory(&default_dir).await;

        // Also clean up custom directory if it's different from the default
        let current_dir = Self::get_workspace_base_dir();
        if current_dir != default_dir {
            self.cleanup_orphans_in_directory(&current_dir).await;
        }
    }

    async fn cleanup_orphans_in_directory(&self, workspace_base_dir: &Path) {
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
            if let Ok(false) =
                DbWorkspace::container_ref_exists(&self.db.pool, &workspace_path_str).await
            {
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
}
