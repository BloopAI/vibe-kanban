//! Forgejo/Gitea hosting service implementation.
//!
//! This provider supports both Forgejo and Gitea instances as they share
//! a compatible API.

pub mod types;

use std::path::Path;
use std::time::Duration;

use async_trait::async_trait;
use backon::{ExponentialBuilder, Retryable};
use db::models::merge::{MergeStatus, PullRequestInfo};
use tracing::info;

use super::http::{extract_host, handle_response, parse_owner_repo, GitHostHttpClient};
use super::types::{CreatePrRequest, GitHostError, OpenPrInfo, ProviderKind, UnifiedPrComment};
use super::GitHostProvider;
use types::{Comment, CreatePullRequestOption, PullRequest, PullRequestState};

/// Forgejo/Gitea provider implementation.
#[derive(Debug, Clone)]
pub struct ForgejoProvider {
    client: GitHostHttpClient,
}

impl ForgejoProvider {
    /// Create a new Forgejo provider for the given host and token.
    pub fn new(base_url: String, token: String) -> Result<Self, GitHostError> {
        Ok(Self {
            client: GitHostHttpClient::new(
                match base_url.ends_with("/api/v1") {
                    true => base_url,
                    false => format!("{}/api/v1", base_url.trim_end_matches('/')),
                },
                token,
            )?,
        })
    }

    /// Create from a remote URL and token.
    pub fn from_remote_url(remote_url: &str, token: String) -> Result<Self, GitHostError> {
        Self::new(format!("https://{}", extract_host(remote_url)?), token)
    }

    async fn get_pr_by_number(
        &self,
        owner: &str,
        repo: &str,
        pr_number: i64,
    ) -> Result<PullRequest, GitHostError> {
        (|| async {
            handle_response(
                self.client
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
                self.client
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
        // Parse PR URL to extract owner, repo, and PR number
        // Format: https://host/owner/repo/pulls/123
        let url = url::Url::parse(pr_url)
            .map_err(|e| GitHostError::InvalidUrl(format!("Invalid PR URL: {e}")))?;

        let path_segments: Vec<&str> = url
            .path_segments()
            .ok_or_else(|| GitHostError::InvalidUrl("PR URL has no path".to_string()))?
            .collect();

        let owner = path_segments
            .get(0)
            .ok_or_else(|| GitHostError::InvalidUrl("PR URL missing owner".to_string()))?;
        let repo = path_segments
            .get(1)
            .ok_or_else(|| GitHostError::InvalidUrl("PR URL missing repo".to_string()))?;
        let pulls = path_segments
            .get(2)
            .ok_or_else(|| GitHostError::InvalidUrl("PR URL missing 'pulls' segment".to_string()))?;
        let pr_number_str = path_segments
            .get(3)
            .ok_or_else(|| GitHostError::InvalidUrl("PR URL missing PR number".to_string()))?;

        if *pulls != "pulls" {
            return Err(GitHostError::InvalidUrl(format!(
                "Expected 'pulls' in URL path, got '{}'",
                pulls
            )));
        }

        Ok(Self::convert_pr_to_info(
            &self
                .get_pr_by_number(
                    owner,
                    repo,
                    pr_number_str
                        .parse()
                        .map_err(|_| GitHostError::InvalidUrl("Invalid PR number in URL".to_string()))?,
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

        // Forgejo API: GET /repos/{owner}/{repo}/pulls?state=all
        // We need to filter by head branch after fetching
        let path = format!("/repos/{}/{}/pulls?state=all&limit=100", owner, repo);

        let client = self.client.clone();
        let path_clone = path.clone();

        let prs: Vec<PullRequest> = (|| async {
            let response = client
                .get(&path_clone)
                .send()
                .await
                .map_err(|e| GitHostError::HttpError(format!("Request failed: {e}")))?;

            handle_response(response).await
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
        .map_err(|e| GitHostError::HttpError(format!("Failed to parse PRs response: {e}")))?;

        // Filter by head branch
        let matching_prs: Vec<PullRequestInfo> = prs
            .iter()
            .filter(|pr| pr.head.branch_ref == branch_name)
            .map(Self::convert_pr_to_info)
            .collect();

        Ok(matching_prs)
    }

    async fn get_pr_comments(
        &self,
        _repo_path: &Path,
        remote_url: &str,
        pr_number: i64,
    ) -> Result<Vec<UnifiedPrComment>, GitHostError> {
        let (owner, repo) = parse_owner_repo(remote_url)?;

        // Forgejo uses issue comments endpoint for PR comments
        let path = format!("/repos/{}/{}/issues/{}/comments", owner, repo, pr_number);

        let client = self.client.clone();
        let path_clone = path.clone();

        let comments: Vec<Comment> = (|| async {
            let response = client
                .get(&path_clone)
                .send()
                .await
                .map_err(|e| GitHostError::HttpError(format!("Request failed: {e}")))?;

            handle_response(response).await
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

        // Convert to unified format
        let unified: Vec<UnifiedPrComment> = comments
            .into_iter()
            .map(|c| UnifiedPrComment::General {
                id: c.id.to_string(),
                author: c.user.login,
                author_association: None, // Forgejo doesn't have author association
                body: c.body,
                created_at: c.created_at,
                url: Some(c.html_url),
            })
            .collect();

        Ok(unified)
    }

    async fn list_open_prs(
        &self,
        _repo_path: &Path,
        remote_url: &str,
    ) -> Result<Vec<OpenPrInfo>, GitHostError> {
        let (owner, repo) = parse_owner_repo(remote_url)?;

        Ok((|| async {
            handle_response(
                self.client
                    .get(&format!("/repos/{}/{}/pulls?state=open&limit=100", owner, repo))
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
