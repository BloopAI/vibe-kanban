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
    config::{save_config_to_file, GitPlatformType},
    github_service::{GitHubService, GitHubServiceError},
    gitea_service::GiteaService,
    git_platform::GitPlatformService,
};
use utils::response::ApiResponse;

use crate::{DeploymentImpl, error::ApiError};

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    Router::new()
        .route("/auth/github/device/start", post(device_start))
        .route("/auth/github/device/poll", post(device_poll))
        .route("/auth/github/check", get(github_check_token))
        .route("/auth/gitea/configure", post(gitea_configure))
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

#[derive(Serialize, Deserialize, ts_rs::TS)]
pub struct GiteaConfigureRequest {
    pub gitea_url: String,
    pub pat: String,
    pub username: Option<String>,
}

#[derive(Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[ts(use_ts_enum)]
pub enum GiteaConfigureResponse {
    Success,
    InvalidUrl,
    InvalidToken,
    Error,
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
        config.git_platform.username = Some(user_info.username.clone());
        config.git_platform.primary_email = user_info.primary_email.clone();
        config.git_platform.oauth_token = Some(user_info.token.to_string());
        config.github_login_acknowledged = true; // Also acknowledge the login step
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

/// POST /auth/gitea/configure - Configure Gitea with PAT
async fn gitea_configure(
    State(deployment): State<DeploymentImpl>,
    axum::Json(payload): axum::Json<GiteaConfigureRequest>,
) -> Result<ResponseJson<ApiResponse<GiteaConfigureResponse>>, ApiError> {
    // Validate URL format
    let gitea_url = payload.gitea_url.trim().trim_end_matches('/');
    if gitea_url.is_empty() || (!gitea_url.starts_with("http://") && !gitea_url.starts_with("https://")) {
        return Ok(ResponseJson(ApiResponse::success(
            GiteaConfigureResponse::InvalidUrl,
        )));
    }

    // Create Gitea service to test the token
    let gitea_service = match GiteaService::new(&payload.pat, gitea_url) {
        Ok(service) => service,
        Err(_) => {
            return Ok(ResponseJson(ApiResponse::success(
                GiteaConfigureResponse::Error,
            )));
        }
    };

    // Test the token by checking its validity
    match gitea_service.check_token().await {
        Ok(()) => {
            // Token is valid, save configuration
            let config_path = utils::assets::config_path();
            let mut config = deployment.config().write().await;

            // Switch to Gitea platform
            config.git_platform.platform_type = GitPlatformType::Gitea;
            config.git_platform.pat = Some(payload.pat.clone());
            config.git_platform.oauth_token = None; // Clear OAuth token
            config.git_platform.gitea_url = Some(gitea_url.to_string());
            config.git_platform.username = payload.username.clone();
            config.github_login_acknowledged = true; // Acknowledge login step

            save_config_to_file(&config.clone(), &config_path).await?;

            let _ = deployment.update_sentry_scope().await;

            // Track analytics
            let props = serde_json::json!({
                "platform": "gitea",
                "gitea_url": gitea_url,
                "username": payload.username,
            });
            deployment
                .track_if_analytics_allowed("onboarding_git_platform_login_completed", props)
                .await;

            Ok(ResponseJson(ApiResponse::success(
                GiteaConfigureResponse::Success,
            )))
        }
        Err(_) => {
            Ok(ResponseJson(ApiResponse::success(
                GiteaConfigureResponse::InvalidToken,
            )))
        }
    }
}

/// GET /auth/github/check - Note: works for both GitHub and Gitea
async fn github_check_token(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<CheckTokenResponse>>, ApiError> {
    let platform_config = deployment.config().read().await.git_platform.clone();
    let Some(token) = platform_config.token() else {
        return Ok(ResponseJson(ApiResponse::success(
            CheckTokenResponse::Invalid,
        )));
    };

    // Check token validity for the configured platform
    let result = match platform_config.platform_type {
        services::services::config::GitPlatformType::GitHub => {
            let gh = GitHubService::new(&token)?;
            gh.check_token().await.map_err(|e| e.into())
        }
        services::services::config::GitPlatformType::Gitea => {
            if let Some(gitea_url) = platform_config.gitea_url {
                let gitea = services::services::gitea_service::GiteaService::new(&token, &gitea_url)?;
                gitea.check_token().await.map_err(|e| e.into())
            } else {
                return Ok(ResponseJson(ApiResponse::success(CheckTokenResponse::Invalid)));
            }
        }
    };

    match result {
        Ok(()) => Ok(ResponseJson(ApiResponse::success(CheckTokenResponse::Valid))),
        Err(GitHubServiceError::TokenInvalid) | Err(_) => Ok(ResponseJson(ApiResponse::success(CheckTokenResponse::Invalid))),
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
