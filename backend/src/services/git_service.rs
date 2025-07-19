use std::path::{Path, PathBuf};

use git2::{
    build::CheckoutBuilder, BranchType, Cred, DiffOptions, Error as GitError, FetchOptions,
    RebaseOptions, RemoteCallbacks, Repository, WorktreeAddOptions,
};
use regex;
use tracing::{debug, info};

use crate::{
    models::task_attempt::{DiffChunk, DiffChunkType, FileDiff, WorktreeDiff},
    utils::worktree_manager::WorktreeManager,
};

#[derive(Debug)]
pub enum GitServiceError {
    Git(GitError),
    IoError(std::io::Error),
    InvalidRepository(String),
    BranchNotFound(String),

    MergeConflicts(String),
    InvalidPath(String),
    WorktreeDirty(String),
}

impl std::fmt::Display for GitServiceError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            GitServiceError::Git(e) => write!(f, "Git error: {}", e),
            GitServiceError::IoError(e) => write!(f, "IO error: {}", e),
            GitServiceError::InvalidRepository(e) => write!(f, "Invalid repository: {}", e),
            GitServiceError::BranchNotFound(e) => write!(f, "Branch not found: {}", e),

            GitServiceError::MergeConflicts(e) => write!(f, "Merge conflicts: {}", e),
            GitServiceError::InvalidPath(e) => write!(f, "Invalid path: {}", e),
            GitServiceError::WorktreeDirty(e) => {
                write!(f, "Worktree has uncommitted changes: {}", e)
            }
        }
    }
}

impl std::error::Error for GitServiceError {}

impl From<GitError> for GitServiceError {
    fn from(err: GitError) -> Self {
        GitServiceError::Git(err)
    }
}

impl From<std::io::Error> for GitServiceError {
    fn from(err: std::io::Error) -> Self {
        GitServiceError::IoError(err)
    }
}

/// Service for managing Git operations in task execution workflows
pub struct GitService {
    repo_path: PathBuf,
}

impl GitService {
    /// Create a new GitService for the given repository path
    pub fn new<P: AsRef<Path>>(repo_path: P) -> Result<Self, GitServiceError> {
        let repo_path = repo_path.as_ref().to_path_buf();

        // Validate that the path exists and is a git repository
        if !repo_path.exists() {
            return Err(GitServiceError::InvalidPath(format!(
                "Repository path does not exist: {}",
                repo_path.display()
            )));
        }

        // Try to open the repository to validate it
        Repository::open(&repo_path).map_err(|e| {
            GitServiceError::InvalidRepository(format!(
                "Failed to open repository at {}: {}",
                repo_path.display(),
                e
            ))
        })?;

        Ok(Self { repo_path })
    }

    /// Open the repository
    fn open_repo(&self) -> Result<Repository, GitServiceError> {
        Repository::open(&self.repo_path).map_err(GitServiceError::from)
    }

    /// Create a worktree with a new branch
    pub fn create_worktree(
        &self,
        branch_name: &str,
        worktree_path: &Path,
        base_branch: Option<&str>,
    ) -> Result<(), GitServiceError> {
        let repo = self.open_repo()?;

        // Ensure parent directory exists
        if let Some(parent) = worktree_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        // Choose base reference
        let base_reference = if let Some(base_branch) = base_branch {
            let branch = repo
                .find_branch(base_branch, BranchType::Local)
                .map_err(|_| GitServiceError::BranchNotFound(base_branch.to_string()))?;
            branch.into_reference()
        } else {
            // Handle new repositories without any commits
            match repo.head() {
                Ok(head_ref) => head_ref,
                Err(e)
                    if e.class() == git2::ErrorClass::Reference
                        && e.code() == git2::ErrorCode::UnbornBranch =>
                {
                    // Repository has no commits yet, create an initial commit
                    self.create_initial_commit(&repo)?;
                    repo.find_reference("refs/heads/main")?
                }
                Err(e) => return Err(e.into()),
            }
        };

        // Create branch
        repo.branch(branch_name, &base_reference.peel_to_commit()?, false)?;

        let branch = repo.find_branch(branch_name, BranchType::Local)?;
        let branch_ref = branch.into_reference();
        let mut worktree_opts = WorktreeAddOptions::new();
        worktree_opts.reference(Some(&branch_ref));

        // Create the worktree at the specified path
        repo.worktree(branch_name, worktree_path, Some(&worktree_opts))?;

        // Fix commondir for Windows/WSL compatibility
        let worktree_name = worktree_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(branch_name);
        if let Err(e) =
            WorktreeManager::fix_worktree_commondir_for_windows_wsl(&self.repo_path, worktree_name)
        {
            tracing::warn!("Failed to fix worktree commondir for Windows/WSL: {}", e);
        }

        info!(
            "Created worktree '{}' at path: {}",
            branch_name,
            worktree_path.display()
        );
        Ok(())
    }

    /// Create an initial commit for empty repositories
    fn create_initial_commit(&self, repo: &Repository) -> Result<(), GitServiceError> {
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

        info!("Created initial commit for empty repository");
        Ok(())
    }

    /// Merge changes from a worktree branch back to the main repository
    pub fn merge_changes(
        &self,
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
        let main_repo = self.open_repo()?;
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

        info!("Created squash merge commit: {}", squash_commit_id);
        Ok(squash_commit_id.to_string())
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
        worktree_path: &Path,
        new_base_branch: Option<&str>,
    ) -> Result<String, GitServiceError> {
        let worktree_repo = Repository::open(worktree_path)?;
        let main_repo = self.open_repo()?;

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

        let base_commit_id = base_branch.get().peel_to_commit()?.id();

        // Get the HEAD commit of the worktree (the changes to rebase)
        let head = worktree_repo.head()?;

        // Set up rebase
        let mut rebase_opts = RebaseOptions::new();
        let signature = worktree_repo.signature()?;

        // Start the rebase
        let head_annotated = worktree_repo.reference_to_annotated_commit(&head)?;
        let base_annotated = worktree_repo.find_annotated_commit(base_commit_id)?;

        let mut rebase = worktree_repo.rebase(
            Some(&head_annotated),
            Some(&base_annotated),
            None, // onto (use upstream if None)
            Some(&mut rebase_opts),
        )?;

        // Process each rebase operation
        while let Some(operation) = rebase.next() {
            let _operation = operation?;

            // Check for conflicts
            let index = worktree_repo.index()?;
            if index.has_conflicts() {
                // For now, abort the rebase on conflicts
                rebase.abort()?;
                return Err(GitServiceError::MergeConflicts(
                    "Rebase failed due to conflicts. Please resolve conflicts manually."
                        .to_string(),
                ));
            }

            // Commit the rebased operation
            rebase.commit(None, &signature, None)?;
        }

        // Finish the rebase
        rebase.finish(None)?;

        // Get the final commit ID after rebase
        let final_head = worktree_repo.head()?;
        let final_commit = final_head.peel_to_commit()?;

        info!("Rebase completed. New HEAD: {}", final_commit.id());
        Ok(final_commit.id().to_string())
    }

    /// Get enhanced diff for task attempts (from merge commit or worktree)
    pub fn get_enhanced_diff(
        &self,
        worktree_path: &Path,
        merge_commit_id: Option<&str>,
        base_branch: &str,
    ) -> Result<WorktreeDiff, GitServiceError> {
        let mut files = Vec::new();

        if let Some(merge_commit_id) = merge_commit_id {
            // Task attempt has been merged - show the diff from the merge commit
            self.get_merged_diff(merge_commit_id, &mut files)?;
        } else {
            // Task attempt not yet merged - get worktree diff
            self.get_worktree_diff(worktree_path, base_branch, &mut files)?;
        }

        Ok(WorktreeDiff { files })
    }

    /// Get diff from a merge commit
    fn get_merged_diff(
        &self,
        merge_commit_id: &str,
        files: &mut Vec<FileDiff>,
    ) -> Result<(), GitServiceError> {
        let main_repo = self.open_repo()?;
        let merge_commit = main_repo.find_commit(git2::Oid::from_str(merge_commit_id)?)?;

        // A merge commit has multiple parents - first parent is the main branch before merge,
        // second parent is the branch that was merged
        let parents: Vec<_> = merge_commit.parents().collect();

        // Create diff options with more context
        let mut diff_opts = DiffOptions::new();
        diff_opts.context_lines(10);
        diff_opts.interhunk_lines(0);

        let diff = if parents.len() >= 2 {
            let base_tree = parents[0].tree()?;
            let merged_tree = parents[1].tree()?;
            main_repo.diff_tree_to_tree(
                Some(&base_tree),
                Some(&merged_tree),
                Some(&mut diff_opts),
            )?
        } else {
            // Fast-forward merge or single parent
            let base_tree = if !parents.is_empty() {
                parents[0].tree()?
            } else {
                main_repo.find_tree(git2::Oid::zero())?
            };
            let merged_tree = merge_commit.tree()?;
            main_repo.diff_tree_to_tree(
                Some(&base_tree),
                Some(&merged_tree),
                Some(&mut diff_opts),
            )?
        };

        // Process each diff delta
        diff.foreach(
            &mut |delta, _progress| {
                if let Some(path_str) = delta.new_file().path().and_then(|p| p.to_str()) {
                    let old_file = delta.old_file();
                    let new_file = delta.new_file();

                    if let Ok(diff_chunks) =
                        self.generate_git_diff_chunks(&main_repo, &old_file, &new_file, path_str)
                    {
                        if !diff_chunks.is_empty() {
                            files.push(FileDiff {
                                path: path_str.to_string(),
                                chunks: diff_chunks,
                            });
                        } else if delta.status() == git2::Delta::Added
                            || delta.status() == git2::Delta::Deleted
                        {
                            files.push(FileDiff {
                                path: path_str.to_string(),
                                chunks: vec![DiffChunk {
                                    chunk_type: if delta.status() == git2::Delta::Added {
                                        DiffChunkType::Insert
                                    } else {
                                        DiffChunkType::Delete
                                    },
                                    content: format!(
                                        "{} file",
                                        if delta.status() == git2::Delta::Added {
                                            "Added"
                                        } else {
                                            "Deleted"
                                        }
                                    ),
                                }],
                            });
                        }
                    }
                }
                true
            },
            None,
            None,
            None,
        )?;

        Ok(())
    }

    /// Get diff for a worktree (before merge)
    fn get_worktree_diff(
        &self,
        worktree_path: &Path,
        base_branch: &str,
        files: &mut Vec<FileDiff>,
    ) -> Result<(), GitServiceError> {
        let worktree_repo = Repository::open(worktree_path)?;
        let main_repo = self.open_repo()?;

        // Get the base branch commit
        let base_branch_ref = main_repo
            .find_branch(base_branch, BranchType::Local)
            .map_err(|_| GitServiceError::BranchNotFound(base_branch.to_string()))?;
        let base_branch_oid = base_branch_ref.get().peel_to_commit()?.id();

        // Get the current worktree HEAD commit
        let worktree_head = worktree_repo.head()?;
        let worktree_head_oid = worktree_head.peel_to_commit()?.id();

        // Find the merge base (common ancestor) between the base branch and worktree head
        let base_oid = worktree_repo.merge_base(base_branch_oid, worktree_head_oid)?;
        let base_commit = worktree_repo.find_commit(base_oid)?;
        let base_tree = base_commit.tree()?;

        // Get the current tree from the worktree HEAD commit
        let current_commit = worktree_repo.find_commit(worktree_head_oid)?;
        let current_tree = current_commit.tree()?;

        // Create a diff between the base tree and current tree
        let mut diff_opts = DiffOptions::new();
        diff_opts.context_lines(10);
        diff_opts.interhunk_lines(0);

        let diff = worktree_repo.diff_tree_to_tree(
            Some(&base_tree),
            Some(&current_tree),
            Some(&mut diff_opts),
        )?;

        // Process committed changes
        diff.foreach(
            &mut |delta, _progress| {
                if let Some(path_str) = delta.new_file().path().and_then(|p| p.to_str()) {
                    let old_file = delta.old_file();
                    let new_file = delta.new_file();

                    if let Ok(diff_chunks) = self.generate_git_diff_chunks(
                        &worktree_repo,
                        &old_file,
                        &new_file,
                        path_str,
                    ) {
                        if !diff_chunks.is_empty() {
                            files.push(FileDiff {
                                path: path_str.to_string(),
                                chunks: diff_chunks,
                            });
                        } else if delta.status() == git2::Delta::Added
                            || delta.status() == git2::Delta::Deleted
                        {
                            files.push(FileDiff {
                                path: path_str.to_string(),
                                chunks: vec![DiffChunk {
                                    chunk_type: if delta.status() == git2::Delta::Added {
                                        DiffChunkType::Insert
                                    } else {
                                        DiffChunkType::Delete
                                    },
                                    content: format!(
                                        "{} file",
                                        if delta.status() == git2::Delta::Added {
                                            "Added"
                                        } else {
                                            "Deleted"
                                        }
                                    ),
                                }],
                            });
                        }
                    }
                }
                true
            },
            None,
            None,
            None,
        )?;

        // Also get unstaged changes (working directory changes)
        let current_tree = worktree_repo.head()?.peel_to_tree()?;

        let mut unstaged_diff_opts = DiffOptions::new();
        unstaged_diff_opts.context_lines(10);
        unstaged_diff_opts.interhunk_lines(0);
        unstaged_diff_opts.include_untracked(true);

        let unstaged_diff = worktree_repo
            .diff_tree_to_workdir_with_index(Some(&current_tree), Some(&mut unstaged_diff_opts))?;

        // Process unstaged changes
        unstaged_diff.foreach(
            &mut |delta, _progress| {
                if let Some(path_str) = delta.new_file().path().and_then(|p| p.to_str()) {
                    if let Err(e) = self.process_unstaged_file(
                        files,
                        &worktree_repo,
                        base_oid,
                        worktree_path,
                        path_str,
                        &delta,
                    ) {
                        eprintln!("Error processing unstaged file {}: {:?}", path_str, e);
                    }
                }
                true
            },
            None,
            None,
            None,
        )?;

        Ok(())
    }

    /// Generate diff chunks using Git's native diff algorithm
    fn generate_git_diff_chunks(
        &self,
        repo: &Repository,
        old_file: &git2::DiffFile,
        new_file: &git2::DiffFile,
        file_path: &str,
    ) -> Result<Vec<DiffChunk>, GitServiceError> {
        let mut chunks = Vec::new();

        // Create a patch for the single file using Git's native diff
        let old_blob = if !old_file.id().is_zero() {
            Some(repo.find_blob(old_file.id())?)
        } else {
            None
        };

        let new_blob = if !new_file.id().is_zero() {
            Some(repo.find_blob(new_file.id())?)
        } else {
            None
        };

        // Generate patch using Git's diff algorithm
        let mut diff_opts = DiffOptions::new();
        diff_opts.context_lines(10);
        diff_opts.interhunk_lines(0);

        let patch = match (old_blob.as_ref(), new_blob.as_ref()) {
            (Some(old_b), Some(new_b)) => git2::Patch::from_blobs(
                old_b,
                Some(Path::new(file_path)),
                new_b,
                Some(Path::new(file_path)),
                Some(&mut diff_opts),
            )?,
            (None, Some(new_b)) => git2::Patch::from_buffers(
                &[],
                Some(Path::new(file_path)),
                new_b.content(),
                Some(Path::new(file_path)),
                Some(&mut diff_opts),
            )?,
            (Some(old_b), None) => git2::Patch::from_blob_and_buffer(
                old_b,
                Some(Path::new(file_path)),
                &[],
                Some(Path::new(file_path)),
                Some(&mut diff_opts),
            )?,
            (None, None) => {
                return Ok(chunks);
            }
        };

        // Process the patch hunks
        for hunk_idx in 0..patch.num_hunks() {
            let (_hunk, hunk_lines) = patch.hunk(hunk_idx)?;

            for line_idx in 0..hunk_lines {
                let line = patch.line_in_hunk(hunk_idx, line_idx)?;
                let content = String::from_utf8_lossy(line.content()).to_string();

                let chunk_type = match line.origin() {
                    ' ' => DiffChunkType::Equal,
                    '+' => DiffChunkType::Insert,
                    '-' => DiffChunkType::Delete,
                    _ => continue,
                };

                chunks.push(DiffChunk {
                    chunk_type,
                    content,
                });
            }
        }

        Ok(chunks)
    }

    /// Process unstaged file changes
    fn process_unstaged_file(
        &self,
        files: &mut Vec<FileDiff>,
        worktree_repo: &Repository,
        base_oid: git2::Oid,
        worktree_path: &Path,
        path_str: &str,
        delta: &git2::DiffDelta,
    ) -> Result<(), GitServiceError> {
        // Check if we already have a diff for this file from committed changes
        if let Some(existing_file) = files.iter_mut().find(|f| f.path == path_str) {
            // File already has committed changes, create a combined diff
            let base_content = self.get_base_file_content(worktree_repo, base_oid, path_str)?;
            let working_content = self.get_working_file_content(worktree_path, path_str, delta)?;

            if base_content != working_content {
                if let Ok(combined_chunks) =
                    self.create_combined_diff_chunks(&base_content, &working_content, path_str)
                {
                    existing_file.chunks = combined_chunks;
                }
            }
        } else {
            // File only has unstaged changes
            let base_content = self.get_base_file_content(worktree_repo, base_oid, path_str)?;
            let working_content = self.get_working_file_content(worktree_path, path_str, delta)?;

            if base_content != working_content || delta.status() != git2::Delta::Modified {
                if let Ok(chunks) =
                    self.create_combined_diff_chunks(&base_content, &working_content, path_str)
                {
                    if !chunks.is_empty() {
                        files.push(FileDiff {
                            path: path_str.to_string(),
                            chunks,
                        });
                    }
                } else if delta.status() != git2::Delta::Modified {
                    // Fallback for added/deleted files
                    files.push(FileDiff {
                        path: path_str.to_string(),
                        chunks: vec![DiffChunk {
                            chunk_type: if delta.status() == git2::Delta::Added {
                                DiffChunkType::Insert
                            } else {
                                DiffChunkType::Delete
                            },
                            content: format!(
                                "{} file",
                                if delta.status() == git2::Delta::Added {
                                    "Added"
                                } else {
                                    "Deleted"
                                }
                            ),
                        }],
                    });
                }
            }
        }

        Ok(())
    }

    /// Get the content of a file at the base commit
    fn get_base_file_content(
        &self,
        repo: &Repository,
        base_oid: git2::Oid,
        path_str: &str,
    ) -> Result<String, GitServiceError> {
        if let Ok(base_commit) = repo.find_commit(base_oid) {
            if let Ok(base_tree) = base_commit.tree() {
                if let Ok(entry) = base_tree.get_path(Path::new(path_str)) {
                    if let Ok(blob) = repo.find_blob(entry.id()) {
                        return Ok(String::from_utf8_lossy(blob.content()).to_string());
                    }
                }
            }
        }
        Ok(String::new())
    }

    /// Get the content of a file in the working directory
    fn get_working_file_content(
        &self,
        worktree_path: &Path,
        path_str: &str,
        delta: &git2::DiffDelta,
    ) -> Result<String, GitServiceError> {
        if delta.status() != git2::Delta::Deleted {
            let file_path = worktree_path.join(path_str);
            std::fs::read_to_string(&file_path).map_err(GitServiceError::from)
        } else {
            Ok(String::new())
        }
    }

    /// Create diff chunks from two text contents
    fn create_combined_diff_chunks(
        &self,
        old_content: &str,
        new_content: &str,
        path_str: &str,
    ) -> Result<Vec<DiffChunk>, GitServiceError> {
        let mut diff_opts = DiffOptions::new();
        diff_opts.context_lines(10);
        diff_opts.interhunk_lines(0);

        let patch = git2::Patch::from_buffers(
            old_content.as_bytes(),
            Some(Path::new(path_str)),
            new_content.as_bytes(),
            Some(Path::new(path_str)),
            Some(&mut diff_opts),
        )?;

        let mut chunks = Vec::new();

        for hunk_idx in 0..patch.num_hunks() {
            let (_hunk, hunk_lines) = patch.hunk(hunk_idx)?;

            for line_idx in 0..hunk_lines {
                let line = patch.line_in_hunk(hunk_idx, line_idx)?;
                let content = String::from_utf8_lossy(line.content()).to_string();

                let chunk_type = match line.origin() {
                    ' ' => DiffChunkType::Equal,
                    '+' => DiffChunkType::Insert,
                    '-' => DiffChunkType::Delete,
                    _ => continue,
                };

                chunks.push(DiffChunk {
                    chunk_type,
                    content,
                });
            }
        }

        Ok(chunks)
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

            debug!("Deleted file: {}", file_path);
        } else {
            info!("File {} does not exist, skipping deletion", file_path);
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

        info!("File {} deleted and committed: {}", file_path, commit_id);

        Ok(commit_id.to_string())
    }

    /// Get the default branch name for the repository
    pub fn get_default_branch_name(&self) -> Result<String, GitServiceError> {
        let repo = self.open_repo()?;

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

    /// Recreate a worktree from an existing branch (for cold task support)
    pub async fn recreate_worktree_from_branch(
        &self,
        branch_name: &str,
        stored_worktree_path: &Path,
    ) -> Result<PathBuf, GitServiceError> {
        let repo = self.open_repo()?;

        // Verify branch exists before proceeding
        let _branch = repo
            .find_branch(branch_name, BranchType::Local)
            .map_err(|_| GitServiceError::BranchNotFound(branch_name.to_string()))?;
        drop(_branch);

        let stored_worktree_path_str = stored_worktree_path.to_string_lossy().to_string();

        info!(
            "Recreating worktree using stored path: {} (branch: {})",
            stored_worktree_path_str, branch_name
        );

        // Clean up existing directory if it exists to avoid git sync issues
        if stored_worktree_path.exists() {
            debug!(
                "Removing existing directory before worktree recreation: {}",
                stored_worktree_path_str
            );
            std::fs::remove_dir_all(stored_worktree_path).map_err(|e| {
                GitServiceError::IoError(std::io::Error::other(format!(
                    "Failed to remove existing worktree directory {}: {}",
                    stored_worktree_path_str, e
                )))
            })?;
        }

        // Ensure parent directory exists - critical for session continuity
        if let Some(parent) = stored_worktree_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                GitServiceError::IoError(std::io::Error::other(format!(
                    "Failed to create parent directory for worktree path {}: {}",
                    stored_worktree_path_str, e
                )))
            })?;
        }

        // Extract repository path for WorktreeManager
        let repo_path = repo
            .workdir()
            .ok_or_else(|| {
                GitServiceError::InvalidRepository(
                    "Repository has no working directory".to_string(),
                )
            })?
            .to_str()
            .ok_or_else(|| {
                GitServiceError::InvalidRepository("Repository path is not valid UTF-8".to_string())
            })?
            .to_string();

        WorktreeManager::ensure_worktree_exists(
            repo_path,
            branch_name.to_string(),
            stored_worktree_path.to_path_buf(),
        )
        .await
        .map_err(|e| {
            GitServiceError::IoError(std::io::Error::other(format!(
                "WorktreeManager error: {}",
                e
            )))
        })?;

        info!(
            "Successfully recreated worktree at original path: {} -> {}",
            branch_name, stored_worktree_path_str
        );
        Ok(stored_worktree_path.to_path_buf())
    }

    /// Extract GitHub owner and repo name from git repo path
    pub fn get_github_repo_info(&self) -> Result<(String, String), GitServiceError> {
        let repo = self.open_repo()?;
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

        info!("Pushed branch {} to GitHub using HTTPS", branch_name);
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
}

#[cfg(test)]
mod tests {
    use tempfile::TempDir;

    use super::*;

    fn create_test_repo() -> (TempDir, Repository) {
        let temp_dir = TempDir::new().unwrap();
        let repo = Repository::init(temp_dir.path()).unwrap();

        // Configure the repository
        let mut config = repo.config().unwrap();
        config.set_str("user.name", "Test User").unwrap();
        config.set_str("user.email", "test@example.com").unwrap();

        (temp_dir, repo)
    }

    #[test]
    fn test_git_service_creation() {
        let (temp_dir, _repo) = create_test_repo();
        let _git_service = GitService::new(temp_dir.path()).unwrap();
    }

    #[test]
    fn test_invalid_repository_path() {
        let result = GitService::new("/nonexistent/path");
        assert!(result.is_err());
    }

    #[test]
    fn test_default_branch_name() {
        let (temp_dir, _repo) = create_test_repo();
        let git_service = GitService::new(temp_dir.path()).unwrap();
        let branch_name = git_service.get_default_branch_name().unwrap();
        assert_eq!(branch_name, "main");
    }
}
