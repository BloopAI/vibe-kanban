//! Forgejo/Gitea hosting service implementation.
//!
//! This provider supports both Forgejo and Gitea instances as they share
//! a compatible API.

mod http;
mod types;

use std::{path::Path, sync::Arc, time::Duration};

use async_trait::async_trait;
use backon::{ExponentialBuilder, Retryable};
use db::models::merge::{MergeStatus, PullRequestInfo};
use http::{GitHostHttpClient, extract_host, handle_response, parse_owner_repo};
use tokio::sync::RwLock;
use tracing::info;
use types::{Comment, CreatePullRequestOption, PullRequest, PullRequestState};

use super::{
    GitHostProvider,
    types::{CreatePrRequest, GitHostError, OpenPrInfo, ProviderKind, UnifiedPrComment},
};
use crate::services::config::Config;

/// Well-known Forgejo/Gitea hosting services.
const KNOWN_HOSTS: &[&str] = &["codeberg.org", "gitea.com"];

/// Forgejo/Gitea provider implementation.
#[derive(Debug, Clone)]
pub struct ForgejoProvider {
    config: Arc<RwLock<Config>>,
}

impl ForgejoProvider {
    pub fn new(config: Arc<RwLock<Config>>) -> Self {
        Self { config }
    }

    pub fn matches_url_static(url: &str) -> bool {
        let url_lower = url.to_lowercase();
        KNOWN_HOSTS.iter().any(|h| url_lower.contains(h))
    }

    pub async fn matches_url_configured(&self, url: &str) -> bool {
        if let Ok(host) = extract_host(url) {
            if let Some(entry) = self.config.read().await.git_hosts.hosts.get(&host) {
                return entry.provider == ProviderKind::Forgejo;
            }
        }
        false
    }

    async fn get_client(&self, url: &str) -> Result<GitHostHttpClient, GitHostError> {
        let host = extract_host(url)?;
        GitHostHttpClient::new(
            format!("https://{}/api/v1", host),
            self.config
                .read()
                .await
                .git_hosts
                .hosts
                .get(&host)
                .and_then(|e| e.token.clone())
                .ok_or_else(|| GitHostError::ApiTokenMissing(host.clone()))?,
        )
    }

    async fn get_pr_by_number(
        &self,
        url: &str,
        owner: &str,
        repo: &str,
        pr_number: i64,
    ) -> Result<PullRequest, GitHostError> {
        (|| async {
            handle_response(
                self.get_client(url)
                    .await?
                    .get(&format!("/repos/{}/{}/pulls/{}", owner, repo, pr_number))
                    .send()
                    .await
                    .map_err(|e| GitHostError::HttpError(format!("Request failed: {e}")))?,
            )
            .await
        })
        .retry(
            ExponentialBuilder::default()
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
        .await?
        .json::<PullRequest>()
        .await
        .map_err(|e| GitHostError::HttpError(format!("Failed to parse PR response: {e}")))
    }

    fn convert_pr_to_info(pr: &PullRequest) -> PullRequestInfo {
        PullRequestInfo {
            number: pr.number,
            url: pr.html_url.clone(),
            status: match (pr.merged, &pr.state) {
                (true, _) => MergeStatus::Merged,
                (false, PullRequestState::Open) => MergeStatus::Open,
                (false, PullRequestState::Closed) => MergeStatus::Closed,
            },
            merged_at: pr.merged_at,
            merge_commit_sha: pr.merge_commit_sha.clone(),
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
    ) -> Result<PullRequestInfo, GitHostError> {
        let (owner, repo) = parse_owner_repo(remote_url)?;

        let pr: PullRequest = (|| async {
            handle_response(
                self.get_client(remote_url)
                    .await?
                    .post(&format!("/repos/{}/{}/pulls", owner, repo))
                    .json(&CreatePullRequestOption {
                        title: request.title.clone(),
                        body: request.body.clone(),
                        head: request.head_branch.clone(),
                        base: request.base_branch.clone(),
                    })
                    .send()
                    .await
                    .map_err(|e| GitHostError::HttpError(format!("Request failed: {e}")))?,
            )
            .await
        })
        .retry(
            ExponentialBuilder::default()
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
        .await?
        .json()
        .await
        .map_err(|e| GitHostError::HttpError(format!("Failed to parse PR response: {e}")))?;

        info!(
            "Created Forgejo PR #{} for branch {}",
            pr.number, request.head_branch
        );

        Ok(Self::convert_pr_to_info(&pr))
    }

    async fn get_pr_status(&self, pr_url: &str) -> Result<PullRequestInfo, GitHostError> {
        let url = url::Url::parse(pr_url)
            .map_err(|e| GitHostError::InvalidUrl(format!("Invalid PR URL: {e}")))?;

        let path_segments: Vec<&str> = url
            .path_segments()
            .ok_or_else(|| GitHostError::InvalidUrl("PR URL has no path".to_string()))?
            .collect();

        let pulls = path_segments.get(2).ok_or_else(|| {
            GitHostError::InvalidUrl("PR URL missing 'pulls' segment".to_string())
        })?;

        if *pulls != "pulls" {
            return Err(GitHostError::InvalidUrl(format!(
                "Expected 'pulls' in URL path, got '{}'",
                pulls
            )));
        }

        Ok(Self::convert_pr_to_info(
            &self
                .get_pr_by_number(
                    pr_url,
                    path_segments.get(0).ok_or_else(|| {
                        GitHostError::InvalidUrl("PR URL missing owner".to_string())
                    })?,
                    path_segments.get(1).ok_or_else(|| {
                        GitHostError::InvalidUrl("PR URL missing repo".to_string())
                    })?,
                    path_segments
                        .get(3)
                        .ok_or_else(|| {
                            GitHostError::InvalidUrl("PR URL missing PR number".to_string())
                        })?
                        .parse()
                        .map_err(|_| {
                            GitHostError::InvalidUrl("Invalid PR number in URL".to_string())
                        })?,
                )
                .await?,
        ))
    }

    async fn list_prs_for_branch(
        &self,
        _repo_path: &Path,
        remote_url: &str,
        branch_name: &str,
    ) -> Result<Vec<PullRequestInfo>, GitHostError> {
        let (owner, repo) = parse_owner_repo(remote_url)?;

        Ok((|| async {
            handle_response(
                self.get_client(remote_url)
                    .await?
                    .get(&format!(
                        "/repos/{}/{}/pulls?state=all&limit=100",
                        owner, repo
                    ))
                    .send()
                    .await
                    .map_err(|e| GitHostError::HttpError(format!("Request failed: {e}")))?,
            )
            .await
        })
        .retry(
            ExponentialBuilder::default()
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
        .await?
        .json::<Vec<PullRequest>>()
        .await
        .map_err(|e| GitHostError::HttpError(format!("Failed to parse PRs response: {e}")))?
        .iter()
        .filter(|pr| pr.head.branch_ref == branch_name)
        .map(Self::convert_pr_to_info)
        .collect())
    }

    async fn get_pr_comments(
        &self,
        _repo_path: &Path,
        remote_url: &str,
        pr_number: i64,
    ) -> Result<Vec<UnifiedPrComment>, GitHostError> {
        let (owner, repo) = parse_owner_repo(remote_url)?;

        let comments: Vec<Comment> = (|| async {
            handle_response(
                self.get_client(remote_url)
                    .await?
                    .get(&format!(
                        "/repos/{}/{}/issues/{}/comments",
                        owner, repo, pr_number
                    ))
                    .send()
                    .await
                    .map_err(|e| GitHostError::HttpError(format!("Request failed: {e}")))?,
            )
            .await
        })
        .retry(
            ExponentialBuilder::default()
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
        .await?
        .json()
        .await
        .map_err(|e| GitHostError::HttpError(format!("Failed to parse comments response: {e}")))?;

        Ok(comments
            .into_iter()
            .map(|c| UnifiedPrComment::General {
                id: c.id.to_string(),
                author: c.user.login,
                author_association: None, // Forgejo doesn't have author association
                body: c.body,
                created_at: c.created_at,
                url: Some(c.html_url),
            })
            .collect())
    }

    async fn list_open_prs(
        &self,
        _repo_path: &Path,
        remote_url: &str,
    ) -> Result<Vec<OpenPrInfo>, GitHostError> {
        let (owner, repo) = parse_owner_repo(remote_url)?;

        Ok((|| async {
            handle_response(
                self.get_client(remote_url)
                    .await?
                    .get(&format!(
                        "/repos/{}/{}/pulls?state=open&limit=100",
                        owner, repo
                    ))
                    .send()
                    .await
                    .map_err(|e| GitHostError::HttpError(format!("Request failed: {e}")))?,
            )
            .await
        })
        .retry(
            ExponentialBuilder::default()
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
        .await?
        .json::<Vec<PullRequest>>()
        .await
        .map_err(|e| GitHostError::HttpError(format!("Failed to parse PRs response: {e}")))?
        .into_iter()
        .map(|pr| OpenPrInfo {
            number: pr.number,
            url: pr.html_url,
            title: pr.title,
            head_branch: pr.head.branch_ref,
            base_branch: pr.base.branch_ref,
        })
        .collect())
    }

    fn provider_kind(&self) -> ProviderKind {
        ProviderKind::Forgejo
    }
}
