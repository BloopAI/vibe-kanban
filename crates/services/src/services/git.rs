use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use git2::{
    BranchType, CherrypickOptions, Cred, DiffOptions, Error as GitError, FetchOptions,
    RemoteCallbacks, Repository, Status, StatusOptions, build::CheckoutBuilder,
};
use regex;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tracing::debug;
use ts_rs::TS;
use utils::diff::{DiffChunk, DiffChunkType, FileDiff, WorktreeDiff};

use crate::services::worktree_manager::WorktreeManager;

// use crate::{
//     models::task_attempt::{DiffChunk, DiffChunkType, FileDiff, WorktreeDiff},
//     utils::worktree_manager::WorktreeManager,
// };

#[derive(Debug, Error)]
pub enum GitServiceError {
    #[error(transparent)]
    Git(#[from] GitError),
    #[error(transparent)]
    IoError(#[from] std::io::Error),
    #[error("Invalid repository: {0}")]
    InvalidRepository(String),
    #[error("Branch not found: {0}")]
    BranchNotFound(String),
    #[error("Merge conflicts: {0}")]
    MergeConflicts(String),
    #[error("Invalid path: {0}")]
    InvalidPath(String),
    #[error("Worktree has uncommitted changes: {0}")]
    WorktreeDirty(String),
    #[error("Invalid file paths: {0}")]
    InvalidFilePaths(String),
}

/// Service for managing Git operations in task execution workflows
#[derive(Clone)]
pub struct GitService {}

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct GitBranch {
    pub name: String,
    pub is_current: bool,
    pub is_remote: bool,
    #[ts(type = "Date")]
    pub last_commit_date: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct BranchStatus {
    pub is_behind: bool,
    pub commits_behind: usize,
    pub commits_ahead: usize,
    pub up_to_date: bool,
    pub merged: bool,
    pub has_uncommitted_changes: bool,
    pub base_branch_name: String,
}

/// Represents a snapshot for diff comparison
enum Snapshot<'a> {
    /// Any git tree object
    Tree(git2::Oid),
    /// The work-dir / index as it is *now*, compared to the given base tree
    WorkdirAgainst(git2::Oid, &'a Path),
}

impl GitService {
    /// Create a new GitService for the given repository path
    pub fn new() -> Self {
        Self {}
    }

    /// Normalize a path to be repo-relative and use POSIX separators
    fn normalize_to_repo_relative(
        repo: &Repository,
        path: &Path,
    ) -> Result<String, GitServiceError> {
        // Get the repository's working directory
        let repo_workdir = repo.workdir().ok_or_else(|| {
            GitServiceError::InvalidRepository("Repository has no working directory".to_string())
        })?;

        // Try to strip the repo prefix if path is absolute
        let relative_path = if path.is_absolute() {
            path.strip_prefix(repo_workdir).map_err(|_| {
                GitServiceError::InvalidFilePaths(format!(
                    "Path '{}' is outside repository root '{}'",
                    path.display(),
                    repo_workdir.display()
                ))
            })?
        } else {
            path
        };

        // Convert to string and normalize separators to forward slashes
        let path_str = relative_path.to_string_lossy();
        let normalized = path_str.replace('\\', "/");

        // Remove leading "./" if present
        let normalized = normalized.strip_prefix("./").unwrap_or(&normalized);

        // Security check: prevent path traversal attacks
        if normalized.contains("../") || normalized.starts_with("../") {
            return Err(GitServiceError::InvalidFilePaths(format!(
                "Path traversal not allowed: '{}'",
                normalized
            )));
        }

        Ok(normalized.to_string())
    }

    /// Validate and normalize file paths for use with git pathspec
    fn validate_and_normalize_paths<P: AsRef<Path>>(
        repo: &Repository,
        file_paths: Option<&[P]>,
    ) -> Result<Option<Vec<String>>, GitServiceError> {
        if let Some(paths) = file_paths {
            let mut normalized_paths = Vec::with_capacity(paths.len());

            for path in paths {
                let normalized = Self::normalize_to_repo_relative(repo, path.as_ref())?;
                normalized_paths.push(normalized);
            }

            // Quick validation: check if any of the paths exist in the repo
            if !normalized_paths.is_empty() {
                let index = repo.index().map_err(GitServiceError::from)?;
                let any_exists = normalized_paths
                    .iter()
                    .any(|path| index.get_path(Path::new(path), 0).is_some());

                // Also check workdir for untracked files
                let workdir_exists = if let Some(workdir) = repo.workdir() {
                    normalized_paths
                        .iter()
                        .any(|path| workdir.join(path).exists())
                } else {
                    false
                };

                if !any_exists && !workdir_exists {
                    debug!(
                        "None of the specified paths exist in repository or workdir: {:?}",
                        normalized_paths
                    );
                }
            }

            Ok(Some(normalized_paths))
        } else {
            Ok(None)
        }
    }

    /// Converts a Patch into our "render friendly" representation
    fn patch_to_chunks(patch: &git2::Patch) -> Vec<DiffChunk> {
        let mut chunks = Vec::new();
        for hunk_idx in 0..patch.num_hunks() {
            let (_, hunk_lines) = patch.hunk(hunk_idx).unwrap();
            for line_idx in 0..hunk_lines {
                let l = patch.line_in_hunk(hunk_idx, line_idx).unwrap();
                let kind = match l.origin() {
                    ' ' => DiffChunkType::Equal,
                    '+' => DiffChunkType::Insert,
                    '-' => DiffChunkType::Delete,
                    _ => continue,
                };
                chunks.push(DiffChunk {
                    chunk_type: kind,
                    content: String::from_utf8_lossy(l.content()).into_owned(),
                });
            }
        }
        chunks
    }

    /// Builds FileDiffs from a generic git2::Diff
    fn diff_to_file_diffs(diff: &git2::Diff) -> Result<Vec<FileDiff>, GitServiceError> {
        let mut files = Vec::new();

        for idx in 0..diff.deltas().len() {
            let delta = diff.get_delta(idx).unwrap();
            let path = delta
                .new_file()
                .path()
                .or_else(|| delta.old_file().path())
                .and_then(|p| p.to_str())
                .unwrap_or("<unknown>")
                .to_owned();

            // Build the in-memory patch that libgit2 has already computed
            if let Some(patch) = git2::Patch::from_diff(diff, idx)? {
                // Special-case pure add/delete with no hunks
                let chunks = if patch.num_hunks() == 0 {
                    vec![DiffChunk {
                        chunk_type: match delta.status() {
                            git2::Delta::Added => DiffChunkType::Insert,
                            git2::Delta::Deleted => DiffChunkType::Delete,
                            _ => DiffChunkType::Equal,
                        },
                        content: format!(
                            "{} file",
                            if delta.status() == git2::Delta::Added {
                                "Added"
                            } else {
                                "Deleted"
                            }
                        ),
                    }]
                } else {
                    Self::patch_to_chunks(&patch)
                };

                files.push(FileDiff { path, chunks });
            }
        }

        Ok(files)
    }

    /// Generic diff engine that handles all types of comparisons
    fn run_diff<P: AsRef<Path>>(
        repo: &Repository,
        left: Snapshot<'_>,
        right: Snapshot<'_>,
        file_paths: Option<&[P]>,
    ) -> Result<Vec<FileDiff>, GitServiceError> {
        let mut opts = git2::DiffOptions::new();
        opts.context_lines(10);
        opts.interhunk_lines(0);

        // Apply pathspec filtering if file paths are provided
        if let Some(normalized_paths) = Self::validate_and_normalize_paths(repo, file_paths)? {
            // Add each path as a pathspec entry
            for path in &normalized_paths {
                opts.pathspec(path);
            }
        }

        let diff = match (left, right) {
            (Snapshot::Tree(a), Snapshot::Tree(b)) => repo.diff_tree_to_tree(
                Some(&repo.find_tree(a)?),
                Some(&repo.find_tree(b)?),
                Some(&mut opts),
            )?,
            (Snapshot::Tree(base), Snapshot::WorkdirAgainst(_, _))
            | (Snapshot::WorkdirAgainst(_, _), Snapshot::Tree(base)) => {
                opts.include_untracked(true);
                repo.diff_tree_to_workdir_with_index(Some(&repo.find_tree(base)?), Some(&mut opts))?
            }
            (Snapshot::WorkdirAgainst(_, _), Snapshot::WorkdirAgainst(_, _)) => {
                unreachable!("work-dir vs work-dir makes no sense here")
            }
        };

        Self::diff_to_file_diffs(&diff)
    }

    /// Diff for an already-merged squash commit
    pub fn diff_for_merge_commit<P: AsRef<Path>>(
        &self,
        repo_path: &Path,
        merge_commit: git2::Oid,
        file_paths: Option<&[P]>,
    ) -> Result<WorktreeDiff, GitServiceError> {
        let repo = self.open_repo(repo_path)?;
        let mc = repo.find_commit(merge_commit)?;
        let base = mc
            .parent(0)
            .map(|p| p.tree().unwrap().id())
            .unwrap_or_else(|_| {
                // For the initial commit, use an empty tree
                repo.treebuilder(None).unwrap().write().unwrap()
            });

        let files = Self::run_diff(
            &repo,
            Snapshot::Tree(base),
            Snapshot::Tree(mc.tree()?.id()),
            file_paths,
        )?;
        Ok(WorktreeDiff { files })
    }

    /// Diff for a work-tree that has not been merged yet
    pub fn diff_for_worktree<P: AsRef<Path>>(
        &self,
        worktree_path: &Path,
        base_branch_commit: git2::Oid,
        file_paths: Option<&[P]>,
    ) -> Result<WorktreeDiff, GitServiceError> {
        let repo = Repository::open(worktree_path)?;
        let base_tree = repo.find_commit(base_branch_commit)?.tree()?.id();
        let files = Self::run_diff(
            &repo,
            Snapshot::Tree(base_tree),
            Snapshot::WorkdirAgainst(base_branch_commit, worktree_path),
            file_paths,
        )?;
        Ok(WorktreeDiff { files })
    }

    /// Open the repository
    fn open_repo(&self, repo_path: &Path) -> Result<Repository, GitServiceError> {
        Repository::open(repo_path).map_err(GitServiceError::from)
    }

    pub fn create_initial_commit(&self, repo: &Repository) -> Result<(), GitServiceError> {
        let signature = repo.signature().unwrap_or_else(|_| {
            // Fallback if no Git config is set
            git2::Signature::now("Vibe Kanban", "noreply@vibekanban.com")
                .expect("Failed to create fallback signature")
        });

        let tree_id = {
            let tree_builder = repo.treebuilder(None)?;
            tree_builder.write()?
        };
        let tree = repo.find_tree(tree_id)?;

        // Create initial commit on main branch
        let _commit_id = repo.commit(
            Some("refs/heads/main"),
            &signature,
            &signature,
            "Initial commit",
            &tree,
            &[],
        )?;

        // Set HEAD to point to main branch
        repo.set_head("refs/heads/main")?;

        Ok(())
    }

    /// Merge changes from a worktree branch back to the main repository
    pub fn merge_changes(
        &self,
        repo_path: &Path,
        worktree_path: &Path,
        branch_name: &str,
        base_branch_name: &str,
        commit_message: &str,
    ) -> Result<String, GitServiceError> {
        // Open the worktree repository
        let worktree_repo = Repository::open(worktree_path)?;

        // Check if worktree is dirty before proceeding
        self.check_worktree_clean(&worktree_repo)?;

        // Verify the task branch exists in the worktree
        let task_branch = worktree_repo
            .find_branch(branch_name, BranchType::Local)
            .map_err(|_| GitServiceError::BranchNotFound(branch_name.to_string()))?;

        // Get the base branch from the worktree
        let base_branch = worktree_repo
            .find_branch(base_branch_name, BranchType::Local)
            .map_err(|_| GitServiceError::BranchNotFound(base_branch_name.to_string()))?;

        // Get commits
        let base_commit = base_branch.get().peel_to_commit()?;
        let task_commit = task_branch.get().peel_to_commit()?;

        // Get the signature for the merge commit
        let signature = worktree_repo.signature()?;

        // Perform a squash merge - create a single commit with all changes
        let squash_commit_id = self.perform_squash_merge(
            &worktree_repo,
            &base_commit,
            &task_commit,
            &signature,
            commit_message,
            base_branch_name,
        )?;

        // Fix: Update main repo's HEAD if it's pointing to the base branch
        let main_repo = self.open_repo(repo_path)?;
        let refname = format!("refs/heads/{}", base_branch_name);

        if let Ok(main_head) = main_repo.head() {
            if let Some(branch_name) = main_head.shorthand() {
                if branch_name == base_branch_name {
                    // Only update main repo's HEAD if it's currently on the base branch
                    main_repo.set_head(&refname)?;
                    let mut co = CheckoutBuilder::new();
                    co.force();
                    main_repo.checkout_head(Some(&mut co))?;
                }
            }
        }

        Ok(squash_commit_id.to_string())
    }

    pub fn get_branch_status(
        &self,
        repo_path: &Path,
        branch_name: &str,
        base_branch_name: &str,
        is_merged: bool,
    ) -> Result<BranchStatus, GitServiceError> {
        let repo = Repository::open(repo_path)?;

        let branch_ref = repo
            // try "refs/heads/<name>" first, then raw name
            .find_reference(&format!("refs/heads/{}", branch_name))
            .or_else(|_| repo.find_reference(&branch_name))?;
        let branch_oid = branch_ref.target().unwrap();

        // 1. prefer the branch’s configured upstream, if any
        if let Ok(local_branch) = repo.find_branch(&branch_name, BranchType::Local) {
            if let Ok(upstream) = local_branch.upstream() {
                if let Some(_name) = upstream.name()? {
                    if let Some(base_oid) = upstream.get().target() {
                        let (_ahead, _behind) = repo.graph_ahead_behind(branch_oid, base_oid)?;
                        // Ignore upstream since we use stored base branch
                    }
                }
            }
        }
        // Calculate ahead/behind counts using the stored base branch
        let (commits_ahead, commits_behind) =
            if let Ok(base_branch) = repo.find_branch(&base_branch_name, BranchType::Local) {
                if let Some(base_oid) = base_branch.get().target() {
                    repo.graph_ahead_behind(branch_oid, base_oid)?
                } else {
                    (0, 0) // Base branch has no commits
                }
            } else {
                // Base branch doesn't exist, assume no relationship
                (0, 0)
            };

        let mut status_opts = StatusOptions::new();
        status_opts
            .include_untracked(true)
            .recurse_untracked_dirs(true)
            .include_ignored(false);

        let has_uncommitted_changes = repo
            .statuses(Some(&mut status_opts))?
            .iter()
            .any(|e| e.status() != Status::CURRENT);

        Ok(BranchStatus {
            is_behind: commits_behind > 0,
            commits_behind,
            commits_ahead,
            up_to_date: commits_behind == 0 && commits_ahead == 0,
            merged: is_merged,
            has_uncommitted_changes,
            base_branch_name: base_branch_name.to_string(),
        })
    }

    /// Check if the worktree is clean (no uncommitted changes to tracked files)
    fn check_worktree_clean(&self, repo: &Repository) -> Result<(), GitServiceError> {
        let mut status_options = git2::StatusOptions::new();
        status_options
            .include_untracked(false) // Don't include untracked files
            .include_ignored(false); // Don't include ignored files

        let statuses = repo.statuses(Some(&mut status_options))?;

        if !statuses.is_empty() {
            let mut dirty_files = Vec::new();
            for entry in statuses.iter() {
                let status = entry.status();
                // Only consider files that are actually tracked and modified
                if status.intersects(
                    git2::Status::INDEX_MODIFIED
                        | git2::Status::INDEX_NEW
                        | git2::Status::INDEX_DELETED
                        | git2::Status::INDEX_RENAMED
                        | git2::Status::INDEX_TYPECHANGE
                        | git2::Status::WT_MODIFIED
                        | git2::Status::WT_DELETED
                        | git2::Status::WT_RENAMED
                        | git2::Status::WT_TYPECHANGE,
                ) {
                    if let Some(path) = entry.path() {
                        dirty_files.push(path.to_string());
                    }
                }
            }

            if !dirty_files.is_empty() {
                return Err(GitServiceError::WorktreeDirty(dirty_files.join(", ")));
            }
        }

        Ok(())
    }

    pub fn get_current_branch(&self, repo_path: &Path) -> Result<String, git2::Error> {
        let repo = Repository::open(repo_path)?;
        let head = repo.head()?;
        if let Some(branch_name) = head.shorthand() {
            Ok(branch_name.to_string())
        } else {
            Ok("HEAD".to_string())
        }
    }

    pub fn get_all_branches(&self, repo_path: &Path) -> Result<Vec<GitBranch>, git2::Error> {
        let repo = Repository::open(repo_path)?;
        let current_branch = self.get_current_branch(repo_path).unwrap_or_default();
        let mut branches = Vec::new();

        // Helper function to get last commit date for a branch
        let get_last_commit_date = |branch: &git2::Branch| -> Result<DateTime<Utc>, git2::Error> {
            if let Some(target) = branch.get().target() {
                if let Ok(commit) = repo.find_commit(target) {
                    let timestamp = commit.time().seconds();
                    return Ok(DateTime::from_timestamp(timestamp, 0).unwrap_or_else(Utc::now));
                }
            }
            Ok(Utc::now()) // Default to now if we can't get the commit date
        };

        // Get local branches
        let local_branches = repo.branches(Some(BranchType::Local))?;
        for branch_result in local_branches {
            let (branch, _) = branch_result?;
            if let Some(name) = branch.name()? {
                let last_commit_date = get_last_commit_date(&branch)?;
                branches.push(GitBranch {
                    name: name.to_string(),
                    is_current: name == current_branch,
                    is_remote: false,
                    last_commit_date,
                });
            }
        }

        // Get remote branches
        let remote_branches = repo.branches(Some(BranchType::Remote))?;
        for branch_result in remote_branches {
            let (branch, _) = branch_result?;
            if let Some(name) = branch.name()? {
                // Skip remote HEAD references
                if !name.ends_with("/HEAD") {
                    let last_commit_date = get_last_commit_date(&branch)?;
                    branches.push(GitBranch {
                        name: name.to_string(),
                        is_current: false,
                        is_remote: true,
                        last_commit_date,
                    });
                }
            }
        }

        // Sort branches: current first, then by most recent commit date
        branches.sort_by(|a, b| {
            if a.is_current && !b.is_current {
                std::cmp::Ordering::Less
            } else if !a.is_current && b.is_current {
                std::cmp::Ordering::Greater
            } else {
                // Sort by most recent commit date (newest first)
                b.last_commit_date.cmp(&a.last_commit_date)
            }
        });

        Ok(branches)
    }

    /// Perform a squash merge of task branch into base branch, but fail on conflicts
    fn perform_squash_merge(
        &self,
        repo: &Repository,
        base_commit: &git2::Commit,
        task_commit: &git2::Commit,
        signature: &git2::Signature,
        commit_message: &str,
        base_branch_name: &str,
    ) -> Result<git2::Oid, GitServiceError> {
        // Attempt an in-memory merge to detect conflicts
        let merge_opts = git2::MergeOptions::new();
        let mut index = repo.merge_commits(base_commit, task_commit, Some(&merge_opts))?;

        // If there are conflicts, return an error
        if index.has_conflicts() {
            return Err(GitServiceError::MergeConflicts(
                "Merge failed due to conflicts. Please resolve conflicts manually.".to_string(),
            ));
        }

        // Write the merged tree back to the repository
        let tree_id = index.write_tree_to(repo)?;
        let tree = repo.find_tree(tree_id)?;

        // Create a squash commit: use merged tree with base_commit as sole parent
        let squash_commit_id = repo.commit(
            None,           // Don't update any reference yet
            signature,      // Author
            signature,      // Committer
            commit_message, // Custom message
            &tree,          // Merged tree content
            &[base_commit], // Single parent: base branch commit
        )?;

        // Update the base branch reference to point to the new commit
        let refname = format!("refs/heads/{}", base_branch_name);
        repo.reference(&refname, squash_commit_id, true, "Squash merge")?;

        Ok(squash_commit_id)
    }

    /// Rebase a worktree branch onto a new base
    pub fn rebase_branch(
        &self,
        repo_path: &Path,
        worktree_path: &Path,
        new_base_branch: Option<&str>,
        old_base_branch: &str,
    ) -> Result<String, GitServiceError> {
        let worktree_repo = Repository::open(worktree_path)?;
        let main_repo = self.open_repo(repo_path)?;

        // Check if there's an existing rebase in progress and abort it
        let state = worktree_repo.state();
        if state == git2::RepositoryState::Rebase
            || state == git2::RepositoryState::RebaseInteractive
            || state == git2::RepositoryState::RebaseMerge
        {
            tracing::warn!("Existing rebase in progress, aborting it first");
            // Try to abort the existing rebase
            if let Ok(mut existing_rebase) = worktree_repo.open_rebase(None) {
                let _ = existing_rebase.abort();
            }
        }

        // Get the target base branch reference
        let base_branch_name = match new_base_branch {
            Some(branch) => branch.to_string(),
            None => main_repo
                .head()
                .ok()
                .and_then(|head| head.shorthand().map(|s| s.to_string()))
                .unwrap_or_else(|| "main".to_string()),
        };
        let base_branch_name = base_branch_name.as_str();

        // Handle remote branches by fetching them first and creating/updating local tracking branches
        let local_branch_name = if base_branch_name.starts_with("origin/") {
            // This is a remote branch, fetch it and create/update local tracking branch
            let remote_branch_name = base_branch_name.strip_prefix("origin/").unwrap();

            // First, fetch the latest changes from remote
            self.fetch_from_remote(&main_repo)?;

            // Try to find the remote branch after fetch
            let remote_branch = main_repo
                .find_branch(base_branch_name, BranchType::Remote)
                .map_err(|_| GitServiceError::BranchNotFound(base_branch_name.to_string()))?;

            // Check if local tracking branch exists
            match main_repo.find_branch(remote_branch_name, BranchType::Local) {
                Ok(mut local_branch) => {
                    // Local tracking branch exists, update it to match remote
                    let remote_commit = remote_branch.get().peel_to_commit()?;
                    local_branch
                        .get_mut()
                        .set_target(remote_commit.id(), "Update local branch to match remote")?;
                }
                Err(_) => {
                    // Local tracking branch doesn't exist, create it
                    let remote_commit = remote_branch.get().peel_to_commit()?;
                    main_repo.branch(remote_branch_name, &remote_commit, false)?;
                }
            }

            // Use the local branch name for rebase
            remote_branch_name
        } else {
            // This is already a local branch
            base_branch_name
        };

        // Get the local branch for rebase
        let base_branch = main_repo
            .find_branch(local_branch_name, BranchType::Local)
            .map_err(|_| GitServiceError::BranchNotFound(local_branch_name.to_string()))?;

        let new_base_commit_id = base_branch.get().peel_to_commit()?.id();

        // Get the HEAD commit of the worktree (the changes to rebase)
        let head = worktree_repo.head()?;
        let task_branch_commit_id = head.peel_to_commit()?.id();

        let signature = worktree_repo.signature()?;

        // Find the old base branch
        let old_base_branch_ref = if old_base_branch.starts_with("origin/") {
            // Remote branch - get local tracking branch name
            let remote_branch_name = old_base_branch.strip_prefix("origin/").unwrap();
            main_repo
                .find_branch(remote_branch_name, BranchType::Local)
                .map_err(|_| GitServiceError::BranchNotFound(remote_branch_name.to_string()))?
        } else {
            // Local branch
            main_repo
                .find_branch(old_base_branch, BranchType::Local)
                .map_err(|_| GitServiceError::BranchNotFound(old_base_branch.to_string()))?
        };

        let old_base_commit_id = old_base_branch_ref.get().peel_to_commit()?.id();

        // Find commits unique to the task branch
        let unique_commits = Self::find_unique_commits(
            &worktree_repo,
            task_branch_commit_id,
            old_base_commit_id,
            new_base_commit_id,
        )?;

        if !unique_commits.is_empty() {
            // Reset HEAD to the new base branch
            let new_base_commit = worktree_repo.find_commit(new_base_commit_id)?;
            worktree_repo.reset(new_base_commit.as_object(), git2::ResetType::Hard, None)?;

            // Cherry-pick the unique commits
            Self::cherry_pick_commits(&worktree_repo, &unique_commits, &signature)?;
        } else {
            // No unique commits to rebase, just reset to new base
            let new_base_commit = worktree_repo.find_commit(new_base_commit_id)?;
            worktree_repo.reset(new_base_commit.as_object(), git2::ResetType::Hard, None)?;
        }

        // Get the final commit ID after rebase
        let final_head = worktree_repo.head()?;
        let final_commit = final_head.peel_to_commit()?;

        Ok(final_commit.id().to_string())
    }

    /// Get enhanced diff for task attempts (from merge commit or worktree)
    pub fn get_enhanced_diff<P: AsRef<Path>>(
        &self,
        repo_path: &Path,
        worktree_path: &Path,
        merge_commit_id: Option<&str>,
        base_branch: &str,
        file_paths: Option<&[P]>,
    ) -> Result<WorktreeDiff, GitServiceError> {
        if let Some(merge_commit_id) = merge_commit_id {
            // Task attempt has been merged - show the diff from the merge commit
            let commit_oid = git2::Oid::from_str(merge_commit_id)
                .map_err(|_| GitServiceError::InvalidRepository("Invalid commit ID".to_string()))?;
            self.diff_for_merge_commit(repo_path, commit_oid, file_paths)
        } else {
            // Task attempt not yet merged - get worktree diff
            let main_repo = self.open_repo(repo_path)?;
            let base_branch_ref = main_repo
                .find_branch(base_branch, BranchType::Local)
                .map_err(|_| GitServiceError::BranchNotFound(base_branch.to_string()))?;
            let base_branch_commit = base_branch_ref.get().peel_to_commit()?.id();

            self.diff_for_worktree(worktree_path, base_branch_commit, file_paths)
        }
    }

    /// Delete a file from the repository and commit the change
    pub fn delete_file_and_commit(
        &self,
        worktree_path: &Path,
        file_path: &str,
    ) -> Result<String, GitServiceError> {
        let repo = Repository::open(worktree_path)?;

        // Get the absolute path to the file within the worktree
        let file_full_path = worktree_path.join(file_path);

        // Check if file exists and delete it
        if file_full_path.exists() {
            std::fs::remove_file(&file_full_path).map_err(|e| {
                GitServiceError::IoError(std::io::Error::other(format!(
                    "Failed to delete file {}: {}",
                    file_path, e
                )))
            })?;
        }

        // Stage the deletion
        let mut index = repo.index()?;
        index.remove_path(Path::new(file_path))?;
        index.write()?;

        // Create a commit for the file deletion
        let signature = repo.signature()?;
        let tree_id = index.write_tree()?;
        let tree = repo.find_tree(tree_id)?;

        // Get the current HEAD commit
        let head = repo.head()?;
        let parent_commit = head.peel_to_commit()?;

        let commit_message = format!("Delete file: {}", file_path);
        let commit_id = repo.commit(
            Some("HEAD"),
            &signature,
            &signature,
            &commit_message,
            &tree,
            &[&parent_commit],
        )?;

        Ok(commit_id.to_string())
    }

    /// Get the default branch name for the repository
    pub fn get_default_branch_name(&self, repo_path: &PathBuf) -> Result<String, GitServiceError> {
        let repo = self.open_repo(repo_path)?;

        let result = match repo.head() {
            Ok(head_ref) => Ok(head_ref.shorthand().unwrap_or("main").to_string()),
            Err(e)
                if e.class() == git2::ErrorClass::Reference
                    && e.code() == git2::ErrorCode::UnbornBranch =>
            {
                Ok("main".to_string()) // Repository has no commits yet
            }
            Err(_) => Ok("main".to_string()), // Fallback
        };
        result
    }

    /// Extract GitHub owner and repo name from git repo path
    pub fn get_github_repo_info(
        &self,
        repo_path: &PathBuf,
    ) -> Result<(String, String), GitServiceError> {
        let repo = self.open_repo(repo_path)?;
        let remote = repo.find_remote("origin").map_err(|_| {
            GitServiceError::InvalidRepository("No 'origin' remote found".to_string())
        })?;

        let url = remote.url().ok_or_else(|| {
            GitServiceError::InvalidRepository("Remote origin has no URL".to_string())
        })?;

        // Parse GitHub URL (supports both HTTPS and SSH formats)
        let github_regex = regex::Regex::new(r"github\.com[:/]([^/]+)/(.+?)(?:\.git)?/?$")
            .map_err(|e| GitServiceError::InvalidRepository(format!("Regex error: {}", e)))?;

        if let Some(captures) = github_regex.captures(url) {
            let owner = captures.get(1).unwrap().as_str().to_string();
            let repo_name = captures.get(2).unwrap().as_str().to_string();
            Ok((owner, repo_name))
        } else {
            Err(GitServiceError::InvalidRepository(format!(
                "Not a GitHub repository: {}",
                url
            )))
        }
    }

    /// Push the branch to GitHub remote
    pub fn push_to_github(
        &self,
        worktree_path: &Path,
        branch_name: &str,
        github_token: &str,
    ) -> Result<(), GitServiceError> {
        let repo = Repository::open(worktree_path)?;

        // Get the remote
        let remote = repo.find_remote("origin")?;
        let remote_url = remote.url().ok_or_else(|| {
            GitServiceError::InvalidRepository("Remote origin has no URL".to_string())
        })?;

        // Convert SSH URL to HTTPS URL if necessary
        let https_url = if remote_url.starts_with("git@github.com:") {
            // Convert git@github.com:owner/repo.git to https://github.com/owner/repo.git
            remote_url.replace("git@github.com:", "https://github.com/")
        } else if remote_url.starts_with("ssh://git@github.com/") {
            // Convert ssh://git@github.com/owner/repo.git to https://github.com/owner/repo.git
            remote_url.replace("ssh://git@github.com/", "https://github.com/")
        } else {
            remote_url.to_string()
        };

        // Create a temporary remote with HTTPS URL for pushing
        let temp_remote_name = "temp_https_origin";

        // Remove any existing temp remote
        let _ = repo.remote_delete(temp_remote_name);

        // Create temporary HTTPS remote
        let mut temp_remote = repo.remote(temp_remote_name, &https_url)?;

        // Create refspec for pushing the branch
        let refspec = format!("refs/heads/{}:refs/heads/{}", branch_name, branch_name);

        // Set up authentication callback using the GitHub token
        let mut callbacks = git2::RemoteCallbacks::new();
        callbacks.credentials(|_url, username_from_url, _allowed_types| {
            git2::Cred::userpass_plaintext(username_from_url.unwrap_or("git"), github_token)
        });

        // Configure push options
        let mut push_options = git2::PushOptions::new();
        push_options.remote_callbacks(callbacks);

        // Push the branch
        let push_result = temp_remote.push(&[&refspec], Some(&mut push_options));

        // Clean up the temporary remote
        let _ = repo.remote_delete(temp_remote_name);

        // Check push result
        push_result?;

        Ok(())
    }

    /// Fetch from remote repository, with SSH authentication callbacks
    fn fetch_from_remote(&self, repo: &Repository) -> Result<(), GitServiceError> {
        // Find the “origin” remote
        let mut remote = repo.find_remote("origin").map_err(|_| {
            GitServiceError::Git(git2::Error::from_str("Remote 'origin' not found"))
        })?;

        // Prepare callbacks for authentication
        let mut callbacks = RemoteCallbacks::new();
        callbacks.credentials(|_url, username_from_url, _| {
            // Try SSH agent first
            if let Some(username) = username_from_url {
                if let Ok(cred) = Cred::ssh_key_from_agent(username) {
                    return Ok(cred);
                }
            }
            // Fallback to key file (~/.ssh/id_rsa)
            let home = dirs::home_dir()
                .ok_or_else(|| git2::Error::from_str("Could not find home directory"))?;
            let key_path = home.join(".ssh").join("id_rsa");
            Cred::ssh_key(username_from_url.unwrap_or("git"), None, &key_path, None)
        });

        // Set up fetch options with our callbacks
        let mut fetch_opts = FetchOptions::new();
        fetch_opts.remote_callbacks(callbacks);

        // Actually fetch (no specific refspecs = fetch all configured)
        remote
            .fetch(&[] as &[&str], Some(&mut fetch_opts), None)
            .map_err(GitServiceError::Git)?;
        Ok(())
    }

    /// Find the merge-base between two commits
    fn get_merge_base(
        repo: &Repository,
        commit1: git2::Oid,
        commit2: git2::Oid,
    ) -> Result<git2::Oid, GitServiceError> {
        repo.merge_base(commit1, commit2)
            .map_err(GitServiceError::Git)
    }

    /// Find commits that are unique to the task branch (not in either base branch)
    fn find_unique_commits(
        repo: &Repository,
        task_branch_commit: git2::Oid,
        old_base_commit: git2::Oid,
        new_base_commit: git2::Oid,
    ) -> Result<Vec<git2::Oid>, GitServiceError> {
        // Find merge-base between task branch and old base branch
        let task_old_base_merge_base =
            Self::get_merge_base(repo, task_branch_commit, old_base_commit)?;

        // Find merge-base between old base and new base
        let old_new_base_merge_base = Self::get_merge_base(repo, old_base_commit, new_base_commit)?;

        // Get all commits from task branch back to the merge-base with old base
        let mut walker = repo.revwalk()?;
        walker.push(task_branch_commit)?;
        walker.hide(task_old_base_merge_base)?;

        let mut task_commits = Vec::new();
        for commit_id in walker {
            let commit_id = commit_id?;

            // Check if this commit is not in the old base branch lineage
            // (i.e., it's not between old_new_base_merge_base and old_base_commit)
            let is_in_old_base = repo
                .graph_descendant_of(commit_id, old_new_base_merge_base)
                .unwrap_or(false)
                && repo
                    .graph_descendant_of(old_base_commit, commit_id)
                    .unwrap_or(false);

            if !is_in_old_base {
                task_commits.push(commit_id);
            }
        }

        // Reverse to get chronological order for cherry-picking
        task_commits.reverse();
        Ok(task_commits)
    }

    /// Cherry-pick specific commits onto a new base
    fn cherry_pick_commits(
        repo: &Repository,
        commits: &[git2::Oid],
        signature: &git2::Signature,
    ) -> Result<(), GitServiceError> {
        for &commit_id in commits {
            let commit = repo.find_commit(commit_id)?;

            // Cherry-pick the commit
            let mut cherrypick_opts = CherrypickOptions::new();
            repo.cherrypick(&commit, Some(&mut cherrypick_opts))?;

            // Check for conflicts
            let mut index = repo.index()?;
            if index.has_conflicts() {
                return Err(GitServiceError::MergeConflicts(format!(
                    "Cherry-pick failed due to conflicts on commit {}",
                    commit_id
                )));
            }

            // Commit the cherry-pick
            let tree_id = index.write_tree()?;
            let tree = repo.find_tree(tree_id)?;
            let head_commit = repo.head()?.peel_to_commit()?;

            repo.commit(
                Some("HEAD"),
                signature,
                signature,
                commit.message().unwrap_or("Cherry-picked commit"),
                &tree,
                &[&head_commit],
            )?;
        }

        Ok(())
    }

    /// Clone a repository to the specified directory
    #[cfg(feature = "cloud")]
    pub fn clone_repository(
        clone_url: &str,
        target_path: &Path,
        token: Option<&str>,
    ) -> Result<Repository, GitServiceError> {
        if let Some(parent) = target_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        // Set up callbacks for authentication if token is provided
        let mut callbacks = RemoteCallbacks::new();
        if let Some(token) = token {
            callbacks.credentials(|_url, username_from_url, _allowed_types| {
                Cred::userpass_plaintext(username_from_url.unwrap_or("git"), token)
            });
        } else {
            // Fallback to SSH agent and key file authentication
            callbacks.credentials(|_url, username_from_url, _| {
                // Try SSH agent first
                if let Some(username) = username_from_url {
                    if let Ok(cred) = Cred::ssh_key_from_agent(username) {
                        return Ok(cred);
                    }
                }
                // Fallback to key file (~/.ssh/id_rsa)
                let home = dirs::home_dir()
                    .ok_or_else(|| git2::Error::from_str("Could not find home directory"))?;
                let key_path = home.join(".ssh").join("id_rsa");
                Cred::ssh_key(username_from_url.unwrap_or("git"), None, &key_path, None)
            });
        }

        // Set up fetch options with our callbacks
        let mut fetch_opts = FetchOptions::new();
        fetch_opts.remote_callbacks(callbacks);

        // Create a repository builder with fetch options
        let mut builder = git2::build::RepoBuilder::new();
        builder.fetch_options(fetch_opts);

        let repo = builder.clone(clone_url, target_path)?;

        tracing::info!(
            "Successfully cloned repository from {} to {}",
            clone_url,
            target_path.display()
        );

        Ok(repo)
    }
}

// #[cfg(test)]
// mod tests {
//     use tempfile::TempDir;

//     use super::*;

//     fn create_test_repo() -> (TempDir, Repository) {
//         let temp_dir = TempDir::new().unwrap();
//         let repo = Repository::init(temp_dir.path()).unwrap();

//         // Configure the repository
//         let mut config = repo.config().unwrap();
//         config.set_str("user.name", "Test User").unwrap();
//         config.set_str("user.email", "test@example.com").unwrap();

//         (temp_dir, repo)
//     }

//     #[test]
//     fn test_git_service_creation() {
//         let (temp_dir, _repo) = create_test_repo();
//         let _git_service = GitService::new(temp_dir.path()).unwrap();
//     }

//     #[test]
//     fn test_invalid_repository_path() {
//         let result = GitService::new("/nonexistent/path");
//         assert!(result.is_err());
//     }

//     #[test]
//     fn test_default_branch_name() {
//         let (temp_dir, _repo) = create_test_repo();
//         let git_service = GitService::new(temp_dir.path()).unwrap();
//         let branch_name = git_service.get_default_branch_name().unwrap();
//         assert_eq!(branch_name, "main");
//     }
// }
