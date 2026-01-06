//! Minimal helpers around the Azure CLI (`az repos`).
//!
//! This module provides low-level access to the Azure CLI for Azure DevOps
//! repository and pull request operations.
//!
//! Most operations use `--detect true` which auto-detects organization, project,
//! and repository from git config when run from within a repo directory.

use std::{
    ffi::{OsStr, OsString},
    io::Write,
    path::Path,
    process::Command,
};

use chrono::{DateTime, Utc};
use db::models::merge::{MergeStatus, PullRequestInfo};
use serde_json::Value;
use tempfile::NamedTempFile;
use thiserror::Error;
use utils::shell::resolve_executable_path_blocking;

use crate::services::git_host::types::{CreatePrRequest, RepoInfo, UnifiedPrComment};

/// High-level errors originating from the Azure CLI.
#[derive(Debug, Error)]
pub enum AzCliError {
    #[error("Azure CLI (`az`) executable not found or not runnable")]
    NotAvailable,
    #[error("Azure CLI command failed: {0}")]
    CommandFailed(String),
    #[error("Azure CLI authentication failed: {0}")]
    AuthFailed(String),
    #[error("Azure CLI returned unexpected output: {0}")]
    UnexpectedOutput(String),
}

/// Newtype wrapper for invoking the `az` command.
#[derive(Debug, Clone, Default)]
pub struct AzCli;

impl AzCli {
    pub fn new() -> Self {
        Self {}
    }

    /// Ensure the Azure CLI binary is discoverable.
    fn ensure_available(&self) -> Result<(), AzCliError> {
        resolve_executable_path_blocking("az").ok_or(AzCliError::NotAvailable)?;
        Ok(())
    }

    fn run<I, S>(&self, args: I, dir: Option<&Path>) -> Result<String, AzCliError>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        self.ensure_available()?;
        let az = resolve_executable_path_blocking("az").ok_or(AzCliError::NotAvailable)?;
        let mut cmd = Command::new(&az);

        if let Some(d) = dir {
            cmd.current_dir(d);
        }

        for arg in args {
            cmd.arg(arg);
        }
        tracing::debug!("Running Azure CLI command: {:?} {:?}", az, cmd.get_args());

        let output = cmd
            .output()
            .map_err(|err| AzCliError::CommandFailed(err.to_string()))?;

        if output.status.success() {
            return Ok(String::from_utf8_lossy(&output.stdout).to_string());
        }

        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

        // Check for authentication errors
        let lower = stderr.to_ascii_lowercase();
        if lower.contains("az login")
            || lower.contains("not logged in")
            || lower.contains("authentication")
            || lower.contains("unauthorized")
            || lower.contains("credentials")
            || lower.contains("please run 'az login'")
        {
            return Err(AzCliError::AuthFailed(stderr));
        }

        Err(AzCliError::CommandFailed(stderr))
    }
    /// Get repository info from a local repository path.
    ///
    /// Uses `--detect true` to auto-detect the repo, then extracts org/project/repo
    /// from the CLI response.
    pub fn get_repo_info(&self, repo_path: &Path) -> Result<RepoInfo, AzCliError> {
        let raw = self.run(
            ["repos", "show", "--detect", "true", "--output", "json"],
            Some(repo_path),
        )?;

        let value: Value = serde_json::from_str(&raw).map_err(|e| {
            AzCliError::UnexpectedOutput(format!("Failed to parse az repos show response: {e}"))
        })?;

        let repo_name = value
            .get("name")
            .and_then(|v| v.as_str())
            .ok_or_else(|| AzCliError::UnexpectedOutput("Missing 'name' in response".to_string()))?
            .to_string();

        let project = value
            .get("project")
            .and_then(|p| p.get("name"))
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                AzCliError::UnexpectedOutput("Missing 'project.name' in response".to_string())
            })?
            .to_string();

        // Extract org URL from the 'url' field: https://dev.azure.com/{org}/.../_apis/...
        let api_url = value
            .get("url")
            .and_then(|v| v.as_str())
            .ok_or_else(|| AzCliError::UnexpectedOutput("Missing 'url' in response".to_string()))?;

        let organization_url = Self::extract_org_url(api_url).ok_or_else(|| {
            AzCliError::UnexpectedOutput(format!(
                "Could not extract organization URL from: {api_url}"
            ))
        })?;

        tracing::debug!(
            "Got Azure DevOps repo info: org_url='{}', project='{}', repo='{}'",
            organization_url,
            project,
            repo_name
        );

        Ok(RepoInfo::AzureDevOps {
            organization_url,
            project,
            repo_name,
        })
    }

    /// Extract base organization URL from an API URL.
    ///
    /// Input: `https://dev.azure.com/{org}/.../_apis/...`
    /// Output: `https://dev.azure.com/{org}`
    fn extract_org_url(api_url: &str) -> Option<String> {
        // Find dev.azure.com/ and extract the org name after it
        if let Some(idx) = api_url.find("dev.azure.com/") {
            let after = &api_url[idx + "dev.azure.com/".len()..];
            if let Some(slash_idx) = after.find('/') {
                let org = &after[..slash_idx];
                return Some(format!("https://dev.azure.com/{}", org));
            }
        }
        None
    }

    /// Run `az repos pr create` and parse the response.
    pub fn create_pr(
        &self,
        request: &CreatePrRequest,
        organization_url: &str,
        project: &str,
        repo_name: &str,
    ) -> Result<PullRequestInfo, AzCliError> {
        // Write body to temp file to avoid shell escaping issues
        let body = request.body.as_deref().unwrap_or("");
        let mut body_file = NamedTempFile::new()
            .map_err(|e| AzCliError::CommandFailed(format!("Failed to create temp file: {e}")))?;
        body_file
            .write_all(body.as_bytes())
            .map_err(|e| AzCliError::CommandFailed(format!("Failed to write body: {e}")))?;

        let mut args: Vec<OsString> = Vec::with_capacity(20);
        args.push(OsString::from("repos"));
        args.push(OsString::from("pr"));
        args.push(OsString::from("create"));
        args.push(OsString::from("--organization"));
        args.push(OsString::from(organization_url));
        args.push(OsString::from("--project"));
        args.push(OsString::from(project));
        args.push(OsString::from("--repository"));
        args.push(OsString::from(repo_name));
        args.push(OsString::from("--source-branch"));
        args.push(OsString::from(&request.head_branch));
        args.push(OsString::from("--target-branch"));
        args.push(OsString::from(&request.base_branch));
        args.push(OsString::from("--title"));
        args.push(OsString::from(&request.title));
        args.push(OsString::from("--description"));
        // Read description from temp file
        let description =
            std::fs::read_to_string(body_file.path()).unwrap_or_else(|_| body.to_string());
        args.push(OsString::from(&description));
        args.push(OsString::from("--output"));
        args.push(OsString::from("json"));

        if request.draft.unwrap_or(false) {
            args.push(OsString::from("--draft"));
        }

        let raw = self.run(args, None)?;
        Self::parse_pr_response(&raw)
    }

    /// Ensure the Azure CLI has valid auth.
    pub fn check_auth(&self) -> Result<(), AzCliError> {
        match self.run(["account", "show"], None) {
            Ok(_) => Ok(()),
            Err(AzCliError::CommandFailed(msg)) => Err(AzCliError::AuthFailed(msg)),
            Err(err) => Err(err),
        }
    }

    /// Retrieve details for a pull request by URL.
    ///
    /// Parses the URL to extract organization and PR ID, then queries Azure CLI.
    pub fn view_pr(&self, pr_url: &str) -> Result<PullRequestInfo, AzCliError> {
        let (organization, pr_id) = Self::parse_pr_url(pr_url).ok_or_else(|| {
            AzCliError::UnexpectedOutput(format!("Could not parse Azure DevOps PR URL: {pr_url}"))
        })?;

        let org_url = format!("https://dev.azure.com/{}", organization);

        let raw = self.run(
            [
                "repos",
                "pr",
                "show",
                "--id",
                &pr_id.to_string(),
                "--organization",
                &org_url,
                "--output",
                "json",
            ],
            None,
        )?;

        Self::parse_pr_response(&raw)
    }

    /// List pull requests for a branch (includes closed/merged).
    pub fn list_prs_for_branch(
        &self,
        organization_url: &str,
        project: &str,
        repo_name: &str,
        branch: &str,
    ) -> Result<Vec<PullRequestInfo>, AzCliError> {
        let raw = self.run(
            [
                "repos",
                "pr",
                "list",
                "--organization",
                organization_url,
                "--project",
                project,
                "--repository",
                repo_name,
                "--source-branch",
                branch,
                "--status",
                "all",
                "--output",
                "json",
            ],
            None,
        )?;

        Self::parse_pr_list_response(&raw)
    }

    /// Fetch comments (threads) for a pull request.
    pub fn get_pr_threads(
        &self,
        organization_url: &str,
        pr_id: i64,
    ) -> Result<Vec<UnifiedPrComment>, AzCliError> {
        let raw = self.run(
            [
                "repos",
                "pr",
                "list-threads",
                "--organization",
                organization_url,
                "--id",
                &pr_id.to_string(),
                "--output",
                "json",
            ],
            None,
        )?;

        Self::parse_pr_threads(&raw)
    }

    /// Parse PR URL to extract organization and PR ID.
    ///
    /// Only extracts the minimal info needed for `az repos pr show`.
    /// Format: `https://dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{id}`
    pub fn parse_pr_url(url: &str) -> Option<(String, i64)> {
        let url_lower = url.to_lowercase();

        if url_lower.contains("dev.azure.com") && url_lower.contains("/pullrequest/") {
            let parts: Vec<&str> = url.split('/').collect();
            if let Some(pr_idx) = parts.iter().position(|&p| p == "pullrequest") {
                if parts.len() > pr_idx + 1 {
                    let pr_id: i64 = parts[pr_idx + 1].parse().ok()?;
                    // Find dev.azure.com position to get organization
                    if let Some(azure_idx) = parts.iter().position(|&p| p.contains("dev.azure.com"))
                    {
                        if parts.len() > azure_idx + 1 {
                            let organization = parts[azure_idx + 1].to_string();
                            return Some((organization, pr_id));
                        }
                    }
                }
            }
        }

        // Legacy format: https://{org}.visualstudio.com/{project}/_git/{repo}/pullrequest/{id}
        if url_lower.contains(".visualstudio.com") && url_lower.contains("/pullrequest/") {
            let parts: Vec<&str> = url.split('/').collect();
            for part in parts.iter() {
                if part.contains(".visualstudio.com") {
                    if let Some(org) = part.split('.').next() {
                        if let Some(pr_idx) = parts.iter().position(|&p| p == "pullrequest") {
                            if parts.len() > pr_idx + 1 {
                                let pr_id: i64 = parts[pr_idx + 1].parse().ok()?;
                                return Some((org.to_string(), pr_id));
                            }
                        }
                    }
                }
            }
        }

        None
    }
}

impl AzCli {
    /// Parse PR response from Azure CLI.
    /// Works for both `az repos pr create` and `az repos pr show`.
    fn parse_pr_response(raw: &str) -> Result<PullRequestInfo, AzCliError> {
        let value: Value = serde_json::from_str(raw.trim()).map_err(|err| {
            AzCliError::UnexpectedOutput(format!(
                "Failed to parse az repos pr response: {err}; raw: {raw}"
            ))
        })?;

        Self::extract_pr_info(&value).ok_or_else(|| {
            AzCliError::UnexpectedOutput(format!(
                "az repos pr response missing required fields: {value:#?}"
            ))
        })
    }

    fn parse_pr_list_response(raw: &str) -> Result<Vec<PullRequestInfo>, AzCliError> {
        let value: Value = serde_json::from_str(raw.trim()).map_err(|err| {
            AzCliError::UnexpectedOutput(format!(
                "Failed to parse az repos pr list response: {err}; raw: {raw}"
            ))
        })?;

        let arr = value.as_array().ok_or_else(|| {
            AzCliError::UnexpectedOutput(format!(
                "az repos pr list response is not an array: {value:#?}"
            ))
        })?;

        arr.iter()
            .map(|item| {
                Self::extract_pr_info(item).ok_or_else(|| {
                    AzCliError::UnexpectedOutput(format!(
                        "az repos pr list item missing required fields: {item:#?}"
                    ))
                })
            })
            .collect()
    }

    fn parse_pr_threads(raw: &str) -> Result<Vec<UnifiedPrComment>, AzCliError> {
        let value: Value = serde_json::from_str(raw.trim()).map_err(|err| {
            AzCliError::UnexpectedOutput(format!(
                "Failed to parse az repos pr list-threads response: {err}; raw: {raw}"
            ))
        })?;

        let threads = value.as_array().ok_or_else(|| {
            AzCliError::UnexpectedOutput(format!(
                "az repos pr list-threads response is not an array: {value:#?}"
            ))
        })?;

        let mut comments = Vec::new();

        for thread in threads {
            // Each thread can have multiple comments
            let thread_comments = thread.get("comments").and_then(|c| c.as_array());

            // Get thread context for file path info
            let thread_context = thread.get("threadContext");
            let file_path = thread_context
                .and_then(|ctx| ctx.get("filePath"))
                .and_then(|p| p.as_str())
                .map(|s| s.to_string());

            // Get right file line if available
            let line = thread_context
                .and_then(|ctx| ctx.get("rightFileStart"))
                .and_then(|rfs| rfs.get("line"))
                .and_then(|l| l.as_i64());

            if let Some(thread_comments) = thread_comments {
                for comment in thread_comments {
                    let id = comment
                        .get("id")
                        .and_then(|v| v.as_i64())
                        .unwrap_or(0)
                        .to_string();

                    let author = comment
                        .get("author")
                        .and_then(|a| a.get("displayName"))
                        .and_then(|n| n.as_str())
                        .unwrap_or("unknown")
                        .to_string();

                    let body = comment
                        .get("content")
                        .and_then(|c| c.as_str())
                        .unwrap_or("")
                        .to_string();

                    let created_at = comment
                        .get("publishedDate")
                        .and_then(|d| d.as_str())
                        .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
                        .map(|dt| dt.with_timezone(&Utc))
                        .unwrap_or_else(Utc::now);

                    // Skip system-generated comments
                    let comment_type = comment
                        .get("commentType")
                        .and_then(|ct| ct.as_str())
                        .unwrap_or("text");

                    if comment_type == "system" {
                        continue;
                    }

                    // Azure doesn't provide direct comment URLs in threads response
                    // Use empty string - caller can construct if needed
                    let url = String::new();

                    if let Some(ref path) = file_path {
                        // This is a review comment on a file
                        comments.push(UnifiedPrComment::Review {
                            id: id.parse().unwrap_or(0),
                            author,
                            author_association: String::new(), // Azure doesn't have this concept
                            body,
                            created_at,
                            url,
                            path: path.clone(),
                            line,
                            diff_hunk: String::new(), // Azure doesn't provide this in the same way
                        });
                    } else {
                        // This is a general comment
                        comments.push(UnifiedPrComment::General {
                            id,
                            author,
                            author_association: String::new(),
                            body,
                            created_at,
                            url,
                        });
                    }
                }
            }
        }

        // Sort by creation time
        comments.sort_by_key(|c| c.created_at());

        Ok(comments)
    }

    /// Extract PR info from Azure CLI JSON response.
    /// The response includes a `repository.webUrl` field we use to construct the PR URL.
    fn extract_pr_info(value: &Value) -> Option<PullRequestInfo> {
        let number = value.get("pullRequestId")?.as_i64()?;

        // Get the PR URL from the repository's webUrl + pullRequestId
        // Response has: repository.webUrl = "https://dev.azure.com/org/project/_git/repo"
        let url = value
            .get("repository")
            .and_then(|r| r.get("webUrl"))
            .and_then(|u| u.as_str())
            .map(|web_url| format!("{}/pullrequest/{}", web_url, number))
            .unwrap_or_else(|| format!("pullrequest/{}", number));

        let status = value
            .get("status")
            .and_then(Value::as_str)
            .unwrap_or("active")
            .to_string();

        let merged_at = value
            .get("closedDate")
            .and_then(Value::as_str)
            .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
            .map(|dt| dt.with_timezone(&Utc));

        // Azure uses "completionOptions.mergeCommitMessage" or "lastMergeCommit.commitId"
        let merge_commit_sha = value
            .get("lastMergeCommit")
            .and_then(|v| v.get("commitId"))
            .and_then(Value::as_str)
            .map(|s| s.to_string());

        Some(PullRequestInfo {
            number,
            url,
            status: Self::map_azure_status(&status),
            merged_at,
            merge_commit_sha,
        })
    }

    /// Map Azure DevOps PR status to MergeStatus
    fn map_azure_status(status: &str) -> MergeStatus {
        match status.to_lowercase().as_str() {
            "active" => MergeStatus::Open,
            "completed" => MergeStatus::Merged,
            "abandoned" => MergeStatus::Closed,
            _ => MergeStatus::Unknown,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_pr_url() {
        // dev.azure.com format
        let (org, id) = AzCli::parse_pr_url(
            "https://dev.azure.com/myorg/myproject/_git/myrepo/pullrequest/123",
        )
        .unwrap();
        assert_eq!(org, "myorg");
        assert_eq!(id, 123);
    }

    #[test]
    fn test_parse_pr_url_visualstudio() {
        // Legacy visualstudio.com format
        let (org, id) = AzCli::parse_pr_url(
            "https://myorg.visualstudio.com/myproject/_git/myrepo/pullrequest/456",
        )
        .unwrap();
        assert_eq!(org, "myorg");
        assert_eq!(id, 456);
    }

    #[test]
    fn test_parse_pr_url_invalid() {
        // GitHub URL should return None
        assert!(AzCli::parse_pr_url("https://github.com/owner/repo/pull/123").is_none());
        // Missing pullrequest path
        assert!(AzCli::parse_pr_url("https://dev.azure.com/myorg/myproject/_git/myrepo").is_none());
    }

    #[test]
    fn test_map_azure_status() {
        assert!(matches!(
            AzCli::map_azure_status("active"),
            MergeStatus::Open
        ));
        assert!(matches!(
            AzCli::map_azure_status("completed"),
            MergeStatus::Merged
        ));
        assert!(matches!(
            AzCli::map_azure_status("abandoned"),
            MergeStatus::Closed
        ));
        assert!(matches!(
            AzCli::map_azure_status("unknown"),
            MergeStatus::Unknown
        ));
    }
}
