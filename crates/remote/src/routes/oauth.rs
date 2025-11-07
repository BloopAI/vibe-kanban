use axum::{
    Json,
    extract::{Extension, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tracing::warn;
use uuid::Uuid;

use crate::{
    AppState,
    api::oauth::GitHubTokenResponse,
    auth::{DeviceFlowError, DeviceFlowPollStatus, RequestContext},
    db::github::GitHubAccountRepository,
};

#[derive(Debug, Deserialize)]
pub struct DeviceInitRequest {
    pub provider: String,
}

#[derive(Debug, Serialize)]
pub struct DeviceInitResponse {
    pub verification_uri: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verification_uri_complete: Option<String>,
    pub user_code: String,
    pub handoff_id: Uuid,
}

#[derive(Debug, Deserialize)]
pub struct DevicePollRequest {
    pub handoff_id: Uuid,
}

#[derive(Debug, Serialize)]
pub struct DevicePollResponse {
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub access_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ProfileResponse {
    pub user_id: String,
    pub username: Option<String>,
    pub email: String,
    pub organization_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub github_login: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
}

pub async fn device_init(
    State(state): State<AppState>,
    Json(payload): Json<DeviceInitRequest>,
) -> Response {
    let device_flow = state.device_flow();

    match device_flow.initiate(&payload.provider).await {
        Ok(response) => {
            let body = DeviceInitResponse {
                verification_uri: response.verification_uri,
                verification_uri_complete: response.verification_uri_complete,
                user_code: response.user_code,
                handoff_id: response.handoff_id,
            };
            (StatusCode::OK, Json(body)).into_response()
        }
        Err(DeviceFlowError::UnsupportedProvider(_)) => (
            StatusCode::BAD_REQUEST,
            Json(DevicePollResponse {
                status: "error".to_string(),
                access_token: None,
                error: Some("unsupported_provider".to_string()),
            }),
        )
            .into_response(),
        Err(error) => {
            warn!(?error, "failed to initiate device authorization");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(DevicePollResponse {
                    status: "error".to_string(),
                    access_token: None,
                    error: Some("internal_error".to_string()),
                }),
            )
                .into_response()
        }
    }
}

pub async fn device_poll(
    State(state): State<AppState>,
    Json(payload): Json<DevicePollRequest>,
) -> Response {
    let device_flow = state.device_flow();

    match device_flow.poll(payload.handoff_id).await {
        Ok(response) => {
            let status = match response.status {
                DeviceFlowPollStatus::Pending => "pending",
                DeviceFlowPollStatus::Success => "success",
                DeviceFlowPollStatus::Error => "error",
            };

            (
                StatusCode::OK,
                Json(DevicePollResponse {
                    status: status.to_string(),
                    access_token: response.access_token,
                    error: response.error,
                }),
            )
                .into_response()
        }
        Err(error) => poll_error_response(error),
    }
}

fn poll_error_response(error: DeviceFlowError) -> Response {
    fn internal_error<E: std::fmt::Debug>(err: E) -> Response {
        warn!(?err, "internal error during device poll");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(DevicePollResponse {
                status: "error".to_string(),
                access_token: None,
                error: Some("internal_error".to_string()),
            }),
        )
            .into_response()
    }

    match error {
        DeviceFlowError::NotFound => (
            StatusCode::NOT_FOUND,
            Json(DevicePollResponse {
                status: "error".to_string(),
                access_token: None,
                error: Some("not_found".to_string()),
            }),
        )
            .into_response(),
        DeviceFlowError::Expired => (
            StatusCode::GONE,
            Json(DevicePollResponse {
                status: "error".to_string(),
                access_token: None,
                error: Some("expired".to_string()),
            }),
        )
            .into_response(),
        DeviceFlowError::Denied => (
            StatusCode::FORBIDDEN,
            Json(DevicePollResponse {
                status: "error".to_string(),
                access_token: None,
                error: Some("access_denied".to_string()),
            }),
        )
            .into_response(),
        DeviceFlowError::Failed(reason) => (
            StatusCode::BAD_REQUEST,
            Json(DevicePollResponse {
                status: "error".to_string(),
                access_token: None,
                error: Some(reason),
            }),
        )
            .into_response(),
        DeviceFlowError::UnsupportedProvider(_) => (
            StatusCode::BAD_REQUEST,
            Json(DevicePollResponse {
                status: "error".to_string(),
                access_token: None,
                error: Some("unsupported_provider".to_string()),
            }),
        )
            .into_response(),
        DeviceFlowError::Provider(err) => {
            warn!(?err, "provider error during device poll");
            (
                StatusCode::BAD_GATEWAY,
                Json(DevicePollResponse {
                    status: "error".to_string(),
                    access_token: None,
                    error: Some("provider_error".to_string()),
                }),
            )
                .into_response()
        }
        DeviceFlowError::Database(err) => internal_error(err),
        DeviceFlowError::Identity(err) => internal_error(err),
        DeviceFlowError::GitHubAccount(err) => internal_error(err),
        DeviceFlowError::Session(err) => internal_error(err),
        DeviceFlowError::Jwt(err) => internal_error(err),
        DeviceFlowError::Authorization(err) => internal_error(err),
    }
}

pub async fn github_token(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
) -> Response {
    let repo = GitHubAccountRepository::new(state.pool());

    match repo.get_by_user_id(&ctx.user.id).await {
        Ok(Some(account)) => {
            let expires_at = account.token_expires_at.map(|ts| ts.timestamp());
            let response = GitHubTokenResponse {
                access_token: account.access_token,
                expires_at,
                scopes: account.scopes,
            };
            (StatusCode::OK, Json(response)).into_response()
        }
        Ok(None) => (
            StatusCode::PRECONDITION_FAILED,
            Json(json!({ "error": "github account not linked" })),
        )
            .into_response(),
        Err(err) => {
            warn!(?err, "failed to fetch GitHub token");
            (
                StatusCode::BAD_GATEWAY,
                Json(json!({ "error": "failed to retrieve GitHub token" })),
            )
                .into_response()
        }
    }
}

pub async fn profile(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
) -> Json<ProfileResponse> {
    let repo = GitHubAccountRepository::new(state.pool());
    let account = repo.get_by_user_id(&ctx.user.id).await.ok().flatten();

    Json(ProfileResponse {
        user_id: ctx.user.id.clone(),
        username: ctx.user.username.clone(),
        email: ctx.user.email.clone(),
        organization_id: ctx.organization.id.clone(),
        github_login: account.as_ref().map(|account| account.login.clone()),
        avatar_url: account.and_then(|account| account.avatar_url),
    })
}
