use std::{path::Path, process::Command};

use thiserror::Error;
use utils::shell::resolve_executable_path;

#[derive(Debug, Error)]
pub enum GitCliError {
    #[error("git executable not found or not runnable")]
    NotAvailable,
    #[error("git command failed: {0}")]
    CommandFailed(String),
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

#[derive(Debug, Clone, Default)]
pub struct StatusDiffOptions {
    pub path_filter: Option<Vec<String>>, // pathspecs to limit diff
}

impl GitCli {
    pub fn new() -> Self {
        Self {}
    }

    /// Ensure `git` is available on PATH
    pub fn ensure_available(&self) -> Result<(), GitCliError> {
        let git = resolve_executable_path("git").ok_or(GitCliError::NotAvailable)?;
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

    /// Run `git -C <repo> worktree add <path> <branch>` (optionally creating the branch with -b)
    pub fn worktree_add(
        &self,
        repo_path: &Path,
        worktree_path: &Path,
        branch: &str,
        create_branch: bool,
    ) -> Result<(), GitCliError> {
        self.ensure_available()?;

        let git = resolve_executable_path("git").ok_or(GitCliError::NotAvailable)?;
        let mut cmd = Command::new(&git);
        cmd.arg("-C").arg(repo_path);
        cmd.arg("worktree").arg("add");
        if create_branch {
            cmd.arg("-b").arg(branch);
        }
        cmd.arg(worktree_path).arg(branch);

        let out = cmd
            .output()
            .map_err(|e| GitCliError::CommandFailed(e.to_string()))?;
        if !out.status.success() {
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            return Err(GitCliError::CommandFailed(stderr));
        }

        // Good practice: reapply sparse-checkout in the new worktree to ensure materialization matches
        // Non-fatal if it fails or not configured.
        let _ = Command::new(&git)
            .arg("-C")
            .arg(worktree_path)
            .arg("sparse-checkout")
            .arg("reapply")
            .output();

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
        let git = resolve_executable_path("git").ok_or(GitCliError::NotAvailable)?;
        let mut cmd = Command::new(&git);
        cmd.arg("-C").arg(repo_path);
        cmd.arg("worktree").arg("remove");
        if force {
            cmd.arg("--force");
        }
        cmd.arg(worktree_path);

        let out = cmd
            .output()
            .map_err(|e| GitCliError::CommandFailed(e.to_string()))?;
        if !out.status.success() {
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            return Err(GitCliError::CommandFailed(stderr));
        }
        Ok(())
    }

    /// Prune stale worktree metadata
    pub fn worktree_prune(&self, repo_path: &Path) -> Result<(), GitCliError> {
        self.ensure_available()?;
        let git = resolve_executable_path("git").ok_or(GitCliError::NotAvailable)?;
        let out = Command::new(&git)
            .arg("-C")
            .arg(repo_path)
            .arg("worktree")
            .arg("prune")
            .output()
            .map_err(|e| GitCliError::CommandFailed(e.to_string()))?;
        if !out.status.success() {
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            return Err(GitCliError::CommandFailed(stderr));
        }
        Ok(())
    }

    /// Return true if there are any changes in the working tree (staged or unstaged).
    pub fn has_changes(&self, worktree_path: &Path) -> Result<bool, GitCliError> {
        self.ensure_available()?;
        let git = resolve_executable_path("git").ok_or(GitCliError::NotAvailable)?;
        let out = Command::new(&git)
            .arg("-C")
            .arg(worktree_path)
            .arg("status")
            .arg("--porcelain")
            .output()
            .map_err(|e| GitCliError::CommandFailed(e.to_string()))?;
        if !out.status.success() {
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            return Err(GitCliError::CommandFailed(stderr));
        }
        Ok(!out.stdout.is_empty())
    }

    /// Diff status vs a base branch using a temporary index (always includes untracked).
    /// Path filter limits the reported paths.
    pub fn diff_status(
        &self,
        worktree_path: &Path,
        base_branch: &str,
        opts: StatusDiffOptions,
    ) -> Result<Vec<StatusDiffEntry>, GitCliError> {
        self.ensure_available()?;
        let git = resolve_executable_path("git").ok_or(GitCliError::NotAvailable)?;

        // Create a temp index file
        let tmp_dir = tempfile::TempDir::new()
            .map_err(|e| GitCliError::CommandFailed(format!("temp dir create failed: {e}")))?;
        let tmp_index = tmp_dir.path().join("index");

        // Use a temp index from HEAD to accurately track renames in untracked files
        let seed_out = Command::new(&git)
            .env("GIT_INDEX_FILE", &tmp_index)
            .arg("-C")
            .arg(worktree_path)
            .arg("read-tree")
            .arg("HEAD")
            .output()
            .map_err(|e| GitCliError::CommandFailed(e.to_string()))?;
        if !seed_out.status.success() {
            let stderr = String::from_utf8_lossy(&seed_out.stderr).trim().to_string();
            return Err(GitCliError::CommandFailed(format!(
                "git read-tree failed: {stderr}"
            )));
        }

        // Stage all in temp index
        let add_out = Command::new(&git)
            .env("GIT_INDEX_FILE", &tmp_index)
            .arg("-C")
            .arg(worktree_path)
            .arg("add")
            .arg("-A")
            .output()
            .map_err(|e| GitCliError::CommandFailed(e.to_string()))?;
        if !add_out.status.success() {
            let stderr = String::from_utf8_lossy(&add_out.stderr).trim().to_string();
            return Err(GitCliError::CommandFailed(stderr));
        }

        // git diff --cached
        let mut cmd = Command::new(&git);
        cmd.env("GIT_INDEX_FILE", &tmp_index)
            .arg("-C")
            .arg(worktree_path)
            .arg("-c")
            .arg("core.quotepath=false")
            .arg("diff")
            .arg("--cached")
            .arg("-M")
            .arg("--name-status")
            .arg(base_branch);
        if let Some(paths) = &opts.path_filter {
            let non_empty_paths: Vec<&str> = paths
                .iter()
                .map(|s| s.as_str())
                .filter(|p| !p.trim().is_empty())
                .collect();
            if !non_empty_paths.is_empty() {
                cmd.arg("--");
                for p in non_empty_paths {
                    cmd.arg(p);
                }
            }
        }
        let diff_out = cmd
            .output()
            .map_err(|e| GitCliError::CommandFailed(e.to_string()))?;
        if !diff_out.status.success() {
            let stderr = String::from_utf8_lossy(&diff_out.stderr).trim().to_string();
            return Err(GitCliError::CommandFailed(stderr));
        }
        Ok(Self::parse_name_status(&String::from_utf8_lossy(
            &diff_out.stdout,
        )))
    }

    /// Stage all changes in the working tree (respects sparse-checkout semantics).
    pub fn add_all(&self, worktree_path: &Path) -> Result<(), GitCliError> {
        self.ensure_available()?;
        let git = resolve_executable_path("git").ok_or(GitCliError::NotAvailable)?;
        let out = Command::new(&git)
            .arg("-C")
            .arg(worktree_path)
            .arg("add")
            .arg("-A")
            .output()
            .map_err(|e| GitCliError::CommandFailed(e.to_string()))?;
        if !out.status.success() {
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            return Err(GitCliError::CommandFailed(stderr));
        }
        Ok(())
    }

    /// Commit staged changes with the given message.
    pub fn commit(&self, worktree_path: &Path, message: &str) -> Result<(), GitCliError> {
        self.ensure_available()?;
        let git = resolve_executable_path("git").ok_or(GitCliError::NotAvailable)?;
        let out = Command::new(&git)
            .arg("-C")
            .arg(worktree_path)
            .arg("commit")
            .arg("-m")
            .arg(message)
            .output()
            .map_err(|e| GitCliError::CommandFailed(e.to_string()))?;
        if !out.status.success() {
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            return Err(GitCliError::CommandFailed(stderr));
        }
        Ok(())
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
}
