//! Bitbucket Server REST API v1.0 client.
//!
//! Provides HTTP methods for interacting with Bitbucket Server API endpoints.

use std::time::Duration;

use backon::{ExponentialBuilder, Retryable};
use reqwest::{Client, Response, StatusCode};
use tracing::{debug, warn};

use super::models::{
    BitbucketActivity, BitbucketDiffComment, BitbucketError, BitbucketPullRequest,
    CreatePullRequestRequest, PagedResponse,
};
use crate::services::vcs_provider::VcsProviderError;

/// HTTP client for Bitbucket Server REST API v1.0
pub struct BitbucketApiClient {
    http_client: Client,
}

impl BitbucketApiClient {
    pub fn new() -> Result<Self, VcsProviderError> {
        let http_client = Client::builder()
            .timeout(Duration::from_secs(30))
            .connect_timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| VcsProviderError::Network(format!("Failed to create HTTP client: {}", e)))?;

        Ok(Self { http_client })
    }

    /// Build the API URL for a given path
    fn api_url(base_url: &str, path: &str) -> String {
        format!("{}/rest/api/1.0{}", base_url.trim_end_matches('/'), path)
    }

    /// Execute a request with retry logic
    async fn execute_with_retry<F, Fut, T>(
        &self,
        operation: F,
    ) -> Result<T, VcsProviderError>
    where
        F: Fn() -> Fut,
        Fut: std::future::Future<Output = Result<T, VcsProviderError>>,
    {
        operation
            .retry(
                &ExponentialBuilder::default()
                    .with_min_delay(Duration::from_secs(1))
                    .with_max_delay(Duration::from_secs(30))
                    .with_max_times(3)
                    .with_jitter(),
            )
            .when(|e: &VcsProviderError| e.should_retry())
            .notify(|err: &VcsProviderError, dur: Duration| {
                warn!(
                    "Bitbucket API call failed, retrying after {:.2}s: {}",
                    dur.as_secs_f64(),
                    err
                );
            })
            .await
    }

    /// Handle response errors
    async fn handle_response(&self, response: Response) -> Result<Response, VcsProviderError> {
        let status = response.status();

        if status.is_success() {
            return Ok(response);
        }

        // Try to parse error response
        let error_text = response.text().await.unwrap_or_default();

        match status {
            StatusCode::UNAUTHORIZED => {
                Err(VcsProviderError::AuthFailed(
                    "Bitbucket authentication failed. Please check your access token.".into()
                ))
            }
            StatusCode::FORBIDDEN => {
                let msg = if let Ok(err) = serde_json::from_str::<BitbucketError>(&error_text) {
                    err.to_string()
                } else {
                    error_text
                };
                Err(VcsProviderError::PermissionDenied(msg))
            }
            StatusCode::NOT_FOUND => {
                let msg = if let Ok(err) = serde_json::from_str::<BitbucketError>(&error_text) {
                    err.to_string()
                } else {
                    "Resource not found".to_string()
                };
                Err(VcsProviderError::NotFound(msg))
            }
            StatusCode::CONFLICT => {
                let msg = if let Ok(err) = serde_json::from_str::<BitbucketError>(&error_text) {
                    err.to_string()
                } else {
                    error_text
                };
                Err(VcsProviderError::PullRequest(format!("Conflict: {}", msg)))
            }
            _ if status.is_server_error() => {
                Err(VcsProviderError::Network(format!(
                    "Bitbucket server error ({}): {}",
                    status.as_u16(),
                    error_text
                )))
            }
            _ => {
                let msg = if let Ok(err) = serde_json::from_str::<BitbucketError>(&error_text) {
                    err.to_string()
                } else {
                    error_text
                };
                Err(VcsProviderError::PullRequest(format!(
                    "Bitbucket API error ({}): {}",
                    status.as_u16(),
                    msg
                )))
            }
        }
    }

    /// Create a pull request
    pub async fn create_pull_request(
        &self,
        base_url: &str,
        token: &str,
        project: &str,
        repo: &str,
        request: &CreatePullRequestRequest,
    ) -> Result<BitbucketPullRequest, VcsProviderError> {
        let url = Self::api_url(
            base_url,
            &format!("/projects/{}/repos/{}/pull-requests", project, repo),
        );

        debug!("Creating PR at {}", url);

        self.execute_with_retry(|| async {
            let response = self
                .http_client
                .post(&url)
                .bearer_auth(token)
                .json(request)
                .send()
                .await
                .map_err(|e| VcsProviderError::Network(e.to_string()))?;

            let response = self.handle_response(response).await?;

            response
                .json::<BitbucketPullRequest>()
                .await
                .map_err(|e| VcsProviderError::PullRequest(format!("Failed to parse response: {}", e)))
        })
        .await
    }

    /// Get a pull request by ID
    pub async fn get_pull_request(
        &self,
        base_url: &str,
        token: &str,
        project: &str,
        repo: &str,
        pr_id: i64,
    ) -> Result<BitbucketPullRequest, VcsProviderError> {
        let url = Self::api_url(
            base_url,
            &format!("/projects/{}/repos/{}/pull-requests/{}", project, repo, pr_id),
        );

        debug!("Getting PR from {}", url);

        self.execute_with_retry(|| async {
            let response = self
                .http_client
                .get(&url)
                .bearer_auth(token)
                .send()
                .await
                .map_err(|e| VcsProviderError::Network(e.to_string()))?;

            let response = self.handle_response(response).await?;

            response
                .json::<BitbucketPullRequest>()
                .await
                .map_err(|e| VcsProviderError::PullRequest(format!("Failed to parse response: {}", e)))
        })
        .await
    }

    /// List pull requests for a repository
    pub async fn list_pull_requests(
        &self,
        base_url: &str,
        token: &str,
        project: &str,
        repo: &str,
        branch: Option<&str>,
        state: Option<&str>, // "OPEN", "MERGED", "DECLINED", "ALL"
    ) -> Result<Vec<BitbucketPullRequest>, VcsProviderError> {
        let mut all_prs = Vec::new();
        let mut start = 0;
        let limit = 25;

        loop {
            let mut url = Self::api_url(
                base_url,
                &format!("/projects/{}/repos/{}/pull-requests", project, repo),
            );

            // Add query parameters
            let mut params = vec![
                format!("start={}", start),
                format!("limit={}", limit),
            ];

            if let Some(branch) = branch {
                // Filter by source branch (at parameter)
                params.push(format!("at=refs/heads/{}", branch));
            }

            if let Some(state) = state {
                params.push(format!("state={}", state));
            }

            url = format!("{}?{}", url, params.join("&"));

            debug!("Listing PRs from {}", url);

            let page: PagedResponse<BitbucketPullRequest> = self
                .execute_with_retry(|| async {
                    let response = self
                        .http_client
                        .get(&url)
                        .bearer_auth(token)
                        .send()
                        .await
                        .map_err(|e| VcsProviderError::Network(e.to_string()))?;

                    let response = self.handle_response(response).await?;

                    response
                        .json::<PagedResponse<BitbucketPullRequest>>()
                        .await
                        .map_err(|e| {
                            VcsProviderError::PullRequest(format!("Failed to parse response: {}", e))
                        })
                })
                .await?;

            all_prs.extend(page.values);

            if page.is_last_page {
                break;
            }

            start = page.next_page_start.unwrap_or(start + limit as i64) as i64;
        }

        Ok(all_prs)
    }

    /// Get PR activities (includes comments)
    pub async fn get_pull_request_activities(
        &self,
        base_url: &str,
        token: &str,
        project: &str,
        repo: &str,
        pr_id: i64,
    ) -> Result<Vec<BitbucketActivity>, VcsProviderError> {
        let mut all_activities = Vec::new();
        let mut start = 0;
        let limit = 100;

        loop {
            let url = Self::api_url(
                base_url,
                &format!(
                    "/projects/{}/repos/{}/pull-requests/{}/activities?start={}&limit={}",
                    project, repo, pr_id, start, limit
                ),
            );

            debug!("Getting PR activities from {}", url);

            let page: PagedResponse<BitbucketActivity> = self
                .execute_with_retry(|| async {
                    let response = self
                        .http_client
                        .get(&url)
                        .bearer_auth(token)
                        .send()
                        .await
                        .map_err(|e| VcsProviderError::Network(e.to_string()))?;

                    let response = self.handle_response(response).await?;

                    response
                        .json::<PagedResponse<BitbucketActivity>>()
                        .await
                        .map_err(|e| {
                            VcsProviderError::PullRequest(format!("Failed to parse response: {}", e))
                        })
                })
                .await?;

            all_activities.extend(page.values);

            if page.is_last_page {
                break;
            }

            start = page.next_page_start.unwrap_or(start + limit as i64) as i64;
        }

        Ok(all_activities)
    }

    /// Get PR diff comments (inline code comments)
    pub async fn get_pull_request_comments(
        &self,
        base_url: &str,
        token: &str,
        project: &str,
        repo: &str,
        pr_id: i64,
    ) -> Result<Vec<BitbucketDiffComment>, VcsProviderError> {
        let mut all_comments = Vec::new();
        let mut start = 0;
        let limit = 100;

        loop {
            let url = Self::api_url(
                base_url,
                &format!(
                    "/projects/{}/repos/{}/pull-requests/{}/comments?start={}&limit={}",
                    project, repo, pr_id, start, limit
                ),
            );

            debug!("Getting PR comments from {}", url);

            let page: PagedResponse<BitbucketDiffComment> = self
                .execute_with_retry(|| async {
                    let response = self
                        .http_client
                        .get(&url)
                        .bearer_auth(token)
                        .send()
                        .await
                        .map_err(|e| VcsProviderError::Network(e.to_string()))?;

                    let response = self.handle_response(response).await?;

                    response
                        .json::<PagedResponse<BitbucketDiffComment>>()
                        .await
                        .map_err(|e| {
                            VcsProviderError::PullRequest(format!("Failed to parse response: {}", e))
                        })
                })
                .await?;

            all_comments.extend(page.values);

            if page.is_last_page {
                break;
            }

            start = page.next_page_start.unwrap_or(start + limit as i64) as i64;
        }

        Ok(all_comments)
    }

    /// Verify token is valid by calling a simple API endpoint
    pub async fn verify_token(
        &self,
        base_url: &str,
        token: &str,
    ) -> Result<(), VcsProviderError> {
        let url = Self::api_url(base_url, "/application-properties");

        debug!("Verifying Bitbucket token at {}", url);

        let response = self
            .http_client
            .get(&url)
            .bearer_auth(token)
            .send()
            .await
            .map_err(|e| VcsProviderError::Network(e.to_string()))?;

        self.handle_response(response).await?;
        Ok(())
    }
}

impl Default for BitbucketApiClient {
    fn default() -> Self {
        Self::new().expect("Failed to create default BitbucketApiClient")
    }
}
