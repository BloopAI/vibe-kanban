//! Minimal helpers around the GitHub CLI (`gh`).
//!
//! This module deliberately mirrors the ergonomics of `git_cli.rs` so we can
//! plug in the GitHub CLI for operations the REST client does not cover well.
//! Future work will flesh out richer error handling and testing.

use std::{
    ffi::{OsStr, OsString},
    process::Command,
};

use chrono::{DateTime, Utc};
use db::models::merge::{MergeStatus, PullRequestInfo};
use serde_json::Value;
use thiserror::Error;
use utils::shell::resolve_executable_path_blocking;

use crate::services::github_service::{CreatePrRequest, GitHubRepoInfo};

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
        resolve_executable_path_blocking("gh")
            .ok_or(GhCliError::NotAvailable)
            .map(|_| ())
    }

    /// Generic helper to execute `gh <args>` and return stdout on success.
    fn run<I, S>(&self, args: I) -> Result<String, GhCliError>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        self.ensure_available()?;
        let gh = resolve_executable_path_blocking("gh").ok_or(GhCliError::NotAvailable)?;
        let mut cmd = Command::new(&gh);
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

    /// Run `gh pr create` and parse the response.
    ///
    /// TODO: support writing the body to a temp file (`--body-file`) for large/multi-line
    /// content and expand stdout/stderr mapping into richer error variants.
    pub fn create_pr(
        &self,
        request: &CreatePrRequest,
        repo_info: &GitHubRepoInfo,
    ) -> Result<PullRequestInfo, GhCliError> {
        let mut args: Vec<OsString> = Vec::with_capacity(12);
        args.push(OsString::from("pr"));
        args.push(OsString::from("create"));
        args.push(OsString::from("--repo"));
        args.push(OsString::from(format!(
            "{}/{}",
            repo_info.owner, repo_info.repo_name
        )));
        args.push(OsString::from("--head"));
        args.push(OsString::from(&request.head_branch));
        args.push(OsString::from("--base"));
        args.push(OsString::from(&request.base_branch));
        args.push(OsString::from("--title"));
        args.push(OsString::from(&request.title));

        let body = request.body.as_deref().unwrap_or("");
        args.push(OsString::from("--body"));
        args.push(OsString::from(body));

        let raw = self.run(args)?;
        Self::parse_pr_create_text(&raw)
    }

    /// Ensure the GitHub CLI has valid auth.
    pub fn check_auth(&self) -> Result<(), GhCliError> {
        match self.run(["auth", "status"]) {
            Ok(_) => Ok(()),
            Err(GhCliError::CommandFailed(msg)) => Err(GhCliError::AuthFailed(msg)),
            Err(err) => Err(err),
        }
    }

    /// Fetch repository numeric ID via `gh api`.
    pub fn repo_database_id(&self, owner: &str, repo: &str) -> Result<i64, GhCliError> {
        let raw = self.run(["api", &format!("repos/{owner}/{repo}"), "--method", "GET"])?;
        let value: Value = serde_json::from_str(raw.trim()).map_err(|err| {
            GhCliError::UnexpectedOutput(format!(
                "Failed to parse gh api repos response: {err}; raw: {raw}"
            ))
        })?;
        value.get("id").and_then(Value::as_i64).ok_or_else(|| {
            GhCliError::UnexpectedOutput(format!(
                "gh api repos response missing numeric repository id: {value:#?}"
            ))
        })
    }

    /// Retrieve details for a single pull request.
    pub fn view_pr(
        &self,
        owner: &str,
        repo: &str,
        pr_number: i64,
    ) -> Result<PullRequestInfo, GhCliError> {
        let raw = self.run([
            "pr",
            "view",
            &pr_number.to_string(),
            "--repo",
            &format!("{owner}/{repo}"),
            "--json",
            "number,url,state,mergedAt,mergeCommit",
        ])?;
        Self::parse_pr_view(&raw)
    }

    /// List pull requests for a branch (includes closed/merged).
    pub fn list_prs_for_branch(
        &self,
        owner: &str,
        repo: &str,
        branch: &str,
    ) -> Result<Vec<PullRequestInfo>, GhCliError> {
        let raw = self.run([
            "pr",
            "list",
            "--repo",
            &format!("{owner}/{repo}"),
            "--state",
            "all",
            "--head",
            &format!("{owner}:{branch}"),
            "--json",
            "number,url,state,mergedAt,mergeCommit",
        ])?;
        Self::parse_pr_list(&raw)
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
