use std::time::Duration;

use backon::{ExponentialBuilder, Retryable};
use db::models::merge::PullRequestInfo;
use regex::Regex;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::task;
use tracing::info;
use ts_rs::TS;

use crate::services::{
    gh_cli::{GhCli, GhCliError},
    git::GitServiceError,
    git_cli::GitCliError,
};

#[derive(Debug, Error, Serialize, Deserialize, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[ts(use_ts_enum)]
pub enum GitHubServiceError {
    #[ts(skip)]
    #[error("Repository error: {0}")]
    Repository(String),
    #[ts(skip)]
    #[error("Pull request error: {0}")]
    PullRequest(String),
    #[ts(skip)]
    #[error("Branch error: {0}")]
    Branch(String),
    #[error("GitHub token is invalid or expired.")]
    TokenInvalid,
    #[error("Insufficient permissions")]
    InsufficientPermissions,
    #[error("GitHub repository not found or no access")]
    RepoNotFoundOrNoAccess,
    #[error(
        "GitHub CLI is not installed or not available in PATH. Please install it from https://cli.github.com/ and authenticate with 'gh auth login'"
    )]
    GhCliNotInstalled,
    #[ts(skip)]
    #[serde(skip)]
    #[error(transparent)]
    GitService(GitServiceError),
}

impl From<GhCliError> for GitHubServiceError {
    fn from(error: GhCliError) -> Self {
        match error {
            GhCliError::AuthFailed(_) => Self::TokenInvalid,
            GhCliError::NotAvailable => Self::GhCliNotInstalled,
            GhCliError::CommandFailed(msg) => {
                let lower = msg.to_ascii_lowercase();
                if lower.contains("403") || lower.contains("forbidden") {
                    Self::InsufficientPermissions
                } else if lower.contains("404") || lower.contains("not found") {
                    Self::RepoNotFoundOrNoAccess
                } else {
                    Self::PullRequest(msg)
                }
            }
            GhCliError::UnexpectedOutput(msg) => Self::PullRequest(msg),
        }
    }
}

impl From<GitServiceError> for GitHubServiceError {
    fn from(error: GitServiceError) -> Self {
        match error {
            GitServiceError::GitCLI(GitCliError::AuthFailed(_)) => Self::TokenInvalid,
            GitServiceError::GitCLI(GitCliError::CommandFailed(msg)) => {
                let lower = msg.to_ascii_lowercase();
                if lower.contains("the requested url returned error: 403") {
                    Self::InsufficientPermissions
                } else if lower.contains("the requested url returned error: 404") {
                    Self::RepoNotFoundOrNoAccess
                } else {
                    Self::GitService(GitServiceError::GitCLI(GitCliError::CommandFailed(msg)))
                }
            }
            other => Self::GitService(other),
        }
    }
}

impl GitHubServiceError {
    pub fn is_api_data(&self) -> bool {
        matches!(
            self,
            GitHubServiceError::TokenInvalid
                | GitHubServiceError::InsufficientPermissions
                | GitHubServiceError::RepoNotFoundOrNoAccess
                | GitHubServiceError::GhCliNotInstalled
        )
    }

    pub fn should_retry(&self) -> bool {
        !self.is_api_data()
    }
}

#[derive(Debug, Clone)]
pub struct GitHubRepoInfo {
    pub owner: String,
    pub repo_name: String,
}
impl GitHubRepoInfo {
    pub fn from_remote_url(remote_url: &str) -> Result<Self, GitHubServiceError> {
        // Supports SSH, HTTPS and PR GitHub URLs. See tests for examples.
        let re = Regex::new(r"github\.com[:/](?P<owner>[^/]+)/(?P<repo>[^/]+?)(?:\.git)?(?:/|$)")
            .map_err(|e| {
            GitHubServiceError::Repository(format!("Failed to compile regex: {e}"))
        })?;

        let caps = re.captures(remote_url).ok_or_else(|| {
            GitHubServiceError::Repository(format!("Invalid GitHub URL format: {remote_url}"))
        })?;

        let owner = caps
            .name("owner")
            .ok_or_else(|| {
                GitHubServiceError::Repository(format!(
                    "Failed to extract owner from GitHub URL: {remote_url}"
                ))
            })?
            .as_str()
            .to_string();

        let repo_name = caps
            .name("repo")
            .ok_or_else(|| {
                GitHubServiceError::Repository(format!(
                    "Failed to extract repo name from GitHub URL: {remote_url}"
                ))
            })?
            .as_str()
            .to_string();

        Ok(Self { owner, repo_name })
    }
}

#[derive(Debug, Clone)]
pub struct CreatePrRequest {
    pub title: String,
    pub body: Option<String>,
    pub head_branch: String,
    pub base_branch: String,
}

#[derive(Debug, Clone)]
pub struct GitHubService {
    gh_cli: GhCli,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct RepositoryInfo {
    pub id: i64,
    pub name: String,
    pub full_name: String,
    pub owner: String,
    pub description: Option<String>,
    pub clone_url: String,
    pub ssh_url: String,
    pub default_branch: String,
    pub private: bool,
}

impl GitHubService {
    /// Create a new GitHub service with authentication
    pub fn new() -> Result<Self, GitHubServiceError> {
        Ok(Self {
            gh_cli: GhCli::new(),
        })
    }

    pub async fn check_token(&self) -> Result<(), GitHubServiceError> {
        let cli = self.gh_cli.clone();
        task::spawn_blocking(move || cli.check_auth())
            .await
            .map_err(|err| {
                GitHubServiceError::Repository(format!(
                    "Failed to execute GitHub CLI for auth check: {err}"
                ))
            })?
            .map_err(|err| match err {
                GhCliError::NotAvailable => GitHubServiceError::GhCliNotInstalled,
                GhCliError::AuthFailed(_) => GitHubServiceError::TokenInvalid,
                GhCliError::CommandFailed(msg) => {
                    GitHubServiceError::Repository(format!("GitHub CLI auth check failed: {msg}"))
                }
                GhCliError::UnexpectedOutput(msg) => GitHubServiceError::Repository(format!(
                    "Unexpected output from GitHub CLI auth check: {msg}"
                )),
            })
    }

    /// Create a pull request on GitHub
    pub async fn create_pr(
        &self,
        repo_info: &GitHubRepoInfo,
        request: &CreatePrRequest,
    ) -> Result<PullRequestInfo, GitHubServiceError> {
        (|| async { self.create_pr_via_cli(repo_info, request).await })
            .retry(
                &ExponentialBuilder::default()
                    .with_min_delay(Duration::from_secs(1))
                    .with_max_delay(Duration::from_secs(30))
                    .with_max_times(3)
                    .with_jitter(),
            )
            .when(|e: &GitHubServiceError| e.should_retry())
            .notify(|err: &GitHubServiceError, dur: Duration| {
                tracing::warn!(
                    "GitHub API call failed, retrying after {:.2}s: {}",
                    dur.as_secs_f64(),
                    err
                );
            })
            .await
    }

    pub async fn fetch_repository_id(
        &self,
        owner: &str,
        repo: &str,
    ) -> Result<i64, GitHubServiceError> {
        let owner = owner.to_string();
        let repo = repo.to_string();
        let cli = self.gh_cli.clone();
        let owner_for_cli = owner.clone();
        let repo_for_cli = repo.clone();
        task::spawn_blocking(move || cli.repo_database_id(&owner_for_cli, &repo_for_cli))
            .await
            .map_err(|err| {
                GitHubServiceError::Repository(format!(
                    "Failed to execute GitHub CLI for repo lookup: {err}"
                ))
            })?
            .map_err(GitHubServiceError::from)
    }

    async fn create_pr_via_cli(
        &self,
        repo_info: &GitHubRepoInfo,
        request: &CreatePrRequest,
    ) -> Result<PullRequestInfo, GitHubServiceError> {
        let cli = self.gh_cli.clone();
        let request_clone = request.clone();
        let repo_clone = repo_info.clone();
        let cli_result = task::spawn_blocking(move || cli.create_pr(&request_clone, &repo_clone))
            .await
            .map_err(|err| {
                GitHubServiceError::PullRequest(format!(
                    "Failed to execute GitHub CLI for PR creation: {err}"
                ))
            })?
            .map_err(GitHubServiceError::from)?;

        info!(
            "Created GitHub PR #{} for branch {} in {}/{}",
            cli_result.number, request.head_branch, repo_info.owner, repo_info.repo_name
        );

        Ok(cli_result)
    }

    /// Update and get the status of a pull request
    pub async fn update_pr_status(
        &self,
        repo_info: &GitHubRepoInfo,
        pr_number: i64,
    ) -> Result<PullRequestInfo, GitHubServiceError> {
        (|| async {
            let owner = repo_info.owner.clone();
            let repo = repo_info.repo_name.clone();
            let cli = self.gh_cli.clone();
            let pr = task::spawn_blocking({
                let owner = owner.clone();
                let repo = repo.clone();
                move || cli.view_pr(&owner, &repo, pr_number)
            })
            .await
            .map_err(|err| {
                GitHubServiceError::PullRequest(format!(
                    "Failed to execute GitHub CLI for viewing PR #{pr_number}: {err}"
                ))
            })?;
            let pr = pr.map_err(GitHubServiceError::from)?;
            Ok(pr)
        })
        .retry(
            &ExponentialBuilder::default()
                .with_min_delay(Duration::from_secs(1))
                .with_max_delay(Duration::from_secs(30))
                .with_max_times(3)
                .with_jitter(),
        )
        .when(|err: &GitHubServiceError| err.should_retry())
        .notify(|err: &GitHubServiceError, dur: Duration| {
            tracing::warn!(
                "GitHub API call failed, retrying after {:.2}s: {}",
                dur.as_secs_f64(),
                err
            );
        })
        .await
    }

    /// List all pull requests for a branch (including closed/merged)
    pub async fn list_all_prs_for_branch(
        &self,
        repo_info: &GitHubRepoInfo,
        branch_name: &str,
    ) -> Result<Vec<PullRequestInfo>, GitHubServiceError> {
        (|| async {
            let owner = repo_info.owner.clone();
            let repo = repo_info.repo_name.clone();
            let branch = branch_name.to_string();
            let cli = self.gh_cli.clone();
            let prs = task::spawn_blocking({
                let owner = owner.clone();
                let repo = repo.clone();
                let branch = branch.clone();
                move || cli.list_prs_for_branch(&owner, &repo, &branch)
            })
            .await
            .map_err(|err| {
                GitHubServiceError::PullRequest(format!(
                    "Failed to execute GitHub CLI for listing PRs on branch '{branch_name}': {err}"
                ))
            })?;
            let prs = prs.map_err(GitHubServiceError::from)?;
            Ok(prs)
        })
        .retry(
            &ExponentialBuilder::default()
                .with_min_delay(Duration::from_secs(1))
                .with_max_delay(Duration::from_secs(30))
                .with_max_times(3)
                .with_jitter(),
        )
        .when(|e: &GitHubServiceError| e.should_retry())
        .notify(|err: &GitHubServiceError, dur: Duration| {
            tracing::warn!(
                "GitHub API call failed, retrying after {:.2}s: {}",
                dur.as_secs_f64(),
                err
            );
        })
        .await
    }

    #[cfg(feature = "cloud")]
    pub async fn list_repositories(
        &self,
        _page: u8,
    ) -> Result<Vec<RepositoryInfo>, GitHubServiceError> {
        Err(GitHubServiceError::Repository(
            "Listing repositories via GitHub CLI is not supported.".into(),
        ))
    }
}
