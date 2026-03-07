use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{post, put},
};
use desktop_bridge::signing::SigningContext;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{
    DeploymentImpl,
    relay::{client::get_signed_relay_api, relay_session_url},
};

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/open-remote-editor", post(open_remote_editor))
        .route(
            "/open-remote-editor/first-workspace",
            post(open_first_workspace_in_remote_editor),
        )
        .route(
            "/open-remote-editor/credentials",
            put(upsert_open_remote_editor_credentials),
        )
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct OpenRemoteEditorRequest {
    pub host_id: Uuid,
    pub browser_session_id: Uuid,
    pub workspace_path: String,
    #[serde(default)]
    pub editor_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct OpenFirstWorkspaceInRemoteEditorRequest {
    pub host_id: Uuid,
    pub browser_session_id: Uuid,
    #[serde(default)]
    pub editor_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct UpsertRelayHostCredentialsRequest {
    pub host_id: Uuid,
    pub signing_session_id: String,
    pub private_key_jwk: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct UpsertRelayHostCredentialsResponse {
    pub upserted: bool,
}

pub async fn open_remote_editor(
    State(deployment): State<DeploymentImpl>,
    Json(req): Json<OpenRemoteEditorRequest>,
) -> Response {
    let signing_ctx = match get_signing_ctx(&deployment, req.host_id).await {
        Ok(signing_ctx) => signing_ctx,
        Err(response) => return response,
    };

    open_remote_editor_with_workspace_path(
        &deployment,
        signing_ctx,
        req.workspace_path,
        req.editor_type,
        req.host_id,
        req.browser_session_id,
    )
    .await
}

pub async fn open_first_workspace_in_remote_editor(
    State(deployment): State<DeploymentImpl>,
    Json(req): Json<OpenFirstWorkspaceInRemoteEditorRequest>,
) -> Response {
    let signing_ctx = match get_signing_ctx(&deployment, req.host_id).await {
        Ok(signing_ctx) => signing_ctx,
        Err(response) => return response,
    };

    let workspaces: Vec<RelayWorkspace> = match get_signed_relay_api(
        req.host_id,
        req.browser_session_id,
        "/api/task-attempts",
        &signing_ctx,
    )
    .await
    {
        Ok(workspaces) => workspaces,
        Err(error) => {
            tracing::warn!(
                ?error,
                host_id = %req.host_id,
                "Failed to fetch host workspaces"
            );
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<
                    desktop_bridge::service::OpenRemoteEditorResponse,
                >::error(
                    "Failed to load host workspaces via relay"
                )),
            )
                .into_response();
        }
    };

    let Some(first_workspace) = workspaces.first() else {
        return (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::<
                desktop_bridge::service::OpenRemoteEditorResponse,
            >::error("No workspaces found on host")),
        )
            .into_response();
    };

    let editor_path: RelayEditorPathResponse = match get_signed_relay_api(
        req.host_id,
        req.browser_session_id,
        &format!("/api/task-attempts/{}/editor-path", first_workspace.id),
        &signing_ctx,
    )
    .await
    {
        Ok(path) => path,
        Err(error) => {
            tracing::warn!(
                ?error,
                host_id = %req.host_id,
                workspace_id = %first_workspace.id,
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

    open_remote_editor_with_workspace_path(
        &deployment,
        signing_ctx,
        editor_path.workspace_path,
        req.editor_type,
        req.host_id,
        req.browser_session_id,
    )
    .await
}

pub async fn upsert_open_remote_editor_credentials(
    State(deployment): State<DeploymentImpl>,
    Json(req): Json<UpsertRelayHostCredentialsRequest>,
) -> Response {
    match deployment
        .upsert_relay_host_credentials(
            req.host_id,
            req.signing_session_id,
            req.private_key_jwk,
            None,
            None,
        )
        .await
    {
        Ok(()) => (
            StatusCode::OK,
            Json(ApiResponse::<UpsertRelayHostCredentialsResponse>::success(
                UpsertRelayHostCredentialsResponse { upserted: true },
            )),
        )
            .into_response(),
        Err(error) => {
            tracing::error!(?error, "Failed to persist relay host credentials");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::<UpsertRelayHostCredentialsResponse>::error(
                    "Failed to persist relay host credentials",
                )),
            )
                .into_response()
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
struct RelayWorkspace {
    id: String,
}

#[derive(Debug, Clone, Deserialize)]
struct RelayEditorPathResponse {
    workspace_path: String,
}

async fn get_signing_ctx(
    deployment: &DeploymentImpl,
    host_id: Uuid,
) -> Result<SigningContext, Response> {
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

    SigningContext::from_jwk(credentials.signing_session_id, &credentials.private_key_jwk).map_err(
        |error| {
            (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<
                    desktop_bridge::service::OpenRemoteEditorResponse,
                >::error(&error.to_string())),
            )
                .into_response()
        },
    )
}

async fn open_remote_editor_with_workspace_path(
    deployment: &DeploymentImpl,
    signing_ctx: SigningContext,
    workspace_path: String,
    editor_type: Option<String>,
    host_id: Uuid,
    browser_session_id: Uuid,
) -> Response {
    let relay_url = match relay_session_url(host_id, browser_session_id) {
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
        .get_or_create_ssh_tunnel(&relay_url, &signing_ctx)
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
        &signing_ctx.signing_key,
        &workspace_path,
        editor_type.as_deref(),
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
