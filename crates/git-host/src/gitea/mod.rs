//! Gitea/Forgejo hosting service implementation.
//!
//! Uses the Gitea REST API v1 directly via `reqwest` rather than depending on
//! an external CLI binary.

pub mod api;

use std::{path::Path, time::Duration};

use async_trait::async_trait;
use backon::{ExponentialBuilder, Retryable};
use tracing::info;

use api::{GiteaApiError, GiteaClient, GiteaRepoInfo};

use crate::{
    GitHostProvider,
    types::{CreatePrRequest, GitHostError, ProviderKind, PullRequestDetail, UnifiedPrComment},
};

#[derive(Debug, Clone)]
pub struct GiteaProvider {
    client: GiteaClient,
}

impl GiteaProvider {
    pub fn new(base_url: &str) -> Result<Self, GitHostError> {
        let client = GiteaClient::new(base_url).map_err(GitHostError::from)?;
        Ok(Self { client })
    }

    fn get_repo_info(&self, remote_url: &str) -> Result<GiteaRepoInfo, GitHostError> {
        GiteaRepoInfo::from_remote_url(remote_url, &self.client.base_url)
            .map_err(GitHostError::from)
    }
}

impl From<GiteaApiError> for GitHostError {
    fn from(error: GiteaApiError) -> Self {
        match &error {
            GiteaApiError::AuthFailed(msg) => GitHostError::AuthFailed(msg.clone()),
            GiteaApiError::NoToken => GitHostError::AuthFailed(
                "No Gitea token found — set the GITEA_TOKEN environment variable".to_string(),
            ),
            GiteaApiError::RequestFailed(msg) => {
                let lower = msg.to_ascii_lowercase();
                if lower.contains("403") || lower.contains("forbidden") {
                    GitHostError::InsufficientPermissions(msg.clone())
                } else if lower.contains("404") || lower.contains("not found") {
                    GitHostError::RepoNotFoundOrNoAccess(msg.clone())
                } else {
                    GitHostError::PullRequest(msg.clone())
                }
            }
            GiteaApiError::UnexpectedResponse(msg) => GitHostError::UnexpectedOutput(msg.clone()),
            GiteaApiError::InvalidUrl(msg) => GitHostError::Repository(msg.clone()),
        }
    }
}

fn retry_policy() -> ExponentialBuilder {
    ExponentialBuilder::default()
        .with_min_delay(Duration::from_secs(1))
        .with_max_delay(Duration::from_secs(30))
        .with_max_times(3)
        .with_jitter()
}

#[async_trait]
impl GitHostProvider for GiteaProvider {
    async fn create_pr(
        &self,
        _repo_path: &Path,
        remote_url: &str,
        request: &CreatePrRequest,
    ) -> Result<PullRequestDetail, GitHostError> {
        if let Some(head_url) = &request.head_repo_url
            && head_url != remote_url
        {
            return Err(GitHostError::PullRequest(
                "Cross-fork pull requests are not yet supported for Gitea".to_string(),
            ));
        }

        let repo_info = self.get_repo_info(remote_url)?;

        (|| async {
            let result = self.client.create_pr(&repo_info, request).await?;
            info!(
                "Created Gitea PR #{} for branch {}",
                result.number, request.head_branch
            );
            Ok(result)
        })
        .retry(&retry_policy())
        .when(|e: &GitHostError| e.should_retry())
        .notify(|err: &GitHostError, dur: Duration| {
            tracing::warn!(
                "Gitea API call failed, retrying after {:.2}s: {}",
                dur.as_secs_f64(),
                err
            );
        })
        .await
    }

    async fn get_pr_status(&self, pr_url: &str) -> Result<PullRequestDetail, GitHostError> {
        let (base_url, owner, repo, number) = api::parse_pr_url(pr_url).ok_or_else(|| {
            GitHostError::PullRequest(format!("Could not parse Gitea PR URL: {pr_url}"))
        })?;

        let repo_info = GiteaRepoInfo {
            base_url,
            owner,
            repo,
        };

        (|| async {
            let pr = self.client.get_pr(&repo_info, number).await?;
            Ok(pr)
        })
        .retry(&retry_policy())
        .when(|e: &GitHostError| e.should_retry())
        .notify(|err: &GitHostError, dur: Duration| {
            tracing::warn!(
                "Gitea API call failed, retrying after {:.2}s: {}",
                dur.as_secs_f64(),
                err
            );
        })
        .await
    }

    async fn list_prs_for_branch(
        &self,
        _repo_path: &Path,
        remote_url: &str,
        branch_name: &str,
    ) -> Result<Vec<PullRequestDetail>, GitHostError> {
        let repo_info = self.get_repo_info(remote_url)?;

        (|| async {
            // Fetch open + closed PRs filtered by head branch
            let mut all = self
                .client
                .list_prs(&repo_info, "open", Some(branch_name))
                .await?;
            let closed = self
                .client
                .list_prs(&repo_info, "closed", Some(branch_name))
                .await?;
            all.extend(closed);
            Ok(all)
        })
        .retry(&retry_policy())
        .when(|e: &GitHostError| e.should_retry())
        .notify(|err: &GitHostError, dur: Duration| {
            tracing::warn!(
                "Gitea API call failed, retrying after {:.2}s: {}",
                dur.as_secs_f64(),
                err
            );
        })
        .await
    }

    async fn get_pr_comments(
        &self,
        _repo_path: &Path,
        remote_url: &str,
        pr_number: i64,
    ) -> Result<Vec<UnifiedPrComment>, GitHostError> {
        let repo_info = self.get_repo_info(remote_url)?;

        (|| async {
            self.client
                .get_pr_comments(&repo_info, pr_number)
                .await
                .map_err(GitHostError::from)
        })
        .retry(&retry_policy())
        .when(|e: &GitHostError| e.should_retry())
        .notify(|err: &GitHostError, dur: Duration| {
            tracing::warn!(
                "Gitea API call failed, retrying after {:.2}s: {}",
                dur.as_secs_f64(),
                err
            );
        })
        .await
    }

    async fn list_open_prs(
        &self,
        _repo_path: &Path,
        remote_url: &str,
    ) -> Result<Vec<PullRequestDetail>, GitHostError> {
        let repo_info = self.get_repo_info(remote_url)?;

        (|| async {
            self.client
                .list_prs(&repo_info, "open", None)
                .await
                .map_err(GitHostError::from)
        })
        .retry(&retry_policy())
        .when(|e: &GitHostError| e.should_retry())
        .notify(|err: &GitHostError, dur: Duration| {
            tracing::warn!(
                "Gitea API call failed, retrying after {:.2}s: {}",
                dur.as_secs_f64(),
                err
            );
        })
        .await
    }

    fn provider_kind(&self) -> ProviderKind {
        ProviderKind::Gitea
    }
}
