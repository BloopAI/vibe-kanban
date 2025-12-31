use std::time::Duration;

use backon::{ExponentialBuilder, Retryable};
use chrono::{DateTime, Utc};
use db::models::merge::PullRequestInfo;
use regex::Regex;
use serde::Serialize;
use thiserror::Error;
use tokio::task;
use tracing::info;
use ts_rs::TS;

pub mod cli;

use cli::{GhCli, GhCliError, GitHubIssue, PrComment, PrReviewComment};
pub use cli::{GitHubUser, PrCommentAuthor, ReviewCommentUser};

/// Unified PR comment that can be either a general comment or review comment
#[derive(Debug, Clone, Serialize, TS)]
#[serde(tag = "comment_type", rename_all = "snake_case")]
#[ts(tag = "comment_type", rename_all = "snake_case")]
pub enum UnifiedPrComment {
    /// General PR comment (conversation)
    General {
        id: String,
        author: String,
        author_association: String,
        body: String,
        created_at: DateTime<Utc>,
        url: String,
    },
    /// Inline review comment (on code)
    Review {
        id: i64,
        author: String,
        author_association: String,
        body: String,
        created_at: DateTime<Utc>,
        url: String,
        path: String,
        line: Option<i64>,
        diff_hunk: String,
    },
}

impl UnifiedPrComment {
    fn created_at(&self) -> DateTime<Utc> {
        match self {
            UnifiedPrComment::General { created_at, .. } => *created_at,
            UnifiedPrComment::Review { created_at, .. } => *created_at,
        }
    }
}

#[derive(Debug, Error)]
pub enum GitHubServiceError {
    #[error("Repository error: {0}")]
    Repository(String),
    #[error("Pull request error: {0}")]
    PullRequest(String),
    #[error("GitHub authentication failed: {0}")]
    AuthFailed(GhCliError),
    #[error("Insufficient permissions: {0}")]
    InsufficientPermissions(GhCliError),
    #[error("GitHub repository not found or no access: {0}")]
    RepoNotFoundOrNoAccess(GhCliError),
    #[error(
        "GitHub CLI is not installed or not available in PATH. Please install it from https://cli.github.com/ and authenticate with 'gh auth login'"
    )]
    GhCliNotInstalled(GhCliError),
}

impl From<GhCliError> for GitHubServiceError {
    fn from(error: GhCliError) -> Self {
        match &error {
            GhCliError::AuthFailed(_) => Self::AuthFailed(error),
            GhCliError::NotAvailable => Self::GhCliNotInstalled(error),
            GhCliError::CommandFailed(msg) => {
                let lower = msg.to_ascii_lowercase();
                if lower.contains("403") || lower.contains("forbidden") {
                    Self::InsufficientPermissions(error)
                } else if lower.contains("404") || lower.contains("not found") {
                    Self::RepoNotFoundOrNoAccess(error)
                } else {
                    Self::PullRequest(msg.to_string())
                }
            }
            GhCliError::UnexpectedOutput(msg) => Self::PullRequest(msg.to_string()),
        }
    }
}

impl GitHubServiceError {
    pub fn should_retry(&self) -> bool {
        !matches!(
            self,
            GitHubServiceError::AuthFailed(_)
                | GitHubServiceError::InsufficientPermissions(_)
                | GitHubServiceError::RepoNotFoundOrNoAccess(_)
                | GitHubServiceError::GhCliNotInstalled(_)
        )
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

    /// Extract GitHub repo info from a local repo path by reading its remote URL
    pub fn from_repo_path(repo_path: &str) -> Result<Self, GitHubServiceError> {
        use std::process::Command;

        // Get the remote URL from the repo
        let output = Command::new("git")
            .args(["config", "--get", "remote.origin.url"])
            .current_dir(repo_path)
            .output()
            .map_err(|e| {
                GitHubServiceError::Repository(format!(
                    "Failed to get remote URL for repo at {repo_path}: {e}"
                ))
            })?;

        if !output.status.success() {
            return Err(GitHubServiceError::Repository(format!(
                "No remote.origin.url found for repo at {repo_path}"
            )));
        }

        let remote_url = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Self::from_remote_url(&remote_url)
    }
}

#[derive(Debug, Clone)]
pub struct CreatePrRequest {
    pub title: String,
    pub body: Option<String>,
    pub head_branch: String,
    pub base_branch: String,
    pub draft: Option<bool>,
}

#[derive(Debug, Clone)]
pub struct GitHubService {
    gh_cli: GhCli,
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
                GhCliError::NotAvailable => GitHubServiceError::GhCliNotInstalled(err),
                GhCliError::AuthFailed(_) => GitHubServiceError::AuthFailed(err),
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

    /// Fetch all comments (both general and review) for a pull request
    pub async fn get_pr_comments(
        &self,
        repo_info: &GitHubRepoInfo,
        pr_number: i64,
    ) -> Result<Vec<UnifiedPrComment>, GitHubServiceError> {
        // Fetch both types of comments in parallel
        let (general_result, review_result) = tokio::join!(
            self.fetch_general_comments(repo_info, pr_number),
            self.fetch_review_comments(repo_info, pr_number)
        );

        let general_comments = general_result?;
        let review_comments = review_result?;

        // Convert and merge into unified timeline
        let mut unified: Vec<UnifiedPrComment> = Vec::new();

        for c in general_comments {
            unified.push(UnifiedPrComment::General {
                id: c.id,
                author: c.author.login,
                author_association: c.author_association,
                body: c.body,
                created_at: c.created_at,
                url: c.url,
            });
        }

        for c in review_comments {
            unified.push(UnifiedPrComment::Review {
                id: c.id,
                author: c.user.login,
                author_association: c.author_association,
                body: c.body,
                created_at: c.created_at,
                url: c.html_url,
                path: c.path,
                line: c.line,
                diff_hunk: c.diff_hunk,
            });
        }

        // Sort by creation time
        unified.sort_by_key(|c| c.created_at());

        Ok(unified)
    }

    async fn fetch_general_comments(
        &self,
        repo_info: &GitHubRepoInfo,
        pr_number: i64,
    ) -> Result<Vec<PrComment>, GitHubServiceError> {
        (|| async {
            let owner = repo_info.owner.clone();
            let repo = repo_info.repo_name.clone();
            let cli = self.gh_cli.clone();
            let comments = task::spawn_blocking({
                let owner = owner.clone();
                let repo = repo.clone();
                move || cli.get_pr_comments(&owner, &repo, pr_number)
            })
            .await
            .map_err(|err| {
                GitHubServiceError::PullRequest(format!(
                    "Failed to execute GitHub CLI for fetching PR #{pr_number} comments: {err}"
                ))
            })?;
            comments.map_err(GitHubServiceError::from)
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

    async fn fetch_review_comments(
        &self,
        repo_info: &GitHubRepoInfo,
        pr_number: i64,
    ) -> Result<Vec<PrReviewComment>, GitHubServiceError> {
        (|| async {
            let owner = repo_info.owner.clone();
            let repo = repo_info.repo_name.clone();
            let cli = self.gh_cli.clone();
            let comments = task::spawn_blocking({
                let owner = owner.clone();
                let repo = repo.clone();
                move || cli.get_pr_review_comments(&owner, &repo, pr_number)
            })
            .await
            .map_err(|err| {
                GitHubServiceError::PullRequest(format!(
                    "Failed to execute GitHub CLI for fetching PR #{pr_number} review comments: {err}"
                ))
            })?;
            comments.map_err(GitHubServiceError::from)
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

    // ========================================================================
    // GitHub Issue Operations
    // ========================================================================

    /// List issues from a GitHub repository
    pub async fn list_issues(
        &self,
        owner: &str,
        repo: &str,
        state: &str,
    ) -> Result<Vec<GitHubIssue>, GitHubServiceError> {
        (|| async {
            let owner = owner.to_string();
            let repo = repo.to_string();
            let state = state.to_string();
            let cli = self.gh_cli.clone();
            let issues = task::spawn_blocking({
                let owner = owner.clone();
                let repo = repo.clone();
                let state = state.clone();
                move || cli.list_issues(&owner, &repo, &state)
            })
            .await
            .map_err(|err| {
                GitHubServiceError::Repository(format!(
                    "Failed to execute GitHub CLI for listing issues: {err}"
                ))
            })?;
            issues.map_err(GitHubServiceError::from)
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

    /// Create a new issue in a GitHub repository
    pub async fn create_issue(
        &self,
        owner: &str,
        repo: &str,
        title: &str,
        body: Option<&str>,
    ) -> Result<GitHubIssue, GitHubServiceError> {
        let owner = owner.to_string();
        let repo = repo.to_string();
        let title = title.to_string();
        let body = body.map(|s| s.to_string());
        let cli = self.gh_cli.clone();

        let owner_clone = owner.clone();
        let repo_clone = repo.clone();
        let issue = task::spawn_blocking(move || {
            cli.create_issue(&owner_clone, &repo_clone, &title, body.as_deref())
        })
        .await
        .map_err(|err| {
            GitHubServiceError::Repository(format!(
                "Failed to execute GitHub CLI for creating issue: {err}"
            ))
        })?
        .map_err(GitHubServiceError::from)?;

        info!(
            "Created GitHub issue #{} in {}/{}",
            issue.number, owner, repo
        );

        Ok(issue)
    }

    /// Close an issue in a GitHub repository
    pub async fn close_issue(
        &self,
        owner: &str,
        repo: &str,
        issue_number: i64,
    ) -> Result<(), GitHubServiceError> {
        let owner = owner.to_string();
        let repo = repo.to_string();
        let cli = self.gh_cli.clone();

        let owner_clone = owner.clone();
        let repo_clone = repo.clone();
        task::spawn_blocking(move || cli.close_issue(&owner_clone, &repo_clone, issue_number))
            .await
            .map_err(|err| {
                GitHubServiceError::Repository(format!(
                    "Failed to execute GitHub CLI for closing issue #{issue_number}: {err}"
                ))
            })?
            .map_err(GitHubServiceError::from)?;

        info!("Closed GitHub issue #{} in {}/{}", issue_number, owner, repo);

        Ok(())
    }

    /// Get the currently authenticated GitHub user
    pub async fn get_current_user(&self) -> Result<String, GitHubServiceError> {
        let cli = self.gh_cli.clone();

        let username = task::spawn_blocking(move || cli.get_current_user())
            .await
            .map_err(|err| {
                GitHubServiceError::Repository(format!(
                    "Failed to execute GitHub CLI for getting current user: {err}"
                ))
            })?
            .map_err(GitHubServiceError::from)?;

        Ok(username)
    }
}
