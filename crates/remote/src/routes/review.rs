use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::post,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::{AppState, r2::R2Error};

pub fn public_router() -> Router<AppState> {
    Router::new().route("/review/init", post(init_review_upload))
}

#[derive(Debug, Deserialize)]
pub struct InitReviewRequest {
    #[serde(default)]
    pub content_type: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct InitReviewResponse {
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
        };

        let body = serde_json::json!({
            "error": message
        });

        (status, Json(body)).into_response()
    }
}

pub async fn init_review_upload(
    State(state): State<AppState>,
    Json(payload): Json<InitReviewRequest>,
) -> Result<Json<InitReviewResponse>, ReviewError> {
    let r2 = state.r2().ok_or(ReviewError::NotConfigured)?;

    let content_type = payload.content_type.as_deref();
    let upload = r2.create_presigned_upload(content_type).await?;

    Ok(Json(InitReviewResponse {
        upload_url: upload.upload_url,
        object_key: upload.object_key,
        expires_at: upload.expires_at,
    }))
}
