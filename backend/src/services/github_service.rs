use std::time::Duration;

use backon::{ExponentialBuilder, Retryable};
use octocrab::{Octocrab, OctocrabBuilder};
use serde::{Deserialize, Serialize};
use tracing::info;
use ts_rs::TS;

#[derive(Debug)]
pub enum GitHubServiceError {
    Client(octocrab::Error),
    Auth(String),
    Repository(String),
    PullRequest(String),
    Branch(String),
    TokenInvalid,
}

impl std::fmt::Display for GitHubServiceError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            GitHubServiceError::Client(e) => write!(f, "GitHub client error: {}", e),
            GitHubServiceError::Auth(e) => write!(f, "Authentication error: {}", e),
            GitHubServiceError::Repository(e) => write!(f, "Repository error: {}", e),
            GitHubServiceError::PullRequest(e) => write!(f, "Pull request error: {}", e),
            GitHubServiceError::Branch(e) => write!(f, "Branch error: {}", e),
            GitHubServiceError::TokenInvalid => write!(f, "GitHub token is invalid or expired."),
        }
    }
}

impl std::error::Error for GitHubServiceError {}

impl From<octocrab::Error> for GitHubServiceError {
    fn from(err: octocrab::Error) -> Self {
        match &err {
            octocrab::Error::GitHub { source, .. } => {
                let status = source.status_code.as_u16();
                let msg = source.message.to_ascii_lowercase();
                if status == 401
                    || status == 403
                    || msg.contains("bad credentials")
                    || msg.contains("token expired")
                {
                    GitHubServiceError::TokenInvalid
                } else {
                    GitHubServiceError::Client(err)
                }
            }
            _ => GitHubServiceError::Client(err),
        }
    }
}

#[derive(Debug, Clone)]
pub struct GitHubRepoInfo {
    pub owner: String,
    pub repo_name: String,
}

#[derive(Debug, Clone)]
pub struct CreatePrRequest {
    pub title: String,
    pub body: Option<String>,
    pub head_branch: String,
    pub base_branch: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PullRequestInfo {
    pub number: i64,
    pub url: String,
    pub status: String,
    pub merged: bool,
    pub merged_at: Option<chrono::DateTime<chrono::Utc>>,
    pub merge_commit_sha: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
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
            .build()
            .map_err(|e| {
                GitHubServiceError::Auth(format!("Failed to create GitHub client: {}", e))
            })?;

        Ok(Self { client })
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
            .when(|e| !matches!(e, GitHubServiceError::TokenInvalid))
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
            .map_err(|e| {
                GitHubServiceError::Repository(format!(
                    "Cannot access repository {}/{}: {}",
                    repo_info.owner, repo_info.repo_name, e
                ))
            })?;

        // Check if the base branch exists
        self.client
            .repos(&repo_info.owner, &repo_info.repo_name)
            .get_ref(&octocrab::params::repos::Reference::Branch(
                request.base_branch.clone(),
            ))
            .await
            .map_err(|e| {
                GitHubServiceError::Branch(format!(
                    "Base branch '{}' does not exist: {}",
                    request.base_branch, e
                ))
            })?;

        // Check if the head branch exists
        self.client
            .repos(&repo_info.owner, &repo_info.repo_name)
            .get_ref(&octocrab::params::repos::Reference::Branch(
                request.head_branch.clone(),
            ))
            .await
            .map_err(|e| {
                GitHubServiceError::Branch(format!(
                    "Head branch '{}' does not exist. Make sure the branch was pushed successfully: {}",
                    request.head_branch, e
                ))
            })?;

        // Create the pull request
        let pr = self
            .client
            .pulls(&repo_info.owner, &repo_info.repo_name)
            .create(&request.title, &request.head_branch, &request.base_branch)
            .body(request.body.as_deref().unwrap_or(""))
            .send()
            .await
            .map_err(|e| match e {
                octocrab::Error::GitHub { source, .. } => {
                    if source.status_code.as_u16() == 401
                        || source.status_code.as_u16() == 403
                        || source
                            .message
                            .to_ascii_lowercase()
                            .contains("bad credentials")
                        || source
                            .message
                            .to_ascii_lowercase()
                            .contains("token expired")
                    {
                        GitHubServiceError::TokenInvalid
                    } else {
                        GitHubServiceError::PullRequest(format!(
                            "GitHub API error: {} (status: {})",
                            source.message,
                            source.status_code.as_u16()
                        ))
                    }
                }
                _ => GitHubServiceError::PullRequest(format!("Failed to create PR: {}", e)),
            })?;

        let pr_info = PullRequestInfo {
            number: pr.number as i64,
            url: pr.html_url.map(|url| url.to_string()).unwrap_or_default(),
            status: "open".to_string(),
            merged: false,
            merged_at: None,
            merge_commit_sha: None,
        };

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
        (|| async { self.update_pr_status_internal(repo_info, pr_number).await })
            .retry(
                &ExponentialBuilder::default()
                    .with_min_delay(Duration::from_secs(1))
                    .with_max_delay(Duration::from_secs(30))
                    .with_max_times(3)
                    .with_jitter(),
            )
            .when(|e| !matches!(e, GitHubServiceError::TokenInvalid))
            .notify(|err: &GitHubServiceError, dur: Duration| {
                tracing::warn!(
                    "GitHub API call failed, retrying after {:.2}s: {}",
                    dur.as_secs_f64(),
                    err
                );
            })
            .await
    }

    async fn update_pr_status_internal(
        &self,
        repo_info: &GitHubRepoInfo,
        pr_number: i64,
    ) -> Result<PullRequestInfo, GitHubServiceError> {
        let pr = self
            .client
            .pulls(&repo_info.owner, &repo_info.repo_name)
            .get(pr_number as u64)
            .await
            .map_err(|e| {
                GitHubServiceError::PullRequest(format!("Failed to get PR #{}: {}", pr_number, e))
            })?;

        let status = match pr.state {
            Some(octocrab::models::IssueState::Open) => "open",
            Some(octocrab::models::IssueState::Closed) => {
                if pr.merged_at.is_some() {
                    "merged"
                } else {
                    "closed"
                }
            }
            None => "unknown",
            Some(_) => "unknown", // Handle any other states
        };

        let pr_info = PullRequestInfo {
            number: pr.number as i64,
            url: pr.html_url.map(|url| url.to_string()).unwrap_or_default(),
            status: status.to_string(),
            merged: pr.merged_at.is_some(),
            merged_at: pr.merged_at.map(|dt| dt.naive_utc().and_utc()),
            merge_commit_sha: pr.merge_commit_sha.clone(),
        };

        Ok(pr_info)
    }

    /// List repositories for the authenticated user with pagination
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
            .when(|e| !matches!(e, GitHubServiceError::TokenInvalid))
            .notify(|err: &GitHubServiceError, dur: Duration| {
                tracing::warn!(
                    "GitHub API call failed, retrying after {:.2}s: {}",
                    dur.as_secs_f64(),
                    err
                );
            })
            .await
    }

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
                GitHubServiceError::Repository(format!("Failed to list repositories: {}", e))
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
