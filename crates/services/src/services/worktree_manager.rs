use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

use git2::{Error as GitError, Repository, WorktreeAddOptions};
use thiserror::Error;
use tracing::{debug, info, warn};
use utils::{is_wsl2, shell::get_shell_command};

use super::git::{GitService, GitServiceError};

// Global synchronization for worktree creation to prevent race conditions
lazy_static::lazy_static! {
    static ref WORKTREE_CREATION_LOCKS: Arc<Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>> =
        Arc::new(Mutex::new(HashMap::new()));
}

#[derive(Debug, Error)]
pub enum WorktreeError {
    #[error(transparent)]
    Git(#[from] GitError),
    #[error(transparent)]
    GitService(#[from] GitServiceError),
    #[error("Task join error: {0}")]
    TaskJoin(String),
    #[error("Invalid path: {0}")]
    InvalidPath(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Branch not found: {0}")]
    BranchNotFound(String),
    #[error("Repository error: {0}")]
    Repository(String),
}

pub struct WorktreeManager;

impl WorktreeManager {
    /// Create a worktree with a new branch
    pub async fn create_worktree(
        repo_path: &Path,
        branch_name: &str,
        worktree_path: &Path,
        base_branch: &str,
        create_branch: bool,
    ) -> Result<(), WorktreeError> {
        if create_branch {
            let repo_path_owned = repo_path.to_path_buf();
            let branch_name_owned = branch_name.to_string();
            let base_branch_owned = base_branch.to_string();

            tokio::task::spawn_blocking(move || {
                let repo = Repository::open(&repo_path_owned)?;
                let base_branch_ref =
                    GitService::find_branch(&repo, &base_branch_owned)?.into_reference();
                repo.branch(
                    &branch_name_owned,
                    &base_branch_ref.peel_to_commit()?,
                    false,
                )?;
                Ok::<(), GitServiceError>(())
            })
            .await
            .map_err(|e| WorktreeError::TaskJoin(format!("Task join error: {e}")))??;
        }

        Self::ensure_worktree_exists(repo_path, branch_name, worktree_path).await
    }

    /// Ensure worktree exists, recreating if necessary with proper synchronization
    /// This is the main entry point for ensuring a worktree exists and prevents race conditions
    pub async fn ensure_worktree_exists(
        repo_path: &Path,
        branch_name: &str,
        worktree_path: &Path,
    ) -> Result<(), WorktreeError> {
        let path_str = worktree_path.to_string_lossy().to_string();

        // Get or create a lock for this specific worktree path
        let lock = {
            let mut locks = WORKTREE_CREATION_LOCKS.lock().unwrap();
            locks
                .entry(path_str.clone())
                .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(())))
                .clone()
        };

        // Acquire the lock for this specific worktree path
        let _guard = lock.lock().await;

        // Check if worktree already exists and is properly set up
        if Self::is_worktree_properly_set_up(repo_path, worktree_path).await? {
            debug!("Worktree already properly set up at path: {}", path_str);
            return Ok(());
        }

        // If worktree doesn't exist or isn't properly set up, recreate it
        info!("Worktree needs recreation at path: {}", path_str);
        Self::recreate_worktree_internal(repo_path, branch_name, worktree_path).await
    }

    /// Internal worktree recreation function (always recreates)
    async fn recreate_worktree_internal(
        repo_path: &Path,
        branch_name: &str,
        worktree_path: &Path,
    ) -> Result<(), WorktreeError> {
        let path_str = worktree_path.to_string_lossy().to_string();
        let branch_name_owned = branch_name.to_string();
        let worktree_path_owned = worktree_path.to_path_buf();

        // Use the provided repo path
        let git_repo_path = repo_path;

        // Get the worktree name for metadata operations
        let worktree_name = worktree_path
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| WorktreeError::InvalidPath("Invalid worktree path".to_string()))?
            .to_string();

        info!(
            "Creating worktree {} at path {}",
            branch_name_owned, path_str
        );

        // Step 1: Comprehensive cleanup of existing worktree and metadata (non-blocking)
        Self::comprehensive_worktree_cleanup_async(
            git_repo_path,
            &worktree_path_owned,
            &worktree_name,
        )
        .await?;

        // Step 2: Ensure parent directory exists (non-blocking)
        if let Some(parent) = worktree_path_owned.parent() {
            let parent_path = parent.to_path_buf();
            tokio::task::spawn_blocking(move || std::fs::create_dir_all(&parent_path))
                .await
                .map_err(|e| WorktreeError::TaskJoin(format!("Task join error: {e}")))?
                .map_err(WorktreeError::Io)?;
        }

        // Step 3: Create the worktree with retry logic for metadata conflicts (non-blocking)
        Self::create_worktree_with_retry(
            git_repo_path,
            &branch_name_owned,
            &worktree_path_owned,
            &worktree_name,
            &path_str,
        )
        .await
    }

    /// Check if a worktree is properly set up (filesystem + git metadata)
    async fn is_worktree_properly_set_up(
        repo_path: &Path,
        worktree_path: &Path,
    ) -> Result<bool, WorktreeError> {
        let repo_path = repo_path.to_path_buf();
        let worktree_path = worktree_path.to_path_buf();

        tokio::task::spawn_blocking(move || -> Result<bool, WorktreeError> {
            // Check 1: Filesystem path must exist
            if !worktree_path.exists() {
                return Ok(false);
            }

            // Check 2: Worktree must be registered in git metadata using find_worktree
            let repo = Repository::open(&repo_path).map_err(WorktreeError::Git)?;
            let worktree_name = worktree_path
                .file_name()
                .and_then(|n| n.to_str())
                .ok_or_else(|| WorktreeError::InvalidPath("Invalid worktree path".to_string()))?;

            // Try to find the worktree - if it exists and is valid, we're good
            match repo.find_worktree(worktree_name) {
                Ok(_) => Ok(true),
                Err(_) => Ok(false),
            }
        })
        .await
        .map_err(|e| WorktreeError::TaskJoin(format!("{e}")))?
    }

    /// Try to remove a worktree registration from git
    fn try_remove_worktree(repo: &Repository, worktree_name: &str) -> Result<(), GitError> {
        let worktrees = repo.worktrees()?;

        for name in worktrees.iter().flatten() {
            if name == worktree_name {
                let worktree = repo.find_worktree(name)?;
                worktree.prune(None)?;
                debug!("Successfully removed worktree registration: {}", name);
                return Ok(());
            }
        }

        debug!("Worktree {} not found in git worktrees list", worktree_name);
        Ok(())
    }

    /// Comprehensive cleanup of worktree path and metadata to prevent "path exists" errors (blocking)
    fn comprehensive_worktree_cleanup(
        repo: &Repository,
        worktree_path: &Path,
        worktree_name: &str,
    ) -> Result<(), WorktreeError> {
        debug!("Performing cleanup for worktree: {}", worktree_name);

        let git_repo_path = Self::get_git_repo_path(repo)?;

        // Step 1: Always try to remove worktree registration first (this may fail if not registered)
        if let Err(e) = Self::try_remove_worktree(repo, worktree_name) {
            debug!(
                "Worktree registration removal failed or not found (non-fatal): {}",
                e
            );
        }

        // Step 2: Always force cleanup metadata directory (proactive cleanup)
        if let Err(e) = Self::force_cleanup_worktree_metadata(&git_repo_path, worktree_name) {
            debug!("Metadata cleanup failed (non-fatal): {}", e);
        }

        // Step 3: Clean up physical worktree directory if it exists
        if worktree_path.exists() {
            debug!(
                "Removing existing worktree directory: {}",
                worktree_path.display()
            );
            std::fs::remove_dir_all(worktree_path).map_err(WorktreeError::Io)?;
        }

        debug!(
            "Comprehensive cleanup completed for worktree: {}",
            worktree_name
        );
        Ok(())
    }

    /// Async version of comprehensive cleanup to avoid blocking the main runtime
    async fn comprehensive_worktree_cleanup_async(
        git_repo_path: &Path,
        worktree_path: &Path,
        worktree_name: &str,
    ) -> Result<(), WorktreeError> {
        let git_repo_path_owned = git_repo_path.to_path_buf();
        let worktree_path_owned = worktree_path.to_path_buf();
        let worktree_name_owned = worktree_name.to_string();

        // First, try to open the repository to see if it exists
        let repo_result = tokio::task::spawn_blocking({
            let git_repo_path = git_repo_path_owned.clone();
            move || Repository::open(&git_repo_path)
        })
        .await;

        match repo_result {
            Ok(Ok(repo)) => {
                // Repository exists, perform comprehensive cleanup
                tokio::task::spawn_blocking(move || {
                    Self::comprehensive_worktree_cleanup(
                        &repo,
                        &worktree_path_owned,
                        &worktree_name_owned,
                    )
                })
                .await
                .map_err(|e| WorktreeError::TaskJoin(format!("Task join error: {e}")))?
            }
            Ok(Err(e)) => {
                // Repository doesn't exist (likely deleted project), fall back to simple cleanup
                debug!(
                    "Failed to open repository at {:?}: {}. Falling back to simple cleanup for worktree at {}",
                    git_repo_path_owned,
                    e,
                    worktree_path_owned.display()
                );
                Self::simple_worktree_cleanup(&worktree_path_owned).await?;
                Ok(())
            }
            Err(e) => Err(WorktreeError::TaskJoin(format!("{e}"))),
        }
    }

    /// Create worktree with retry logic in non-blocking manner
    async fn create_worktree_with_retry(
        git_repo_path: &Path,
        branch_name: &str,
        worktree_path: &Path,
        worktree_name: &str,
        path_str: &str,
    ) -> Result<(), WorktreeError> {
        let git_repo_path = git_repo_path.to_path_buf();
        let branch_name = branch_name.to_string();
        let worktree_path = worktree_path.to_path_buf();
        let worktree_name = worktree_name.to_string();
        let path_str = path_str.to_string();

        tokio::task::spawn_blocking(move || -> Result<(), WorktreeError> {
            // Open repository in blocking context
            let repo = Repository::open(&git_repo_path).map_err(WorktreeError::Git)?;

            // Find the branch reference using the branch name
            let branch_ref = GitService::find_branch(&repo, &branch_name)?.into_reference();

            // Create worktree options
            let mut worktree_opts = WorktreeAddOptions::new();
            worktree_opts.reference(Some(&branch_ref));

            match repo.worktree(&branch_name, &worktree_path, Some(&worktree_opts)) {
                Ok(_) => {
                    // Verify the worktree was actually created
                    if !worktree_path.exists() {
                        return Err(WorktreeError::Repository(format!(
                            "Worktree creation reported success but path {path_str} does not exist"
                        )));
                    }

                    info!(
                        "Successfully created worktree {} at {}",
                        branch_name, path_str
                    );

                    // Fix commondir for Windows/WSL compatibility
                    if let Err(e) = Self::fix_worktree_commondir_for_windows_wsl(
                        Path::new(&git_repo_path),
                        &worktree_name,
                    ) {
                        warn!("Failed to fix worktree commondir for Windows/WSL: {}", e);
                    }

                    Ok(())
                }
                Err(e) if e.code() == git2::ErrorCode::Exists => {
                    // Handle the specific "directory exists" error for metadata
                    debug!(
                        "Worktree metadata directory exists, attempting force cleanup: {}",
                        e
                    );

                    // Force cleanup metadata and try one more time
                    Self::force_cleanup_worktree_metadata(&git_repo_path, &worktree_name)
                        .map_err(WorktreeError::Io)?;

                    // Try again after cleanup
                    match repo.worktree(&branch_name, &worktree_path, Some(&worktree_opts)) {
                        Ok(_) => {
                            if !worktree_path.exists() {
                                return Err(WorktreeError::Repository(format!(
                                    "Worktree creation reported success but path {path_str} does not exist"
                                )));
                            }

                            info!(
                                "Successfully created worktree {} at {} after metadata cleanup",
                                branch_name, path_str
                            );

                            // Fix commondir for Windows/WSL compatibility
                            if let Err(e) = Self::fix_worktree_commondir_for_windows_wsl(
                                Path::new(&git_repo_path),
                                &worktree_name,
                            ) {
                                warn!("Failed to fix worktree commondir for Windows/WSL: {}", e);
                            }

                            Ok(())
                        }
                        Err(retry_error) => {
                            debug!(
                                "Worktree creation failed even after metadata cleanup: {}",
                                retry_error
                            );
                            Err(WorktreeError::Git(retry_error))
                        }
                    }
                }
                Err(e) => Err(WorktreeError::Git(e)),
            }
        })
        .await
        .map_err(|e| WorktreeError::TaskJoin(format!("{e}")))?
    }

    /// Get the git repository path
    fn get_git_repo_path(repo: &Repository) -> Result<PathBuf, WorktreeError> {
        repo.workdir()
            .ok_or_else(|| {
                WorktreeError::Repository("Repository has no working directory".to_string())
            })?
            .to_str()
            .ok_or_else(|| {
                WorktreeError::InvalidPath("Repository path is not valid UTF-8".to_string())
            })
            .map(PathBuf::from)
    }

    /// Force cleanup worktree metadata directory
    fn force_cleanup_worktree_metadata(
        git_repo_path: &Path,
        worktree_name: &str,
    ) -> Result<(), std::io::Error> {
        let git_worktree_metadata_path = git_repo_path
            .join(".git")
            .join("worktrees")
            .join(worktree_name);

        if git_worktree_metadata_path.exists() {
            debug!(
                "Force removing git worktree metadata: {}",
                git_worktree_metadata_path.display()
            );
            std::fs::remove_dir_all(&git_worktree_metadata_path)?;
        }

        Ok(())
    }

    /// Clean up a worktree path and its git metadata (non-blocking)
    /// If git_repo_path is None, attempts to infer it from the worktree itself
    pub async fn cleanup_worktree(
        worktree_path: &Path,
        git_repo_path: Option<&Path>,
    ) -> Result<(), WorktreeError> {
        let path_str = worktree_path.to_string_lossy().to_string();

        // Get the same lock to ensure we don't interfere with creation
        let lock = {
            let mut locks = WORKTREE_CREATION_LOCKS.lock().unwrap();
            locks
                .entry(path_str.clone())
                .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(())))
                .clone()
        };

        let _guard = lock.lock().await;

        if let Some(worktree_name) = worktree_path.file_name().and_then(|n| n.to_str()) {
            // Try to determine the git repo path if not provided
            let resolved_repo_path = if let Some(repo_path) = git_repo_path {
                Some(repo_path.to_path_buf())
            } else {
                Self::infer_git_repo_path(worktree_path).await
            };

            if let Some(repo_path) = resolved_repo_path {
                Self::comprehensive_worktree_cleanup_async(
                    &repo_path,
                    worktree_path,
                    worktree_name,
                )
                .await?;
            } else {
                // Can't determine repo path, just clean up the worktree directory
                debug!(
                    "Cannot determine git repo path for worktree {}, performing simple cleanup",
                    path_str
                );
                Self::simple_worktree_cleanup(worktree_path).await?;
            }
        } else {
            return Err(WorktreeError::InvalidPath(
                "Invalid worktree path, cannot determine name".to_string(),
            ));
        }

        Ok(())
    }

    /// Try to infer the git repository path from a worktree
    async fn infer_git_repo_path(worktree_path: &Path) -> Option<PathBuf> {
        // Try using git rev-parse --git-common-dir from within the worktree
        let worktree_path_owned = worktree_path.to_path_buf();

        tokio::task::spawn_blocking(move || {
            let (shell_cmd, shell_arg) = get_shell_command();
            let git_command = "git rev-parse --git-common-dir";

            let output = std::process::Command::new(shell_cmd)
                .args([shell_arg, git_command])
                .current_dir(&worktree_path_owned)
                .output()
                .ok()?;

            if output.status.success() {
                let git_common_dir = String::from_utf8(output.stdout).ok()?.trim().to_string();

                // git-common-dir gives us the path to the .git directory
                // We need the working directory (parent of .git)
                let git_dir_path = Path::new(&git_common_dir);
                if git_dir_path.file_name() == Some(std::ffi::OsStr::new(".git")) {
                    git_dir_path.parent()?.to_str().map(PathBuf::from)
                } else {
                    // In case of bare repo or unusual setup, use the git-common-dir as is
                    Some(PathBuf::from(git_common_dir))
                }
            } else {
                None
            }
        })
        .await
        .ok()
        .flatten()
    }

    /// Simple worktree cleanup when we can't determine the main repo
    async fn simple_worktree_cleanup(worktree_path: &Path) -> Result<(), WorktreeError> {
        let worktree_path_owned = worktree_path.to_path_buf();

        tokio::task::spawn_blocking(move || -> Result<(), WorktreeError> {
            if worktree_path_owned.exists() {
                std::fs::remove_dir_all(&worktree_path_owned).map_err(WorktreeError::Io)?;
                info!(
                    "Removed worktree directory: {}",
                    worktree_path_owned.display()
                );
            }
            Ok(())
        })
        .await
        .map_err(|e| WorktreeError::TaskJoin(format!("{e}")))?
    }

    /// Rewrite worktree's commondir file to use relative paths for WSL compatibility
    ///
    /// This fixes Git repository corruption in WSL environments where git2/libgit2 creates
    /// worktrees with absolute WSL paths (/mnt/c/...) that Windows Git cannot understand.
    /// Git CLI creates relative paths (../../..) which work across both environments.
    ///
    /// References:
    /// - Git 2.48+ native support: https://git-scm.com/docs/git-config/2.48.0#Documentation/git-config.txt-worktreeuseRelativePaths
    /// - WSL worktree absolute path issue: https://github.com/git-ecosystem/git-credential-manager/issues/1789
    pub fn fix_worktree_commondir_for_windows_wsl(
        git_repo_path: &Path,
        worktree_name: &str,
    ) -> Result<(), std::io::Error> {
        if !cfg!(target_os = "linux") || !is_wsl2() {
            debug!("Skipping commondir fix for non-WSL2 environment");
            return Ok(());
        }

        let commondir_path = git_repo_path
            .join(".git")
            .join("worktrees")
            .join(worktree_name)
            .join("commondir");

        if !commondir_path.exists() {
            debug!(
                "commondir file does not exist: {}",
                commondir_path.display()
            );
            return Ok(());
        }

        // Read current commondir content
        let current_content = std::fs::read_to_string(&commondir_path)?.trim().to_string();

        debug!("Current commondir content: {}", current_content);

        // Skip if already relative
        if !Path::new(&current_content).is_absolute() {
            debug!("commondir already contains relative path, skipping");
            return Ok(());
        }

        // Calculate relative path from worktree metadata dir to repo .git dir
        let metadata_dir = commondir_path.parent().unwrap();
        let target_git_dir = Path::new(&current_content);

        if let Some(relative_path) = pathdiff::diff_paths(target_git_dir, metadata_dir) {
            let relative_path_str = relative_path.to_string_lossy();

            // Safety check: ensure the relative path resolves to the same absolute path
            let resolved_path = metadata_dir.join(&relative_path);
            if let (Ok(resolved_canonical), Ok(target_canonical)) =
                (resolved_path.canonicalize(), target_git_dir.canonicalize())
            {
                if resolved_canonical == target_canonical {
                    // Write the relative path
                    std::fs::write(&commondir_path, format!("{relative_path_str}\n"))?;
                    info!(
                        "Rewrote commondir to relative path: {} -> {}",
                        current_content, relative_path_str
                    );
                } else {
                    warn!(
                        "Safety check failed: relative path {} does not resolve to same target",
                        relative_path_str
                    );
                }
            } else {
                warn!("Failed to canonicalize paths for safety check");
            }
        } else {
            warn!(
                "Failed to calculate relative path from {} to {}",
                metadata_dir.display(),
                target_git_dir.display()
            );
        }

        Ok(())
    }

    /// Get the base directory for vibe-kanban worktrees
    pub fn get_worktree_base_dir() -> std::path::PathBuf {
        utils::path::get_vibe_kanban_temp_dir().join("worktrees")
    }
}
