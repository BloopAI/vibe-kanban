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

#[async_trait]
pub trait GitHostService: Send + Sync {
    async fn get_repo_info(&self, repo_path: &Path) -> Result<RepoInfo, GitHostError>;
    async fn check_auth(&self) -> Result<(), GitHostError>;
    async fn create_pr(
        &self,
        repo_info: &RepoInfo,
        request: &CreatePrRequest,
    ) -> Result<PullRequestInfo, GitHostError>;
    async fn get_pr_status(&self, pr_url: &str) -> Result<PullRequestInfo, GitHostError>;
    async fn list_prs_for_branch(
        &self,
        repo_info: &RepoInfo,
        branch_name: &str,
    ) -> Result<Vec<PullRequestInfo>, GitHostError>;
    async fn get_pr_comments(
        &self,
        repo_info: &RepoInfo,
        pr_number: i64,
    ) -> Result<Vec<UnifiedPrComment>, GitHostError>;
    fn provider(&self) -> GitHostProvider;
}

pub fn create_service(repo_path: &Path) -> Result<Box<dyn GitHostService>, GitHostError> {
    let provider = detect_provider(repo_path)?;
    create_service_for_provider(provider)
}

pub fn create_service_for_provider(
    provider: GitHostProvider,
) -> Result<Box<dyn GitHostService>, GitHostError> {
    match provider {
        GitHostProvider::GitHub => Ok(Box::new(github::GitHubHostService::new()?)),
        GitHostProvider::AzureDevOps => Ok(Box::new(azure::AzureHostService::new()?)),
        GitHostProvider::Unknown => Err(GitHostError::UnsupportedProvider),
    }
}

pub fn create_service_for_pr_url(pr_url: &str) -> Result<Box<dyn GitHostService>, GitHostError> {
    let provider = detect_provider_from_url(pr_url);
    create_service_for_provider(provider)
}
