use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::post,
};
use deployment::Deployment;
use relay_hosts::{OpenRemoteEditorError, RelayHostLookupError};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::DeploymentImpl;

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

async fn open_remote_workspace_in_editor(
    State(deployment): State<DeploymentImpl>,
    Json(req): Json<OpenRemoteWorkspaceInEditorRequest>,
) -> Response {
    let Ok(relay_hosts) = deployment.relay_hosts() else {
        return map_open_remote_editor_error(
            req.host_id,
            req.workspace_id,
            req.editor_type.as_deref(),
            OpenRemoteEditorError::RelayNotConfigured,
        );
    };
    let relay_host = match relay_hosts.host(req.host_id).await {
        Ok(relay_host) => relay_host,
        Err(error) => {
            return map_open_remote_editor_lookup_error(req.host_id, error);
        }
    };

    match relay_host
        .open_workspace_in_editor(
            deployment.tunnel_manager().as_ref(),
            req.workspace_id,
            req.editor_type.as_deref(),
            req.file_path.as_deref(),
        )
        .await
    {
        Ok(response) => (
            StatusCode::OK,
            Json(ApiResponse::<
                desktop_bridge::service::OpenRemoteEditorResponse,
            >::success(response)),
        )
            .into_response(),
        Err(error) => map_open_remote_editor_error(
            req.host_id,
            req.workspace_id,
            req.editor_type.as_deref(),
            error,
        ),
    }
}

fn map_open_remote_editor_lookup_error(host_id: Uuid, error: RelayHostLookupError) -> Response {
    match error {
        RelayHostLookupError::NotPaired => (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::<
                desktop_bridge::service::OpenRemoteEditorResponse,
            >::error(&format!(
                "Open-in-IDE credentials are unavailable for host '{host_id}'"
            ))),
        )
            .into_response(),
        RelayHostLookupError::MissingSigningMetadata => (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::<
                desktop_bridge::service::OpenRemoteEditorResponse,
            >::error(
                "Host pairing is missing signing metadata. Re-pair it."
            )),
        )
            .into_response(),
        RelayHostLookupError::MissingClientMetadata => (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::<
                desktop_bridge::service::OpenRemoteEditorResponse,
            >::error(
                "Host pairing is missing client metadata. Re-pair it."
            )),
        )
            .into_response(),
    }
}

fn map_open_remote_editor_error(
    host_id: Uuid,
    workspace_id: Uuid,
    _editor_type: Option<&str>,
    error: OpenRemoteEditorError,
) -> Response {
    match error {
        OpenRemoteEditorError::RelayNotConfigured => (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::<
                desktop_bridge::service::OpenRemoteEditorResponse,
            >::error(
                "Failed to initialize relay access for host"
            )),
        )
            .into_response(),
        OpenRemoteEditorError::Authentication(error) => {
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
        OpenRemoteEditorError::RemoteSession(error) => {
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
        OpenRemoteEditorError::SigningSession(error) => {
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
        OpenRemoteEditorError::ResolveEditorPath(error) => {
            tracing::warn!(
                ?error,
                host_id = %host_id,
                workspace_id = %workspace_id,
                "Failed to resolve workspace editor path"
            );
            (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<
                    desktop_bridge::service::OpenRemoteEditorResponse,
                >::error(
                    "Failed to resolve editor path for host workspace"
                )),
            )
                .into_response()
        }
        OpenRemoteEditorError::CreateTunnel(error) => {
            tracing::error!(?error, "Failed to create SSH tunnel");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::<
                    desktop_bridge::service::OpenRemoteEditorResponse,
                >::error(&error.to_string())),
            )
                .into_response()
        }
        OpenRemoteEditorError::LaunchEditor(error) => {
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
