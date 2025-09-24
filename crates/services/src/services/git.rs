use std::{collections::HashMap, path::Path};

use chrono::{DateTime, Utc};
use git2::{
    BranchType, Delta, DiffFindOptions, DiffOptions, Error as GitError, Reference, Remote,
    Repository, Sort, build::CheckoutBuilder,
};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use ts_rs::TS;
use utils::diff::{Diff, DiffChangeKind, FileDiffDetails};

// Import for file ranking functionality
use super::file_ranker::FileStat;
use super::git_cli::{ChangeType, GitCli, GitCliError, StatusDiffEntry, StatusDiffOptions};
use crate::services::github_service::GitHubRepoInfo;

#[derive(Debug, Error)]
pub enum GitServiceError {
    #[error(transparent)]
    Git(#[from] GitError),
    #[error(transparent)]
    GitCLI(#[from] GitCliError),
    #[error(transparent)]
    IoError(#[from] std::io::Error),
    #[error("Invalid repository: {0}")]
    InvalidRepository(String),
    #[error("Branch not found: {0}")]
    BranchNotFound(String),
    #[error("Merge conflicts: {0}")]
    MergeConflicts(String),
    #[error("Branches diverged: {0}")]
    BranchesDiverged(String),
    #[error("{0} has uncommitted changes: {1}")]
    WorktreeDirty(String, String),
    #[error("No GitHub token available.")]
    TokenUnavailable,
    #[error("Rebase in progress; resolve or abort it before retrying")]
    RebaseInProgress,
}
/// Service for managing Git operations in task execution workflows
#[derive(Clone)]
pub struct GitService {}

// Max inline diff size for UI (in bytes). Files larger than this will have
// their contents omitted from the diff stream to avoid UI crashes.
const MAX_INLINE_DIFF_BYTES: usize = 2 * 1024 * 1024; // ~2MB

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum ConflictOp {
    Rebase,
    Merge,
    CherryPick,
    Revert,
}

#[derive(Debug, Serialize, TS)]
pub struct GitBranch {
    pub name: String,
    pub is_current: bool,
    pub is_remote: bool,
    #[ts(type = "Date")]
    pub last_commit_date: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct HeadInfo {
    pub branch: String,
    pub oid: String,
}

#[derive(Debug, Clone)]
pub struct Commit(git2::Oid);

impl Commit {
    pub fn new(id: git2::Oid) -> Self {
        Self(id)
    }
    pub fn as_oid(&self) -> git2::Oid {
        self.0
    }
}

impl std::fmt::Display for Commit {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Target for diff generation
pub enum DiffTarget<'p> {
    /// Work-in-progress branch checked out in this worktree
    Worktree {
        worktree_path: &'p Path,
        base_commit: &'p Commit,
    },
    /// Fully committed branch vs base branch
    Branch {
        repo_path: &'p Path,
        branch_name: &'p str,
        base_branch: &'p str,
    },
    /// Specific commit vs base branch
    Commit {
        repo_path: &'p Path,
        commit_sha: &'p str,
    },
}

impl Default for GitService {
    fn default() -> Self {
        Self::new()
    }
}

impl GitService {
    /// Create a new GitService for the given repository path
    pub fn new() -> Self {
        Self {}
    }

    /// Open the repository
    fn open_repo(&self, repo_path: &Path) -> Result<Repository, GitServiceError> {
        Repository::open(repo_path).map_err(GitServiceError::from)
    }

    /// Ensure local (repo-scoped) identity exists for CLI commits.
    /// Sets user.name/email only if missing in the repo config.
    fn ensure_cli_commit_identity(&self, repo_path: &Path) -> Result<(), GitServiceError> {
        let repo = self.open_repo(repo_path)?;
        let cfg = repo.config()?;
        let has_name = cfg.get_string("user.name").is_ok();
        let has_email = cfg.get_string("user.email").is_ok();
        if !(has_name && has_email) {
            let mut cfg = repo.config()?;
            cfg.set_str("user.name", "Vibe Kanban")?;
            cfg.set_str("user.email", "noreply@vibekanban.com")?;
        }
        Ok(())
    }

    /// Get a signature for libgit2 commits with a safe fallback identity.
    fn signature_with_fallback<'a>(
        &self,
        repo: &'a Repository,
    ) -> Result<git2::Signature<'a>, GitServiceError> {
        match repo.signature() {
            Ok(sig) => Ok(sig),
            Err(_) => git2::Signature::now("Vibe Kanban", "noreply@vibekanban.com")
                .map_err(GitServiceError::from),
        }
    }

    pub fn default_remote_name(&self, repo: &Repository) -> String {
        if let Ok(repos) = repo.remotes() {
            repos
                .iter()
                .flatten()
                .next()
                .map(|r| r.to_owned())
                .unwrap_or_else(|| "origin".to_string())
        } else {
            "origin".to_string()
        }
    }

    /// Initialize a new git repository with a main branch and initial commit
    pub fn initialize_repo_with_main_branch(
        &self,
        repo_path: &Path,
    ) -> Result<(), GitServiceError> {
        // Create directory if it doesn't exist
        if !repo_path.exists() {
            std::fs::create_dir_all(repo_path)?;
        }

        // Initialize git repository with main branch
        let repo = Repository::init_opts(
            repo_path,
            git2::RepositoryInitOptions::new()
                .initial_head("main")
                .mkdir(true),
        )?;

        // Create initial commit
        self.create_initial_commit(&repo)?;

        Ok(())
    }

    /// Ensure an existing repository has a main branch (for empty repos)
    pub fn ensure_main_branch_exists(&self, repo_path: &Path) -> Result<(), GitServiceError> {
        let repo = self.open_repo(repo_path)?;

        match repo.branches(None) {
            Ok(branches) => {
                if branches.count() == 0 {
                    // No branches exist - create initial commit on main branch
                    self.create_initial_commit(&repo)?;
                }
            }
            Err(e) => {
                return Err(GitServiceError::InvalidRepository(format!(
                    "Failed to list branches: {e}"
                )));
            }
        }
        Ok(())
    }

    pub fn create_initial_commit(&self, repo: &Repository) -> Result<(), GitServiceError> {
        let signature = self.signature_with_fallback(repo)?;

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

    pub fn commit(&self, path: &Path, message: &str) -> Result<bool, GitServiceError> {
        // Use Git CLI to respect sparse-checkout semantics for staging and commit
        let git = GitCli::new();
        let has_changes = git
            .has_changes(path)
            .map_err(|e| GitServiceError::InvalidRepository(format!("git status failed: {e}")))?;
        if !has_changes {
            tracing::debug!("No changes to commit!");
            return Ok(false);
        }

        git.add_all(path)
            .map_err(|e| GitServiceError::InvalidRepository(format!("git add failed: {e}")))?;
        // Only ensure identity once we know we're about to commit
        self.ensure_cli_commit_identity(path)?;
        git.commit(path, message)
            .map_err(|e| GitServiceError::InvalidRepository(format!("git commit failed: {e}")))?;
        Ok(true)
    }

    /// Get diffs between branches or worktree changes
    pub fn get_diffs(
        &self,
        target: DiffTarget,
        path_filter: Option<&[&str]>,
    ) -> Result<Vec<Diff>, GitServiceError> {
        match target {
            DiffTarget::Worktree {
                worktree_path,
                base_commit,
            } => {
                // Use Git CLI to compute diff vs base to avoid sparse false deletions
                let repo = Repository::open(worktree_path)?;
                let base_tree = repo
                    .find_commit(base_commit.as_oid())?
                    .tree()
                    .map_err(|e| {
                        GitServiceError::InvalidRepository(format!(
                            "Failed to find base commit tree: {e}"
                        ))
                    })?;

                let git = GitCli::new();
                let cli_opts = StatusDiffOptions {
                    path_filter: path_filter.map(|fs| fs.iter().map(|s| s.to_string()).collect()),
                };
                let entries = git
                    .diff_status(worktree_path, base_commit, cli_opts)
                    .map_err(|e| {
                        GitServiceError::InvalidRepository(format!("git diff failed: {e}"))
                    })?;
                Ok(entries
                    .into_iter()
                    .map(|e| Self::status_entry_to_diff(&repo, &base_tree, e))
                    .collect())
            }
            DiffTarget::Branch {
                repo_path,
                branch_name,
                base_branch,
            } => {
                let repo = self.open_repo(repo_path)?;
                let base_tree = Self::find_branch(&repo, base_branch)?
                    .get()
                    .peel_to_commit()?
                    .tree()?;
                let branch_tree = Self::find_branch(&repo, branch_name)?
                    .get()
                    .peel_to_commit()?
                    .tree()?;

                let mut diff_opts = DiffOptions::new();
                diff_opts.include_typechange(true);

                // Add path filtering if specified
                if let Some(paths) = path_filter {
                    for path in paths {
                        diff_opts.pathspec(*path);
                    }
                }

                let mut diff = repo.diff_tree_to_tree(
                    Some(&base_tree),
                    Some(&branch_tree),
                    Some(&mut diff_opts),
                )?;

                // Enable rename detection
                let mut find_opts = DiffFindOptions::new();
                diff.find_similar(Some(&mut find_opts))?;

                self.convert_diff_to_file_diffs(diff, &repo)
            }
            DiffTarget::Commit {
                repo_path,
                commit_sha,
            } => {
                let repo = self.open_repo(repo_path)?;

                // Resolve commit and its baseline (the parent before the squash landed)
                let commit_oid = git2::Oid::from_str(commit_sha).map_err(|_| {
                    GitServiceError::InvalidRepository(format!("Invalid commit SHA: {commit_sha}"))
                })?;
                let commit = repo.find_commit(commit_oid)?;
                let parent = commit.parent(0).map_err(|_| {
                    GitServiceError::InvalidRepository(
                        "Commit has no parent; cannot diff a squash merge without a baseline"
                            .into(),
                    )
                })?;

                let parent_tree = parent.tree()?;
                let commit_tree = commit.tree()?;

                // Diff options
                let mut diff_opts = git2::DiffOptions::new();
                diff_opts.include_typechange(true);

                // Optional path filtering
                if let Some(paths) = path_filter {
                    for path in paths {
                        diff_opts.pathspec(*path);
                    }
                }

                // Compute the diff parent -> commit
                let mut diff = repo.diff_tree_to_tree(
                    Some(&parent_tree),
                    Some(&commit_tree),
                    Some(&mut diff_opts),
                )?;

                // Enable rename detection
                let mut find_opts = git2::DiffFindOptions::new();
                diff.find_similar(Some(&mut find_opts))?;

                self.convert_diff_to_file_diffs(diff, &repo)
            }
        }
    }

    /// Convert git2::Diff to our Diff structs
    fn convert_diff_to_file_diffs(
        &self,
        diff: git2::Diff,
        repo: &Repository,
    ) -> Result<Vec<Diff>, GitServiceError> {
        let mut file_diffs = Vec::new();

        let mut delta_index: usize = 0;
        diff.foreach(
            &mut |delta, _| {
                if delta.status() == Delta::Unreadable {
                    return true;
                }

                let status = delta.status();

                // Decide if we should omit content due to size
                let mut content_omitted = false;
                // Check old blob size when applicable
                if !matches!(status, Delta::Added) {
                    let oid = delta.old_file().id();
                    if !oid.is_zero()
                        && let Ok(blob) = repo.find_blob(oid)
                        && !blob.is_binary()
                        && blob.size() > MAX_INLINE_DIFF_BYTES
                    {
                        content_omitted = true;
                    }
                }
                // Check new blob size when applicable
                if !matches!(status, Delta::Deleted) {
                    let oid = delta.new_file().id();
                    if !oid.is_zero()
                        && let Ok(blob) = repo.find_blob(oid)
                        && !blob.is_binary()
                        && blob.size() > MAX_INLINE_DIFF_BYTES
                    {
                        content_omitted = true;
                    }
                }

                // Only build old/new content if not omitted
                let (old_path, old_content) = if matches!(status, Delta::Added) {
                    (None, None)
                } else {
                    let path_opt = delta
                        .old_file()
                        .path()
                        .map(|p| p.to_string_lossy().to_string());
                    if content_omitted {
                        (path_opt, None)
                    } else {
                        let details = delta
                            .old_file()
                            .path()
                            .map(|p| self.create_file_details(p, &delta.old_file().id(), repo));
                        (
                            details.as_ref().and_then(|f| f.file_name.clone()),
                            details.and_then(|f| f.content),
                        )
                    }
                };

                let (new_path, new_content) = if matches!(status, Delta::Deleted) {
                    (None, None)
                } else {
                    let path_opt = delta
                        .new_file()
                        .path()
                        .map(|p| p.to_string_lossy().to_string());
                    if content_omitted {
                        (path_opt, None)
                    } else {
                        let details = delta
                            .new_file()
                            .path()
                            .map(|p| self.create_file_details(p, &delta.new_file().id(), repo));
                        (
                            details.as_ref().and_then(|f| f.file_name.clone()),
                            details.and_then(|f| f.content),
                        )
                    }
                };

                let mut change = match status {
                    Delta::Added => DiffChangeKind::Added,
                    Delta::Deleted => DiffChangeKind::Deleted,
                    Delta::Modified => DiffChangeKind::Modified,
                    Delta::Renamed => DiffChangeKind::Renamed,
                    Delta::Copied => DiffChangeKind::Copied,
                    Delta::Untracked => DiffChangeKind::Added,
                    _ => DiffChangeKind::Modified,
                };

                // Detect pure mode changes (e.g., chmod +/-x) and classify as PermissionChange
                if matches!(status, Delta::Modified)
                    && delta.old_file().mode() != delta.new_file().mode()
                {
                    // Only downgrade to PermissionChange if we KNOW content is unchanged
                    if old_content.is_some() && new_content.is_some() && old_content == new_content
                    {
                        change = DiffChangeKind::PermissionChange;
                    }
                }

                // If contents are omitted, try to compute line stats via libgit2 Patch
                let mut additions: Option<usize> = None;
                let mut deletions: Option<usize> = None;
                if content_omitted
                    && let Ok(Some(patch)) = git2::Patch::from_diff(&diff, delta_index)
                    && let Ok((_ctx, adds, dels)) = patch.line_stats()
                {
                    additions = Some(adds);
                    deletions = Some(dels);
                }

                file_diffs.push(Diff {
                    change,
                    old_path,
                    new_path,
                    old_content,
                    new_content,
                    content_omitted,
                    additions,
                    deletions,
                });

                delta_index += 1;
                true
            },
            None,
            None,
            None,
        )?;

        Ok(file_diffs)
    }

    /// Extract file path from a Diff (for indexing and ConversationPatch)
    pub fn diff_path(diff: &Diff) -> String {
        diff.new_path
            .clone()
            .or_else(|| diff.old_path.clone())
            .unwrap_or_default()
    }

    /// Helper function to convert blob to string content
    fn blob_to_string(blob: &git2::Blob) -> Option<String> {
        if blob.is_binary() {
            None // Skip binary files
        } else {
            std::str::from_utf8(blob.content())
                .ok()
                .map(|s| s.to_string())
        }
    }

    /// Helper function to read file content from filesystem with safety guards
    fn read_file_to_string(repo: &Repository, rel_path: &Path) -> Option<String> {
        let workdir = repo.workdir()?;
        let abs_path = workdir.join(rel_path);

        // Read file from filesystem
        let bytes = match std::fs::read(&abs_path) {
            Ok(bytes) => bytes,
            Err(e) => {
                tracing::debug!("Failed to read file from filesystem: {:?}: {}", abs_path, e);
                return None;
            }
        };

        // Size guard - skip files larger than UI inline threshold
        if bytes.len() > MAX_INLINE_DIFF_BYTES {
            tracing::debug!(
                "Skipping large file ({}KB): {:?}",
                bytes.len() / 1024,
                abs_path
            );
            return None;
        }

        // Binary guard - skip files containing null bytes
        if bytes.contains(&0) {
            tracing::debug!("Skipping binary file: {:?}", abs_path);
            return None;
        }

        // UTF-8 validation
        match String::from_utf8(bytes) {
            Ok(content) => Some(content),
            Err(e) => {
                tracing::debug!("File is not valid UTF-8: {:?}: {}", abs_path, e);
                None
            }
        }
    }

    /// Create FileDiffDetails from path and blob with filesystem fallback
    fn create_file_details(
        &self,
        path: &Path,
        blob_id: &git2::Oid,
        repo: &Repository,
    ) -> FileDiffDetails {
        let file_name = path.to_string_lossy().to_string();

        // Try to get content from blob first (for non-zero OIDs)
        let content = if !blob_id.is_zero() {
            repo.find_blob(*blob_id)
                .ok()
                .and_then(|blob| Self::blob_to_string(&blob))
                .or_else(|| {
                    // Fallback to filesystem for unstaged changes
                    tracing::debug!(
                        "Blob not found for non-zero OID, reading from filesystem: {}",
                        file_name
                    );
                    Self::read_file_to_string(repo, path)
                })
        } else {
            // For zero OIDs, check filesystem directly (covers new/untracked files)
            Self::read_file_to_string(repo, path)
        };

        FileDiffDetails {
            file_name: Some(file_name),
            content,
        }
    }

    /// Create Diff entries from git_cli::StatusDiffEntry
    /// New Diff format is flattened with change kind, paths, and optional contents.
    fn status_entry_to_diff(repo: &Repository, base_tree: &git2::Tree, e: StatusDiffEntry) -> Diff {
        // Map ChangeType to DiffChangeKind
        let mut change = match e.change {
            ChangeType::Added => DiffChangeKind::Added,
            ChangeType::Deleted => DiffChangeKind::Deleted,
            ChangeType::Modified => DiffChangeKind::Modified,
            ChangeType::Renamed => DiffChangeKind::Renamed,
            ChangeType::Copied => DiffChangeKind::Copied,
            // Treat type changes and unmerged as modified for now
            ChangeType::TypeChanged | ChangeType::Unmerged => DiffChangeKind::Modified,
            ChangeType::Unknown(_) => DiffChangeKind::Modified,
        };

        // Determine old/new paths based on change
        let (old_path_opt, new_path_opt): (Option<String>, Option<String>) = match e.change {
            ChangeType::Added => (None, Some(e.path.clone())),
            ChangeType::Deleted => (Some(e.old_path.unwrap_or(e.path.clone())), None),
            ChangeType::Modified | ChangeType::TypeChanged | ChangeType::Unmerged => (
                Some(e.old_path.unwrap_or(e.path.clone())),
                Some(e.path.clone()),
            ),
            ChangeType::Renamed | ChangeType::Copied => (e.old_path.clone(), Some(e.path.clone())),
            ChangeType::Unknown(_) => (e.old_path.clone(), Some(e.path.clone())),
        };

        // Decide if we should omit content by size (either side)
        let mut content_omitted = false;
        // Old side (from base tree)
        if let Some(ref oldp) = old_path_opt {
            let rel = std::path::Path::new(oldp);
            if let Ok(entry) = base_tree.get_path(rel)
                && entry.kind() == Some(git2::ObjectType::Blob)
                && let Ok(blob) = repo.find_blob(entry.id())
                && !blob.is_binary()
                && blob.size() > MAX_INLINE_DIFF_BYTES
            {
                content_omitted = true;
            }
        }
        // New side (from filesystem)
        if let Some(ref newp) = new_path_opt
            && let Some(workdir) = repo.workdir()
        {
            let abs = workdir.join(newp);
            if let Ok(md) = std::fs::metadata(&abs)
                && (md.len() as usize) > MAX_INLINE_DIFF_BYTES
            {
                content_omitted = true;
            }
        }

        // Load contents only if not omitted
        let (old_content, new_content) = if content_omitted {
            (None, None)
        } else {
            // Load old content from base tree if possible
            let old_content = if let Some(ref oldp) = old_path_opt {
                let rel = std::path::Path::new(oldp);
                match base_tree.get_path(rel) {
                    Ok(entry) if entry.kind() == Some(git2::ObjectType::Blob) => repo
                        .find_blob(entry.id())
                        .ok()
                        .and_then(|b| Self::blob_to_string(&b)),
                    _ => None,
                }
            } else {
                None
            };

            // Load new content from filesystem (worktree) when available
            let new_content = if let Some(ref newp) = new_path_opt {
                let rel = std::path::Path::new(newp);
                Self::read_file_to_string(repo, rel)
            } else {
                None
            };
            (old_content, new_content)
        };

        // If reported as Modified but content is identical, treat as a permission-only change
        if matches!(change, DiffChangeKind::Modified)
            && old_content.is_some()
            && new_content.is_some()
            && old_content == new_content
        {
            change = DiffChangeKind::PermissionChange;
        }

        Diff {
            change,
            old_path: old_path_opt,
            new_path: new_path_opt,
            old_content,
            new_content,
            content_omitted,
            additions: None,
            deletions: None,
        }
    }

    /// Find where a branch is currently checked out
    fn find_checkout_path_for_branch(
        &self,
        repo_path: &Path,
        branch_name: &str,
    ) -> Result<Option<std::path::PathBuf>, GitServiceError> {
        let git_cli = GitCli::new();
        let worktrees = git_cli.list_worktrees(repo_path).map_err(|e| {
            GitServiceError::InvalidRepository(format!("git worktree list failed: {e}"))
        })?;

        for worktree in worktrees {
            if let Some(ref branch) = worktree.branch
                && branch == branch_name
            {
                return Ok(Some(std::path::PathBuf::from(worktree.path)));
            }
        }
        Ok(None)
    }

    /// Merge changes from a task branch into the base branch.
    pub fn merge_changes(
        &self,
        base_worktree_path: &Path,
        task_worktree_path: &Path,
        task_branch_name: &str,
        base_branch_name: &str,
        commit_message: &str,
    ) -> Result<String, GitServiceError> {
        // Open the repositories
        let task_repo = self.open_repo(task_worktree_path)?;
        let base_repo = self.open_repo(base_worktree_path)?;

        // Check if base branch is ahead of task branch - this indicates the base has moved
        // ahead since the task was created, which should block the merge
        let (_, task_behind) =
            self.get_branch_status(base_worktree_path, task_branch_name, base_branch_name)?;

        if task_behind > 0 {
            return Err(GitServiceError::BranchesDiverged(format!(
                "Cannot merge: base branch '{base_branch_name}' is {task_behind} commits ahead of task branch '{task_branch_name}'. The base branch has moved forward since the task was created.",
            )));
        }

        // Check where base branch is checked out (if anywhere)
        match self.find_checkout_path_for_branch(base_worktree_path, base_branch_name)? {
            Some(base_checkout_path) => {
                // base branch is checked out somewhere - use CLI merge
                let git_cli = GitCli::new();

                // Safety check: base branch has no staged changes
                if git_cli
                    .has_staged_changes(&base_checkout_path)
                    .map_err(|e| {
                        GitServiceError::InvalidRepository(format!("git diff --cached failed: {e}"))
                    })?
                {
                    return Err(GitServiceError::WorktreeDirty(
                        base_branch_name.to_string(),
                        "staged changes present".to_string(),
                    ));
                }

                // Use CLI merge in base context
                self.ensure_cli_commit_identity(&base_checkout_path)?;
                let sha = git_cli
                    .merge_squash_commit(
                        &base_checkout_path,
                        base_branch_name,
                        task_branch_name,
                        commit_message,
                    )
                    .map_err(|e| {
                        GitServiceError::InvalidRepository(format!("CLI merge failed: {e}"))
                    })?;

                // Update task branch ref for continuity
                let task_refname = format!("refs/heads/{task_branch_name}");
                git_cli
                    .update_ref(base_worktree_path, &task_refname, &sha)
                    .map_err(|e| {
                        GitServiceError::InvalidRepository(format!("git update-ref failed: {e}"))
                    })?;

                Ok(sha)
            }
            None => {
                // base branch not checked out anywhere - use libgit2 pure ref operations
                let task_branch = Self::find_branch(&task_repo, task_branch_name)?;
                let base_branch = Self::find_branch(&task_repo, base_branch_name)?;

                // Resolve commits
                let base_commit = base_branch.get().peel_to_commit()?;
                let task_commit = task_branch.get().peel_to_commit()?;

                // Create the squash commit in-memory (no checkout) and update the base branch ref
                let signature = self.signature_with_fallback(&task_repo)?;
                let squash_commit_id = self.perform_squash_merge(
                    &task_repo,
                    &base_commit,
                    &task_commit,
                    &signature,
                    commit_message,
                    base_branch_name,
                )?;

                // Update the task branch to the new squash commit so follow-up
                // work can continue from the merged state without conflicts.
                let task_refname = format!("refs/heads/{task_branch_name}");
                base_repo.reference(
                    &task_refname,
                    squash_commit_id,
                    true,
                    "Reset task branch after squash merge",
                )?;

                Ok(squash_commit_id.to_string())
            }
        }
    }
    fn get_branch_status_inner(
        &self,
        repo: &Repository,
        branch_ref: &Reference,
        base_branch_ref: &Reference,
    ) -> Result<(usize, usize), GitServiceError> {
        let (a, b) = repo.graph_ahead_behind(
            branch_ref.target().ok_or(GitServiceError::BranchNotFound(
                "Branch not found".to_string(),
            ))?,
            base_branch_ref
                .target()
                .ok_or(GitServiceError::BranchNotFound(
                    "Branch not found".to_string(),
                ))?,
        )?;
        Ok((a, b))
    }

    pub fn get_branch_status(
        &self,
        repo_path: &Path,
        branch_name: &str,
        base_branch_name: &str,
    ) -> Result<(usize, usize), GitServiceError> {
        let repo = Repository::open(repo_path)?;
        let branch = Self::find_branch(&repo, branch_name)?;
        let base_branch = Self::find_branch(&repo, base_branch_name)?;
        self.get_branch_status_inner(
            &repo,
            &branch.into_reference(),
            &base_branch.into_reference(),
        )
    }

    pub fn get_base_commit(
        &self,
        repo_path: &Path,
        branch_name: &str,
        base_branch_name: &str,
    ) -> Result<Commit, GitServiceError> {
        let repo = Repository::open(repo_path)?;
        let branch = Self::find_branch(&repo, branch_name)?;
        let base_branch = Self::find_branch(&repo, base_branch_name)?;
        // Find the common ancestor (merge base)
        let oid = repo
            .merge_base(
                branch.get().peel_to_commit()?.id(),
                base_branch.get().peel_to_commit()?.id(),
            )
            .map_err(GitServiceError::from)?;
        Ok(Commit::new(oid))
    }

    pub fn get_remote_branch_status(
        &self,
        repo_path: &Path,
        branch_name: &str,
        base_branch_name: Option<&str>,
        github_token: String,
    ) -> Result<(usize, usize), GitServiceError> {
        let repo = Repository::open(repo_path)?;
        let branch_ref = Self::find_branch(&repo, branch_name)?.into_reference();
        // base branch is either given or upstream of branch_name
        let base_branch_ref = if let Some(bn) = base_branch_name {
            Self::find_branch(&repo, bn)?
        } else {
            repo.find_branch(branch_name, BranchType::Local)?
                .upstream()?
        }
        .into_reference();
        let remote = self.get_remote_from_branch_ref(&repo, &base_branch_ref)?;
        self.fetch_all_from_remote(&repo, &github_token, &remote)?;
        self.get_branch_status_inner(&repo, &branch_ref, &base_branch_ref)
    }

    pub fn is_worktree_clean(&self, worktree_path: &Path) -> Result<bool, GitServiceError> {
        let repo = self.open_repo(worktree_path)?;
        match self.check_worktree_clean(&repo) {
            Ok(()) => Ok(true),
            Err(GitServiceError::WorktreeDirty(_, _)) => Ok(false),
            Err(e) => Err(e),
        }
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
                ) && let Some(path) = entry.path()
                {
                    dirty_files.push(path.to_string());
                }
            }

            if !dirty_files.is_empty() {
                let branch_name = repo
                    .head()
                    .ok()
                    .and_then(|h| h.shorthand().map(|s| s.to_string()))
                    .unwrap_or_else(|| "unknown branch".to_string());
                return Err(GitServiceError::WorktreeDirty(
                    branch_name,
                    dirty_files.join(", "),
                ));
            }
        }

        Ok(())
    }

    /// Get current HEAD information including branch name and commit OID
    pub fn get_head_info(&self, repo_path: &Path) -> Result<HeadInfo, GitServiceError> {
        let repo = self.open_repo(repo_path)?;
        let head = repo.head()?;

        let branch = if let Some(branch_name) = head.shorthand() {
            branch_name.to_string()
        } else {
            "HEAD".to_string()
        };

        let oid = if let Some(target_oid) = head.target() {
            target_oid.to_string()
        } else {
            // Handle case where HEAD exists but has no target (empty repo)
            return Err(GitServiceError::InvalidRepository(
                "Repository HEAD has no target commit".to_string(),
            ));
        };

        Ok(HeadInfo { branch, oid })
    }

    pub fn get_current_branch(&self, repo_path: &Path) -> Result<String, git2::Error> {
        // Thin wrapper for backward compatibility
        match self.get_head_info(repo_path) {
            Ok(head_info) => Ok(head_info.branch),
            Err(GitServiceError::Git(git_err)) => Err(git_err),
            Err(_) => Err(git2::Error::from_str("Failed to get head info")),
        }
    }

    /// Get the commit OID (as hex string) for a given branch without modifying HEAD
    pub fn get_branch_oid(
        &self,
        repo_path: &Path,
        branch_name: &str,
    ) -> Result<String, GitServiceError> {
        let repo = self.open_repo(repo_path)?;
        let branch = Self::find_branch(&repo, branch_name)?;
        let oid = branch.get().peel_to_commit()?.id().to_string();
        Ok(oid)
    }

    /// Get the author name and email for the given commit OID (hex)
    pub fn get_commit_author(
        &self,
        repo_path: &Path,
        commit_sha: &str,
    ) -> Result<(Option<String>, Option<String>), GitServiceError> {
        let repo = self.open_repo(repo_path)?;
        let oid = git2::Oid::from_str(commit_sha)
            .map_err(|_| GitServiceError::InvalidRepository("Invalid commit SHA".into()))?;
        let commit = repo.find_commit(oid)?;
        let author = commit.author();
        Ok((
            author.name().map(|s| s.to_string()),
            author.email().map(|s| s.to_string()),
        ))
    }

    /// Get the subject/summary line for a given commit OID
    pub fn get_commit_subject(
        &self,
        repo_path: &Path,
        commit_sha: &str,
    ) -> Result<String, GitServiceError> {
        let repo = self.open_repo(repo_path)?;
        let oid = git2::Oid::from_str(commit_sha)
            .map_err(|_| GitServiceError::InvalidRepository("Invalid commit SHA".into()))?;
        let commit = repo.find_commit(oid)?;
        Ok(commit.summary().unwrap_or("(no subject)").to_string())
    }

    /// Compare two OIDs and return (ahead, behind) counts: how many commits
    /// `from_oid` is ahead of and behind `to_oid`.
    pub fn ahead_behind_commits_by_oid(
        &self,
        repo_path: &Path,
        from_oid: &str,
        to_oid: &str,
    ) -> Result<(usize, usize), GitServiceError> {
        let repo = self.open_repo(repo_path)?;
        let from = git2::Oid::from_str(from_oid)
            .map_err(|_| GitServiceError::InvalidRepository("Invalid from OID".into()))?;
        let to = git2::Oid::from_str(to_oid)
            .map_err(|_| GitServiceError::InvalidRepository("Invalid to OID".into()))?;
        let (ahead, behind) = repo.graph_ahead_behind(from, to)?;
        Ok((ahead, behind))
    }

    /// Return (uncommitted_tracked_changes, untracked_files) counts in worktree
    pub fn get_worktree_change_counts(
        &self,
        worktree_path: &Path,
    ) -> Result<(usize, usize), GitServiceError> {
        let cli = super::git_cli::GitCli::new();
        let st = cli
            .get_worktree_status(worktree_path)
            .map_err(|e| GitServiceError::InvalidRepository(format!("git status failed: {e}")))?;
        Ok((st.uncommitted_tracked, st.untracked))
    }

    /// Expose full worktree status details (CLI porcelain parsing)
    pub fn get_worktree_status(
        &self,
        worktree_path: &Path,
    ) -> Result<super::git_cli::WorktreeStatus, GitServiceError> {
        let cli = super::git_cli::GitCli::new();
        cli.get_worktree_status(worktree_path)
            .map_err(|e| GitServiceError::InvalidRepository(format!("git status failed: {e}")))
    }

    /// Reset the given worktree to the specified commit SHA.
    /// If `force` is false and the worktree is dirty, returns WorktreeDirty error.
    pub fn reset_worktree_to_commit(
        &self,
        worktree_path: &Path,
        commit_sha: &str,
        force: bool,
    ) -> Result<(), GitServiceError> {
        let repo = self.open_repo(worktree_path)?;
        if !force {
            // Avoid clobbering uncommitted changes unless explicitly forced
            self.check_worktree_clean(&repo)?;
        }
        let cli = super::git_cli::GitCli::new();
        cli.git(worktree_path, ["reset", "--hard", commit_sha])
            .map_err(|e| {
                GitServiceError::InvalidRepository(format!("git reset --hard failed: {e}"))
            })?;
        // Reapply sparse-checkout if configured (non-fatal)
        let _ = cli.git(worktree_path, ["sparse-checkout", "reapply"]);
        Ok(())
    }

    /// Convenience: Get author of HEAD commit
    pub fn get_head_author(
        &self,
        repo_path: &Path,
    ) -> Result<(Option<String>, Option<String>), GitServiceError> {
        let head = self.get_head_info(repo_path)?;
        self.get_commit_author(repo_path, &head.oid)
    }

    /// Configure local user identity for committing via CLI
    pub fn configure_user(
        &self,
        repo_path: &Path,
        name: &str,
        email: &str,
    ) -> Result<(), GitServiceError> {
        let repo = self.open_repo(repo_path)?;
        let mut cfg = repo.config()?;
        cfg.set_str("user.name", name)?;
        cfg.set_str("user.email", email)?;
        Ok(())
    }

    /// Create a local branch at the current HEAD
    pub fn create_branch(
        &self,
        repo_path: &Path,
        branch_name: &str,
    ) -> Result<(), GitServiceError> {
        let repo = self.open_repo(repo_path)?;
        let head_commit = repo.head()?.peel_to_commit()?;
        repo.branch(branch_name, &head_commit, true)?;
        Ok(())
    }

    /// Checkout a local branch in the given working tree
    pub fn checkout_branch(
        &self,
        repo_path: &Path,
        branch_name: &str,
    ) -> Result<(), GitServiceError> {
        let repo = self.open_repo(repo_path)?;
        let refname = format!("refs/heads/{branch_name}");
        repo.set_head(&refname)?;
        let mut co = CheckoutBuilder::new();
        co.force();
        repo.checkout_head(Some(&mut co))?;
        Ok(())
    }

    /// Add a worktree for a branch, optionally creating the branch
    pub fn add_worktree(
        &self,
        repo_path: &Path,
        worktree_path: &Path,
        branch: &str,
        create_branch: bool,
    ) -> Result<(), GitServiceError> {
        let git = GitCli::new();
        git.worktree_add(repo_path, worktree_path, branch, create_branch)
            .map_err(|e| GitServiceError::InvalidRepository(e.to_string()))?;
        Ok(())
    }

    /// Set or add a remote URL
    pub fn set_remote(
        &self,
        repo_path: &Path,
        name: &str,
        url: &str,
    ) -> Result<(), GitServiceError> {
        let repo = self.open_repo(repo_path)?;
        match repo.find_remote(name) {
            Ok(_) => repo.remote_set_url(name, url)?,
            Err(_) => {
                repo.remote(name, url)?;
            }
        }
        Ok(())
    }

    /// Stage a specific path (wrapper over git add)
    pub fn add_path(&self, repo_path: &Path, path: &str) -> Result<(), GitServiceError> {
        let git = GitCli::new();
        git.git(repo_path, ["add", path])
            .map(|_| ())
            .map_err(|e| GitServiceError::InvalidRepository(e.to_string()))
    }

    /// Detach HEAD to the current commit (for testing commit on detached HEAD)
    pub fn detach_head_current(&self, repo_path: &Path) -> Result<(), GitServiceError> {
        let repo = self.open_repo(repo_path)?;
        let oid = repo
            .head()?
            .target()
            .ok_or_else(|| GitServiceError::InvalidRepository("HEAD has no target".into()))?;
        repo.set_head_detached(oid)?;
        Ok(())
    }

    pub fn get_all_branches(&self, repo_path: &Path) -> Result<Vec<GitBranch>, git2::Error> {
        let repo = Repository::open(repo_path)?;
        let current_branch = self.get_current_branch(repo_path).unwrap_or_default();
        let mut branches = Vec::new();

        // Helper function to get last commit date for a branch
        let get_last_commit_date = |branch: &git2::Branch| -> Result<DateTime<Utc>, git2::Error> {
            if let Some(target) = branch.get().target()
                && let Ok(commit) = repo.find_commit(target)
            {
                let timestamp = commit.time().seconds();
                return Ok(DateTime::from_timestamp(timestamp, 0).unwrap_or_else(Utc::now));
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
        // In-memory merge to detect conflicts without touching the working tree
        let mut merge_opts = git2::MergeOptions::new();
        // Safety and correctness options
        merge_opts.find_renames(true); // improve rename handling
        merge_opts.fail_on_conflict(true); // bail out instead of generating conflicted index
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
        let refname = format!("refs/heads/{base_branch_name}");
        repo.reference(&refname, squash_commit_id, true, "Squash merge")?;

        Ok(squash_commit_id)
    }

    /// Rebase a worktree branch onto a new base
    pub fn rebase_branch(
        &self,
        repo_path: &Path,
        worktree_path: &Path,
        new_base_branch: &str,
        old_base_branch: &str,
        task_branch: &str,
        github_token: Option<String>,
    ) -> Result<String, GitServiceError> {
        let worktree_repo = Repository::open(worktree_path)?;
        let main_repo = self.open_repo(repo_path)?;

        // Safety guard: never operate on a dirty worktree. This preserves any
        // uncommitted changes to tracked files by failing fast instead of
        // resetting or cherry-picking over them. Untracked files are allowed.
        self.check_worktree_clean(&worktree_repo)?;

        // If a rebase is already in progress, refuse to proceed instead of
        // aborting (which might destroy user changes mid-rebase).
        let git = GitCli::new();
        if git.is_rebase_in_progress(worktree_path).unwrap_or(false) {
            return Err(GitServiceError::RebaseInProgress);
        }

        // Get the target base branch reference
        let nbr = Self::find_branch(&main_repo, new_base_branch)?.into_reference();
        // If the target base is remote, update it first so CLI sees latest
        if nbr.is_remote() {
            let github_token = github_token.ok_or(GitServiceError::TokenUnavailable)?;
            let remote = self.get_remote_from_branch_ref(&main_repo, &nbr)?;
            // First, fetch the latest changes from remote
            self.fetch_branch_from_remote(&main_repo, &github_token, &remote, new_base_branch)?;
        }

        // Ensure identity for any commits produced by rebase
        self.ensure_cli_commit_identity(worktree_path)?;
        // Use git CLI rebase to carry out the operation safely
        match git.rebase_onto(worktree_path, new_base_branch, old_base_branch, task_branch) {
            Ok(()) => {}
            Err(GitCliError::RebaseInProgress) => {
                return Err(GitServiceError::RebaseInProgress);
            }
            Err(GitCliError::CommandFailed(stderr)) => {
                // If the CLI indicates conflicts, return a concise, actionable error.
                let looks_like_conflict = stderr.contains("could not apply")
                    || stderr.contains("CONFLICT")
                    || stderr.to_lowercase().contains("resolve all conflicts");
                if looks_like_conflict {
                    // Determine current attempt branch name for clarity
                    let attempt_branch = worktree_repo
                        .head()
                        .ok()
                        .and_then(|h| h.shorthand().map(|s| s.to_string()))
                        .unwrap_or_else(|| "(unknown)".to_string());
                    // List conflicted files (best-effort)
                    let conflicts = git.get_conflicted_files(worktree_path).unwrap_or_default();
                    let files_part = if conflicts.is_empty() {
                        "".to_string()
                    } else {
                        let mut sample = conflicts.clone();
                        let total = sample.len();
                        sample.truncate(10);
                        let list = sample.join(", ");
                        if total > sample.len() {
                            format!(
                                " Conflicted files (showing {} of {}): {}.",
                                sample.len(),
                                total,
                                list
                            )
                        } else {
                            format!(" Conflicted files: {list}.")
                        }
                    };
                    let msg = format!(
                        "Rebase encountered merge conflicts while rebasing '{attempt_branch}' onto '{new_base_branch}'.{files_part} Resolve conflicts and then continue or abort."
                    );
                    return Err(GitServiceError::MergeConflicts(msg));
                }
                return Err(GitServiceError::InvalidRepository(format!(
                    "Rebase failed: {}",
                    stderr.lines().next().unwrap_or("")
                )));
            }
            Err(e) => {
                return Err(GitServiceError::InvalidRepository(format!(
                    "git rebase failed: {e}"
                )));
            }
        }

        // Return resulting HEAD commit
        let final_commit = worktree_repo.head()?.peel_to_commit()?;
        Ok(final_commit.id().to_string())
    }

    pub fn find_branch_type(
        &self,
        repo_path: &Path,
        branch_name: &str,
    ) -> Result<BranchType, GitServiceError> {
        let repo = self.open_repo(repo_path)?;
        // Try to find the branch as a local branch first
        match repo.find_branch(branch_name, BranchType::Local) {
            Ok(_) => Ok(BranchType::Local),
            Err(_) => {
                // If not found, try to find it as a remote branch
                match repo.find_branch(branch_name, BranchType::Remote) {
                    Ok(_) => Ok(BranchType::Remote),
                    Err(_) => Err(GitServiceError::BranchNotFound(branch_name.to_string())),
                }
            }
        }
    }

    pub fn check_branch_exists(
        &self,
        repo_path: &Path,
        branch_name: &str,
    ) -> Result<bool, GitServiceError> {
        let repo = self.open_repo(repo_path)?;
        match repo.find_branch(branch_name, BranchType::Local) {
            Ok(_) => Ok(true),
            Err(_) => match repo.find_branch(branch_name, BranchType::Remote) {
                Ok(_) => Ok(true),
                Err(_) => Ok(false),
            },
        }
    }

    /// Return true if a rebase is currently in progress in this worktree.
    pub fn is_rebase_in_progress(&self, worktree_path: &Path) -> Result<bool, GitServiceError> {
        let git = GitCli::new();
        git.is_rebase_in_progress(worktree_path).map_err(|e| {
            GitServiceError::InvalidRepository(format!("git rebase state check failed: {e}"))
        })
    }

    pub fn detect_conflict_op(
        &self,
        worktree_path: &Path,
    ) -> Result<Option<ConflictOp>, GitServiceError> {
        let git = GitCli::new();
        if git.is_rebase_in_progress(worktree_path).unwrap_or(false) {
            return Ok(Some(ConflictOp::Rebase));
        }
        if git.is_merge_in_progress(worktree_path).unwrap_or(false) {
            return Ok(Some(ConflictOp::Merge));
        }
        if git
            .is_cherry_pick_in_progress(worktree_path)
            .unwrap_or(false)
        {
            return Ok(Some(ConflictOp::CherryPick));
        }
        if git.is_revert_in_progress(worktree_path).unwrap_or(false) {
            return Ok(Some(ConflictOp::Revert));
        }
        Ok(None)
    }

    /// List conflicted (unmerged) files in the worktree.
    pub fn get_conflicted_files(
        &self,
        worktree_path: &Path,
    ) -> Result<Vec<String>, GitServiceError> {
        let git = GitCli::new();
        git.get_conflicted_files(worktree_path).map_err(|e| {
            GitServiceError::InvalidRepository(format!("git diff for conflicts failed: {e}"))
        })
    }

    /// Abort an in-progress rebase in this worktree (no-op if none).
    pub fn abort_rebase(&self, worktree_path: &Path) -> Result<(), GitServiceError> {
        let git = GitCli::new();
        git.abort_rebase(worktree_path).map_err(|e| {
            GitServiceError::InvalidRepository(format!("git rebase --abort failed: {e}"))
        })
    }

    pub fn abort_conflicts(&self, worktree_path: &Path) -> Result<(), GitServiceError> {
        let git = GitCli::new();
        if git.is_rebase_in_progress(worktree_path).unwrap_or(false) {
            // If there are no conflicted files, prefer `git rebase --quit` to clean up metadata
            let has_conflicts = !self
                .get_conflicted_files(worktree_path)
                .unwrap_or_default()
                .is_empty();
            if has_conflicts {
                return self.abort_rebase(worktree_path);
            } else {
                return git.quit_rebase(worktree_path).map_err(|e| {
                    GitServiceError::InvalidRepository(format!("git rebase --quit failed: {e}"))
                });
            }
        }
        if git.is_merge_in_progress(worktree_path).unwrap_or(false) {
            return git.abort_merge(worktree_path).map_err(|e| {
                GitServiceError::InvalidRepository(format!("git merge --abort failed: {e}"))
            });
        }
        if git
            .is_cherry_pick_in_progress(worktree_path)
            .unwrap_or(false)
        {
            return git.abort_cherry_pick(worktree_path).map_err(|e| {
                GitServiceError::InvalidRepository(format!("git cherry-pick --abort failed: {e}"))
            });
        }
        if git.is_revert_in_progress(worktree_path).unwrap_or(false) {
            return git.abort_revert(worktree_path).map_err(|e| {
                GitServiceError::InvalidRepository(format!("git revert --abort failed: {e}"))
            });
        }
        Ok(())
    }

    pub fn find_branch<'a>(
        repo: &'a Repository,
        branch_name: &str,
    ) -> Result<git2::Branch<'a>, GitServiceError> {
        // Try to find the branch as a local branch first
        match repo.find_branch(branch_name, BranchType::Local) {
            Ok(branch) => Ok(branch),
            Err(_) => {
                // If not found, try to find it as a remote branch
                match repo.find_branch(branch_name, BranchType::Remote) {
                    Ok(branch) => Ok(branch),
                    Err(_) => Err(GitServiceError::BranchNotFound(branch_name.to_string())),
                }
            }
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
                    "Failed to delete file {file_path}: {e}"
                )))
            })?;
        }

        // Stage the deletion
        let mut index = repo.index()?;
        index.remove_path(Path::new(file_path))?;
        index.write()?;

        // Create a commit for the file deletion
        let signature = self.signature_with_fallback(&repo)?;
        let tree_id = index.write_tree()?;
        let tree = repo.find_tree(tree_id)?;

        // Get the current HEAD commit
        let head = repo.head()?;
        let parent_commit = head.peel_to_commit()?;

        let commit_message = format!("Delete file: {file_path}");
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
    pub fn get_default_branch_name(&self, repo_path: &Path) -> Result<String, GitServiceError> {
        let repo = self.open_repo(repo_path)?;

        match repo.head() {
            Ok(head_ref) => Ok(head_ref.shorthand().unwrap_or("main").to_string()),
            Err(e)
                if e.class() == git2::ErrorClass::Reference
                    && e.code() == git2::ErrorCode::UnbornBranch =>
            {
                Ok("main".to_string()) // Repository has no commits yet
            }
            Err(_) => Ok("main".to_string()), // Fallback
        }
    }

    /// Extract GitHub owner and repo name from git repo path
    pub fn get_github_repo_info(
        &self,
        repo_path: &Path,
    ) -> Result<GitHubRepoInfo, GitServiceError> {
        let repo = self.open_repo(repo_path)?;
        let remote_name = self.default_remote_name(&repo);
        let remote = repo.find_remote(&remote_name).map_err(|_| {
            GitServiceError::InvalidRepository(format!("No '{remote_name}' remote found"))
        })?;

        let url = remote
            .url()
            .ok_or_else(|| GitServiceError::InvalidRepository("Remote has no URL".to_string()))?;
        GitHubRepoInfo::from_remote_url(url).map_err(|e| {
            GitServiceError::InvalidRepository(format!("Failed to parse remote URL: {e}"))
        })
    }

    pub fn get_remote_name_from_branch_name(
        &self,
        repo_path: &Path,
        branch_name: &str,
    ) -> Result<String, GitServiceError> {
        let repo = Repository::open(repo_path)?;
        let branch_ref = Self::find_branch(&repo, branch_name)?.into_reference();
        let default_remote = self.default_remote_name(&repo);
        self.get_remote_from_branch_ref(&repo, &branch_ref)
            .map(|r| r.name().unwrap_or(&default_remote).to_string())
    }

    fn get_remote_from_branch_ref<'a>(
        &self,
        repo: &'a Repository,
        branch_ref: &Reference,
    ) -> Result<Remote<'a>, GitServiceError> {
        let branch_name = branch_ref
            .name()
            .map(|name| name.to_string())
            .ok_or_else(|| GitServiceError::InvalidRepository("Invalid branch ref".into()))?;
        let remote_name_buf = repo.branch_remote_name(&branch_name)?;

        let remote_name = str::from_utf8(&remote_name_buf)
            .map_err(|e| {
                GitServiceError::InvalidRepository(format!(
                    "Invalid remote name for branch {branch_name}: {e}"
                ))
            })?
            .to_string();
        repo.find_remote(&remote_name).map_err(|_| {
            GitServiceError::InvalidRepository(format!(
                "Remote '{remote_name}' for branch '{branch_name}' not found"
            ))
        })
    }

    pub fn push_to_github(
        &self,
        worktree_path: &Path,
        branch_name: &str,
        github_token: &str,
    ) -> Result<(), GitServiceError> {
        let repo = Repository::open(worktree_path)?;
        self.check_worktree_clean(&repo)?;

        // Get the remote
        let remote_name = self.default_remote_name(&repo);
        let remote = repo.find_remote(&remote_name)?;

        let remote_url = remote
            .url()
            .ok_or_else(|| GitServiceError::InvalidRepository("Remote has no URL".to_string()))?;
        let https_url = self.convert_to_https_url(remote_url);
        let git_cli = GitCli::new();
        if let Err(e) =
            git_cli.push_with_token(worktree_path, &https_url, branch_name, github_token)
        {
            tracing::error!("Push to GitHub failed: {}", e);
            return Err(e.into());
        }

        let mut branch = Self::find_branch(&repo, branch_name)?;
        if !branch.get().is_remote() {
            if let Some(branch_target) = branch.get().target() {
                let remote_ref = format!("refs/remotes/{remote_name}/{branch_name}");
                repo.reference(
                    &remote_ref,
                    branch_target,
                    true,
                    "update remote tracking branch",
                )?;
            }
            branch.set_upstream(Some(&format!("{remote_name}/{branch_name}")))?;
        }

        Ok(())
    }

    pub fn convert_to_https_url(&self, url: &str) -> String {
        // Convert SSH URL to HTTPS URL if necessary
        let new_url = if url.starts_with("git@github.com:") {
            // Convert git@github.com:owner/repo.git to https://github.com/owner/repo.git
            url.replace("git@github.com:", "https://github.com/")
        } else if url.starts_with("ssh://git@github.com/") {
            // Convert ssh://git@github.com/owner/repo.git to https://github.com/owner/repo.git
            url.replace("ssh://git@github.com/", "https://github.com/")
        } else {
            url.to_string()
        };
        let mut normalized = new_url.trim_end_matches('/').to_string();
        if !normalized.ends_with(".git") {
            normalized.push_str(".git");
        }

        normalized
    }

    /// Fetch from remote repository using GitHub token authentication
    fn fetch_from_remote(
        &self,
        repo: &Repository,
        github_token: &str,
        remote: &Remote,
        refspec: &str,
    ) -> Result<(), GitServiceError> {
        // Get the remote
        let remote_url = remote
            .url()
            .ok_or_else(|| GitServiceError::InvalidRepository("Remote has no URL".to_string()))?;

        let https_url = self.convert_to_https_url(remote_url);
        // Create temporary HTTPS remote
        let git_cli = GitCli::new();
        if let Err(e) =
            git_cli.fetch_with_token_and_refspec(repo.path(), &https_url, refspec, github_token)
        {
            tracing::error!("Fetch from GitHub failed: {}", e);
            return Err(e.into());
        }
        Ok(())
    }

    /// Fetch from remote repository using GitHub token authentication
    fn fetch_branch_from_remote(
        &self,
        repo: &Repository,
        github_token: &str,
        remote: &Remote,
        branch_name: &str,
    ) -> Result<(), GitServiceError> {
        let default_remote_name = self.default_remote_name(repo);
        let remote_name = remote.name().unwrap_or(&default_remote_name);
        let refspec = format!("+refs/heads/{branch_name}:refs/remotes/{remote_name}/{branch_name}");
        self.fetch_from_remote(repo, github_token, remote, &refspec)
    }

    /// Fetch from remote repository using GitHub token authentication
    fn fetch_all_from_remote(
        &self,
        repo: &Repository,
        github_token: &str,
        remote: &Remote,
    ) -> Result<(), GitServiceError> {
        let default_remote_name = self.default_remote_name(repo);
        let remote_name = remote.name().unwrap_or(&default_remote_name);
        let refspec = format!("+refs/heads/*:refs/remotes/{remote_name}/*");
        self.fetch_from_remote(repo, github_token, remote, &refspec)
    }

    /// Clone a repository to the specified directory
    #[cfg(feature = "cloud")]
    pub fn clone_repository(
        clone_url: &str,
        target_path: &Path,
        token: Option<&str>,
    ) -> Result<Repository, GitServiceError> {
        use git2::{Cred, FetchOptions, RemoteCallbacks};

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
                if let Some(username) = username_from_url
                    && let Ok(cred) = Cred::ssh_key_from_agent(username)
                {
                    return Ok(cred);
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

    /// Collect file statistics from recent commits for ranking purposes
    pub fn collect_recent_file_stats(
        &self,
        repo_path: &Path,
        commit_limit: usize,
    ) -> Result<HashMap<String, FileStat>, GitServiceError> {
        let repo = self.open_repo(repo_path)?;
        let mut stats: HashMap<String, FileStat> = HashMap::new();

        // Set up revision walk from HEAD
        let mut revwalk = repo.revwalk()?;
        revwalk.push_head()?;
        revwalk.set_sorting(Sort::TIME)?;

        // Iterate through recent commits
        for (commit_index, oid_result) in revwalk.take(commit_limit).enumerate() {
            let oid = oid_result?;
            let commit = repo.find_commit(oid)?;

            // Get commit timestamp
            let commit_time = {
                let time = commit.time();
                DateTime::from_timestamp(time.seconds(), 0).unwrap_or_else(Utc::now)
            };

            // Get the commit tree
            let commit_tree = commit.tree()?;

            // For the first commit (no parent), diff against empty tree
            let parent_tree = if commit.parent_count() == 0 {
                None
            } else {
                Some(commit.parent(0)?.tree()?)
            };

            // Create diff between parent and current commit
            let diff = repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&commit_tree), None)?;

            // Process each changed file in this commit
            diff.foreach(
                &mut |delta, _progress| {
                    // Get the file path - prefer new file path, fall back to old
                    if let Some(path) = delta.new_file().path().or_else(|| delta.old_file().path())
                    {
                        let path_str = path.to_string_lossy().to_string();

                        // Update or insert file stats
                        let stat = stats.entry(path_str).or_insert(FileStat {
                            last_index: commit_index,
                            commit_count: 0,
                            last_time: commit_time,
                        });

                        // Increment commit count
                        stat.commit_count += 1;

                        // Keep the most recent change (smallest index)
                        if commit_index < stat.last_index {
                            stat.last_index = commit_index;
                            stat.last_time = commit_time;
                        }
                    }

                    true // Continue iteration
                },
                None, // No binary callback
                None, // No hunk callback
                None, // No line callback
            )?;
        }

        Ok(stats)
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
