use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::post,
};
use deployment::Deployment;
use relay_client::{get_signed_relay_api, relay_session_url};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{
    DeploymentImpl,
    relay::session::{
        PairedRelayHostMetadata, PairedRelayHostMetadataError, RelayHostSession,
        RelayHostSessionInitError, build_relay_client, load_paired_relay_host_metadata,
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
    let host_metadata = match get_host_metadata_response(&deployment, req.host_id).await {
        Ok(info) => info,
        Err(response) => return response,
    };

    let relay_client = match build_relay_client(&deployment).await {
        Ok(relay_client) => relay_client,
        Err(error) => {
            tracing::warn!(
                ?error,
                host_id = %req.host_id,
                "Failed to initialize relay API client for remote editor open"
            );
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<
                    desktop_bridge::service::OpenRemoteEditorResponse,
                >::error(
                    "Failed to initialize relay access for host"
                )),
            )
                .into_response();
        }
    };
    let mut relay_session = match RelayHostSession::for_host(
        &deployment,
        relay_client,
        req.host_id,
        host_metadata.client_id,
        deployment.relay_signing().signing_key().clone(),
    )
    .await
    {
        Ok(session) => session,
        Err(RelayHostSessionInitError::RemoteSession(error)) => {
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
        Err(RelayHostSessionInitError::SigningSession(error)) => {
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
        relay_session.relay_base_url(),
        req.host_id,
        relay_session.remote_session().id,
        &editor_path_api_path,
        relay_session.signing_key(),
        relay_session.signing_session_id(),
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

            if let Err(error) = relay_session.refresh_signing_session().await {
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

            let second_attempt = fetch_relay_editor_path(
                relay_session.relay_base_url(),
                req.host_id,
                relay_session.remote_session().id,
                &editor_path_api_path,
                relay_session.signing_key(),
                relay_session.signing_session_id(),
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

                    if let Err(error) = relay_session.rotate_remote_session().await {
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

                    match fetch_relay_editor_path(
                        relay_session.relay_base_url(),
                        req.host_id,
                        relay_session.remote_session().id,
                        &editor_path_api_path,
                        relay_session.signing_key(),
                        relay_session.signing_session_id(),
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

    let relay_url = relay_session_url(
        relay_session.relay_base_url(),
        req.host_id,
        relay_session.remote_session().id,
    );

    let local_port = match deployment
        .tunnel_manager()
        .get_or_create_ssh_tunnel(
            req.host_id,
            &relay_url,
            relay_session.signing_key(),
            relay_session.signing_session_id(),
            host_metadata.server_verify_key,
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
        relay_session.signing_key(),
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
    relay_base_url: &str,
    host_id: Uuid,
    relay_session_id: Uuid,
    api_path: &str,
    signing_key: &ed25519_dalek::SigningKey,
    signing_session_id: &str,
) -> anyhow::Result<RelayEditorPathResponse> {
    get_signed_relay_api(
        relay_base_url,
        host_id,
        relay_session_id,
        api_path,
        signing_key,
        signing_session_id,
    )
    .await
}

async fn get_host_metadata_response(
    deployment: &DeploymentImpl,
    host_id: Uuid,
) -> Result<PairedRelayHostMetadata, Response> {
    load_paired_relay_host_metadata(deployment, host_id)
        .await
        .map_err(|error| match error {
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
        })
}
