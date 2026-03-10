use std::{
    collections::HashMap,
    sync::{LazyLock, RwLock},
};

use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::post,
};
use deployment::Deployment;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{
    DeploymentImpl,
    relay::{
        api::{RelayApiClient, get_signed_relay_api},
        relay_session_url,
    },
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

static RELAY_EDITOR_SESSION_CACHE: LazyLock<RwLock<HashMap<Uuid, Uuid>>> =
    LazyLock::new(|| RwLock::new(HashMap::new()));

pub async fn open_remote_workspace_in_editor(
    State(deployment): State<DeploymentImpl>,
    Json(req): Json<OpenRemoteWorkspaceInEditorRequest>,
) -> Response {
    let host_signing = match get_host_signing_info(&deployment, req.host_id).await {
        Ok(info) => info,
        Err(response) => return response,
    };

    let signing_key = deployment.relay_signing().signing_key().clone();
    let signing_session_id = host_signing.signing_session_id;

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
                "Failed to resolve workspace editor path; refreshing relay session and retrying"
            );

            remove_cached_relay_session(req.host_id);
            remote_session = match create_relay_remote_session(&deployment, req.host_id).await {
                Ok(remote_session) => {
                    cache_relay_session(req.host_id, remote_session.id);
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

fn get_cached_relay_session(host_id: Uuid) -> Option<Uuid> {
    RELAY_EDITOR_SESSION_CACHE
        .read()
        .ok()
        .and_then(|cache| cache.get(&host_id).copied())
}

fn cache_relay_session(host_id: Uuid, session_id: Uuid) {
    if let Ok(mut cache) = RELAY_EDITOR_SESSION_CACHE.write() {
        cache.insert(host_id, session_id);
    }
}

fn remove_cached_relay_session(host_id: Uuid) {
    if let Ok(mut cache) = RELAY_EDITOR_SESSION_CACHE.write() {
        cache.remove(&host_id);
    }
}

async fn get_or_create_cached_relay_remote_session(
    deployment: &DeploymentImpl,
    host_id: Uuid,
) -> anyhow::Result<crate::relay::api::RemoteSession> {
    if let Some(session_id) = get_cached_relay_session(host_id) {
        return Ok(crate::relay::api::RemoteSession {
            host_id,
            id: session_id,
        });
    }

    let remote_session = create_relay_remote_session(deployment, host_id).await?;
    cache_relay_session(host_id, remote_session.id);
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
    signing_session_id: String,
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

    Ok(HostSigningInfo {
        signing_session_id: credentials.signing_session_id,
        server_verify_key,
    })
}
