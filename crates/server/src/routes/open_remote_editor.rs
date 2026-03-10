use std::time::{SystemTime, UNIX_EPOCH};

use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::post,
};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use deployment::Deployment;
use ed25519_dalek::Signer;
use serde::{Deserialize, Serialize};
use trusted_key_auth::refresh::build_refresh_message;
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{
    DeploymentImpl,
    relay::{
        api::{RelayApiClient, get_signed_relay_api},
        relay_session_url,
    },
    routes::relay_auth::{RefreshRelaySigningSessionRequest, RefreshRelaySigningSessionResponse},
};

pub fn router() -> Router<DeploymentImpl> {
    Router::new().route(
        "/open-remote-editor/workspace",
        post(open_remote_workspace_in_editor),
    )
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct OpenRemoteWorkspaceInEditorRequest {
    pub host_id: Uuid,
    pub workspace_id: Uuid,
    #[serde(default)]
    pub editor_type: Option<String>,
    #[serde(default)]
    pub file_path: Option<String>,
}

pub async fn open_remote_workspace_in_editor(
    State(deployment): State<DeploymentImpl>,
    Json(req): Json<OpenRemoteWorkspaceInEditorRequest>,
) -> Response {
    let host_signing = match get_host_signing_info(&deployment, req.host_id).await {
        Ok(info) => info,
        Err(response) => return response,
    };

    let signing_key = deployment.relay_signing().signing_key().clone();

    let mut remote_session =
        match get_or_create_cached_relay_remote_session(&deployment, req.host_id).await {
            Ok(remote_session) => remote_session,
            Err(error) => {
                tracing::warn!(
                    ?error,
                    host_id = %req.host_id,
                    "Failed to create relay session for remote editor open"
                );
                return (
                    StatusCode::BAD_REQUEST,
                    Json(ApiResponse::<
                        desktop_bridge::service::OpenRemoteEditorResponse,
                    >::error(
                        "Failed to create relay session for host"
                    )),
                )
                    .into_response();
            }
        };

    let mut signing_session_id = match get_or_refresh_cached_signing_session(
        &deployment,
        req.host_id,
        host_signing.client_id,
        &signing_key,
        &remote_session,
        false,
    )
    .await
    {
        Ok(signing_session_id) => signing_session_id,
        Err(error) => {
            tracing::warn!(
                ?error,
                host_id = %req.host_id,
                "Failed to initialize relay signing session for remote editor open"
            );
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<
                    desktop_bridge::service::OpenRemoteEditorResponse,
                >::error(
                    "Failed to initialize signing session for host"
                )),
            )
                .into_response();
        }
    };

    let editor_path_api_path =
        build_workspace_editor_path_api_path(req.workspace_id, req.file_path.as_deref());

    let editor_path: RelayEditorPathResponse = match fetch_relay_editor_path(
        req.host_id,
        remote_session.id,
        &editor_path_api_path,
        &signing_key,
        &signing_session_id,
    )
    .await
    {
        Ok(path) => path,
        Err(first_error) => {
            tracing::warn!(
                ?first_error,
                host_id = %req.host_id,
                workspace_id = %req.workspace_id,
                "Failed to resolve workspace editor path; refreshing signing session and retrying"
            );

            signing_session_id = match get_or_refresh_cached_signing_session(
                &deployment,
                req.host_id,
                host_signing.client_id,
                &signing_key,
                &remote_session,
                true,
            )
            .await
            {
                Ok(signing_session_id) => signing_session_id,
                Err(error) => {
                    tracing::warn!(
                        ?error,
                        host_id = %req.host_id,
                        "Failed to refresh signing session for remote editor open"
                    );
                    return (
                        StatusCode::BAD_REQUEST,
                        Json(ApiResponse::<
                            desktop_bridge::service::OpenRemoteEditorResponse,
                        >::error(
                            "Failed to initialize signing session for host"
                        )),
                    )
                        .into_response();
                }
            };

            let second_attempt = fetch_relay_editor_path(
                req.host_id,
                remote_session.id,
                &editor_path_api_path,
                &signing_key,
                &signing_session_id,
            )
            .await;
            match second_attempt {
                Ok(path) => path,
                Err(second_error) => {
                    tracing::warn!(
                        ?second_error,
                        host_id = %req.host_id,
                        workspace_id = %req.workspace_id,
                        "Failed to resolve workspace editor path after signing refresh; refreshing relay session"
                    );

                    deployment
                        .invalidate_cached_relay_remote_session_id(req.host_id)
                        .await;
                    remote_session =
                        match create_relay_remote_session(&deployment, req.host_id).await {
                            Ok(remote_session) => {
                                deployment
                                    .cache_relay_remote_session_id(req.host_id, remote_session.id)
                                    .await;
                                remote_session
                            }
                            Err(error) => {
                                tracing::warn!(
                                    ?error,
                                    host_id = %req.host_id,
                                    "Failed to refresh relay session for remote editor open"
                                );
                                return (
                                    StatusCode::BAD_REQUEST,
                                    Json(ApiResponse::<
                                        desktop_bridge::service::OpenRemoteEditorResponse,
                                    >::error(
                                        "Failed to create relay session for host"
                                    )),
                                )
                                    .into_response();
                            }
                        };

                    match fetch_relay_editor_path(
                        req.host_id,
                        remote_session.id,
                        &editor_path_api_path,
                        &signing_key,
                        &signing_session_id,
                    )
                    .await
                    {
                        Ok(path) => path,
                        Err(error) => {
                            tracing::warn!(
                                ?error,
                                host_id = %req.host_id,
                                workspace_id = %req.workspace_id,
                                "Failed to resolve workspace editor path"
                            );
                            return (
                                StatusCode::BAD_REQUEST,
                                Json(ApiResponse::<
                                    desktop_bridge::service::OpenRemoteEditorResponse,
                                >::error(
                                    "Failed to resolve editor path for host workspace"
                                )),
                            )
                                .into_response();
                        }
                    }
                }
            }
        }
    };

    let relay_url = match relay_session_url(req.host_id, remote_session.id) {
        Some(url) => url,
        None => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::<
                    desktop_bridge::service::OpenRemoteEditorResponse,
                >::error(
                    "VK_SHARED_RELAY_API_BASE is not configured"
                )),
            )
                .into_response();
        }
    };

    let local_port = match deployment
        .tunnel_manager()
        .get_or_create_ssh_tunnel(
            req.host_id,
            &relay_url,
            &signing_key,
            &signing_session_id,
            host_signing.server_verify_key,
        )
        .await
    {
        Ok(port) => port,
        Err(error) => {
            tracing::error!(?error, "Failed to create SSH tunnel");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::<
                    desktop_bridge::service::OpenRemoteEditorResponse,
                >::error(&error.to_string())),
            )
                .into_response();
        }
    };

    match desktop_bridge::service::open_remote_editor(
        local_port,
        &signing_key,
        &req.host_id.to_string(),
        &editor_path.workspace_path,
        req.editor_type.as_deref(),
    ) {
        Ok(response) => (
            StatusCode::OK,
            Json(ApiResponse::<
                desktop_bridge::service::OpenRemoteEditorResponse,
            >::success(response)),
        )
            .into_response(),
        Err(error) => {
            tracing::error!(?error, "Open remote editor failed");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::<
                    desktop_bridge::service::OpenRemoteEditorResponse,
                >::error(&error.to_string())),
            )
                .into_response()
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
struct RelayEditorPathResponse {
    workspace_path: String,
}

fn build_workspace_editor_path_api_path(workspace_id: Uuid, file_path: Option<&str>) -> String {
    let base = format!("/api/workspaces/{workspace_id}/integration/editor/path");
    let Some(file_path) = file_path.filter(|value| !value.is_empty()) else {
        return base;
    };

    let query = url::form_urlencoded::Serializer::new(String::new())
        .append_pair("file_path", file_path)
        .finish();
    format!("{base}?{query}")
}

async fn fetch_relay_editor_path(
    host_id: Uuid,
    relay_session_id: Uuid,
    api_path: &str,
    signing_key: &ed25519_dalek::SigningKey,
    signing_session_id: &str,
) -> anyhow::Result<RelayEditorPathResponse> {
    get_signed_relay_api(
        host_id,
        relay_session_id,
        api_path,
        signing_key,
        signing_session_id,
    )
    .await
}

async fn get_or_refresh_cached_signing_session(
    deployment: &DeploymentImpl,
    host_id: Uuid,
    client_id: Uuid,
    signing_key: &ed25519_dalek::SigningKey,
    remote_session: &crate::relay::api::RemoteSession,
    force_refresh: bool,
) -> anyhow::Result<String> {
    if !force_refresh
        && let Some(signing_session_id) = deployment
            .get_cached_relay_signing_session_id(host_id)
            .await
    {
        return Ok(signing_session_id);
    }

    let remote_client = deployment.remote_client()?;
    let access_token = remote_client.access_token().await?;
    let relay_client = RelayApiClient::new(access_token);
    let refreshed =
        refresh_signing_session(&relay_client, remote_session, signing_key, client_id).await?;
    let signing_session_id = refreshed.signing_session_id.to_string();
    deployment
        .cache_relay_signing_session_id(host_id, signing_session_id.clone())
        .await;
    Ok(signing_session_id)
}

async fn refresh_signing_session(
    relay_client: &RelayApiClient,
    remote_session: &crate::relay::api::RemoteSession,
    signing_key: &ed25519_dalek::SigningKey,
    client_id: Uuid,
) -> anyhow::Result<RefreshRelaySigningSessionResponse> {
    let timestamp = unix_timestamp_now()?;
    let nonce = Uuid::new_v4().simple().to_string();
    let refresh_message = build_refresh_message(timestamp, &nonce, client_id);
    let signature_b64 =
        BASE64_STANDARD.encode(signing_key.sign(refresh_message.as_bytes()).to_bytes());

    let payload = RefreshRelaySigningSessionRequest {
        client_id,
        timestamp,
        nonce,
        signature_b64,
    };

    relay_client
        .post_session_api(
            remote_session,
            "/api/relay-auth/server/signing-session/refresh",
            &payload,
        )
        .await
}

fn unix_timestamp_now() -> anyhow::Result<i64> {
    let duration = SystemTime::now().duration_since(UNIX_EPOCH)?;
    Ok(duration.as_secs() as i64)
}

async fn get_or_create_cached_relay_remote_session(
    deployment: &DeploymentImpl,
    host_id: Uuid,
) -> anyhow::Result<crate::relay::api::RemoteSession> {
    if let Some(session_id) = deployment.get_cached_relay_remote_session_id(host_id).await {
        return Ok(crate::relay::api::RemoteSession {
            host_id,
            id: session_id,
        });
    }

    let remote_session = create_relay_remote_session(deployment, host_id).await?;
    deployment
        .cache_relay_remote_session_id(host_id, remote_session.id)
        .await;
    Ok(remote_session)
}

async fn create_relay_remote_session(
    deployment: &DeploymentImpl,
    host_id: Uuid,
) -> anyhow::Result<crate::relay::api::RemoteSession> {
    let remote_client = deployment.remote_client()?;
    let access_token = remote_client.access_token().await?;
    let relay_client = RelayApiClient::new(access_token);
    relay_client.create_session(host_id).await
}

struct HostSigningInfo {
    client_id: Uuid,
    server_verify_key: ed25519_dalek::VerifyingKey,
}

async fn get_host_signing_info(
    deployment: &DeploymentImpl,
    host_id: Uuid,
) -> Result<HostSigningInfo, Response> {
    let Some(credentials) = deployment.get_relay_host_credentials(host_id).await else {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::<
                desktop_bridge::service::OpenRemoteEditorResponse,
            >::error(&format!(
                "Open-in-IDE credentials are unavailable for host '{host_id}'"
            ))),
        )
            .into_response());
    };

    let server_verify_key = credentials
        .server_public_key_b64
        .as_deref()
        .and_then(|key| trusted_key_auth::trusted_keys::parse_public_key_base64(key).ok())
        .ok_or_else(|| {
            (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<
                    desktop_bridge::service::OpenRemoteEditorResponse,
                >::error(
                    "Host pairing is missing signing metadata. Re-pair it."
                )),
            )
                .into_response()
        })?;

    let client_id = credentials
        .client_id
        .as_ref()
        .and_then(|value| value.parse::<Uuid>().ok())
        .ok_or_else(|| {
            (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<
                    desktop_bridge::service::OpenRemoteEditorResponse,
                >::error(
                    "Host pairing is missing client metadata. Re-pair it."
                )),
            )
                .into_response()
        })?;

    Ok(HostSigningInfo {
        client_id,
        server_verify_key,
    })
}
