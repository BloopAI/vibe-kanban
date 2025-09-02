use axum::{
    Router,
    extract::{Request, State},
    http::StatusCode,
    middleware::{Next, from_fn_with_state},
    response::{Json as ResponseJson, Response},
    routing::{get, post},
};
use deployment::Deployment;
use octocrab::auth::Continue;
use serde::{Deserialize, Serialize};
use services::services::{
    auth::{AuthError, DeviceFlowStartResponse},
    config::save_config_to_file,
    github_service::{GitHubService, GitHubServiceError},
};
use utils::response::ApiResponse;

use crate::{DeploymentImpl, error::ApiError};

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    Router::new()
        .route("/auth/github/device/start", post(device_start))
        .route("/auth/github/device/poll", post(device_poll))
        .route("/auth/github/check", get(github_check_token))
        .layer(from_fn_with_state(
            deployment.clone(),
            sentry_user_context_middleware,
        ))
}

/// POST /auth/github/device/start
async fn device_start(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<DeviceFlowStartResponse>>, ApiError> {
    let device_start_response = deployment.auth().device_start().await?;
    Ok(ResponseJson(ApiResponse::success(device_start_response)))
}

#[derive(Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[ts(use_ts_enum)]
pub enum DevicePollStatus {
    SlowDown,
    AuthorizationPending,
    Success,
}

#[derive(Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[ts(use_ts_enum)]
pub enum CheckTokenResponse {
    Valid,
    Invalid,
}

/// POST /auth/github/device/poll
async fn device_poll(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<DevicePollStatus>>, ApiError> {
    let user_info = match deployment.auth().device_poll().await {
        Ok(info) => info,
        Err(AuthError::Pending(Continue::SlowDown)) => {
            return Ok(ResponseJson(ApiResponse::success(
                DevicePollStatus::SlowDown,
            )));
        }
        Err(AuthError::Pending(Continue::AuthorizationPending)) => {
            return Ok(ResponseJson(ApiResponse::success(
                DevicePollStatus::AuthorizationPending,
            )));
        }
        Err(e) => return Err(e.into()),
    };
    // Save to config
    {
        let config_path = utils::assets::config_path();
        let mut config = deployment.config().write().await;
        config.github.username = Some(user_info.username.clone());
        config.github.primary_email = user_info.primary_email.clone();
        config.github.oauth_token = Some(user_info.token.to_string());
        config.github_login_acknowledged = true; // Also acknowledge the GitHub login step
        save_config_to_file(&config.clone(), &config_path).await?;
    }
    let _ = deployment.update_sentry_scope().await;
    let props = serde_json::json!({
        "username": user_info.username,
        "email": user_info.primary_email,
    });
    deployment
        .track_if_analytics_allowed("$identify", props)
        .await;
    Ok(ResponseJson(ApiResponse::success(
        DevicePollStatus::Success,
    )))
}

/// GET /auth/github/check
async fn github_check_token(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<CheckTokenResponse>>, ApiError> {
    let gh_config = deployment.config().read().await.github.clone();
    let Some(token) = gh_config.token() else {
        return Ok(ResponseJson(ApiResponse::success(
            CheckTokenResponse::Invalid,
        )));
    };
    let gh = GitHubService::new(&token)?;
    match gh.check_token().await {
        Ok(()) => Ok(ResponseJson(ApiResponse::success(
            CheckTokenResponse::Valid,
        ))),
        Err(GitHubServiceError::TokenInvalid) => Ok(ResponseJson(ApiResponse::success(
            CheckTokenResponse::Invalid,
        ))),
        Err(e) => Err(e.into()),
    }
}

/// Middleware to set Sentry user context for every request
pub async fn sentry_user_context_middleware(
    State(deployment): State<DeploymentImpl>,
    req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let _ = deployment.update_sentry_scope().await;
    Ok(next.run(req).await)
}
