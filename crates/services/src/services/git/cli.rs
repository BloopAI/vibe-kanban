//! Why we prefer the Git CLI here
//!
//! - Safer working-tree semantics: the `git` CLI refuses to clobber uncommitted
//!   tracked changes and untracked files during checkout/merge/rebase unless you
//!   explicitly force it. libgit2 does not enforce those protections by default,
//!   which means callers must re‑implement a lot of safety checks to avoid data loss.
//! - Sparse‑checkout correctness: the CLI natively respects sparse‑checkout.
//!   libgit2 does not yet support sparse‑checkout semantics the same way, which
//!   led to incorrect diffs and staging in our workflows.
//! - Cross‑platform stability: we observed libgit2 corrupt repositories shared
//!   between WSL and Windows in scenarios where the `git` CLI did not. Delegating
//!   working‑tree mutations to the CLI has proven more reliable in practice.
//!
//! Given these reasons, this module centralizes destructive or working‑tree‑
//! touching operations (rebase, merge, checkout, add/commit, etc.) through the
//! `git` CLI, while keeping libgit2 for read‑only graph queries and credentialed
//! network operations when useful.
use std::{
    ffi::{OsStr, OsString},
    path::Path,
    process::Command,
};

use thiserror::Error;
use utils::shell::resolve_executable_path_blocking; // TODO: make GitCli async

use crate::services::git::Commit;

#[derive(Debug, Error)]
pub enum GitCliError {
    #[error("git executable not found or not runnable")]
    NotAvailable,
    #[error("git command failed: {0}")]
    CommandFailed(String),
    #[error("authentication failed: {0}")]
    AuthFailed(String),
    #[error("push rejected: {0}")]
    PushRejected(String),
    #[error("rebase in progress in this worktree")]
    RebaseInProgress,
}

#[derive(Clone, Default)]
pub struct GitCli;

/// Parsed change type from `git diff --name-status` output
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ChangeType {
    Added,
    Modified,
    Deleted,
    Renamed,
    Copied,
    TypeChanged,
    Unmerged,
    Unknown(String),
}

/// One entry from a status diff (name-status + paths)
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StatusDiffEntry {
    pub change: ChangeType,
    pub path: String,
    pub old_path: Option<String>,
}

/// Parsed worktree entry from `git worktree list --porcelain`
#[derive(Debug, Clone)]
pub struct WorktreeEntry {
    pub path: String,
    pub branch: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct StatusDiffOptions {
    pub path_filter: Option<Vec<String>>, // pathspecs to limit diff
}

impl GitCli {
    pub fn new() -> Self {
        Self {}
    }
    /// Run `git -C <repo> worktree add <path> <branch>` (optionally creating the branch with -b)
    pub fn worktree_add(
        &self,
        repo_path: &Path,
        worktree_path: &Path,
        branch: &str,
        create_branch: bool,
    ) -> Result<(), GitCliError> {
        self.ensure_available()?;

        let mut args: Vec<OsString> = vec!["worktree".into(), "add".into()];
        if create_branch {
            args.push("-b".into());
            args.push(OsString::from(branch));
        }
        args.push(worktree_path.as_os_str().into());
        args.push(OsString::from(branch));
        self.git(repo_path, args)?;

        // Good practice: reapply sparse-checkout in the new worktree to ensure materialization matches
        // Non-fatal if it fails or not configured.
        let _ = self.git(worktree_path, ["sparse-checkout", "reapply"]);

        Ok(())
    }

    /// Run `git -C <repo> worktree remove <path>`
    pub fn worktree_remove(
        &self,
        repo_path: &Path,
        worktree_path: &Path,
        force: bool,
    ) -> Result<(), GitCliError> {
        self.ensure_available()?;
        let mut args: Vec<OsString> = vec!["worktree".into(), "remove".into()];
        if force {
            args.push("--force".into());
        }
        args.push(worktree_path.as_os_str().into());
        self.git(repo_path, args)?;
        Ok(())
    }

    /// Prune stale worktree metadata
    pub fn worktree_prune(&self, repo_path: &Path) -> Result<(), GitCliError> {
        self.git(repo_path, ["worktree", "prune"])?;
        Ok(())
    }

    /// Return true if there are any changes in the working tree (staged or unstaged).
    pub fn has_changes(&self, worktree_path: &Path) -> Result<bool, GitCliError> {
        let out = self.git(worktree_path, ["status", "--porcelain"])?;
        Ok(!out.is_empty())
    }

    /// Diff status vs a base branch using a temporary index (always includes untracked).
    /// Path filter limits the reported paths.
    pub fn diff_status(
        &self,
        worktree_path: &Path,
        base_commit: &Commit,
        opts: StatusDiffOptions,
    ) -> Result<Vec<StatusDiffEntry>, GitCliError> {
        // Create a temp index file
        let tmp_dir = tempfile::TempDir::new()
            .map_err(|e| GitCliError::CommandFailed(format!("temp dir create failed: {e}")))?;
        let tmp_index = tmp_dir.path().join("index");
        let envs = vec![(
            OsString::from("GIT_INDEX_FILE"),
            tmp_index.as_os_str().to_os_string(),
        )];

        // Use a temp index from HEAD to accurately track renames in untracked files
        let _ = self.git_with_env(worktree_path, ["read-tree", "HEAD"], &envs)?;

        // Stage all in temp index
        let _ = self.git_with_env(worktree_path, ["add", "-A"], &envs)?;

        // git diff --cached
        let mut args: Vec<OsString> = vec![
            "-c".into(),
            "core.quotepath=false".into(),
            "diff".into(),
            "--cached".into(),
            "-M".into(),
            "--name-status".into(),
            OsString::from(base_commit.to_string()),
        ];
        if let Some(paths) = &opts.path_filter {
            let non_empty_paths: Vec<&str> = paths
                .iter()
                .map(|s| s.as_str())
                .filter(|p| !p.trim().is_empty())
                .collect();
            if !non_empty_paths.is_empty() {
                args.push("--".into());
                for p in non_empty_paths {
                    args.push(OsString::from(p));
                }
            }
        }
        let out = self.git_with_env(worktree_path, args, &envs)?;
        Ok(Self::parse_name_status(&out))
    }

    /// Return `git status --porcelain` parsed into a structured summary
    pub fn get_worktree_status(&self, worktree_path: &Path) -> Result<WorktreeStatus, GitCliError> {
        let out = self.git(worktree_path, ["status", "--porcelain"])?;
        let mut entries: Vec<StatusEntry> = Vec::new();
        let mut uncommitted_tracked = 0usize;
        let mut untracked = 0usize;
        for line in out.lines() {
            let l = line.trim_end();
            if l.is_empty() {
                continue;
            }
            // Two columns (XY) + space + path(s), or '?? path' for untracked
            if let Some(rest) = l.strip_prefix("?? ") {
                untracked += 1;
                entries.push(StatusEntry {
                    staged: '?',
                    unstaged: '?',
                    path: rest.to_string(),
                    orig_path: None,
                    is_untracked: true,
                });
                continue;
            }
            // At least 3 chars (X, Y, space)
            let (xy, tail) = l.split_at(2);
            let (_, pathspec) = tail.split_at(1); // skip the space
            let staged = xy.chars().nth(0).unwrap_or(' ');
            let unstaged = xy.chars().nth(1).unwrap_or(' ');
            // Rename shows as 'R ' with `old -> new`
            let (path, orig_path) = if pathspec.contains(" -> ") {
                let mut parts = pathspec.splitn(2, " -> ");
                let oldp = parts.next().unwrap_or("").to_string();
                let newp = parts.next().unwrap_or("").to_string();
                (newp, Some(oldp))
            } else {
                (pathspec.to_string(), None)
            };
            // Count as tracked change if either column indicates a change
            if staged != ' ' || unstaged != ' ' {
                uncommitted_tracked += 1;
            }
            entries.push(StatusEntry {
                staged,
                unstaged,
                path,
                orig_path,
                is_untracked: false,
            });
        }
        Ok(WorktreeStatus {
            uncommitted_tracked,
            untracked,
            entries,
        })
    }

    /// Stage all changes in the working tree (respects sparse-checkout semantics).
    pub fn add_all(&self, worktree_path: &Path) -> Result<(), GitCliError> {
        self.git(worktree_path, ["add", "-A"])?;
        Ok(())
    }
    pub fn list_worktrees(&self, repo_path: &Path) -> Result<Vec<WorktreeEntry>, GitCliError> {
        let out = self.git(repo_path, ["worktree", "list", "--porcelain"])?;
        let mut entries = Vec::new();
        let mut current_path: Option<String> = None;
        let mut current_head: Option<String> = None;
        let mut current_branch: Option<String> = None;

        for line in out.lines() {
            let line = line.trim();

            if line.is_empty() {
                // End of current worktree entry, save it if we have required data
                if let (Some(path), Some(_head)) = (current_path.take(), current_head.take()) {
                    entries.push(WorktreeEntry {
                        path,
                        branch: current_branch.take(),
                    });
                }
            } else if let Some(path) = line.strip_prefix("worktree ") {
                current_path = Some(path.to_string());
            } else if let Some(head) = line.strip_prefix("HEAD ") {
                current_head = Some(head.to_string());
            } else if let Some(branch_ref) = line.strip_prefix("branch ") {
                // Extract branch name from refs/heads/branch-name
                current_branch = branch_ref
                    .strip_prefix("refs/heads/")
                    .map(|name| name.to_string());
            }
        }

        // Handle the last entry if no trailing empty line
        if let (Some(path), Some(_head)) = (current_path, current_head) {
            entries.push(WorktreeEntry {
                path,
                branch: current_branch,
            });
        }

        Ok(entries)
    }

    /// Commit staged changes with the given message.
    pub fn commit(&self, worktree_path: &Path, message: &str) -> Result<(), GitCliError> {
        self.git(worktree_path, ["commit", "-m", message])?;
        Ok(())
    }
    /// Fetch a branch to the given remote using native git authentication.
    pub fn fetch_with_refspec(
        &self,
        repo_path: &Path,
        remote_url: &str,
        refspec: &str,
    ) -> Result<(), GitCliError> {
        let envs = vec![(OsString::from("GIT_TERMINAL_PROMPT"), OsString::from("0"))];

        let args = [
            OsString::from("fetch"),
            OsString::from(remote_url),
            OsString::from(refspec),
        ];

        match self.git_with_env(repo_path, args, &envs) {
            Ok(_) => Ok(()),
            Err(GitCliError::CommandFailed(msg)) => Err(self.classify_cli_error(msg)),
            Err(err) => Err(err),
        }
    }

    /// Push a branch to the given remote using native git authentication.
    pub fn push(
        &self,
        repo_path: &Path,
        remote_url: &str,
        branch: &str,
        force: bool,
    ) -> Result<(), GitCliError> {
        let refspec = if force {
            format!("+refs/heads/{branch}:refs/heads/{branch}")
        } else {
            format!("refs/heads/{branch}:refs/heads/{branch}")
        };
        let envs = vec![(OsString::from("GIT_TERMINAL_PROMPT"), OsString::from("0"))];

        let args = [
            OsString::from("push"),
            OsString::from(remote_url),
            OsString::from(refspec),
        ];

        match self.git_with_env(repo_path, args, &envs) {
            Ok(_) => Ok(()),
            Err(GitCliError::CommandFailed(msg)) => Err(self.classify_cli_error(msg)),
            Err(err) => Err(err),
        }
    }

    /// This directly queries the remote without fetching.
    pub fn check_remote_branch_exists(
        &self,
        repo_path: &Path,
        remote_url: &str,
        branch_name: &str,
    ) -> Result<bool, GitCliError> {
        let envs = vec![(OsString::from("GIT_TERMINAL_PROMPT"), OsString::from("0"))];

        let args = [
            OsString::from("ls-remote"),
            OsString::from("--heads"),
            OsString::from(remote_url),
            OsString::from(format!("refs/heads/{branch_name}")),
        ];

        match self.git_with_env(repo_path, args, &envs) {
            Ok(output) => Ok(!output.trim().is_empty()),
            Err(GitCliError::CommandFailed(msg)) => Err(self.classify_cli_error(msg)),
            Err(err) => Err(err),
        }
    }

    // Parse `git diff --name-status` output into structured entries.
    // Handles rename/copy scores like `R100` by matching the first letter.
    fn parse_name_status(output: &str) -> Vec<StatusDiffEntry> {
        let mut out = Vec::new();
        for line in output.lines() {
            let line = line.trim_end();
            if line.is_empty() {
                continue;
            }
            let mut parts = line.split('\t');
            let code = parts.next().unwrap_or("");
            let change = match code.chars().next().unwrap_or('?') {
                'A' => ChangeType::Added,
                'M' => ChangeType::Modified,
                'D' => ChangeType::Deleted,
                'R' => ChangeType::Renamed,
                'C' => ChangeType::Copied,
                'T' => ChangeType::TypeChanged,
                'U' => ChangeType::Unmerged,
                other => ChangeType::Unknown(other.to_string()),
            };

            match change {
                ChangeType::Renamed | ChangeType::Copied => {
                    if let (Some(old), Some(newp)) = (parts.next(), parts.next()) {
                        out.push(StatusDiffEntry {
                            change,
                            path: newp.to_string(),
                            old_path: Some(old.to_string()),
                        });
                    }
                }
                _ => {
                    if let Some(p) = parts.next() {
                        out.push(StatusDiffEntry {
                            change,
                            path: p.to_string(),
                            old_path: None,
                        });
                    }
                }
            }
        }
        out
    }

    /// Return the merge base commit sha of two refs in the given worktree.
    /// If `git merge-base --fork-point` fails, falls back to regular `merge-base`.
    fn merge_base(&self, worktree_path: &Path, a: &str, b: &str) -> Result<String, GitCliError> {
        let out = self
            .git(worktree_path, ["merge-base", "--fork-point", a, b])
            .unwrap_or(self.git(worktree_path, ["merge-base", a, b])?);
        Ok(out.trim().to_string())
    }

    /// Perform `git rebase --onto <new_base> <old_base>` on <task_branch> in `worktree_path`.
    pub fn rebase_onto(
        &self,
        worktree_path: &Path,
        new_base: &str,
        old_base: &str,
        task_branch: &str,
    ) -> Result<(), GitCliError> {
        // If a rebase is in progress, refuse to proceed. The caller can
        // choose to abort or continue; we avoid destructive actions here.
        if self.is_rebase_in_progress(worktree_path).unwrap_or(false) {
            return Err(GitCliError::RebaseInProgress);
        }
        // compute the merge base of task_branch from old_base
        let merge_base = self
            .merge_base(worktree_path, old_base, task_branch)
            .unwrap_or(old_base.to_string());

        self.git(
            worktree_path,
            ["rebase", "--onto", new_base, &merge_base, task_branch],
        )?;
        Ok(())
    }

    /// Return true if there is a rebase in progress in this worktree.
    /// We treat this as true when either of Git's rebase state directories exists:
    /// - rebase-merge (interactive rebase)
    /// - rebase-apply (am-based rebase)
    pub fn is_rebase_in_progress(&self, worktree_path: &Path) -> Result<bool, GitCliError> {
        let rebase_merge = self.git(worktree_path, ["rev-parse", "--git-path", "rebase-merge"])?;
        let rebase_apply = self.git(worktree_path, ["rev-parse", "--git-path", "rebase-apply"])?;
        let rm_exists = std::path::Path::new(rebase_merge.trim()).exists();
        let ra_exists = std::path::Path::new(rebase_apply.trim()).exists();
        Ok(rm_exists || ra_exists)
    }

    /// Return true if a merge is in progress (MERGE_HEAD exists).
    pub fn is_merge_in_progress(&self, worktree_path: &Path) -> Result<bool, GitCliError> {
        match self.git(worktree_path, ["rev-parse", "--verify", "MERGE_HEAD"]) {
            Ok(_) => Ok(true),
            Err(GitCliError::CommandFailed(_)) => Ok(false),
            Err(e) => Err(e),
        }
    }

    /// Return true if a cherry-pick is in progress (CHERRY_PICK_HEAD exists).
    pub fn is_cherry_pick_in_progress(&self, worktree_path: &Path) -> Result<bool, GitCliError> {
        match self.git(worktree_path, ["rev-parse", "--verify", "CHERRY_PICK_HEAD"]) {
            Ok(_) => Ok(true),
            Err(GitCliError::CommandFailed(_)) => Ok(false),
            Err(e) => Err(e),
        }
    }

    /// Return true if a revert is in progress (REVERT_HEAD exists).
    pub fn is_revert_in_progress(&self, worktree_path: &Path) -> Result<bool, GitCliError> {
        match self.git(worktree_path, ["rev-parse", "--verify", "REVERT_HEAD"]) {
            Ok(_) => Ok(true),
            Err(GitCliError::CommandFailed(_)) => Ok(false),
            Err(e) => Err(e),
        }
    }

    /// Abort an in-progress rebase in this worktree. If no rebase is in progress,
    /// this is a no-op and returns Ok(()).
    pub fn abort_rebase(&self, worktree_path: &Path) -> Result<(), GitCliError> {
        // If nothing to abort, return success
        if !self.is_rebase_in_progress(worktree_path)? {
            return Ok(());
        }
        // Best-effort: if `git rebase --abort` fails, surface the error message
        self.git(worktree_path, ["rebase", "--abort"]).map(|_| ())
    }

    /// Quit an in-progress rebase (cleanup metadata without modifying commits).
    /// If no rebase is in progress, it's a no-op.
    pub fn quit_rebase(&self, worktree_path: &Path) -> Result<(), GitCliError> {
        if !self.is_rebase_in_progress(worktree_path)? {
            return Ok(());
        }
        self.git(worktree_path, ["rebase", "--quit"]).map(|_| ())
    }

    /// Return true if there are staged changes (index differs from HEAD)
    pub fn has_staged_changes(&self, repo_path: &Path) -> Result<bool, GitCliError> {
        // `git diff --cached --quiet` returns exit code 1 if there are differences
        let out =
            Command::new(resolve_executable_path_blocking("git").ok_or(GitCliError::NotAvailable)?)
                .arg("-C")
                .arg(repo_path)
                .arg("diff")
                .arg("--cached")
                .arg("--quiet")
                .output()
                .map_err(|e| GitCliError::CommandFailed(e.to_string()))?;
        match out.status.code() {
            Some(0) => Ok(false),
            Some(1) => Ok(true),
            _ => Err(GitCliError::CommandFailed(
                String::from_utf8_lossy(&out.stderr).trim().to_string(),
            )),
        }
    }

    /// Checkout base branch, squash-merge from_branch, and commit with message. Returns new HEAD sha.
    pub fn merge_squash_commit(
        &self,
        repo_path: &Path,
        base_branch: &str,
        from_branch: &str,
        message: &str,
    ) -> Result<String, GitCliError> {
        self.git(repo_path, ["checkout", base_branch]).map(|_| ())?;
        self.git(repo_path, ["merge", "--squash", "--no-commit", from_branch])
            .map(|_| ())?;
        self.git(repo_path, ["commit", "-m", message]).map(|_| ())?;
        let sha = self
            .git(repo_path, ["rev-parse", "HEAD"])?
            .trim()
            .to_string();
        Ok(sha)
    }

    /// Update a ref to a specific sha in the repo.
    pub fn update_ref(
        &self,
        repo_path: &Path,
        refname: &str,
        sha: &str,
    ) -> Result<(), GitCliError> {
        self.git(repo_path, ["update-ref", refname, sha])
            .map(|_| ())
    }

    pub fn abort_merge(&self, worktree_path: &Path) -> Result<(), GitCliError> {
        if !self.is_merge_in_progress(worktree_path)? {
            return Ok(());
        }
        self.git(worktree_path, ["merge", "--abort"]).map(|_| ())
    }

    pub fn abort_cherry_pick(&self, worktree_path: &Path) -> Result<(), GitCliError> {
        if !self.is_cherry_pick_in_progress(worktree_path)? {
            return Ok(());
        }
        self.git(worktree_path, ["cherry-pick", "--abort"])
            .map(|_| ())
    }

    pub fn abort_revert(&self, worktree_path: &Path) -> Result<(), GitCliError> {
        if !self.is_revert_in_progress(worktree_path)? {
            return Ok(());
        }
        self.git(worktree_path, ["revert", "--abort"]).map(|_| ())
    }

    /// List files currently in a conflicted (unmerged) state in the worktree.
    pub fn get_conflicted_files(&self, worktree_path: &Path) -> Result<Vec<String>, GitCliError> {
        // `--diff-filter=U` lists paths with unresolved conflicts
        let out = self.git(worktree_path, ["diff", "--name-only", "--diff-filter=U"])?;
        let mut files = Vec::new();
        for line in out.lines() {
            let p = line.trim();
            if !p.is_empty() {
                files.push(p.to_string());
            }
        }
        Ok(files)
    }
}

// Private methods
impl GitCli {
    fn classify_cli_error(&self, msg: String) -> GitCliError {
        let lower = msg.to_ascii_lowercase();
        if lower.contains("authentication failed")
            || lower.contains("could not read username")
            || lower.contains("invalid username or password")
        {
            GitCliError::AuthFailed(msg)
        } else if lower.contains("non-fast-forward")
            || lower.contains("failed to push some refs")
            || lower.contains("fetch first")
            || lower.contains("updates were rejected because the tip")
        {
            GitCliError::PushRejected(msg)
        } else {
            GitCliError::CommandFailed(msg)
        }
    }

    /// Ensure `git` is available on PATH
    fn ensure_available(&self) -> Result<(), GitCliError> {
        let git = resolve_executable_path_blocking("git").ok_or(GitCliError::NotAvailable)?;
        let out = Command::new(&git)
            .arg("--version")
            .output()
            .map_err(|_| GitCliError::NotAvailable)?;
        if out.status.success() {
            Ok(())
        } else {
            Err(GitCliError::NotAvailable)
        }
    }

    /// Run `git -C <repo_path> <args...>` and return stdout on success.
    /// Prefer adding specific helpers (e.g. `get_worktree_status`, `diff_status`)
    /// instead of calling this directly, so all parsing and command choices are
    /// centralized here. This makes it easier to change the underlying commands
    /// without adjusting callers. Use this low-level method directly only in
    /// tests or when no dedicated helper exists yet.
    ///
    /// About `OsStr`/`OsString` usage:
    /// - `Command` and `Path` operate on `OsStr` to support non‑UTF‑8 paths and
    ///   arguments across platforms. Using `String` would force lossy conversion
    ///   or partial failures. This API accepts anything that implements
    ///   `AsRef<OsStr>` so typical call sites can still pass `&str` literals or
    ///   owned `String`s without friction.
    pub fn git<I, S>(&self, repo_path: &Path, args: I) -> Result<String, GitCliError>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        self.ensure_available()?;
        let git = resolve_executable_path_blocking("git").ok_or(GitCliError::NotAvailable)?;
        let mut cmd = Command::new(&git);
        cmd.arg("-C").arg(repo_path);
        for a in args {
            cmd.arg(a);
        }
        let out = cmd
            .output()
            .map_err(|e| GitCliError::CommandFailed(e.to_string()))?;
        if !out.status.success() {
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
            let combined = match (stdout.is_empty(), stderr.is_empty()) {
                (true, true) => "Command failed with no output".to_string(),
                (false, false) => format!("--- stderr\n{stderr}\n--- stdout\n{stdout}"),
                (false, true) => format!("--- stderr\n{stdout}"),
                (true, false) => format!("--- stdout\n{stderr}"),
            };
            return Err(GitCliError::CommandFailed(combined));
        }
        Ok(String::from_utf8_lossy(&out.stdout).to_string())
    }

    /// Like `git`, but allows passing additional environment variables.
    fn git_with_env<I, S>(
        &self,
        repo_path: &Path,
        args: I,
        envs: &[(OsString, OsString)],
    ) -> Result<String, GitCliError>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        self.ensure_available()?;
        let git = resolve_executable_path_blocking("git").ok_or(GitCliError::NotAvailable)?;
        let mut cmd = Command::new(&git);
        cmd.arg("-C").arg(repo_path);
        for (k, v) in envs {
            cmd.env(k, v);
        }
        for a in args {
            cmd.arg(a);
        }
        let out = cmd
            .output()
            .map_err(|e| GitCliError::CommandFailed(e.to_string()))?;
        if !out.status.success() {
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
            let combined = match (stdout.is_empty(), stderr.is_empty()) {
                (true, true) => "Command failed with no output".to_string(),
                (false, false) => format!("--- stderr\n{stderr}\n--- stdout\n{stdout}"),
                (false, true) => format!("--- stderr\n{stdout}"),
                (true, false) => format!("--- stdout\n{stderr}"),
            };
            return Err(GitCliError::CommandFailed(combined));
        }
        Ok(String::from_utf8_lossy(&out.stdout).to_string())
    }
}
/// Parsed entry from `git status --porcelain`
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StatusEntry {
    /// Single-letter staged status (column X) or '?' for untracked
    pub staged: char,
    /// Single-letter unstaged status (column Y) or '?' for untracked
    pub unstaged: char,
    /// Current path
    pub path: String,
    /// Original path (for renames)
    pub orig_path: Option<String>,
    /// True if this entry is untracked ("??")
    pub is_untracked: bool,
}

/// Summary + entries for a working tree status
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorktreeStatus {
    pub uncommitted_tracked: usize,
    pub untracked: usize,
    pub entries: Vec<StatusEntry>,
}
