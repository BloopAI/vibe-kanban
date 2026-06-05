//! Forgejo/Gitea hosting service implementation.

mod cli;

use std::{path::Path, time::Duration};

use async_trait::async_trait;
use backon::{ExponentialBuilder, Retryable};
pub use cli::ForgejoApi;
use cli::{ForgejoApiError, ForgejoRepoInfo};
use tokio::task;
use tracing::info;

use crate::{
    GitHostProvider,
    types::{
        CreatePrRequest, GitHostError, PrComment, PrReviewComment, ProviderKind, PullRequestDetail,
        UnifiedPrComment,
    },
};

#[derive(Debug, Clone)]
pub struct ForgejoProvider {
    api: ForgejoApi,
}

impl ForgejoProvider {
    pub fn new() -> Result<Self, GitHostError> {
        Ok(Self {
            api: ForgejoApi::new().map_err(GitHostError::from)?,
        })
    }

    async fn get_repo_info(
&self,
        remote_url: &str,
    ) -> Result<ForgejoRepoInfo, GitHostError> {
        let api = self.api.clone();
        let url = remote_url.to_string();
        task::spawn_blocking(move || api.parse_remote_url(&url))
            .await
            .map_err(|err| {
                GitHostError::Repository(format!("Failed to parse repo URL: {err}"))
            })?
            .map_err(Into::into)
    }

    async fn get_repo_info_from_pr_url(
        &self,
        pr_url: &str,
    ) -> Result<(ForgejoRepoInfo, i64), GitHostError> {
        let api = self.api.clone();
        let url = pr_url.to_string();
        task::spawn_blocking(move || api.parse_pr_url(&url))
            .await
            .map_err(|err| {
                GitHostError::Repository(format!("Failed to parse PR URL: {err}"))
            })?
            .map_err(Into::into)
    }

    async fn fetch_general_comments(
        &self,
        api: &ForgejoApi,
        repo_info: &ForgejoRepoInfo,
        pr_number: i64,
    ) -> Result<Vec<PrComment>, GitHostError> {
        let api = api.clone();
        let repo_info = repo_info.clone();

        (|| async {
            let api = api.clone();
            let repo_info = repo_info.clone();

            let comments = task::spawn_blocking(move || {
                api.get_pr_comments(&repo_info, pr_number)
            })
            .await
            .map_err(|err| {
                GitHostError::PullRequest(format!(
                    "Failed to execute Forgejo API for fetching PR comments: {err}"
                ))
            })?
            .map_err(GitHostError::from)?;

            Ok(comments)
        })
        .retry(
&ExponentialBuilder::default()
                .with_min_delay(Duration::from_secs(1))
                .with_max_delay(Duration::from_secs(30))
                .with_max_times(3)
                .with_jitter(),
        )
        .when(|e: &GitHostError| e.should_retry())
        .notify(|err: &GitHostError, dur: Duration| {
            tracing::warn!(
                "Forgejo API call failed, retrying after {:.2}s: {}",
                dur.as_secs_f64(),
                err
            );
        })
        .await
    }

    async fn fetch_review_comments(
       &self,
        api: &ForgejoApi,
        repo_info: &ForgejoRepoInfo,
        pr_number: i64,
    ) -> Result<Vec<PrReviewComment>, GitHostError> {
        let api = api.clone();
        let repo_info = repo_info.clone();

        (|| async {
            let api = api.clone();
            let repo_info = repo_info.clone();

            let comments = task::spawn_blocking(move || {
                api.get_pr_review_comments(&repo_info, pr_number)
            })
            .await
            .map_err(|err| {
                GitHostError::PullRequest(format!(
                    "Failed to execute Forgejo API for fetching review comments: {err}"
                ))
            })?
            .map_err(GitHostError::from)?;

            Ok(comments)
        })
        .retry(
            &ExponentialBuilder::default()
                .with_min_delay(Duration::from_secs(1))
                .with_max_delay(Duration::from_secs(30))
                .with_max_times(3)
                .with_jitter(),
        )
        .when(|e: &GitHostError| e.should_retry())
        .notify(|err: &GitHostError, dur: Duration| {
            tracing::warn!(
                "Forgejo API call failed, retrying after {:.2}s: {}",
                dur.as_secs_f64(),
                err
            );
        })
        .await
    }
}

impl From<ForgejoApiError> for GitHostError {
    fn from(error: ForgejoApiError) -> Self {
        match &error {
            ForgejoApiError::NotConfigured(msg) => {
                GitHostError::Repository(format!("Forgejo not configured: {msg}"))
            }
            ForgejoApiError::AuthFailed(msg) => GitHostError::AuthFailed(msg.clone()),
            ForgejoApiError::HttpError(status, msg) => {
                let lower = msg.to_ascii_lowercase();
                if *status == 403 || lower.contains("forbidden") {
                    GitHostError::InsufficientPermissions(msg.clone())
                } else if *status == 404 || lower.contains("not found") {
                    GitHostError::RepoNotFoundOrNoAccess(msg.clone())
                } else {
                    GitHostError::PullRequest(format!("HTTP {status}: {msg}"))
                }
            }
            ForgejoApiError::UnexpectedOutput(msg) => GitHostError::UnexpectedOutput(msg.clone()),
            ForgejoApiError::ReqwestError(err) => {
                GitHostError::PullRequest(format!("Request failed: {err}"))
            }
        }
    }
}

#[async_trait]
impl GitHostProvider for ForgejoProvider {
    async fn create_pr(
        &self,
        _repo_path: &Path,
        remote_url: &str,
        request: &CreatePrRequest,
    ) -> Result<PullRequestDetail, GitHostError> {
        let repo_info = self.get_repo_info(remote_url).await?;

        (|| async {
            let api = self.api.clone();
            let request = request.clone();
            let repo_info = repo_info.clone();

            let result = task::spawn_blocking(move || api.create_pr(&request, &repo_info))
                .await
                .map_err(|err| {
                    GitHostError::PullRequest(format!(
                        "Failed to execute Forgejo API for PR creation: {err}"
                    ))
                })?
                .map_err(GitHostError::from)?;

            info!(
                "Created Forgejo PR #{} for branch {}",
                result.number, request.head_branch
            );

            Ok(result)
        })
        .retry(
            &ExponentialBuilder::default()
                .with_min_delay(Duration::from_secs(1))
                .with_max_delay(Duration::from_secs(30))
                .with_max_times(3)
                .with_jitter(),
        )
        .when(|e: &GitHostError| e.should_retry())
        .notify(|err: &GitHostError, dur: Duration| {
            tracing::warn!(
                "Forgejo API call failed, retrying after {:.2}s: {}",
                dur.as_secs_f64(),
                err
            );
        })
        .await
    }

    async fn get_pr_status(&self, pr_url: &str) -> Result<PullRequestDetail, GitHostError> {
        let (repo_info, pr_number) = self.get_repo_info_from_pr_url(pr_url).await?;

        (|| async {
            let api = self.api.clone();
            let repo_info = repo_info.clone();

            let pr = task::spawn_blocking(move || api.view_pr(&repo_info, pr_number))
                .await
                .map_err(|err| {
                    GitHostError::PullRequest(format!(
                        "Failed to execute Forgejo API for viewing PR: {err}"
                    ))
                })?
                .map_err(GitHostError::from)?;

            Ok(pr)
        })
        .retry(
&ExponentialBuilder::default()
                .with_min_delay(Duration::from_secs(1))
                .with_max_delay(Duration::from_secs(30))
                .with_max_times(3)
                .with_jitter(),
        )
        .when(|err: &GitHostError| err.should_retry())
        .notify(|err: &GitHostError, dur: Duration| {
            tracing::warn!(
                "Forgejo API call failed, retrying after {:.2}s: {}",
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
        let repo_info = self.get_repo_info(remote_url).await?;

        (|| async {
            let api = self.api.clone();
            let repo_info = repo_info.clone();
            let branch = branch_name.to_string();

            let prs = task::spawn_blocking(move || {
                api.list_prs_for_branch(&repo_info, &branch)
            })
            .await
            .map_err(|err| {
                GitHostError::PullRequest(format!(
                    "Failed to execute Forgejo API for listing PRs: {err}"
                ))
            })?
            .map_err(GitHostError::from)?;

            Ok(prs)
        })
        .retry(
&ExponentialBuilder::default()
                .with_min_delay(Duration::from_secs(1))
                .with_max_delay(Duration::from_secs(30))
                .with_max_times(3)
                .with_jitter(),
        )
        .when(|e: &GitHostError| e.should_retry())
        .notify(|err: &GitHostError, dur: Duration| {
            tracing::warn!(
                "Forgejo API call failed, retrying after {:.2}s: {}",
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
        let repo_info = self.get_repo_info(remote_url).await?;

        // Fetch both types of comments in parallel
        let api1 = self.api.clone();
        let api2 = self.api.clone();

        let (general_result, review_result) = tokio::join!(
            self.fetch_general_comments(&api1, &repo_info, pr_number),
            self.fetch_review_comments(&api2, &repo_info, pr_number)
        );

        let general_comments = general_result?;
        let review_comments = review_result?;

        // Convert and merge into unified timeline
        let mut unified: Vec<UnifiedPrComment> = Vec::new();

        for c in general_comments {
            unified.push(UnifiedPrComment::General {
                id: c.id,
                author: c.author.login,
                author_association: Some(c.author_association),
                body: c.body,
                created_at: c.created_at,
                url: Some(c.url),
            });
        }

        for c in review_comments {
            unified.push(UnifiedPrComment::Review {
                id: c.id,
                author: c.user.login,
                author_association: Some(c.author_association),
                body: c.body,
                created_at: c.created_at,
                url: Some(c.html_url),
                path: c.path,
                line: c.line,
                side: c.side,
                diff_hunk: Some(c.diff_hunk),
            });
        }

        // Sort by creation time
        unified.sort_by_key(|c| c.created_at());

        Ok(unified)
    }

    async fn list_open_prs(
&self,
        _repo_path: &Path,
        remote_url: &str,
    ) -> Result<Vec<PullRequestDetail>, GitHostError> {
        let repo_info = self.get_repo_info(remote_url).await?;

        (|| async {
            let api = self.api.clone();
            let repo_info = repo_info.clone();

            let prs = task::spawn_blocking(move || api.list_open_prs(&repo_info))
                .await
                .map_err(|err| {
                    GitHostError::PullRequest(format!(
                        "Failed to execute Forgejo API for listing PRs: {err}"
                    ))
                })?
                .map_err(GitHostError::from)?;

            Ok(prs)
        })
        .retry(
&ExponentialBuilder::default()
                .with_min_delay(Duration::from_secs(1))
                .with_max_delay(Duration::from_secs(30))
                .with_max_times(3)
                .with_jitter(),
        )
        .when(|e: &GitHostError| e.should_retry())
        .notify(|err: &GitHostError, dur: Duration| {
            tracing::warn!(
                "Forgejo API call failed, retrying after {:.2}s: {}",
                dur.as_secs_f64(),
                err
            );
        })
        .await
    }

    fn provider_kind(&self) -> ProviderKind {
        ProviderKind::Forgejo
    }
}
