//! VCS Provider abstraction for supporting multiple version control hosting services.
//!
//! This module provides a trait-based abstraction for VCS providers (GitHub, Bitbucket, etc.)
//! allowing the application to work with different providers through a unified interface.

use async_trait::async_trait;
use db::models::merge::PullRequestInfo;
use regex::Regex;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use ts_rs::TS;

use super::bitbucket::BitbucketService;
use super::github::{GitHubService, UnifiedPrComment};

/// Supported VCS provider types
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum VcsProviderType {
    GitHub,
    BitbucketServer,
}

impl std::fmt::Display for VcsProviderType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            VcsProviderType::GitHub => write!(f, "GitHub"),
            VcsProviderType::BitbucketServer => write!(f, "Bitbucket Server"),
        }
    }
}

/// Repository information extracted from a git remote URL.
/// This is provider-agnostic and contains the necessary info to make API calls.
#[derive(Debug, Clone)]
pub struct VcsRepoInfo {
    pub provider_type: VcsProviderType,
    /// Base URL for API calls (e.g., "https://api.github.com" or "https://git.taboolasyndication.com")
    pub base_url: String,
    /// Owner (GitHub) or Project key (Bitbucket)
    pub owner_or_project: String,
    /// Repository name
    pub repo_name: String,
}

impl VcsRepoInfo {
    /// Parse a git remote URL and extract repository information.
    /// Supports both SSH and HTTPS URLs for GitHub and Bitbucket Server.
    pub fn from_remote_url(url: &str) -> Result<Self, VcsProviderError> {
        // Try GitHub first
        if let Ok(info) = Self::parse_github_url(url) {
            return Ok(info);
        }

        // Try Bitbucket Server
        if let Ok(info) = Self::parse_bitbucket_server_url(url) {
            return Ok(info);
        }

        Err(VcsProviderError::UnsupportedProvider(format!(
            "Could not determine VCS provider from URL: {url}"
        )))
    }

    fn parse_github_url(url: &str) -> Result<Self, VcsProviderError> {
        // Supports SSH, HTTPS and PR GitHub URLs
        // Examples:
        //   git@github.com:owner/repo.git
        //   https://github.com/owner/repo.git
        //   https://github.com/owner/repo/pull/123
        let re = Regex::new(r"github\.com[:/](?P<owner>[^/]+)/(?P<repo>[^/]+?)(?:\.git)?(?:/|$)")
            .map_err(|e| VcsProviderError::Repository(format!("Failed to compile regex: {e}")))?;

        let caps = re.captures(url).ok_or_else(|| {
            VcsProviderError::Repository(format!("Not a GitHub URL: {url}"))
        })?;

        let owner = caps
            .name("owner")
            .ok_or_else(|| VcsProviderError::Repository("Failed to extract owner".into()))?
            .as_str()
            .to_string();

        let repo_name = caps
            .name("repo")
            .ok_or_else(|| VcsProviderError::Repository("Failed to extract repo name".into()))?
            .as_str()
            .to_string();

        Ok(Self {
            provider_type: VcsProviderType::GitHub,
            base_url: "https://api.github.com".to_string(),
            owner_or_project: owner,
            repo_name,
        })
    }

    fn parse_bitbucket_server_url(url: &str) -> Result<Self, VcsProviderError> {
        // Supports Bitbucket Server URLs:
        // SSH: ssh://git@git.taboolasyndication.com:7998/dev/products.git
        // SSH alt: git@git.taboolasyndication.com:7998/dev/products.git
        // HTTPS browse: https://git.taboolasyndication.com/projects/DEV/repos/products/browse
        // HTTPS clone: https://git.taboolasyndication.com/scm/DEV/products.git

        // First, check if this looks like our Bitbucket server
        if !url.contains("git.taboolasyndication.com") {
            return Err(VcsProviderError::Repository(format!(
                "Not a Bitbucket Server URL: {url}"
            )));
        }

        let base_url = "https://git.taboolasyndication.com".to_string();

        // Try SSH format: ssh://git@host:port/project/repo.git or git@host:port/project/repo.git
        let ssh_re = Regex::new(
            r"git\.taboolasyndication\.com(?::\d+)?[/:](?P<project>[^/]+)/(?P<repo>[^/]+?)(?:\.git)?$"
        ).map_err(|e| VcsProviderError::Repository(format!("Failed to compile regex: {e}")))?;

        if let Some(caps) = ssh_re.captures(url) {
            let project = caps
                .name("project")
                .ok_or_else(|| VcsProviderError::Repository("Failed to extract project".into()))?
                .as_str()
                .to_uppercase(); // Bitbucket project keys are typically uppercase

            let repo_name = caps
                .name("repo")
                .ok_or_else(|| VcsProviderError::Repository("Failed to extract repo name".into()))?
                .as_str()
                .to_string();

            return Ok(Self {
                provider_type: VcsProviderType::BitbucketServer,
                base_url,
                owner_or_project: project,
                repo_name,
            });
        }

        // Try HTTPS browse format: /projects/PROJECT/repos/REPO/browse
        let browse_re = Regex::new(
            r"git\.taboolasyndication\.com/projects/(?P<project>[^/]+)/repos/(?P<repo>[^/]+)"
        ).map_err(|e| VcsProviderError::Repository(format!("Failed to compile regex: {e}")))?;

        if let Some(caps) = browse_re.captures(url) {
            let project = caps
                .name("project")
                .ok_or_else(|| VcsProviderError::Repository("Failed to extract project".into()))?
                .as_str()
                .to_string();

            let repo_name = caps
                .name("repo")
                .ok_or_else(|| VcsProviderError::Repository("Failed to extract repo name".into()))?
                .as_str()
                .to_string();

            return Ok(Self {
                provider_type: VcsProviderType::BitbucketServer,
                base_url,
                owner_or_project: project,
                repo_name,
            });
        }

        // Try HTTPS clone format: /scm/PROJECT/repo.git
        let scm_re = Regex::new(
            r"git\.taboolasyndication\.com/scm/(?P<project>[^/]+)/(?P<repo>[^/]+?)(?:\.git)?$"
        ).map_err(|e| VcsProviderError::Repository(format!("Failed to compile regex: {e}")))?;

        if let Some(caps) = scm_re.captures(url) {
            let project = caps
                .name("project")
                .ok_or_else(|| VcsProviderError::Repository("Failed to extract project".into()))?
                .as_str()
                .to_string();

            let repo_name = caps
                .name("repo")
                .ok_or_else(|| VcsProviderError::Repository("Failed to extract repo name".into()))?
                .as_str()
                .to_string();

            return Ok(Self {
                provider_type: VcsProviderType::BitbucketServer,
                base_url,
                owner_or_project: project,
                repo_name,
            });
        }

        Err(VcsProviderError::Repository(format!(
            "Could not parse Bitbucket Server URL: {url}"
        )))
    }
}

/// Request to create a pull request
#[derive(Debug, Clone)]
pub struct CreatePrRequest {
    pub title: String,
    pub body: Option<String>,
    pub head_branch: String,
    pub base_branch: String,
    pub draft: Option<bool>,
}

/// Errors that can occur when interacting with VCS providers
#[derive(Debug, Error)]
pub enum VcsProviderError {
    #[error("VCS provider not supported: {0}")]
    UnsupportedProvider(String),

    #[error("Authentication failed: {0}")]
    AuthFailed(String),

    #[error("Authentication required - please configure your {0} access token")]
    AuthRequired(String),

    #[error("Repository error: {0}")]
    Repository(String),

    #[error("Pull request error: {0}")]
    PullRequest(String),

    #[error("Network error: {0}")]
    Network(String),

    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    #[error("Resource not found: {0}")]
    NotFound(String),

    #[error("GitHub CLI is not installed")]
    GhCliNotInstalled,

    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

impl VcsProviderError {
    /// Whether this error is transient and the operation should be retried
    pub fn should_retry(&self) -> bool {
        matches!(
            self,
            VcsProviderError::Network(_) | VcsProviderError::Http(_)
        )
    }
}

/// Trait defining the interface for VCS providers
#[async_trait]
pub trait VcsProvider: Send + Sync {
    /// Get the provider type
    fn provider_type(&self) -> VcsProviderType;

    /// Check if this provider can handle the given remote URL
    fn matches_remote_url(&self, url: &str) -> bool;

    /// Check authentication status
    async fn check_auth(&self) -> Result<(), VcsProviderError>;

    /// Create a pull request
    async fn create_pr(
        &self,
        repo_info: &VcsRepoInfo,
        request: &CreatePrRequest,
    ) -> Result<PullRequestInfo, VcsProviderError>;

    /// Get the status of a pull request
    async fn get_pr_status(
        &self,
        repo_info: &VcsRepoInfo,
        pr_number: i64,
    ) -> Result<PullRequestInfo, VcsProviderError>;

    /// List all pull requests for a branch
    async fn list_prs_for_branch(
        &self,
        repo_info: &VcsRepoInfo,
        branch_name: &str,
    ) -> Result<Vec<PullRequestInfo>, VcsProviderError>;

    /// Get all comments for a pull request
    async fn get_pr_comments(
        &self,
        repo_info: &VcsRepoInfo,
        pr_number: i64,
    ) -> Result<Vec<UnifiedPrComment>, VcsProviderError>;
}

/// Registry of VCS providers for auto-detection and dispatch
pub struct VcsProviderRegistry {
    providers: Vec<Box<dyn VcsProvider>>,
}

impl VcsProviderRegistry {
    /// Create a new registry with default providers
    pub fn new() -> Result<Self, VcsProviderError> {
        let mut providers: Vec<Box<dyn VcsProvider>> = Vec::new();

        // Register GitHub provider (may fail if gh CLI not installed, but that's ok)
        match GitHubProviderAdapter::new() {
            Ok(github) => providers.push(Box::new(github)),
            Err(e) => {
                tracing::debug!("GitHub provider not available: {}", e);
            }
        }

        // Register Bitbucket provider
        match BitbucketService::new() {
            Ok(bitbucket) => providers.push(Box::new(bitbucket)),
            Err(e) => {
                tracing::debug!("Bitbucket provider not available: {}", e);
            }
        }

        Ok(Self { providers })
    }

    /// Create a new registry and load Bitbucket credentials
    pub async fn new_with_loaded_credentials() -> Result<Self, VcsProviderError> {
        let mut providers: Vec<Box<dyn VcsProvider>> = Vec::new();

        // Register GitHub provider
        match GitHubProviderAdapter::new() {
            Ok(github) => providers.push(Box::new(github)),
            Err(e) => {
                tracing::debug!("GitHub provider not available: {}", e);
            }
        }

        // Register Bitbucket provider with loaded credentials
        match BitbucketService::new() {
            Ok(bitbucket) => {
                if let Err(e) = bitbucket.load_credentials().await {
                    tracing::debug!("Failed to load Bitbucket credentials: {}", e);
                }
                providers.push(Box::new(bitbucket));
            }
            Err(e) => {
                tracing::debug!("Bitbucket provider not available: {}", e);
            }
        }

        Ok(Self { providers })
    }

    /// Register a provider
    pub fn register(&mut self, provider: Box<dyn VcsProvider>) {
        self.providers.push(provider);
    }

    /// Detect the appropriate provider from a remote URL
    pub fn detect_from_url(&self, url: &str) -> Option<&dyn VcsProvider> {
        self.providers
            .iter()
            .find(|p| p.matches_remote_url(url))
            .map(|b| b.as_ref())
    }

    /// Get a provider by type
    pub fn get_provider(&self, provider_type: VcsProviderType) -> Option<&dyn VcsProvider> {
        self.providers
            .iter()
            .find(|p| p.provider_type() == provider_type)
            .map(|b| b.as_ref())
    }
}

impl Default for VcsProviderRegistry {
    fn default() -> Self {
        Self::new().unwrap_or_else(|_| Self {
            providers: Vec::new(),
        })
    }
}

/// Adapter to make GitHubService implement VcsProvider trait
pub struct GitHubProviderAdapter {
    inner: GitHubService,
}

impl GitHubProviderAdapter {
    pub fn new() -> Result<Self, VcsProviderError> {
        let inner = GitHubService::new().map_err(|e| {
            if matches!(e, super::github::GitHubServiceError::GhCliNotInstalled(_)) {
                VcsProviderError::GhCliNotInstalled
            } else {
                VcsProviderError::AuthFailed(e.to_string())
            }
        })?;
        Ok(Self { inner })
    }
}

#[async_trait]
impl VcsProvider for GitHubProviderAdapter {
    fn provider_type(&self) -> VcsProviderType {
        VcsProviderType::GitHub
    }

    fn matches_remote_url(&self, url: &str) -> bool {
        url.contains("github.com")
    }

    async fn check_auth(&self) -> Result<(), VcsProviderError> {
        self.inner.check_token().await.map_err(|e| {
            VcsProviderError::AuthFailed(format!("GitHub authentication failed: {}", e))
        })
    }

    async fn create_pr(
        &self,
        repo_info: &VcsRepoInfo,
        request: &CreatePrRequest,
    ) -> Result<PullRequestInfo, VcsProviderError> {
        let github_repo_info = super::github::GitHubRepoInfo {
            owner: repo_info.owner_or_project.clone(),
            repo_name: repo_info.repo_name.clone(),
        };

        let github_request = super::github::CreatePrRequest {
            title: request.title.clone(),
            body: request.body.clone(),
            head_branch: request.head_branch.clone(),
            base_branch: request.base_branch.clone(),
            draft: request.draft,
        };

        self.inner
            .create_pr(&github_repo_info, &github_request)
            .await
            .map_err(|e| VcsProviderError::PullRequest(e.to_string()))
    }

    async fn get_pr_status(
        &self,
        repo_info: &VcsRepoInfo,
        pr_number: i64,
    ) -> Result<PullRequestInfo, VcsProviderError> {
        // Construct GitHub PR URL from repo info and PR number
        let pr_url = format!(
            "https://github.com/{}/{}/pull/{}",
            repo_info.owner_or_project, repo_info.repo_name, pr_number
        );

        self.inner
            .update_pr_status(&pr_url)
            .await
            .map_err(|e| VcsProviderError::PullRequest(e.to_string()))
    }

    async fn list_prs_for_branch(
        &self,
        repo_info: &VcsRepoInfo,
        branch_name: &str,
    ) -> Result<Vec<PullRequestInfo>, VcsProviderError> {
        let github_repo_info = super::github::GitHubRepoInfo {
            owner: repo_info.owner_or_project.clone(),
            repo_name: repo_info.repo_name.clone(),
        };

        self.inner
            .list_all_prs_for_branch(&github_repo_info, branch_name)
            .await
            .map_err(|e| VcsProviderError::PullRequest(e.to_string()))
    }

    async fn get_pr_comments(
        &self,
        repo_info: &VcsRepoInfo,
        pr_number: i64,
    ) -> Result<Vec<UnifiedPrComment>, VcsProviderError> {
        let github_repo_info = super::github::GitHubRepoInfo {
            owner: repo_info.owner_or_project.clone(),
            repo_name: repo_info.repo_name.clone(),
        };

        self.inner
            .get_pr_comments(&github_repo_info, pr_number)
            .await
            .map_err(|e| VcsProviderError::PullRequest(e.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_github_ssh_url() {
        let info = VcsRepoInfo::from_remote_url("git@github.com:owner/repo.git").unwrap();
        assert_eq!(info.provider_type, VcsProviderType::GitHub);
        assert_eq!(info.owner_or_project, "owner");
        assert_eq!(info.repo_name, "repo");
    }

    #[test]
    fn test_parse_github_https_url() {
        let info = VcsRepoInfo::from_remote_url("https://github.com/owner/repo.git").unwrap();
        assert_eq!(info.provider_type, VcsProviderType::GitHub);
        assert_eq!(info.owner_or_project, "owner");
        assert_eq!(info.repo_name, "repo");
    }

    #[test]
    fn test_parse_bitbucket_ssh_url() {
        let info = VcsRepoInfo::from_remote_url(
            "ssh://git@git.taboolasyndication.com:7998/dev/products.git",
        )
        .unwrap();
        assert_eq!(info.provider_type, VcsProviderType::BitbucketServer);
        assert_eq!(info.owner_or_project, "DEV"); // uppercase
        assert_eq!(info.repo_name, "products");
    }

    #[test]
    fn test_parse_bitbucket_browse_url() {
        let info = VcsRepoInfo::from_remote_url(
            "https://git.taboolasyndication.com/projects/DEV/repos/products/browse",
        )
        .unwrap();
        assert_eq!(info.provider_type, VcsProviderType::BitbucketServer);
        assert_eq!(info.owner_or_project, "DEV");
        assert_eq!(info.repo_name, "products");
    }

    #[test]
    fn test_parse_bitbucket_scm_url() {
        let info = VcsRepoInfo::from_remote_url(
            "https://git.taboolasyndication.com/scm/DEV/products.git",
        )
        .unwrap();
        assert_eq!(info.provider_type, VcsProviderType::BitbucketServer);
        assert_eq!(info.owner_or_project, "DEV");
        assert_eq!(info.repo_name, "products");
    }

    #[test]
    fn test_unsupported_provider() {
        let result = VcsRepoInfo::from_remote_url("https://gitlab.com/owner/repo.git");
        assert!(result.is_err());
    }
}
