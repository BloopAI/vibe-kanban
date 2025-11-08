use axum::{
    Router,
    extract::{Json, Query, State},
    http::StatusCode,
    response::Json as ResponseJson,
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use services::services::{
    oauth_credentials::Credentials,
    remote_client::{DevicePollResult, RemoteClientError},
};
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
                .oauth_credentials()
                .save(&credentials)
                .await
                .map_err(|e| {
                    tracing::error!(?e, "failed to save credentials");
                    ApiError::Io(e)
                })?;

            let profile = remote_client.profile(&access_token).await.map_err(|e| {
                tracing::warn!(?e, "failed to fetch profile after successful auth");
                ApiError::Conflict(format!("Failed to fetch profile: {}", e))
            })?;

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
    deployment.oauth_credentials().clear().await.map_err(|e| {
        tracing::error!(?e, "failed to clear credentials");
        ApiError::Io(e)
    })?;

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
    let credentials = deployment.oauth_credentials().get().await;

    let Some(creds) = credentials else {
        return Ok(ResponseJson(ApiResponse::success(StatusResponse {
            logged_in: false,
            profile: None,
            degraded: None,
        })));
    };

    let remote_client = deployment
        .remote_client()
        .ok_or_else(|| ApiError::Conflict("OAuth remote client not configured".to_string()))?;

    match remote_client.profile(&creds.access_token).await {
        Ok(profile) => Ok(ResponseJson(ApiResponse::success(StatusResponse {
            logged_in: true,
            profile: Some(profile),
            degraded: None,
        }))),
        Err(RemoteClientError::Auth) => {
            tracing::info!("credentials invalid, clearing");
            let _ = deployment.oauth_credentials().clear().await;
            Ok(ResponseJson(ApiResponse::success(StatusResponse {
                logged_in: false,
                profile: None,
                degraded: None,
            })))
        }
        Err(e) if e.should_retry() => {
            tracing::warn!(
                ?e,
                "transient error fetching profile, not clearing credentials"
            );
            Ok(ResponseJson(ApiResponse::success(StatusResponse {
                logged_in: true,
                profile: None,
                degraded: Some(true),
            })))
        }
        Err(e) => {
            tracing::error!(?e, "unexpected error fetching profile");
            Err(ApiError::Conflict(format!(
                "Failed to fetch profile: {}",
                e
            )))
        }
    }
}
