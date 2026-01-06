//! Minimal helpers around the GitHub CLI (`gh`).
//!
//! This module provides low-level access to the GitHub CLI for operations
//! the REST client does not cover well.

use std::{
    ffi::{OsStr, OsString},
    io::Write,
    path::Path,
    process::Command,
};

use chrono::{DateTime, Utc};
use db::models::merge::{MergeStatus, PullRequestInfo};
use serde::Deserialize;
use serde_json::Value;
use tempfile::NamedTempFile;
use thiserror::Error;
use utils::shell::resolve_executable_path_blocking;

use crate::services::git_host::types::{
    CreatePrRequest, PrComment, PrCommentAuthor, PrReviewComment, RepoInfo, ReviewCommentUser,
};

/// High-level errors originating from the GitHub CLI.
#[derive(Debug, Error)]
pub enum GhCliError {
    #[error("GitHub CLI (`gh`) executable not found or not runnable")]
    NotAvailable,
    #[error("GitHub CLI command failed: {0}")]
    CommandFailed(String),
    #[error("GitHub CLI authentication failed: {0}")]
    AuthFailed(String),
    #[error("GitHub CLI returned unexpected output: {0}")]
    UnexpectedOutput(String),
}

/// Newtype wrapper for invoking the `gh` command.
#[derive(Debug, Clone, Default)]
pub struct GhCli;

impl GhCli {
    pub fn new() -> Self {
        Self {}
    }

    /// Ensure the GitHub CLI binary is discoverable.
    fn ensure_available(&self) -> Result<(), GhCliError> {
        resolve_executable_path_blocking("gh").ok_or(GhCliError::NotAvailable)?;
        Ok(())
    }

    fn run<I, S>(&self, args: I, dir: Option<&Path>) -> Result<String, GhCliError>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        self.ensure_available()?;
        let gh = resolve_executable_path_blocking("gh").ok_or(GhCliError::NotAvailable)?;
        let mut cmd = Command::new(&gh);
        if let Some(d) = dir {
            cmd.current_dir(d);
        }
        for arg in args {
            cmd.arg(arg);
        }
        let output = cmd
            .output()
            .map_err(|err| GhCliError::CommandFailed(err.to_string()))?;

        if output.status.success() {
            return Ok(String::from_utf8_lossy(&output.stdout).to_string());
        }

        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

        // Check exit code first - gh CLI uses exit code 4 for auth failures
        if output.status.code() == Some(4) {
            return Err(GhCliError::AuthFailed(stderr));
        }

        // Fall back to string matching for older gh versions or other auth scenarios
        let lower = stderr.to_ascii_lowercase();
        if lower.contains("authentication failed")
            || lower.contains("must authenticate")
            || lower.contains("bad credentials")
            || lower.contains("unauthorized")
            || lower.contains("gh auth login")
        {
            return Err(GhCliError::AuthFailed(stderr));
        }

        Err(GhCliError::CommandFailed(stderr))
    }

    /// Get repository info (owner and name) from a local repository path.
    pub fn get_repo_info(&self, repo_path: &Path) -> Result<RepoInfo, GhCliError> {
        let raw = self.run(["repo", "view", "--json", "owner,name"], Some(repo_path))?;

        #[derive(Deserialize)]
        struct Response {
            owner: Owner,
            name: String,
        }
        #[derive(Deserialize)]
        struct Owner {
            login: String,
        }

        let resp: Response = serde_json::from_str(&raw).map_err(|e| {
            GhCliError::UnexpectedOutput(format!("Failed to parse gh repo view response: {e}"))
        })?;

        Ok(RepoInfo::GitHub {
            owner: resp.owner.login,
            repo_name: resp.name,
        })
    }

    /// Run `gh pr create` and parse the response.
    pub fn create_pr(
        &self,
        request: &CreatePrRequest,
        owner: &str,
        repo_name: &str,
    ) -> Result<PullRequestInfo, GhCliError> {
        // Write body to temp file to avoid shell escaping and length issues
        let body = request.body.as_deref().unwrap_or("");
        let mut body_file = NamedTempFile::new()
            .map_err(|e| GhCliError::CommandFailed(format!("Failed to create temp file: {e}")))?;
        body_file
            .write_all(body.as_bytes())
            .map_err(|e| GhCliError::CommandFailed(format!("Failed to write body: {e}")))?;

        let mut args: Vec<OsString> = Vec::with_capacity(14);
        args.push(OsString::from("pr"));
        args.push(OsString::from("create"));
        args.push(OsString::from("--repo"));
        args.push(OsString::from(format!("{}/{}", owner, repo_name)));
        args.push(OsString::from("--head"));
        args.push(OsString::from(&request.head_branch));
        args.push(OsString::from("--base"));
        args.push(OsString::from(&request.base_branch));
        args.push(OsString::from("--title"));
        args.push(OsString::from(&request.title));
        args.push(OsString::from("--body-file"));
        args.push(body_file.path().as_os_str().to_os_string());

        if request.draft.unwrap_or(false) {
            args.push(OsString::from("--draft"));
        }

        let raw = self.run(args, None)?;
        Self::parse_pr_create_text(&raw)
    }

    /// Ensure the GitHub CLI has valid auth.
    pub fn check_auth(&self) -> Result<(), GhCliError> {
        match self.run(["auth", "status"], None) {
            Ok(_) => Ok(()),
            Err(GhCliError::CommandFailed(msg)) => Err(GhCliError::AuthFailed(msg)),
            Err(err) => Err(err),
        }
    }

    /// Retrieve details for a pull request by URL.
    pub fn view_pr(&self, pr_url: &str) -> Result<PullRequestInfo, GhCliError> {
        let raw = self.run(
            [
                "pr",
                "view",
                pr_url,
                "--json",
                "number,url,state,mergedAt,mergeCommit",
            ],
            None,
        )?;
        Self::parse_pr_view(&raw)
    }

    /// List pull requests for a branch (includes closed/merged).
    pub fn list_prs_for_branch(
        &self,
        owner: &str,
        repo: &str,
        branch: &str,
    ) -> Result<Vec<PullRequestInfo>, GhCliError> {
        let raw = self.run(
            [
                "pr",
                "list",
                "--repo",
                &format!("{owner}/{repo}"),
                "--state",
                "all",
                "--head",
                branch,
                "--json",
                "number,url,state,mergedAt,mergeCommit",
            ],
            None,
        )?;
        Self::parse_pr_list(&raw)
    }

    /// Fetch comments for a pull request.
    pub fn get_pr_comments(
        &self,
        owner: &str,
        repo: &str,
        pr_number: i64,
    ) -> Result<Vec<PrComment>, GhCliError> {
        let raw = self.run(
            [
                "pr",
                "view",
                &pr_number.to_string(),
                "--repo",
                &format!("{owner}/{repo}"),
                "--json",
                "comments",
            ],
            None,
        )?;
        Self::parse_pr_comments(&raw)
    }

    /// Fetch inline review comments for a pull request via API.
    pub fn get_pr_review_comments(
        &self,
        owner: &str,
        repo: &str,
        pr_number: i64,
    ) -> Result<Vec<PrReviewComment>, GhCliError> {
        let raw = self.run(
            [
                "api",
                &format!("repos/{owner}/{repo}/pulls/{pr_number}/comments"),
            ],
            None,
        )?;
        Self::parse_pr_review_comments(&raw)
    }
}

impl GhCli {
    fn parse_pr_create_text(raw: &str) -> Result<PullRequestInfo, GhCliError> {
        let pr_url = raw
            .lines()
            .rev()
            .flat_map(|line| line.split_whitespace())
            .map(|token| token.trim_matches(|c: char| c == '<' || c == '>'))
            .find(|token| token.starts_with("http") && token.contains("/pull/"))
            .ok_or_else(|| {
                GhCliError::UnexpectedOutput(format!(
                    "gh pr create did not return a pull request URL; raw output: {raw}"
                ))
            })?
            .trim_end_matches(['.', ',', ';'])
            .to_string();

        let number = pr_url
            .rsplit('/')
            .next()
            .ok_or_else(|| {
                GhCliError::UnexpectedOutput(format!(
                    "Failed to extract PR number from URL '{pr_url}'"
                ))
            })?
            .trim_end_matches(|c: char| !c.is_ascii_digit())
            .parse::<i64>()
            .map_err(|err| {
                GhCliError::UnexpectedOutput(format!(
                    "Failed to parse PR number from URL '{pr_url}': {err}"
                ))
            })?;

        Ok(PullRequestInfo {
            number,
            url: pr_url,
            status: MergeStatus::Open,
            merged_at: None,
            merge_commit_sha: None,
        })
    }

    fn parse_pr_view(raw: &str) -> Result<PullRequestInfo, GhCliError> {
        let value: Value = serde_json::from_str(raw.trim()).map_err(|err| {
            GhCliError::UnexpectedOutput(format!(
                "Failed to parse gh pr view response: {err}; raw: {raw}"
            ))
        })?;
        Self::extract_pr_info(&value).ok_or_else(|| {
            GhCliError::UnexpectedOutput(format!(
                "gh pr view response missing required fields: {value:#?}"
            ))
        })
    }

    fn parse_pr_list(raw: &str) -> Result<Vec<PullRequestInfo>, GhCliError> {
        let value: Value = serde_json::from_str(raw.trim()).map_err(|err| {
            GhCliError::UnexpectedOutput(format!(
                "Failed to parse gh pr list response: {err}; raw: {raw}"
            ))
        })?;
        let arr = value.as_array().ok_or_else(|| {
            GhCliError::UnexpectedOutput(format!("gh pr list response is not an array: {value:#?}"))
        })?;
        arr.iter()
            .map(|item| {
                Self::extract_pr_info(item).ok_or_else(|| {
                    GhCliError::UnexpectedOutput(format!(
                        "gh pr list item missing required fields: {item:#?}"
                    ))
                })
            })
            .collect()
    }

    fn parse_pr_comments(raw: &str) -> Result<Vec<PrComment>, GhCliError> {
        let value: Value = serde_json::from_str(raw.trim()).map_err(|err| {
            GhCliError::UnexpectedOutput(format!(
                "Failed to parse gh pr view --json comments response: {err}; raw: {raw}"
            ))
        })?;
        let comments_arr = value
            .get("comments")
            .and_then(|v| v.as_array())
            .ok_or_else(|| {
                GhCliError::UnexpectedOutput(format!(
                    "gh pr view --json comments response missing 'comments' array: {value:#?}"
                ))
            })?;
        comments_arr
            .iter()
            .map(|item| {
                // Parse manually to handle the nested author field
                let id = item
                    .get("id")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        GhCliError::UnexpectedOutput(format!("Comment missing id: {item:#?}"))
                    })?
                    .to_string();
                let author_login = item
                    .get("author")
                    .and_then(|a| a.get("login"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string();
                let author_association = item
                    .get("authorAssociation")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let body = item
                    .get("body")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let created_at = item
                    .get("createdAt")
                    .and_then(|v| v.as_str())
                    .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(Utc::now);
                let url = item
                    .get("url")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                Ok(PrComment {
                    id,
                    author: PrCommentAuthor {
                        login: author_login,
                    },
                    author_association,
                    body,
                    created_at,
                    url,
                })
            })
            .collect()
    }

    fn parse_pr_review_comments(raw: &str) -> Result<Vec<PrReviewComment>, GhCliError> {
        let items: Vec<Value> = serde_json::from_str(raw.trim()).map_err(|err| {
            GhCliError::UnexpectedOutput(format!(
                "Failed to parse review comments API response: {err}; raw: {raw}"
            ))
        })?;

        items
            .into_iter()
            .map(|item| {
                let id = item.get("id").and_then(|v| v.as_i64()).ok_or_else(|| {
                    GhCliError::UnexpectedOutput(format!("Review comment missing id: {item:#?}"))
                })?;
                let user_login = item
                    .get("user")
                    .and_then(|u| u.get("login"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string();
                let body = item
                    .get("body")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let created_at = item
                    .get("created_at")
                    .and_then(|v| v.as_str())
                    .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(Utc::now);
                let html_url = item
                    .get("html_url")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let path = item
                    .get("path")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let line = item.get("line").and_then(|v| v.as_i64());
                let side = item
                    .get("side")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                let diff_hunk = item
                    .get("diff_hunk")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let author_association = item
                    .get("author_association")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                Ok(PrReviewComment {
                    id,
                    user: ReviewCommentUser { login: user_login },
                    body,
                    created_at,
                    html_url,
                    path,
                    line,
                    side,
                    diff_hunk,
                    author_association,
                })
            })
            .collect()
    }

    fn extract_pr_info(value: &Value) -> Option<PullRequestInfo> {
        let number = value.get("number")?.as_i64()?;
        let url = value.get("url")?.as_str()?.to_string();
        let state = value
            .get("state")
            .and_then(Value::as_str)
            .unwrap_or("OPEN")
            .to_string();
        let merged_at = value
            .get("mergedAt")
            .and_then(Value::as_str)
            .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
            .map(|dt| dt.with_timezone(&Utc));
        let merge_commit_sha = value
            .get("mergeCommit")
            .and_then(|v| v.get("oid"))
            .and_then(Value::as_str)
            .map(|s| s.to_string());
        Some(PullRequestInfo {
            number,
            url,
            status: match state.to_ascii_uppercase().as_str() {
                "OPEN" => MergeStatus::Open,
                "MERGED" => MergeStatus::Merged,
                "CLOSED" => MergeStatus::Closed,
                _ => MergeStatus::Unknown,
            },
            merged_at,
            merge_commit_sha,
        })
    }
}
