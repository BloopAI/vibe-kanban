use std::time::Duration;

use backon::{ExponentialBuilder, Retryable};
use db::models::merge::{MergeStatus, PullRequestInfo};
use octocrab::{Octocrab, OctocrabBuilder, models::IssueState};
use regex::Regex;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tracing::info;
use ts_rs::TS;

use crate::services::{git::GitServiceError, git_cli::GitCliError};

#[derive(Debug, Error, Serialize, Deserialize, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[ts(use_ts_enum)]
pub enum GitHubServiceError {
    #[ts(skip)]
    #[serde(skip)]
    #[error(transparent)]
    Client(octocrab::Error),
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
    #[ts(skip)]
    #[serde(skip)]
    #[error(transparent)]
    GitService(GitServiceError),
}

impl From<octocrab::Error> for GitHubServiceError {
    fn from(err: octocrab::Error) -> Self {
        match &err {
            octocrab::Error::GitHub { source, .. } => {
                let status = source.status_code.as_u16();
                let msg = source.message.to_ascii_lowercase();
                if status == 401 || msg.contains("bad credentials") || msg.contains("token expired")
                {
                    GitHubServiceError::TokenInvalid
                } else if status == 403 {
                    GitHubServiceError::InsufficientPermissions
                } else {
                    GitHubServiceError::Client(err)
                }
            }
            _ => GitHubServiceError::Client(err),
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

        Ok(Self {
            owner: caps.name("owner").unwrap().as_str().to_string(),
            repo_name: caps.name("repo").unwrap().as_str().to_string(),
        })
    }
}

#[derive(Debug, Clone)]
pub struct CreatePrRequest {
    pub title: String,
    pub body: Option<String>,
    pub head_branch: String,
    pub base_branch: String,
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

#[derive(Debug, Clone)]
pub struct GitHubService {
    client: Octocrab,
}

impl GitHubService {
    /// Create a new GitHub service with authentication
    pub fn new(github_token: &str) -> Result<Self, GitHubServiceError> {
        let client = OctocrabBuilder::new()
            .personal_token(github_token.to_string())
            .build()?;

        Ok(Self { client })
    }

    pub async fn check_token(&self) -> Result<(), GitHubServiceError> {
        self.client.current().user().await?;
        Ok(())
    }

    /// Create a pull request on GitHub
    pub async fn create_pr(
        &self,
        repo_info: &GitHubRepoInfo,
        request: &CreatePrRequest,
    ) -> Result<PullRequestInfo, GitHubServiceError> {
        (|| async { self.create_pr_internal(repo_info, request).await })
            .retry(
                &ExponentialBuilder::default()
                    .with_min_delay(Duration::from_secs(1))
                    .with_max_delay(Duration::from_secs(30))
                    .with_max_times(3)
                    .with_jitter(),
            )
            .when(|e| e.should_retry())
            .notify(|err: &GitHubServiceError, dur: Duration| {
                tracing::warn!(
                    "GitHub API call failed, retrying after {:.2}s: {}",
                    dur.as_secs_f64(),
                    err
                );
            })
            .await
    }

    async fn create_pr_internal(
        &self,
        repo_info: &GitHubRepoInfo,
        request: &CreatePrRequest,
    ) -> Result<PullRequestInfo, GitHubServiceError> {
        // Verify repository access
        self.client
            .repos(&repo_info.owner, &repo_info.repo_name)
            .get()
            .await
            .map_err(|error| match GitHubServiceError::from(error) {
                GitHubServiceError::Client(source) => GitHubServiceError::Repository(format!(
                    "Cannot access repository {}/{}: {}",
                    repo_info.owner, repo_info.repo_name, source
                )),
                other => other,
            })?;

        // Check if the base branch exists
        self.client
            .repos(&repo_info.owner, &repo_info.repo_name)
            .get_ref(&octocrab::params::repos::Reference::Branch(
                request.base_branch.to_string(),
            ))
            .await
            .map_err(|err| match GitHubServiceError::from(err) {
                GitHubServiceError::Client(source) => {
                    let hint = if request.base_branch != "main" {
                        " Perhaps you meant to use main as your base branch instead?"
                    } else {
                        ""
                    };
                    GitHubServiceError::Branch(format!(
                        "Base branch '{}' does not exist: {}{}",
                        request.base_branch, source, hint
                    ))
                }
                other => other,
            })?;

        // Check if the head branch exists
        self.client
            .repos(&repo_info.owner, &repo_info.repo_name)
            .get_ref(&octocrab::params::repos::Reference::Branch(
                request.head_branch.to_string(),
            ))
            .await
            .map_err(|err| match GitHubServiceError::from(err) {
                GitHubServiceError::Client(source) => GitHubServiceError::Branch(format!(
                    "Head branch '{}' does not exist: {}",
                    request.head_branch, source
                )),
                other => other,
            })?;

        // Create the pull request
        let pr_info = self
            .client
            .pulls(&repo_info.owner, &repo_info.repo_name)
            .create(&request.title, &request.head_branch, &request.base_branch)
            .body(request.body.as_deref().unwrap_or(""))
            .send()
            .await
            .map(Self::map_pull_request)
            .map_err(|err| match GitHubServiceError::from(err) {
                GitHubServiceError::Client(source) => GitHubServiceError::PullRequest(format!(
                    "Failed to create PR for '{} -> {}': {}",
                    request.head_branch, request.base_branch, source
                )),
                other => other,
            })?;

        info!(
            "Created GitHub PR #{} for branch {} in {}/{}",
            pr_info.number, request.head_branch, repo_info.owner, repo_info.repo_name
        );

        Ok(pr_info)
    }

    /// Update and get the status of a pull request
    pub async fn update_pr_status(
        &self,
        repo_info: &GitHubRepoInfo,
        pr_number: i64,
    ) -> Result<PullRequestInfo, GitHubServiceError> {
        (|| async {
            self.client
                .pulls(&repo_info.owner, &repo_info.repo_name)
                .get(pr_number as u64)
                .await
                .map(Self::map_pull_request)
                .map_err(|err| match GitHubServiceError::from(err) {
                    GitHubServiceError::Client(source) => GitHubServiceError::PullRequest(format!(
                        "Failed to get PR #{pr_number}: {source}",
                    )),
                    other => other,
                })
        })
        .retry(
            &ExponentialBuilder::default()
                .with_min_delay(Duration::from_secs(1))
                .with_max_delay(Duration::from_secs(30))
                .with_max_times(3)
                .with_jitter(),
        )
        .when(|err| err.should_retry())
        .notify(|err: &GitHubServiceError, dur: Duration| {
            tracing::warn!(
                "GitHub API call failed, retrying after {:.2}s: {}",
                dur.as_secs_f64(),
                err
            );
        })
        .await
    }

    fn map_pull_request(pr: octocrab::models::pulls::PullRequest) -> PullRequestInfo {
        let state = match pr.state {
            Some(IssueState::Open) => MergeStatus::Open,
            Some(IssueState::Closed) => {
                if pr.merged_at.is_some() {
                    MergeStatus::Merged
                } else {
                    MergeStatus::Closed
                }
            }
            None => MergeStatus::Unknown,
            Some(_) => MergeStatus::Unknown,
        };

        PullRequestInfo {
            number: pr.number as i64,
            url: pr.html_url.map(|url| url.to_string()).unwrap_or_default(),
            status: state,
            merged_at: pr.merged_at.map(|dt| dt.naive_utc().and_utc()),
            merge_commit_sha: pr.merge_commit_sha,
        }
    }

    /// List repositories for the authenticated user with pagination
    #[cfg(feature = "cloud")]
    pub async fn list_repositories(
        &self,
        page: u8,
    ) -> Result<Vec<RepositoryInfo>, GitHubServiceError> {
        (|| async { self.list_repositories_internal(page).await })
            .retry(
                &ExponentialBuilder::default()
                    .with_min_delay(Duration::from_secs(1))
                    .with_max_delay(Duration::from_secs(30))
                    .with_max_times(3)
                    .with_jitter(),
            )
            .when(|err| err.should_retry())
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
    async fn list_repositories_internal(
        &self,
        page: u8,
    ) -> Result<Vec<RepositoryInfo>, GitHubServiceError> {
        let repos_page = self
            .client
            .current()
            .list_repos_for_authenticated_user()
            .type_("all")
            .sort("updated")
            .direction("desc")
            .per_page(50)
            .page(page)
            .send()
            .await
            .map_err(|e| {
                GitHubServiceError::Repository(format!("Failed to list repositories: {e}"))
            })?;

        let repositories: Vec<RepositoryInfo> = repos_page
            .items
            .into_iter()
            .map(|repo| RepositoryInfo {
                id: repo.id.0 as i64,
                name: repo.name,
                full_name: repo.full_name.unwrap_or_default(),
                owner: repo.owner.map(|o| o.login).unwrap_or_default(),
                description: repo.description,
                clone_url: repo
                    .clone_url
                    .map(|url| url.to_string())
                    .unwrap_or_default(),
                ssh_url: repo.ssh_url.unwrap_or_default(),
                default_branch: repo.default_branch.unwrap_or_else(|| "main".to_string()),
                private: repo.private.unwrap_or(false),
            })
            .collect();

        tracing::info!(
            "Retrieved {} repositories from GitHub (page {})",
            repositories.len(),
            page
        );
        Ok(repositories)
    }
}
