//! API routes for managing Claude Code OAuth tokens.

use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::Json as ResponseJson,
    routing::{delete, get, post},
};
use db::models::claude_oauth_token::{ClaudeOAuthTokenStatus, UserTokenStatus};
use deployment::Deployment;
use serde::Deserialize;
use ts_rs::TS;
use utils::response::ApiResponse;

use crate::{DeploymentImpl, error::ApiError, middleware::try_get_authenticated_user};

/// Request body for adding/updating a Claude OAuth token
#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct UpsertClaudeTokenRequest {
    /// The raw token from `claude setup-token` output
    pub token: String,
}

/// Get current user's token status
pub async fn get_my_token_status(
    State(deployment): State<DeploymentImpl>,
    headers: HeaderMap,
) -> Result<ResponseJson<ApiResponse<ClaudeOAuthTokenStatus>>, ApiError> {
    let user = try_get_authenticated_user(&deployment, &headers)
        .await
        .ok_or(ApiError::Unauthorized)?;

    let status = deployment
        .claude_token_rotation()
        .get_user_token_status(user.id)
        .await
        .map_err(|e| ApiError::BadRequest(format!("Failed to get token status: {e}")))?;

    Ok(ResponseJson(ApiResponse::success(status)))
}

/// Add or update token for current user
pub async fn upsert_token(
    State(deployment): State<DeploymentImpl>,
    headers: HeaderMap,
    Json(payload): Json<UpsertClaudeTokenRequest>,
) -> Result<ResponseJson<ApiResponse<ClaudeOAuthTokenStatus>>, ApiError> {
    let user = try_get_authenticated_user(&deployment, &headers)
        .await
        .ok_or(ApiError::Unauthorized)?;

    // Basic validation
    if payload.token.trim().is_empty() {
        return Err(ApiError::BadRequest("Token cannot be empty".to_string()));
    }

    if payload.token.len() < 20 {
        return Err(ApiError::BadRequest(
            "Token appears too short. Please paste the complete token from `claude setup-token`"
                .to_string(),
        ));
    }

    let status = deployment
        .claude_token_rotation()
        .upsert_token(user.id, &payload.token)
        .await
        .map_err(|e| ApiError::BadRequest(format!("Failed to save token: {e}")))?;

    Ok(ResponseJson(ApiResponse::success(status)))
}

/// Delete current user's token
pub async fn delete_my_token(
    State(deployment): State<DeploymentImpl>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    let user = try_get_authenticated_user(&deployment, &headers)
        .await
        .ok_or(ApiError::Unauthorized)?;

    deployment
        .claude_token_rotation()
        .delete_user_token(user.id)
        .await
        .map_err(|e| ApiError::BadRequest(format!("Failed to delete token: {e}")))?;

    Ok(StatusCode::NO_CONTENT)
}

/// Get all users' token statuses (for admin view / dashboard)
pub async fn get_all_token_statuses(
    State(deployment): State<DeploymentImpl>,
    headers: HeaderMap,
) -> Result<ResponseJson<ApiResponse<Vec<UserTokenStatus>>>, ApiError> {
    // Require authentication
    let _user = try_get_authenticated_user(&deployment, &headers)
        .await
        .ok_or(ApiError::Unauthorized)?;

    let statuses = deployment
        .claude_token_rotation()
        .get_all_token_statuses()
        .await
        .map_err(|e| ApiError::BadRequest(format!("Failed to get token statuses: {e}")))?;

    Ok(ResponseJson(ApiResponse::success(statuses)))
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/claude-tokens/me", get(get_my_token_status))
        .route("/claude-tokens", post(upsert_token))
        .route("/claude-tokens/me", delete(delete_my_token))
        .route("/claude-tokens/all", get(get_all_token_statuses))
}
