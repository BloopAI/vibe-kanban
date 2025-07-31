use axum::{
    extract::{Request, State},
    http::StatusCode,
    middleware::{from_fn_with_state, Next},
    response::{Json as ResponseJson, Response},
    routing::{get, post},
    Router,
};
use deployment::{Deployment, DeploymentError};
use services::services::auth::{AuthError, DeviceFlowStartResponse};
use utils::response::ApiResponse;

use crate::{error::ApiError, DeploymentImpl};

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

/// POST /auth/github/device/poll
async fn device_poll(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<String>>, ApiError> {
    let user_info = match deployment.auth().device_poll().await {
        Ok(info) => info,
        Err(AuthError::Pending) => {
            return Ok(ResponseJson(ApiResponse::error(
                "Device flow pending".into(),
            )));
        }
        Err(AuthError::DeviceFlowNotStarted) => {
            return Ok(ResponseJson(ApiResponse::error(
                "Device flow not started".into(),
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
        config.github.token = Some(user_info.token.to_string());
        config.github_login_acknowledged = true; // Also acknowledge the GitHub login step
        config
            .save(&config_path)
            .map_err(|e| DeploymentError::Other(e))?;
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
        "GitHub login successful".to_string(),
    )))
}

/// GET /auth/github/check
async fn github_check_token(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let config = deployment.config().read().await;
    let token = config.github.token.clone();
    drop(config);
    match deployment.auth().check_token(token.as_deref()).await {
        Ok(_) => Ok(ResponseJson(ApiResponse::success(()))),
        Err(AuthError::InvalidAccessToken) => Ok(ResponseJson(ApiResponse::error(
            "Invalid access token".into(),
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
