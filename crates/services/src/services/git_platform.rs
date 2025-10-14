use async_trait::async_trait;
use db::models::merge::PullRequestInfo;
use regex::Regex;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use ts_rs::TS;

use crate::services::git::GitServiceError;

#[derive(Debug, Error, Serialize, Deserialize, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[ts(use_ts_enum)]
pub enum GitPlatformError {
    #[ts(skip)]
    #[error("Repository error: {0}")]
    Repository(String),
    #[ts(skip)]
    #[error("Pull request error: {0}")]
    PullRequest(String),
    #[ts(skip)]
    #[error("Branch error: {0}")]
    Branch(String),
    #[error("Git platform token is invalid or expired.")]
    TokenInvalid,
    #[error("Insufficient permissions")]
    InsufficientPermissions,
    #[error("Repository not found or no access")]
    RepoNotFoundOrNoAccess,
    #[ts(skip)]
    #[serde(skip)]
    #[error(transparent)]
    GitService(#[from] GitServiceError),
    #[ts(skip)]
    #[serde(skip)]
    #[error("HTTP error: {0}")]
    Http(String),
    #[ts(skip)]
    #[serde(skip)]
    #[error("Parse error: {0}")]
    Parse(String),
}

impl GitPlatformError {
    pub fn is_api_data(&self) -> bool {
        matches!(
            self,
            GitPlatformError::TokenInvalid
                | GitPlatformError::InsufficientPermissions
                | GitPlatformError::RepoNotFoundOrNoAccess
        )
    }

    pub fn should_retry(&self) -> bool {
        !self.is_api_data()
    }
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
pub struct RepoInfo {
    pub owner: String,
    pub repo_name: String,
    pub platform_url: Option<String>, // For self-hosted platforms like Gitea
}

impl RepoInfo {
    /// Parse GitHub URLs
    pub fn from_github_url(remote_url: &str) -> Result<Self, GitPlatformError> {
        let re = Regex::new(r"github\.com[:/](?P<owner>[^/]+)/(?P<repo>[^/]+?)(?:\.git)?(?:/|$)")
            .map_err(|e| {
                GitPlatformError::Repository(format!("Failed to compile regex: {e}"))
            })?;

        let caps = re.captures(remote_url).ok_or_else(|| {
            GitPlatformError::Repository(format!("Invalid GitHub URL format: {remote_url}"))
        })?;

        Ok(Self {
            owner: caps.name("owner").unwrap().as_str().to_string(),
            repo_name: caps.name("repo").unwrap().as_str().to_string(),
            platform_url: None,
        })
    }

    /// Parse Gitea URLs (supports custom domains)
    pub fn from_gitea_url(remote_url: &str, gitea_url: &str) -> Result<Self, GitPlatformError> {
        // Extract domain from gitea_url
        let domain = gitea_url
            .trim_start_matches("http://")
            .trim_start_matches("https://")
            .trim_end_matches('/');

        let pattern = format!(r"{}[:/](?P<owner>[^/]+)/(?P<repo>[^/]+?)(?:\.git)?(?:/|$)", regex::escape(domain));
        let re = Regex::new(&pattern).map_err(|e| {
            GitPlatformError::Repository(format!("Failed to compile regex: {e}"))
        })?;

        let caps = re.captures(remote_url).ok_or_else(|| {
            GitPlatformError::Repository(format!("Invalid Gitea URL format: {remote_url}"))
        })?;

        Ok(Self {
            owner: caps.name("owner").unwrap().as_str().to_string(),
            repo_name: caps.name("repo").unwrap().as_str().to_string(),
            platform_url: Some(gitea_url.to_string()),
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

/// Trait for Git platform operations (GitHub, Gitea, etc.)
#[async_trait]
pub trait GitPlatformService: Send + Sync {
    /// Check if the authentication token is valid
    async fn check_token(&self) -> Result<(), GitPlatformError>;

    /// Create a pull request
    async fn create_pr(
        &self,
        repo_info: &RepoInfo,
        request: &CreatePrRequest,
    ) -> Result<PullRequestInfo, GitPlatformError>;

    /// Update and get the status of a pull request
    async fn update_pr_status(
        &self,
        repo_info: &RepoInfo,
        pr_number: i64,
    ) -> Result<PullRequestInfo, GitPlatformError>;

    /// List all pull requests for a branch (including closed/merged)
    async fn list_all_prs_for_branch(
        &self,
        repo_info: &RepoInfo,
        branch_name: &str,
    ) -> Result<Vec<PullRequestInfo>, GitPlatformError>;

    /// List repositories for the authenticated user (cloud feature only)
    #[cfg(feature = "cloud")]
    async fn list_repositories(&self, page: u8) -> Result<Vec<RepositoryInfo>, GitPlatformError>;

    /// Parse a remote URL into RepoInfo
    fn parse_repo_url(&self, remote_url: &str) -> Result<RepoInfo, GitPlatformError>;
}
