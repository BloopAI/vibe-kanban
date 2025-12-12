use std::net::IpAddr;

use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::post,
};
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{AppState, db::reviews::ReviewRepository, r2::R2Error};

pub fn public_router() -> Router<AppState> {
    Router::new().route("/review/init", post(init_review_upload))
}

#[derive(Debug, Deserialize)]
pub struct InitReviewRequest {
    pub gh_pr_url: String,
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
            ReviewError::Database(e) => {
                tracing::error!(error = %e, "Database error in review");
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error")
            }
        };

        let body = serde_json::json!({
            "error": message
        });

        (status, Json(body)).into_response()
    }
}

/// Extract client IP from Cloudflare's CF-Connecting-IP header
fn extract_client_ip(headers: &HeaderMap) -> Option<IpAddr> {
    headers
        .get("CF-Connecting-IP")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse().ok())
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
    // 1. Extract IP (required for rate limiting)
    let ip = extract_client_ip(&headers).ok_or(ReviewError::MissingClientIp)?;

    // 2. Check rate limits
    let repo = ReviewRepository::new(state.pool());
    check_rate_limit(&repo, ip).await?;

    // 3. Get R2 service
    let r2 = state.r2().ok_or(ReviewError::NotConfigured)?;

    // 4. Generate presigned URL
    let content_type = payload.content_type.as_deref();
    let upload = r2.create_presigned_upload(content_type).await?;

    // 5. Insert DB record
    let review = repo
        .create(
            &payload.gh_pr_url,
            payload.claude_code_session_id.as_deref(),
            ip,
            &upload.object_key,
        )
        .await?;

    // 6. Return response with review_id
    Ok(Json(InitReviewResponse {
        review_id: review.id,
        upload_url: upload.upload_url,
        object_key: upload.object_key,
        expires_at: upload.expires_at,
    }))
}
