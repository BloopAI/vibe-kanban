use std::borrow::Cow;

use axum::{
    Json, Router,
    extract::{Extension, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde_json::json;
use tracing::warn;
use utils::api::oauth::{
    DeviceInitRequest, DeviceInitResponse, DevicePollRequest, DevicePollResponse, ProfileResponse,
    ProviderProfile,
};

use crate::{
    AppState,
    auth::{DeviceFlowError, DeviceFlowPollStatus, RequestContext},
    db::oauth_accounts::OAuthAccountRepository,
};

pub fn public_router() -> Router<AppState> {
    Router::new()
        .route("/oauth/device/init", post(device_init))
        .route("/oauth/device/poll", post(device_poll))
}

pub fn protected_router() -> Router<AppState> {
    Router::new().route("/profile", get(profile))
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
        Err(error) => init_error_response(error),
    }
}

fn init_error_response(error: DeviceFlowError) -> Response {
    match &error {
        DeviceFlowError::Provider(err) => warn!(?err, "provider error during device init"),
        DeviceFlowError::NotFound
        | DeviceFlowError::Expired
        | DeviceFlowError::Denied
        | DeviceFlowError::Failed(_)
        | DeviceFlowError::Database(_)
        | DeviceFlowError::Identity(_)
        | DeviceFlowError::OAuthAccount(_)
        | DeviceFlowError::Session(_)
        | DeviceFlowError::Jwt(_)
        | DeviceFlowError::Authorization(_) => {
            warn!(?error, "failed to initiate device authorization")
        }
        DeviceFlowError::UnsupportedProvider(_) => {}
    }

    let (default_status, default_code) = classify_device_flow_error(&error);

    match error {
        DeviceFlowError::UnsupportedProvider(_) | DeviceFlowError::Provider(_) => {
            let code = default_code.into_owned();
            (default_status, Json(json!({ "error": code }))).into_response()
        }
        _ => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "internal_error" })),
        )
            .into_response(),
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
    match &error {
        DeviceFlowError::Provider(err) => warn!(?err, "provider error during device poll"),
        DeviceFlowError::Database(err) => warn!(?err, "internal error during device poll"),
        DeviceFlowError::Identity(err) => warn!(?err, "internal error during device poll"),
        DeviceFlowError::OAuthAccount(err) => warn!(?err, "internal error during device poll"),
        DeviceFlowError::Session(err) => warn!(?err, "internal error during device poll"),
        DeviceFlowError::Jwt(err) => warn!(?err, "internal error during device poll"),
        DeviceFlowError::Authorization(err) => {
            warn!(?err, "device authorization error")
        }
        _ => {}
    }

    let (status, error_code) = classify_device_flow_error(&error);
    let error_code = error_code.into_owned();

    (
        status,
        Json(DevicePollResponse {
            status: "error".to_string(),
            access_token: None,
            error: Some(error_code),
        }),
    )
        .into_response()
}

fn classify_device_flow_error(error: &DeviceFlowError) -> (StatusCode, Cow<'_, str>) {
    match error {
        DeviceFlowError::UnsupportedProvider(_) => (
            StatusCode::BAD_REQUEST,
            Cow::Borrowed("unsupported_provider"),
        ),
        DeviceFlowError::Provider(_) => (StatusCode::BAD_GATEWAY, Cow::Borrowed("provider_error")),
        DeviceFlowError::NotFound => (StatusCode::NOT_FOUND, Cow::Borrowed("not_found")),
        DeviceFlowError::Expired => (StatusCode::GONE, Cow::Borrowed("expired")),
        DeviceFlowError::Denied => (StatusCode::FORBIDDEN, Cow::Borrowed("access_denied")),
        DeviceFlowError::Failed(reason) => (StatusCode::BAD_REQUEST, Cow::Owned(reason.clone())),
        DeviceFlowError::Database(_) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Cow::Borrowed("internal_error"),
        ),
        DeviceFlowError::Identity(_) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Cow::Borrowed("internal_error"),
        ),
        DeviceFlowError::OAuthAccount(_) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Cow::Borrowed("internal_error"),
        ),
        DeviceFlowError::Session(_) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Cow::Borrowed("internal_error"),
        ),
        DeviceFlowError::Jwt(_) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Cow::Borrowed("internal_error"),
        ),
        DeviceFlowError::Authorization(_) => {
            (StatusCode::BAD_GATEWAY, Cow::Borrowed("provider_error"))
        }
    }
}

pub async fn profile(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
) -> Json<ProfileResponse> {
    let repo = OAuthAccountRepository::new(state.pool());
    let providers = repo
        .list_by_user(&ctx.user.id)
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|account| ProviderProfile {
            provider: account.provider,
            username: account.username,
            display_name: account.display_name,
            email: account.email,
            avatar_url: account.avatar_url,
        })
        .collect();

    Json(ProfileResponse {
        user_id: ctx.user.id.clone(),
        username: ctx.user.username.clone(),
        email: ctx.user.email.clone(),
        organization_id: ctx.organization.id.clone(),
        providers,
    })
}
