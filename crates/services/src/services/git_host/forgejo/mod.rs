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
        // Ensure base_url has the API path
        let api_url = if base_url.ends_with("/api/v1") {
            base_url
        } else {
            format!("{}/api/v1", base_url.trim_end_matches('/'))
        };

        let client = GitHostHttpClient::new(api_url, token)?;
        Ok(Self { client })
    }

    /// Create from a remote URL and token.
    pub fn from_remote_url(remote_url: &str, token: String) -> Result<Self, GitHostError> {
        let host = extract_host(remote_url)?;
        let base_url = format!("https://{}", host);
        Self::new(base_url, token)
    }

    async fn get_pr_by_number(
        &self,
        owner: &str,
        repo: &str,
        pr_number: i64,
    ) -> Result<PullRequest, GitHostError> {
        let path = format!("/repos/{}/{}/pulls/{}", owner, repo, pr_number);

        let client = self.client.clone();
        let path_clone = path.clone();

        (|| async {
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
        .json::<PullRequest>()
        .await
        .map_err(|e| GitHostError::HttpError(format!("Failed to parse PR response: {e}")))
    }

    fn convert_pr_to_info(pr: &PullRequest) -> PullRequestInfo {
        let status = if pr.merged {
            MergeStatus::Merged
        } else {
            match pr.state {
                PullRequestState::Open => MergeStatus::Open,
                PullRequestState::Closed => MergeStatus::Closed,
            }
        };

        PullRequestInfo {
            number: pr.number,
            url: pr.html_url.clone(),
            status,
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
        let path = format!("/repos/{}/{}/pulls", owner, repo);

        let body = CreatePullRequestOption {
            title: request.title.clone(),
            body: request.body.clone(),
            head: request.head_branch.clone(),
            base: request.base_branch.clone(),
        };

        let client = self.client.clone();
        let path_clone = path.clone();

        let pr: PullRequest = (|| async {
            let response = client
                .post(&path_clone)
                .json(&body)
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

        if path_segments.len() < 4 || path_segments[2] != "pulls" {
            return Err(GitHostError::InvalidUrl(format!(
                "Invalid Forgejo PR URL format: {}",
                pr_url
            )));
        }

        let owner = path_segments[0];
        let repo = path_segments[1];
        let pr_number: i64 = path_segments[3]
            .parse()
            .map_err(|_| GitHostError::InvalidUrl("Invalid PR number in URL".to_string()))?;

        let pr = self.get_pr_by_number(owner, repo, pr_number).await?;
        Ok(Self::convert_pr_to_info(&pr))
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
