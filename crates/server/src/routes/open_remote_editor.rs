use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::post,
};
use relay_client::{RelayHostTransport, RelayTransportBootstrapError, RelayTransportError};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{
    DeploymentImpl,
    host_relay::transport::{
        PairedRelayHostMetadataError, RelayClientBuildError, RelayTransportBuildError,
        build_relay_host_transport, persist_relay_auth_state,
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

pub async fn open_remote_workspace_in_editor(
    State(deployment): State<DeploymentImpl>,
    Json(req): Json<OpenRemoteWorkspaceInEditorRequest>,
) -> Response {
    let mut relay_transport = match get_host_transport_response(&deployment, req.host_id).await {
        Ok(relay_transport) => relay_transport,
        Err(response) => return response,
    };

    let editor_path_api_path =
        build_workspace_editor_path_api_path(req.workspace_id, req.file_path.as_deref());
    let editor_path_result: Result<RelayEditorPathResponse, RelayTransportError> =
        relay_transport.get_signed_json(&editor_path_api_path).await;
    persist_relay_auth_state(&deployment, req.host_id, relay_transport.auth_state()).await;

    let editor_path = match editor_path_result {
        Ok(path) => path,
        Err(RelayTransportError::SigningSession(error)) => {
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
        Err(RelayTransportError::RemoteSession(error)) => {
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
        Err(RelayTransportError::Upstream(error)) => {
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
    };

    let relay_url = relay_transport.relay_url();
    let local_port = match deployment
        .tunnel_manager()
        .get_or_create_ssh_tunnel(
            req.host_id,
            &relay_url,
            relay_transport.signing_key(),
            &relay_transport.auth_state().signing_session_id,
            relay_transport.server_verify_key().to_owned(),
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
        relay_transport.signing_key(),
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

async fn get_host_transport_response(
    deployment: &DeploymentImpl,
    host_id: Uuid,
) -> Result<RelayHostTransport, Response> {
    build_relay_host_transport(deployment, host_id)
        .await
        .map_err(|error| match error {
            RelayTransportBuildError::Metadata(error) => match error {
                PairedRelayHostMetadataError::NotPaired => (
                    StatusCode::BAD_REQUEST,
                    Json(ApiResponse::<
                        desktop_bridge::service::OpenRemoteEditorResponse,
                    >::error(&format!(
                        "Open-in-IDE credentials are unavailable for host '{host_id}'"
                    ))),
                )
                    .into_response(),
                PairedRelayHostMetadataError::MissingSigningMetadata => (
                    StatusCode::BAD_REQUEST,
                    Json(ApiResponse::<
                        desktop_bridge::service::OpenRemoteEditorResponse,
                    >::error(
                        "Host pairing is missing signing metadata. Re-pair it."
                    )),
                )
                    .into_response(),
                PairedRelayHostMetadataError::MissingClientMetadata => (
                    StatusCode::BAD_REQUEST,
                    Json(ApiResponse::<
                        desktop_bridge::service::OpenRemoteEditorResponse,
                    >::error(
                        "Host pairing is missing client metadata. Re-pair it."
                    )),
                )
                    .into_response(),
            },
            RelayTransportBuildError::ClientBuild(error) => match error {
                RelayClientBuildError::NotConfigured => (
                    StatusCode::BAD_REQUEST,
                    Json(ApiResponse::<
                        desktop_bridge::service::OpenRemoteEditorResponse,
                    >::error(
                        "Failed to initialize relay access for host"
                    )),
                )
                    .into_response(),
                RelayClientBuildError::Authentication(error) => {
                    tracing::warn!(
                        ?error,
                        host_id = %host_id,
                        "Failed to initialize relay API client for remote editor open"
                    );
                    (
                        StatusCode::BAD_REQUEST,
                        Json(ApiResponse::<
                            desktop_bridge::service::OpenRemoteEditorResponse,
                        >::error(
                            "Failed to initialize relay access for host"
                        )),
                    )
                        .into_response()
                }
            },
            RelayTransportBuildError::Bootstrap(error) => match error {
                RelayTransportBootstrapError::RemoteSession(error) => {
                    tracing::warn!(
                        ?error,
                        host_id = %host_id,
                        "Failed to create relay session for remote editor open"
                    );
                    (
                        StatusCode::BAD_REQUEST,
                        Json(ApiResponse::<
                            desktop_bridge::service::OpenRemoteEditorResponse,
                        >::error(
                            "Failed to create relay session for host"
                        )),
                    )
                        .into_response()
                }
                RelayTransportBootstrapError::SigningSession(error) => {
                    tracing::warn!(
                        ?error,
                        host_id = %host_id,
                        "Failed to initialize relay signing session for remote editor open"
                    );
                    (
                        StatusCode::BAD_REQUEST,
                        Json(ApiResponse::<
                            desktop_bridge::service::OpenRemoteEditorResponse,
                        >::error(
                            "Failed to initialize signing session for host"
                        )),
                    )
                        .into_response()
                }
            },
        })
}
