use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::post,
};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{
    DeploymentImpl,
    host_relay::{
        transport::{HostRelayOperationError, HostRelayResolveError, ResolvedHostRelay},
        wiring::{HostRelayResolverBuildError, build_host_relay_resolver},
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
    let mut host = match resolve_host_relay_response(&deployment, req.host_id).await {
        Ok(host) => host,
        Err(response) => return response,
    };

    let editor_path_api_path =
        build_workspace_editor_path_api_path(req.workspace_id, req.file_path.as_deref());
    let editor_path_result: Result<RelayEditorPathResponse, HostRelayOperationError> =
        host.get_json(&editor_path_api_path).await;

    let editor_path = match editor_path_result {
        Ok(path) => path,
        Err(HostRelayOperationError::SigningSession(error)) => {
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
        Err(HostRelayOperationError::RemoteSession(error)) => {
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
        Err(HostRelayOperationError::Upstream(error)) => {
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

    let tunnel_access = host.tunnel_access();
    let local_port = match deployment
        .tunnel_manager()
        .get_or_create_ssh_tunnel(
            req.host_id,
            &tunnel_access.relay_url,
            &tunnel_access.signing_key,
            &tunnel_access.signing_session_id,
            tunnel_access.server_verify_key,
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
        &tunnel_access.signing_key,
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

async fn resolve_host_relay_response(
    deployment: &DeploymentImpl,
    host_id: Uuid,
) -> Result<ResolvedHostRelay, Response> {
    let resolver = build_host_relay_resolver(deployment).map_err(|error| match error {
        HostRelayResolverBuildError::NotConfigured => (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::<
                desktop_bridge::service::OpenRemoteEditorResponse,
            >::error(
                "Failed to initialize relay access for host"
            )),
        )
            .into_response(),
    })?;

    resolver
        .resolve(host_id)
        .await
        .map_err(|error| match error {
            HostRelayResolveError::NotPaired => (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<
                    desktop_bridge::service::OpenRemoteEditorResponse,
                >::error(&format!(
                    "Open-in-IDE credentials are unavailable for host '{host_id}'"
                ))),
            )
                .into_response(),
            HostRelayResolveError::MissingSigningMetadata => (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<
                    desktop_bridge::service::OpenRemoteEditorResponse,
                >::error(
                    "Host pairing is missing signing metadata. Re-pair it."
                )),
            )
                .into_response(),
            HostRelayResolveError::MissingClientMetadata => (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<
                    desktop_bridge::service::OpenRemoteEditorResponse,
                >::error(
                    "Host pairing is missing client metadata. Re-pair it."
                )),
            )
                .into_response(),
            HostRelayResolveError::RelayNotConfigured => (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<
                    desktop_bridge::service::OpenRemoteEditorResponse,
                >::error(
                    "Failed to initialize relay access for host"
                )),
            )
                .into_response(),
            HostRelayResolveError::Authentication(error) => {
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
            HostRelayResolveError::RemoteSession(error) => {
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
            HostRelayResolveError::SigningSession(error) => {
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
        })
}
