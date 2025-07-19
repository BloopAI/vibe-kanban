use std::time::Duration;

use reqwest::{Client, header};
use serde::{Deserialize, Serialize};
use tokio::time::sleep;
use tracing::{info, warn};

#[derive(Debug)]
pub enum GitLabServiceError {
    Client(reqwest::Error),
    Auth(String),
    Repository(String),
    MergeRequest(String),
    Branch(String),
    TokenInvalid,
    ApiError(String),
}

impl std::fmt::Display for GitLabServiceError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            GitLabServiceError::Client(e) => write!(f, "GitLab client error: {}", e),
            GitLabServiceError::Auth(e) => write!(f, "Authentication error: {}", e),
            GitLabServiceError::Repository(e) => write!(f, "Repository error: {}", e),
            GitLabServiceError::MergeRequest(e) => write!(f, "Merge request error: {}", e),
            GitLabServiceError::Branch(e) => write!(f, "Branch error: {}", e),
            GitLabServiceError::TokenInvalid => write!(f, "GitLab token is invalid or expired."),
            GitLabServiceError::ApiError(e) => write!(f, "GitLab API error: {}", e),
        }
    }
}

impl std::error::Error for GitLabServiceError {}

#[derive(Debug, Clone)]
pub struct GitLabRepoInfo {
    pub project_id: String,  // GitLab uses project ID or namespace/project format
}

#[derive(Debug, Clone)]
pub struct CreateMrRequest {
    pub title: String,
    pub description: Option<String>,
    pub source_branch: String,
    pub target_branch: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergeRequestInfo {
    pub iid: i64,  // GitLab uses iid (internal ID) for project-specific MR numbers
    pub web_url: String,
    pub state: String,  // opened, closed, merged
    pub merged: bool,
    pub merged_at: Option<chrono::DateTime<chrono::Utc>>,
    pub merge_commit_sha: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GitLabMergeRequest {
    id: i64,
    iid: i64,
    state: String,
    web_url: String,
    merged_at: Option<String>,
    merge_commit_sha: Option<String>,
}

#[derive(Debug, Serialize)]
struct CreateMergeRequestPayload {
    id: String,
    source_branch: String,
    target_branch: String,
    title: String,
    description: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GitLabErrorResponse {
    message: Option<serde_json::Value>,
    error: Option<String>,
    error_description: Option<String>,
}

#[derive(Debug, Clone)]
pub struct GitLabService {
    client: Client,
    base_url: String,
    token: String,
    retry_config: RetryConfig,
}

#[derive(Debug, Clone)]
pub struct RetryConfig {
    pub max_retries: u32,
    pub base_delay: Duration,
    pub max_delay: Duration,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_retries: 3,
            base_delay: Duration::from_secs(1),
            max_delay: Duration::from_secs(30),
        }
    }
}

impl GitLabService {
    /// Create a new GitLab service with authentication
    pub fn new(gitlab_url: &str, gitlab_token: &str) -> Result<Self, GitLabServiceError> {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| {
                GitLabServiceError::Auth(format!("Failed to create GitLab client: {}", e))
            })?;

        // Ensure base_url ends without a trailing slash
        let base_url = gitlab_url.trim_end_matches('/').to_string();

        Ok(Self {
            client,
            base_url,
            token: gitlab_token.to_string(),
            retry_config: RetryConfig::default(),
        })
    }

    /// Create a merge request on GitLab
    pub async fn create_mr(
        &self,
        repo_info: &GitLabRepoInfo,
        request: &CreateMrRequest,
    ) -> Result<MergeRequestInfo, GitLabServiceError> {
        self.with_retry(|| async { self.create_mr_internal(repo_info, request).await })
            .await
    }

    async fn create_mr_internal(
        &self,
        repo_info: &GitLabRepoInfo,
        request: &CreateMrRequest,
    ) -> Result<MergeRequestInfo, GitLabServiceError> {
        // URL encode the project ID (in case it's in namespace/project format)
        let encoded_project_id = urlencoding::encode(&repo_info.project_id);
        
        // Create the merge request
        let url = format!("{}/api/v4/projects/{}/merge_requests", self.base_url, encoded_project_id);
        
        let payload = CreateMergeRequestPayload {
            id: repo_info.project_id.clone(),
            source_branch: request.source_branch.clone(),
            target_branch: request.target_branch.clone(),
            title: request.title.clone(),
            description: request.description.clone(),
        };

        let response = self.client
            .post(&url)
            .header(header::AUTHORIZATION, format!("Bearer {}", self.token))
            .header(header::CONTENT_TYPE, "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| GitLabServiceError::Client(e))?;

        let status = response.status();
        
        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            
            // Try to parse GitLab error response
            if let Ok(error_response) = serde_json::from_str::<GitLabErrorResponse>(&error_text) {
                if status.as_u16() == 401 {
                    return Err(GitLabServiceError::TokenInvalid);
                } else if status.as_u16() == 404 {
                    return Err(GitLabServiceError::Repository(
                        format!("Project '{}' not found or no access", repo_info.project_id)
                    ));
                } else if let Some(message) = error_response.message {
                    return Err(GitLabServiceError::ApiError(
                        format!("GitLab API error ({}): {}", status, message)
                    ));
                } else if let Some(error) = error_response.error {
                    return Err(GitLabServiceError::ApiError(
                        format!("GitLab API error ({}): {}", status, error)
                    ));
                }
            }
            
            return Err(GitLabServiceError::ApiError(
                format!("GitLab API error ({}): {}", status, error_text)
            ));
        }

        let mr: GitLabMergeRequest = response.json().await
            .map_err(|e| GitLabServiceError::Client(e))?;

        let mr_info = MergeRequestInfo {
            iid: mr.iid,
            web_url: mr.web_url,
            state: mr.state,
            merged: mr.merged_at.is_some(),
            merged_at: mr.merged_at.and_then(|s| chrono::DateTime::parse_from_rfc3339(&s).ok())
                .map(|dt| dt.with_timezone(&chrono::Utc)),
            merge_commit_sha: mr.merge_commit_sha,
        };

        info!(
            "Created GitLab MR !{} for branch {} in project {}",
            mr_info.iid, request.source_branch, repo_info.project_id
        );

        Ok(mr_info)
    }

    /// Update and get the status of a merge request
    pub async fn update_mr_status(
        &self,
        repo_info: &GitLabRepoInfo,
        mr_iid: i64,
    ) -> Result<MergeRequestInfo, GitLabServiceError> {
        self.with_retry(|| async { self.update_mr_status_internal(repo_info, mr_iid).await })
            .await
    }

    async fn update_mr_status_internal(
        &self,
        repo_info: &GitLabRepoInfo,
        mr_iid: i64,
    ) -> Result<MergeRequestInfo, GitLabServiceError> {
        let encoded_project_id = urlencoding::encode(&repo_info.project_id);
        let url = format!("{}/api/v4/projects/{}/merge_requests/{}", self.base_url, encoded_project_id, mr_iid);

        let response = self.client
            .get(&url)
            .header(header::AUTHORIZATION, format!("Bearer {}", self.token))
            .send()
            .await
            .map_err(|e| GitLabServiceError::Client(e))?;

        let status = response.status();
        
        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            
            if status.as_u16() == 401 {
                return Err(GitLabServiceError::TokenInvalid);
            } else if status.as_u16() == 404 {
                return Err(GitLabServiceError::MergeRequest(
                    format!("Merge request !{} not found", mr_iid)
                ));
            }
            
            return Err(GitLabServiceError::ApiError(
                format!("GitLab API error ({}): {}", status, error_text)
            ));
        }

        let mr: GitLabMergeRequest = response.json().await
            .map_err(|e| GitLabServiceError::Client(e))?;

        let mr_info = MergeRequestInfo {
            iid: mr.iid,
            web_url: mr.web_url,
            state: mr.state.clone(),
            merged: mr.state == "merged",
            merged_at: mr.merged_at.and_then(|s| chrono::DateTime::parse_from_rfc3339(&s).ok())
                .map(|dt| dt.with_timezone(&chrono::Utc)),
            merge_commit_sha: mr.merge_commit_sha,
        };

        Ok(mr_info)
    }

    /// Retry wrapper for GitLab API calls with exponential backoff
    async fn with_retry<F, Fut, T>(&self, operation: F) -> Result<T, GitLabServiceError>
    where
        F: Fn() -> Fut,
        Fut: std::future::Future<Output = Result<T, GitLabServiceError>>,
    {
        let mut last_error = None;

        for attempt in 0..=self.retry_config.max_retries {
            match operation().await {
                Ok(result) => return Ok(result),
                Err(e) => {
                    last_error = Some(e);

                    if attempt < self.retry_config.max_retries {
                        let delay = std::cmp::min(
                            self.retry_config.base_delay * 2_u32.pow(attempt),
                            self.retry_config.max_delay,
                        );

                        warn!(
                            "GitLab API call failed (attempt {}/{}), retrying in {:?}: {}",
                            attempt + 1,
                            self.retry_config.max_retries + 1,
                            delay,
                            last_error.as_ref().unwrap()
                        );

                        sleep(delay).await;
                    }
                }
            }
        }

        Err(last_error.unwrap())
    }
}