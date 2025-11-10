use axum::{
    Router,
    extract::{Json, Query, State},
    http::StatusCode,
    response::Json as ResponseJson,
    routing::{get, post},
};
use deployment::Deployment;
use serde::{Deserialize, Serialize};
use services::services::{oauth_credentials::Credentials, remote_client::DevicePollResult};
use utils::{
    api::oauth::{DeviceInitResponse, ProfileResponse},
    response::ApiResponse,
};
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/auth/device-init", post(device_init))
        .route("/auth/device-poll", post(device_poll))
        .route("/auth/logout", post(logout))
        .route("/auth/status", get(status))
}

#[derive(Debug, Deserialize)]
struct DeviceInitQuery {
    provider: String,
}

async fn device_init(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<DeviceInitQuery>,
) -> Result<ResponseJson<ApiResponse<DeviceInitResponse>>, ApiError> {
    let remote_client = deployment
        .remote_client()
        .ok_or_else(|| ApiError::Conflict("OAuth remote client not configured".to_string()))?;

    let response = remote_client
        .device_init(&query.provider)
        .await
        .map_err(|e| {
            tracing::error!(?e, "failed to initiate device flow");
            ApiError::Conflict(format!("Failed to initiate OAuth: {}", e))
        })?;

    Ok(ResponseJson(ApiResponse::success(response)))
}

#[derive(Debug, Deserialize)]
struct DevicePollRequest {
    handoff_id: Uuid,
}

#[derive(Debug, Serialize)]
#[serde(tag = "status", rename_all = "lowercase")]
enum DevicePollResponseData {
    Pending,
    Success { profile: ProfileResponse },
    Error { code: String },
}

async fn device_poll(
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<DevicePollRequest>,
) -> Result<ResponseJson<ApiResponse<DevicePollResponseData>>, ApiError> {
    let remote_client = deployment
        .remote_client()
        .ok_or_else(|| ApiError::Conflict("OAuth remote client not configured".to_string()))?;

    let result = remote_client
        .device_poll(request.handoff_id)
        .await
        .map_err(|e| {
            tracing::error!(?e, "failed to poll device flow");
            ApiError::Conflict(format!("Failed to poll OAuth: {}", e))
        })?;

    match result {
        DevicePollResult::Pending => Ok(ResponseJson(ApiResponse::success(
            DevicePollResponseData::Pending,
        ))),
        DevicePollResult::Success { access_token } => {
            let credentials = Credentials {
                access_token: access_token.clone(),
            };

            deployment
                .auth_context()
                .save_credentials(&credentials)
                .await
                .map_err(|e| {
                    tracing::error!(?e, "failed to save credentials");
                    ApiError::Io(e)
                })?;

            let profile = remote_client.profile(&access_token).await.map_err(|e| {
                tracing::warn!(?e, "failed to fetch profile after successful auth");
                ApiError::Conflict(format!("Failed to fetch profile: {}", e))
            })?;

            deployment.auth_context().set_profile(profile.clone()).await;

            Ok(ResponseJson(ApiResponse::success(
                DevicePollResponseData::Success { profile },
            )))
        }
        DevicePollResult::Error { code } => Ok(ResponseJson(ApiResponse::success(
            DevicePollResponseData::Error {
                code: format!("{:?}", code),
            },
        ))),
    }
}

async fn logout(State(deployment): State<DeploymentImpl>) -> Result<StatusCode, ApiError> {
    deployment
        .auth_context()
        .clear_credentials()
        .await
        .map_err(|e| {
            tracing::error!(?e, "failed to clear credentials");
            ApiError::Io(e)
        })?;

    deployment.auth_context().clear_profile().await;

    Ok(StatusCode::NO_CONTENT)
}

#[derive(Debug, Serialize)]
struct StatusResponse {
    logged_in: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    profile: Option<ProfileResponse>,
    #[serde(skip_serializing_if = "Option::is_none")]
    degraded: Option<bool>,
}

async fn status(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<StatusResponse>>, ApiError> {
    use utils::api::oauth::LoginStatus;

    match deployment.get_login_status().await {
        LoginStatus::LoggedOut => Ok(ResponseJson(ApiResponse::success(StatusResponse {
            logged_in: false,
            profile: None,
            degraded: None,
        }))),
        LoginStatus::LoggedIn { profile } => {
            Ok(ResponseJson(ApiResponse::success(StatusResponse {
                logged_in: true,
                profile: Some(profile),
                degraded: None,
            })))
        }
    }
}
