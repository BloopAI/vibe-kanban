//! Minimal helpers around the Azure CLI (`az repos`).
//!
//! This module provides low-level access to the Azure CLI for Azure DevOps
//! repository and pull request operations.

use std::{
    ffi::{OsStr, OsString},
    path::Path,
    process::Command,
};

use chrono::{DateTime, Utc};
use db::models::merge::{MergeStatus, PullRequestInfo};
use serde::Deserialize;
use thiserror::Error;
use utils::shell::resolve_executable_path_blocking;

use crate::services::git_host::types::{CreatePrRequest, UnifiedPrComment};

#[derive(Debug, Clone)]
pub struct AzureRepoInfo {
    pub organization_url: String,
    pub project: String,
    pub project_id: String,
    pub repo_name: String,
    pub repo_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AzPrResponse {
    pull_request_id: i64,
    status: Option<String>,
    closed_date: Option<String>,
    repository: Option<AzRepository>,
    last_merge_commit: Option<AzCommit>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AzRepository {
    web_url: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AzCommit {
    commit_id: Option<String>,
}

#[derive(Deserialize)]
struct AzThreadsResponse {
    value: Vec<AzThread>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AzThread {
    comments: Option<Vec<AzThreadComment>>,
    thread_context: Option<AzThreadContext>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AzThreadContext {
    file_path: Option<String>,
    right_file_start: Option<AzFilePosition>,
}

#[derive(Deserialize)]
struct AzFilePosition {
    line: Option<i64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AzThreadComment {
    id: Option<i64>,
    author: Option<AzAuthor>,
    content: Option<String>,
    published_date: Option<String>,
    comment_type: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AzAuthor {
    display_name: Option<String>,
}

/// Response item from `az repos list`
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AzRepoListItem {
    id: String,
    name: String,
    project: AzRepoProject,
    remote_url: String,
    ssh_url: Option<String>,
}

#[derive(Deserialize)]
struct AzRepoProject {
    id: String,
    name: String,
}

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
    pub fn get_repo_info(
        &self,
        repo_path: &Path,
        remote_url: &str,
    ) -> Result<AzureRepoInfo, AzCliError> {
        let raw = self.run(
            ["repos", "list", "--detect", "true", "--output", "json"],
            Some(repo_path),
        )?;

        let repos: Vec<AzRepoListItem> = serde_json::from_str(raw.trim()).map_err(|e| {
            AzCliError::UnexpectedOutput(format!("Failed to parse repos list: {e}; raw: {raw}"))
        })?;

        // Find the repo that matches our remote URL (check both HTTPS and SSH)
        let is_ssh = remote_url.starts_with("git@") || remote_url.starts_with("ssh://");
        let repo = repos
            .into_iter()
            .find(|r| {
                if is_ssh {
                    r.ssh_url
                        .as_ref()
                        .map(|ssh| Self::urls_match(ssh, remote_url))
                        .unwrap_or(false)
                } else {
                    Self::urls_match(&r.remote_url, remote_url)
                }
            })
            .ok_or_else(|| {
                AzCliError::UnexpectedOutput(format!(
                    "No repo found matching remote URL: {}",
                    remote_url
                ))
            })?;

        let organization_url =
            Self::extract_organization_url(&repo.remote_url).ok_or_else(|| {
                AzCliError::UnexpectedOutput(format!(
                    "Could not extract organization URL from: {}",
                    repo.remote_url
                ))
            })?;

        tracing::debug!(
            "Got Azure DevOps repo info: org_url='{}', project='{}' ({}), repo='{}' ({})",
            organization_url,
            repo.project.name,
            repo.project.id,
            repo.name,
            repo.id
        );

        Ok(AzureRepoInfo {
            organization_url,
            project: repo.project.name,
            project_id: repo.project.id,
            repo_name: repo.name,
            repo_id: repo.id,
        })
    }

    fn urls_match(url1: &str, url2: &str) -> bool {
        let normalize = |url: &str| {
            let mut s = url.to_lowercase();
            // Normalize ssh:// prefix to scp-style
            if let Some(rest) = s.strip_prefix("ssh://") {
                s = rest.to_string();
            }
            s.trim_end_matches('/').trim_end_matches(".git").to_string()
        };
        normalize(url1) == normalize(url2)
    }

    /// Extract the organization URL from a remote URL.
    /// Returns the base URL that can be used with Azure CLI commands.
    fn extract_organization_url(url: &str) -> Option<String> {
        // dev.azure.com format: https://dev.azure.com/{org}/... -> https://dev.azure.com/{org}
        if url.contains("dev.azure.com") {
            let parts: Vec<&str> = url.split('/').collect();
            let azure_idx = parts.iter().position(|&p| p.contains("dev.azure.com"))?;
            let org = parts.get(azure_idx + 1)?;
            return Some(format!("https://dev.azure.com/{}", org));
        }

        // Legacy format: https://{org}.visualstudio.com/... -> https://{org}.visualstudio.com
        if url.contains(".visualstudio.com") {
            let parts: Vec<&str> = url.split('/').collect();
            for part in parts.iter() {
                if part.contains(".visualstudio.com") {
                    return Some(format!("https://{}", part));
                }
            }
        }

        None
    }

    pub fn create_pr(
        &self,
        request: &CreatePrRequest,
        organization_url: &str,
        project: &str,
        repo_name: &str,
    ) -> Result<PullRequestInfo, AzCliError> {
        let body = request.body.as_deref().unwrap_or("");

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
        args.push(OsString::from(body));
        args.push(OsString::from("--output"));
        args.push(OsString::from("json"));

        if request.draft.unwrap_or(false) {
            args.push(OsString::from("--draft"));
        }

        let raw = self.run(args, None)?;
        Self::parse_pr_response(&raw)
    }

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

    pub fn get_pr_threads(
        &self,
        organization_url: &str,
        project_id: &str,
        repo_id: &str,
        pr_id: i64,
    ) -> Result<Vec<UnifiedPrComment>, AzCliError> {
        let mut args: Vec<OsString> = Vec::with_capacity(16);
        args.push(OsString::from("devops"));
        args.push(OsString::from("invoke"));
        args.push(OsString::from("--area"));
        args.push(OsString::from("git"));
        args.push(OsString::from("--resource"));
        args.push(OsString::from("pullRequestThreads"));
        args.push(OsString::from("--route-parameters"));
        args.push(OsString::from(format!("project={}", project_id)));
        args.push(OsString::from(format!("repositoryId={}", repo_id)));
        args.push(OsString::from(format!("pullRequestId={}", pr_id)));
        args.push(OsString::from("--organization"));
        args.push(OsString::from(organization_url));
        args.push(OsString::from("--api-version"));
        args.push(OsString::from("7.0"));
        args.push(OsString::from("--output"));
        args.push(OsString::from("json"));

        let raw = self.run(args, None)?;
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
            if let Some(pr_idx) = parts.iter().position(|&p| p == "pullrequest")
                && parts.len() > pr_idx + 1
            {
                let pr_id: i64 = parts[pr_idx + 1].parse().ok()?;
                if let Some(azure_idx) = parts.iter().position(|&p| p.contains("dev.azure.com"))
                    && parts.len() > azure_idx + 1
                {
                    let organization = parts[azure_idx + 1].to_string();
                    return Some((organization, pr_id));
                }
            }
        }

        // Legacy format: https://{org}.visualstudio.com/{project}/_git/{repo}/pullrequest/{id}
        if url_lower.contains(".visualstudio.com") && url_lower.contains("/pullrequest/") {
            let parts: Vec<&str> = url.split('/').collect();
            for part in parts.iter() {
                if let Some(org) = part.strip_suffix(".visualstudio.com")
                    && let Some(pr_idx) = parts.iter().position(|&p| p == "pullrequest")
                    && parts.len() > pr_idx + 1
                {
                    let pr_id: i64 = parts[pr_idx + 1].parse().ok()?;
                    return Some((org.to_string(), pr_id));
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
        let pr: AzPrResponse = serde_json::from_str(raw.trim()).map_err(|e| {
            AzCliError::UnexpectedOutput(format!("Failed to parse PR response: {e}; raw: {raw}"))
        })?;
        Ok(Self::az_pr_to_info(pr))
    }

    fn parse_pr_list_response(raw: &str) -> Result<Vec<PullRequestInfo>, AzCliError> {
        let prs: Vec<AzPrResponse> = serde_json::from_str(raw.trim()).map_err(|e| {
            AzCliError::UnexpectedOutput(format!("Failed to parse PR list: {e}; raw: {raw}"))
        })?;
        Ok(prs.into_iter().map(Self::az_pr_to_info).collect())
    }

    /// Convert Azure PR response to PullRequestInfo.
    fn az_pr_to_info(pr: AzPrResponse) -> PullRequestInfo {
        let url = pr
            .repository
            .and_then(|r| r.web_url)
            .map(|u| format!("{}/pullrequest/{}", u, pr.pull_request_id))
            .unwrap_or_else(|| format!("pullrequest/{}", pr.pull_request_id));

        let status = pr.status.as_deref().unwrap_or("active");
        let merged_at = pr
            .closed_date
            .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
            .map(|dt| dt.with_timezone(&Utc));
        let merge_commit_sha = pr.last_merge_commit.and_then(|c| c.commit_id);

        PullRequestInfo {
            number: pr.pull_request_id,
            url,
            status: Self::map_azure_status(status),
            merged_at,
            merge_commit_sha,
        }
    }

    fn parse_pr_threads(raw: &str) -> Result<Vec<UnifiedPrComment>, AzCliError> {
        // REST API returns { "value": [...threads...] } wrapper
        let response: AzThreadsResponse = serde_json::from_str(raw.trim()).map_err(|e| {
            AzCliError::UnexpectedOutput(format!("Failed to parse threads: {e}; raw: {raw}"))
        })?;
        let threads = response.value;

        let mut comments = Vec::new();

        for thread in threads {
            let file_path = thread
                .thread_context
                .as_ref()
                .and_then(|c| c.file_path.clone());
            let line = thread
                .thread_context
                .as_ref()
                .and_then(|c| c.right_file_start.as_ref())
                .and_then(|p| p.line);

            if let Some(thread_comments) = thread.comments {
                for c in thread_comments {
                    // Skip system-generated comments
                    if c.comment_type.as_deref() == Some("system") {
                        continue;
                    }

                    let id = c.id.unwrap_or(0);
                    let author = c
                        .author
                        .and_then(|a| a.display_name)
                        .unwrap_or_else(|| "unknown".to_string());
                    let body = c.content.unwrap_or_default();
                    let created_at = c
                        .published_date
                        .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                        .map(|dt| dt.with_timezone(&Utc))
                        .unwrap_or_else(Utc::now);

                    if let Some(ref path) = file_path {
                        comments.push(UnifiedPrComment::Review {
                            id,
                            author,
                            author_association: None,
                            body,
                            created_at,
                            url: None,
                            path: path.clone(),
                            line,
                            side: None,
                            diff_hunk: None,
                        });
                    } else {
                        comments.push(UnifiedPrComment::General {
                            id: id.to_string(),
                            author,
                            author_association: None,
                            body,
                            created_at,
                            url: None,
                        });
                    }
                }
            }
        }

        comments.sort_by_key(|c| c.created_at());
        Ok(comments)
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

    #[test]
    fn test_urls_match() {
        // Exact match
        assert!(AzCli::urls_match(
            "https://dev.azure.com/myorg/myproject/_git/myrepo",
            "https://dev.azure.com/myorg/myproject/_git/myrepo"
        ));

        // Trailing slash
        assert!(AzCli::urls_match(
            "https://dev.azure.com/myorg/myproject/_git/myrepo/",
            "https://dev.azure.com/myorg/myproject/_git/myrepo"
        ));

        // .git suffix
        assert!(AzCli::urls_match(
            "https://dev.azure.com/myorg/myproject/_git/myrepo.git",
            "https://dev.azure.com/myorg/myproject/_git/myrepo"
        ));

        // Case insensitive
        assert!(AzCli::urls_match(
            "https://dev.azure.com/MyOrg/MyProject/_git/MyRepo",
            "https://dev.azure.com/myorg/myproject/_git/myrepo"
        ));

        // Different repos should not match
        assert!(!AzCli::urls_match(
            "https://dev.azure.com/myorg/myproject/_git/repo1",
            "https://dev.azure.com/myorg/myproject/_git/repo2"
        ));

        // SSH URLs
        assert!(AzCli::urls_match(
            "git@ssh.dev.azure.com:v3/myorg/myproject/myrepo",
            "git@ssh.dev.azure.com:v3/myorg/myproject/myrepo"
        ));

        // SSH URL with ssh:// prefix should match scp-style
        assert!(AzCli::urls_match(
            "ssh://git@ssh.dev.azure.com:v3/myorg/myproject/myrepo",
            "git@ssh.dev.azure.com:v3/myorg/myproject/myrepo"
        ));
    }

    #[test]
    fn test_extract_organization_url_dev_azure() {
        let org_url =
            AzCli::extract_organization_url("https://dev.azure.com/myorg/myproject/_git/myrepo")
                .unwrap();
        assert_eq!(org_url, "https://dev.azure.com/myorg");
    }

    #[test]
    fn test_extract_organization_url_visualstudio() {
        let org_url =
            AzCli::extract_organization_url("https://myorg.visualstudio.com/myproject/_git/myrepo")
                .unwrap();
        assert_eq!(org_url, "https://myorg.visualstudio.com");
    }

    #[test]
    fn test_extract_organization_url_invalid() {
        assert!(AzCli::extract_organization_url("https://github.com/owner/repo").is_none());
    }
}
