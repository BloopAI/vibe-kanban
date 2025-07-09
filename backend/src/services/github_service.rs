use std::time::Duration;

use octocrab::{Octocrab, OctocrabBuilder};
use regex::Regex;
use serde::{Deserialize, Serialize};
use tokio::time::sleep;
use tracing::{info, warn};

#[derive(Debug)]
pub enum GitHubServiceError {
    ClientError(octocrab::Error),
    AuthError(String),
    RepositoryError(String),
    PullRequestError(String),
    BranchError(String),
    NetworkError(String),
    RateLimitError(String),
}

impl std::fmt::Display for GitHubServiceError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            GitHubServiceError::ClientError(e) => write!(f, "GitHub client error: {}", e),
            GitHubServiceError::AuthError(e) => write!(f, "Authentication error: {}", e),
            GitHubServiceError::RepositoryError(e) => write!(f, "Repository error: {}", e),
            GitHubServiceError::PullRequestError(e) => write!(f, "Pull request error: {}", e),
            GitHubServiceError::BranchError(e) => write!(f, "Branch error: {}", e),
            GitHubServiceError::NetworkError(e) => write!(f, "Network error: {}", e),
            GitHubServiceError::RateLimitError(e) => write!(f, "Rate limit exceeded: {}", e),
        }
    }
}

impl std::error::Error for GitHubServiceError {}

impl From<octocrab::Error> for GitHubServiceError {
    fn from(err: octocrab::Error) -> Self {
        GitHubServiceError::ClientError(err)
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

#[derive(Debug, Clone)]
pub struct GitHubService {
    client: Octocrab,
    retry_config: RetryConfig,
}

#[derive(Debug, Clone)]
pub struct RetryConfig {
    pub max_retries: u32,
    pub base_delay: Duration,
    pub max_delay: Duration,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_retries: 3,
            base_delay: Duration::from_secs(1),
            max_delay: Duration::from_secs(30),
        }
    }
}

impl GitHubService {
    /// Create a new GitHub service with authentication
    pub fn new(github_token: &str) -> Result<Self, GitHubServiceError> {
        let client = OctocrabBuilder::new()
            .personal_token(github_token.to_string())
            .build()
            .map_err(|e| {
                GitHubServiceError::AuthError(format!("Failed to create GitHub client: {}", e))
            })?;

        Ok(Self {
            client,
            retry_config: RetryConfig::default(),
        })
    }

    /// Create a new GitHub service with custom retry configuration
    pub fn with_retry_config(
        github_token: &str,
        retry_config: RetryConfig,
    ) -> Result<Self, GitHubServiceError> {
        let mut service = Self::new(github_token)?;
        service.retry_config = retry_config;
        Ok(service)
    }

    /// Extract GitHub repository information from a repository URL
    pub fn extract_repo_info(repo_url: &str) -> Result<GitHubRepoInfo, GitHubServiceError> {
        // Parse GitHub URL (supports both HTTPS and SSH formats)
        let github_regex = Regex::new(r"github\.com[:/]([^/]+)/(.+?)(?:\.git)?/?$")
            .map_err(|e| GitHubServiceError::RepositoryError(format!("Regex error: {}", e)))?;

        if let Some(captures) = github_regex.captures(repo_url) {
            let owner = captures.get(1).unwrap().as_str().to_string();
            let repo_name = captures.get(2).unwrap().as_str().to_string();
            Ok(GitHubRepoInfo { owner, repo_name })
        } else {
            Err(GitHubServiceError::RepositoryError(format!(
                "Not a GitHub repository URL: {}",
                repo_url
            )))
        }
    }

    /// Create a pull request on GitHub
    pub async fn create_pr(
        &self,
        repo_info: &GitHubRepoInfo,
        request: &CreatePrRequest,
    ) -> Result<PullRequestInfo, GitHubServiceError> {
        self.with_retry(|| async { self.create_pr_internal(repo_info, request).await })
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
                GitHubServiceError::RepositoryError(format!(
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
                GitHubServiceError::BranchError(format!(
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
                GitHubServiceError::BranchError(format!(
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
                    GitHubServiceError::PullRequestError(format!(
                        "GitHub API error: {} (status: {})",
                        source.message,
                        source.status_code.as_u16()
                    ))
                }
                _ => GitHubServiceError::PullRequestError(format!("Failed to create PR: {}", e)),
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
        self.with_retry(|| async { self.update_pr_status_internal(repo_info, pr_number).await })
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
                GitHubServiceError::PullRequestError(format!(
                    "Failed to get PR #{}: {}",
                    pr_number, e
                ))
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

    /// Push a branch to GitHub (this would typically be handled by GitService,
    /// but included here for completeness of GitHub operations)
    pub async fn push_branch(
        &self,
        repo_info: &GitHubRepoInfo,
        branch_name: &str,
    ) -> Result<(), GitHubServiceError> {
        // Note: This is a placeholder. Actual git operations should be handled by GitService.
        // This method is here to maintain the interface contract, but actual implementation
        // would typically delegate to GitService.

        // Verify the branch exists on the remote
        self.with_retry(|| async {
            self.client
                .repos(&repo_info.owner, &repo_info.repo_name)
                .get_ref(&octocrab::params::repos::Reference::Branch(
                    branch_name.to_string(),
                ))
                .await
                .map_err(|e| {
                    GitHubServiceError::BranchError(format!(
                        "Branch '{}' was not found on GitHub. Ensure it was pushed correctly: {}",
                        branch_name, e
                    ))
                })?;

            Ok(())
        })
        .await?;

        info!("Verified branch '{}' exists on GitHub", branch_name);
        Ok(())
    }

    /// Verify repository access and permissions
    pub async fn verify_repository_access(
        &self,
        repo_info: &GitHubRepoInfo,
    ) -> Result<(), GitHubServiceError> {
        self.with_retry(|| async {
            self.client
                .repos(&repo_info.owner, &repo_info.repo_name)
                .get()
                .await
                .map_err(|e| {
                    GitHubServiceError::RepositoryError(format!(
                        "Cannot access repository {}/{}: {}",
                        repo_info.owner, repo_info.repo_name, e
                    ))
                })?;
            Ok(())
        })
        .await
    }

    /// Retry wrapper for GitHub API calls with exponential backoff
    async fn with_retry<F, Fut, T>(&self, operation: F) -> Result<T, GitHubServiceError>
    where
        F: Fn() -> Fut,
        Fut: std::future::Future<Output = Result<T, GitHubServiceError>>,
    {
        let mut last_error = None;

        for attempt in 0..=self.retry_config.max_retries {
            match operation().await {
                Ok(result) => return Ok(result),
                Err(e) => {
                    last_error = Some(e);

                    if attempt < self.retry_config.max_retries {
                        let delay = std::cmp::min(
                            self.retry_config.base_delay * 2_u32.pow(attempt),
                            self.retry_config.max_delay,
                        );

                        warn!(
                            "GitHub API call failed (attempt {}/{}), retrying in {:?}: {}",
                            attempt + 1,
                            self.retry_config.max_retries + 1,
                            delay,
                            last_error.as_ref().unwrap()
                        );

                        sleep(delay).await;
                    }
                }
            }
        }

        Err(last_error.unwrap())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_repo_info_https() {
        let repo_url = "https://github.com/owner/repo.git";
        let result = GitHubService::extract_repo_info(repo_url).unwrap();
        assert_eq!(result.owner, "owner");
        assert_eq!(result.repo_name, "repo");
    }

    #[test]
    fn test_extract_repo_info_ssh() {
        let repo_url = "git@github.com:owner/repo.git";
        let result = GitHubService::extract_repo_info(repo_url).unwrap();
        assert_eq!(result.owner, "owner");
        assert_eq!(result.repo_name, "repo");
    }

    #[test]
    fn test_extract_repo_info_no_git_suffix() {
        let repo_url = "https://github.com/owner/repo";
        let result = GitHubService::extract_repo_info(repo_url).unwrap();
        assert_eq!(result.owner, "owner");
        assert_eq!(result.repo_name, "repo");
    }

    #[test]
    fn test_extract_repo_info_invalid() {
        let repo_url = "https://gitlab.com/owner/repo.git";
        assert!(GitHubService::extract_repo_info(repo_url).is_err());
    }
}
