use reqwest::Client;
use serde::{Deserialize, Serialize};
use tracing::debug;
use uuid::Uuid;

use crate::error::ReviewError;

/// API client for the review service
pub(crate) struct ReviewApiClient {
    client: Client,
    base_url: String,
}

/// Response from POST /review/init
#[derive(Debug, Deserialize)]
pub(crate) struct InitResponse {
    pub(crate) review_id: Uuid,
    pub(crate) upload_url: String,
    pub(crate) object_key: String,
}

/// Request body for POST /review/init
#[derive(Debug, Serialize)]
struct InitRequest {
    gh_pr_url: String,
    email: String,
    pr_title: String,
}

/// Request body for POST /review/start
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StartRequest {
    pub(crate) id: String,
    pub(crate) title: String,
    pub(crate) description: String,
    pub(crate) org: String,
    pub(crate) repo: String,
    pub(crate) codebase_url: String,
    pub(crate) base_commit: String,
}

/// Response from GET /review/{id}/status
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StatusResponse {
    pub(crate) status: ReviewStatus,
    pub(crate) progress: Option<String>,
    pub(crate) error: Option<String>,
}

/// Possible review statuses
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ReviewStatus {
    Queued,
    Extracting,
    Running,
    Completed,
    Failed,
}

impl std::fmt::Display for ReviewStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ReviewStatus::Queued => write!(f, "queued"),
            ReviewStatus::Extracting => write!(f, "extracting"),
            ReviewStatus::Running => write!(f, "running"),
            ReviewStatus::Completed => write!(f, "completed"),
            ReviewStatus::Failed => write!(f, "failed"),
        }
    }
}

impl ReviewApiClient {
    /// Create a new API client
    pub(crate) fn new(base_url: String) -> Self {
        Self {
            client: Client::new(),
            base_url,
        }
    }

    /// Initialize a review upload and get a presigned URL
    pub(crate) async fn init(
        &self,
        pr_url: &str,
        email: &str,
        pr_title: &str,
    ) -> Result<InitResponse, ReviewError> {
        let url = format!("{}/v1/review/init", self.base_url);
        debug!("POST {url}");

        let response = self
            .client
            .post(&url)
            .json(&InitRequest {
                gh_pr_url: pr_url.to_string(),
                email: email.to_string(),
                pr_title: pr_title.to_string(),
            })
            .send()
            .await
            .map_err(|e| ReviewError::ApiError(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(ReviewError::ApiError(format!("{status}: {body}")));
        }

        let init_response: InitResponse = response
            .json()
            .await
            .map_err(|e| ReviewError::ApiError(e.to_string()))?;

        debug!("Review ID: {}", init_response.review_id);

        Ok(init_response)
    }

    /// Upload the tarball to the presigned URL
    pub(crate) async fn upload(
        &self,
        upload_url: &str,
        payload: Vec<u8>,
    ) -> Result<(), ReviewError> {
        debug!("PUT {} ({} bytes)", upload_url, payload.len());

        let response = self
            .client
            .put(upload_url)
            .header("Content-Type", "application/gzip")
            .body(payload)
            .send()
            .await
            .map_err(|e| ReviewError::UploadFailed(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(ReviewError::UploadFailed(format!("{status}: {body}")));
        }

        Ok(())
    }

    /// Start the review process
    pub(crate) async fn start(&self, request: StartRequest) -> Result<(), ReviewError> {
        let url = format!("{}/v1/review/start", self.base_url);
        debug!("POST {url}");

        let response = self
            .client
            .post(&url)
            .json(&request)
            .send()
            .await
            .map_err(|e| ReviewError::ApiError(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(ReviewError::ApiError(format!("{status}: {body}")));
        }

        Ok(())
    }

    /// Poll the review status
    pub(crate) async fn poll_status(&self, review_id: &str) -> Result<StatusResponse, ReviewError> {
        let url = format!("{}/v1/review/{}/status", self.base_url, review_id);
        debug!("GET {url}");

        let response = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| ReviewError::ApiError(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(ReviewError::ApiError(format!("{status}: {body}")));
        }

        let status_response: StatusResponse = response
            .json()
            .await
            .map_err(|e| ReviewError::ApiError(e.to_string()))?;

        Ok(status_response)
    }

    /// Get the review URL for a given review ID
    pub(crate) fn review_url(&self, review_id: &str) -> String {
        format!("{}/review/{}", self.base_url, review_id)
    }
}
