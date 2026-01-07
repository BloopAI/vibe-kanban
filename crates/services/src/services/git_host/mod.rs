mod detection;
mod types;

pub mod azure;
pub mod github;

use std::path::Path;

use async_trait::async_trait;
use db::models::merge::PullRequestInfo;
use detection::detect_provider_from_url;
use enum_dispatch::enum_dispatch;
pub use types::{
    CreatePrRequest, GitHostError, PrComment, PrCommentAuthor, PrReviewComment, ProviderKind,
    ReviewCommentUser, UnifiedPrComment,
};

use self::{azure::AzureDevOpsProvider, github::GitHubProvider};

/// Trait for git hosting provider operations (GitHub, Azure DevOps, etc.)
#[async_trait]
#[enum_dispatch(GitHostService)]
pub trait GitHostProvider: Send + Sync {
    /// Create a pull request. Handles auth check internally.
    async fn create_pr(
        &self,
        repo_path: &Path,
        request: &CreatePrRequest,
    ) -> Result<PullRequestInfo, GitHostError>;

    /// Get PR status from a PR URL.
    async fn get_pr_status(&self, pr_url: &str) -> Result<PullRequestInfo, GitHostError>;

    /// List all PRs for a branch.
    async fn list_prs_for_branch(
        &self,
        repo_path: &Path,
        branch_name: &str,
    ) -> Result<Vec<PullRequestInfo>, GitHostError>;

    /// Get comments for a PR.
    async fn get_pr_comments(
        &self,
        repo_path: &Path,
        pr_number: i64,
    ) -> Result<Vec<UnifiedPrComment>, GitHostError>;

    /// Get the provider kind.
    fn provider_kind(&self) -> ProviderKind;
}

/// Git hosting service - dispatches to the appropriate provider.
#[enum_dispatch]
pub enum GitHostService {
    GitHub(GitHubProvider),
    AzureDevOps(AzureDevOpsProvider),
}

impl GitHostService {
    /// Create a GitHostService by detecting the provider from a URL.
    /// Works with PR URLs, remote URLs, or any URL that identifies a provider.
    pub fn from_url(url: &str) -> Result<Self, GitHostError> {
        match detect_provider_from_url(url) {
            ProviderKind::GitHub => Ok(Self::GitHub(GitHubProvider::new()?)),
            ProviderKind::AzureDevOps => Ok(Self::AzureDevOps(AzureDevOpsProvider::new()?)),
            ProviderKind::Unknown => Err(GitHostError::UnsupportedProvider),
        }
    }
}
