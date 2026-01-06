//! Git hosting platform abstraction layer.
//!
//! This module provides a unified interface for interacting with different
//! git hosting platforms (GitHub, Azure DevOps, etc.) for PR operations.

mod detection;
mod types;

pub mod azure;
pub mod github;

use std::path::Path;

use async_trait::async_trait;
use db::models::merge::PullRequestInfo;
pub use detection::{detect_provider, detect_provider_from_url};
pub use types::{
    CreatePrRequest, GitHostError, GitHostProvider, PrComment, PrCommentAuthor, PrReviewComment,
    RepoInfo, ReviewCommentUser, UnifiedPrComment,
};

/// Trait for git hosting platform services (GitHub, Azure DevOps, etc.)
#[async_trait]
pub trait GitHostService: Send + Sync {
    /// Get repository identification info from the local repo path
    async fn get_repo_info(&self, repo_path: &Path) -> Result<RepoInfo, GitHostError>;

    /// Check if the CLI tool is authenticated
    async fn check_auth(&self) -> Result<(), GitHostError>;

    /// Create a pull request
    async fn create_pr(
        &self,
        repo_info: &RepoInfo,
        request: &CreatePrRequest,
    ) -> Result<PullRequestInfo, GitHostError>;

    /// Get PR status by URL
    async fn get_pr_status(&self, pr_url: &str) -> Result<PullRequestInfo, GitHostError>;

    /// List PRs for a branch (including closed/merged)
    async fn list_prs_for_branch(
        &self,
        repo_info: &RepoInfo,
        branch_name: &str,
    ) -> Result<Vec<PullRequestInfo>, GitHostError>;

    /// Get PR comments (both general and review comments)
    async fn get_pr_comments(
        &self,
        repo_info: &RepoInfo,
        pr_number: i64,
    ) -> Result<Vec<UnifiedPrComment>, GitHostError>;

    /// Get the provider type
    fn provider(&self) -> GitHostProvider;
}

/// Create a git host service based on the detected provider from repository remote URL
pub fn create_service(repo_path: &Path) -> Result<Box<dyn GitHostService>, GitHostError> {
    let provider = detect_provider(repo_path)?;
    create_service_for_provider(provider)
}

/// Create a git host service for a specific provider
pub fn create_service_for_provider(
    provider: GitHostProvider,
) -> Result<Box<dyn GitHostService>, GitHostError> {
    match provider {
        GitHostProvider::GitHub => Ok(Box::new(github::GitHubHostService::new()?)),
        GitHostProvider::AzureDevOps => Ok(Box::new(azure::AzureHostService::new()?)),
        GitHostProvider::Unknown => Err(GitHostError::UnsupportedProvider),
    }
}

/// Create a git host service based on the detected provider from a PR URL
pub fn create_service_for_pr_url(pr_url: &str) -> Result<Box<dyn GitHostService>, GitHostError> {
    let provider = detect_provider_from_url(pr_url);
    create_service_for_provider(provider)
}
