use std::net::IpAddr;

use axum::{
    Json, Router,
    body::Body,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    AppState,
    db::reviews::{CreateReviewParams, ReviewRepository},
    r2::R2Error,
};

pub fn public_router() -> Router<AppState> {
    Router::new()
        .route("/review/init", post(init_review_upload))
        .route("/review/start", post(start_review))
        .route("/review/{id}/status", get(get_review_status))
        .route("/review/{id}", get(get_review))
        .route("/review/{id}/metadata", get(get_review_metadata))
        .route("/review/{id}/file/{file_hash}", get(get_review_file))
        .route("/review/{id}/diff", get(get_review_diff))
        .route("/review/{id}/success", post(review_success))
        .route("/review/{id}/failed", post(review_failed))
}

#[derive(Debug, Deserialize)]
pub struct InitReviewRequest {
    pub gh_pr_url: String,
    pub email: String,
    pub pr_title: String,
    #[serde(default)]
    pub claude_code_session_id: Option<String>,
    #[serde(default)]
    pub content_type: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct InitReviewResponse {
    pub review_id: Uuid,
    pub upload_url: String,
    pub object_key: String,
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct ReviewMetadataResponse {
    pub gh_pr_url: String,
    pub pr_title: String,
}

#[derive(Debug, thiserror::Error)]
pub enum ReviewError {
    #[error("R2 storage not configured")]
    NotConfigured,
    #[error("failed to generate upload URL: {0}")]
    R2Error(#[from] R2Error),
    #[error("rate limit exceeded")]
    RateLimited,
    #[error("unable to determine client IP")]
    MissingClientIp,
    #[error("database error: {0}")]
    Database(#[from] crate::db::reviews::ReviewError),
    #[error("review worker not configured")]
    WorkerNotConfigured,
    #[error("review worker request failed: {0}")]
    WorkerError(#[from] reqwest::Error),
    #[error("invalid review ID")]
    InvalidReviewId,
}

impl IntoResponse for ReviewError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            ReviewError::NotConfigured => (
                StatusCode::SERVICE_UNAVAILABLE,
                "Review upload service not available",
            ),
            ReviewError::R2Error(e) => {
                tracing::error!(error = %e, "R2 presign failed");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Failed to generate upload URL",
                )
            }
            ReviewError::RateLimited => (
                StatusCode::TOO_MANY_REQUESTS,
                "Rate limit exceeded. Try again later.",
            ),
            ReviewError::MissingClientIp => {
                (StatusCode::BAD_REQUEST, "Unable to determine client IP")
            }
            ReviewError::Database(crate::db::reviews::ReviewError::NotFound) => {
                (StatusCode::NOT_FOUND, "Review not found")
            }
            ReviewError::Database(e) => {
                tracing::error!(error = %e, "Database error in review");
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error")
            }
            ReviewError::WorkerNotConfigured => (
                StatusCode::SERVICE_UNAVAILABLE,
                "Review worker service not available",
            ),
            ReviewError::WorkerError(e) => {
                tracing::error!(error = %e, "Review worker request failed");
                (
                    StatusCode::BAD_GATEWAY,
                    "Failed to fetch review from worker",
                )
            }
            ReviewError::InvalidReviewId => (StatusCode::BAD_REQUEST, "Invalid review ID"),
        };

        let body = serde_json::json!({
            "error": message
        });

        (status, Json(body)).into_response()
    }
}

/// Ensures the GitHub URL has the https:// protocol prefix
fn normalize_github_url(url: &str) -> String {
    let url = url.trim();
    if url.starts_with("https://") || url.starts_with("http://") {
        url.to_string()
    } else {
        format!("https://{}", url)
    }
}

/// Extract client IP from headers, with fallbacks for local development
fn extract_client_ip(headers: &HeaderMap) -> Option<IpAddr> {
    // Try Cloudflare header first (production)
    if let Some(ip) = headers
        .get("CF-Connecting-IP")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse().ok())
    {
        return Some(ip);
    }

    // Fallback to X-Forwarded-For (common proxy header)
    if let Some(ip) = headers
        .get("X-Forwarded-For")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.split(',').next()) // Take first IP in chain
        .and_then(|s| s.trim().parse().ok())
    {
        return Some(ip);
    }

    // Fallback to X-Real-IP
    if let Some(ip) = headers
        .get("X-Real-IP")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse().ok())
    {
        return Some(ip);
    }

    // For local development, use localhost
    Some(IpAddr::V4(std::net::Ipv4Addr::LOCALHOST))
}

/// Check rate limits for the given IP address.
/// Limits: 2 reviews per minute, 20 reviews per hour.
async fn check_rate_limit(repo: &ReviewRepository<'_>, ip: IpAddr) -> Result<(), ReviewError> {
    let now = Utc::now();

    // Check minute limit (2 per minute)
    let minute_ago = now - Duration::minutes(1);
    let minute_count = repo.count_since(ip, minute_ago).await?;
    if minute_count >= 2 {
        return Err(ReviewError::RateLimited);
    }

    // Check hour limit (20 per hour)
    let hour_ago = now - Duration::hours(1);
    let hour_count = repo.count_since(ip, hour_ago).await?;
    if hour_count >= 20 {
        return Err(ReviewError::RateLimited);
    }

    Ok(())
}

pub async fn init_review_upload(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<InitReviewRequest>,
) -> Result<Json<InitReviewResponse>, ReviewError> {
    // 1. Generate the review ID upfront (used in both R2 path and DB record)
    let review_id = Uuid::new_v4();

    // 2. Extract IP (required for rate limiting)
    let ip = extract_client_ip(&headers).ok_or(ReviewError::MissingClientIp)?;

    // 3. Check rate limits
    let repo = ReviewRepository::new(state.pool());
    check_rate_limit(&repo, ip).await?;

    // 4. Get R2 service
    let r2 = state.r2().ok_or(ReviewError::NotConfigured)?;

    // 5. Generate presigned URL with review ID in path
    let content_type = payload.content_type.as_deref();
    let upload = r2.create_presigned_upload(review_id, content_type).await?;

    // 6. Normalize the GitHub PR URL to ensure it has https:// prefix
    let normalized_url = normalize_github_url(&payload.gh_pr_url);

    // 7. Insert DB record with the same review ID, storing folder path
    let review = repo
        .create(CreateReviewParams {
            id: review_id,
            gh_pr_url: &normalized_url,
            claude_code_session_id: payload.claude_code_session_id.as_deref(),
            ip_address: ip,
            r2_path: &upload.folder_path,
            email: &payload.email,
            pr_title: &payload.pr_title,
        })
        .await?;

    // 8. Return response with review_id
    Ok(Json(InitReviewResponse {
        review_id: review.id,
        upload_url: upload.upload_url,
        object_key: upload.object_key,
        expires_at: upload.expires_at,
    }))
}

/// Proxy a request to the review worker and return the response.
async fn proxy_to_worker(state: &AppState, path: &str) -> Result<Response, ReviewError> {
    let base_url = state
        .config
        .review_worker_base_url
        .as_ref()
        .ok_or(ReviewError::WorkerNotConfigured)?;

    let url = format!("{}{}", base_url.trim_end_matches('/'), path);

    let response = state.http_client.get(&url).send().await?;

    let status = response.status();
    let headers = response.headers().clone();
    let bytes = response.bytes().await?;

    let mut builder = Response::builder().status(status);

    // Copy relevant headers from the worker response
    if let Some(content_type) = headers.get("content-type") {
        builder = builder.header("content-type", content_type);
    }

    Ok(builder.body(Body::from(bytes)).unwrap())
}

/// Proxy a POST request with JSON body to the review worker
async fn proxy_post_to_worker(
    state: &AppState,
    path: &str,
    body: serde_json::Value,
) -> Result<Response, ReviewError> {
    let base_url = state
        .config
        .review_worker_base_url
        .as_ref()
        .ok_or(ReviewError::WorkerNotConfigured)?;

    let url = format!("{}{}", base_url.trim_end_matches('/'), path);

    let response = state.http_client.post(&url).json(&body).send().await?;

    let status = response.status();
    let headers = response.headers().clone();
    let bytes = response.bytes().await?;

    let mut builder = Response::builder().status(status);

    if let Some(content_type) = headers.get("content-type") {
        builder = builder.header("content-type", content_type);
    }

    Ok(builder.body(Body::from(bytes)).unwrap())
}

/// POST /review/start - Start review processing on worker
pub async fn start_review(
    State(state): State<AppState>,
    Json(body): Json<serde_json::Value>,
) -> Result<Response, ReviewError> {
    proxy_post_to_worker(&state, "/review/start", body).await
}

/// GET /review/:id/status - Get review status from worker
pub async fn get_review_status(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Response, ReviewError> {
    let review_id: Uuid = id.parse().map_err(|_| ReviewError::InvalidReviewId)?;

    // Verify review exists in our database
    let repo = ReviewRepository::new(state.pool());
    let _review = repo.get_by_id(review_id).await?;

    // Proxy to worker
    proxy_to_worker(&state, &format!("/review/{}/status", review_id)).await
}

/// GET /review/:id/metadata - Get PR metadata from database
pub async fn get_review_metadata(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<ReviewMetadataResponse>, ReviewError> {
    let review_id: Uuid = id.parse().map_err(|_| ReviewError::InvalidReviewId)?;

    let repo = ReviewRepository::new(state.pool());
    let review = repo.get_by_id(review_id).await?;

    Ok(Json(ReviewMetadataResponse {
        gh_pr_url: review.gh_pr_url,
        pr_title: review.pr_title,
    }))
}

/// GET /review/:id - Get complete review result from worker
pub async fn get_review(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Response, ReviewError> {
    let review_id: Uuid = id.parse().map_err(|_| ReviewError::InvalidReviewId)?;

    // Verify review exists in our database
    let repo = ReviewRepository::new(state.pool());
    let _review = repo.get_by_id(review_id).await?;

    // Proxy to worker
    proxy_to_worker(&state, &format!("/review/{}", review_id)).await
}

/// GET /review/:id/file/:file_hash - Get file content from worker
pub async fn get_review_file(
    State(state): State<AppState>,
    Path((id, file_hash)): Path<(String, String)>,
) -> Result<Response, ReviewError> {
    let review_id: Uuid = id.parse().map_err(|_| ReviewError::InvalidReviewId)?;

    // Verify review exists in our database
    let repo = ReviewRepository::new(state.pool());
    let _review = repo.get_by_id(review_id).await?;

    // Proxy to worker
    proxy_to_worker(&state, &format!("/review/{}/file/{}", review_id, file_hash)).await
}

/// GET /review/:id/diff - Get diff for review from worker
pub async fn get_review_diff(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Response, ReviewError> {
    let review_id: Uuid = id.parse().map_err(|_| ReviewError::InvalidReviewId)?;

    // Verify review exists in our database
    let repo = ReviewRepository::new(state.pool());
    let _review = repo.get_by_id(review_id).await?;

    // Proxy to worker
    proxy_to_worker(&state, &format!("/review/{}/diff", review_id)).await
}

/// POST /review/:id/success - Called by worker when review completes successfully
/// Sends success notification email to the user, or posts PR comment for webhook reviews
pub async fn review_success(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, ReviewError> {
    let review_id: Uuid = id.parse().map_err(|_| ReviewError::InvalidReviewId)?;

    // Fetch review from database to get email and PR title
    let repo = ReviewRepository::new(state.pool());
    let review = repo.get_by_id(review_id).await?;

    // Mark review as completed
    repo.mark_completed(review_id).await?;

    // Build review URL
    let review_url = format!("{}/review/{}", state.server_public_base_url, review_id);

    // Check if this is a webhook-triggered review
    if review.is_webhook_review() {
        // Post PR comment instead of sending email
        if let Some(github_app) = state.github_app() {
            let comment = format!(
                "## Review Complete\n\n\
                Your review story is ready!\n\n\
                **[View Story]({})**\n\n\
                Comment **!reviewfast** on this PR to re-generate the story.",
                review_url
            );

            let installation_id = review.github_installation_id.unwrap_or(0);
            let pr_owner = review.pr_owner.as_deref().unwrap_or("");
            let pr_repo = review.pr_repo.as_deref().unwrap_or("");
            let pr_number = review.pr_number.unwrap_or(0) as u64;

            if let Err(e) = github_app
                .post_pr_comment(installation_id, pr_owner, pr_repo, pr_number, &comment)
                .await
            {
                tracing::error!(
                    ?e,
                    review_id = %review_id,
                    "Failed to post success comment to PR"
                );
            }
        }
    } else if let Some(email) = &review.email {
        // CLI review - send email notification
        state
            .mailer
            .send_review_ready(email, &review_url, &review.pr_title)
            .await;
    }

    Ok(StatusCode::OK)
}

/// POST /review/:id/failed - Called by worker when review fails
/// Sends failure notification email to the user, or posts PR comment for webhook reviews
pub async fn review_failed(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, ReviewError> {
    let review_id: Uuid = id.parse().map_err(|_| ReviewError::InvalidReviewId)?;

    // Fetch review from database to get email and PR title
    let repo = ReviewRepository::new(state.pool());
    let review = repo.get_by_id(review_id).await?;

    // Mark review as failed
    repo.mark_failed(review_id).await?;

    // Check if this is a webhook-triggered review
    if review.is_webhook_review() {
        // Post PR comment instead of sending email
        if let Some(github_app) = state.github_app() {
            let comment = format!(
                "## Vibe Kanban Review Failed\n\n\
                Unfortunately, the code review could not be completed.\n\n\
                Review ID: `{}`",
                review_id
            );

            let installation_id = review.github_installation_id.unwrap_or(0);
            let pr_owner = review.pr_owner.as_deref().unwrap_or("");
            let pr_repo = review.pr_repo.as_deref().unwrap_or("");
            let pr_number = review.pr_number.unwrap_or(0) as u64;

            if let Err(e) = github_app
                .post_pr_comment(installation_id, pr_owner, pr_repo, pr_number, &comment)
                .await
            {
                tracing::error!(
                    ?e,
                    review_id = %review_id,
                    "Failed to post failure comment to PR"
                );
            }
        }
    } else if let Some(email) = &review.email {
        // CLI review - send email notification
        state
            .mailer
            .send_review_failed(email, &review.pr_title, &review_id.to_string())
            .await;
    }

    Ok(StatusCode::OK)
}
