use axum::{Json, Router, extract::State, routing::post};
use deployment::Deployment;
use futures_util::StreamExt;
use http::{HeaderMap, Method, StatusCode};
use serde::{Deserialize, Serialize};
use tracing::warn;
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

pub(super) fn router() -> Router<DeploymentImpl> {
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

#[derive(Debug, Clone, Deserialize)]
struct EditorPathResponse {
    workspace_path: String,
}

async fn open_remote_workspace_in_editor(
    State(deployment): State<DeploymentImpl>,
    Json(req): Json<OpenRemoteWorkspaceInEditorRequest>,
) -> Result<Json<ApiResponse<desktop_bridge::service::OpenRemoteEditorResponse>>, ApiError> {
    let relay_hosts = deployment.relay_hosts()?;
    let relay_host = relay_hosts.host(req.host_id).await?;

    // Build the editor path API URL.
    let api_path = build_editor_path_api_path(req.workspace_id, req.file_path.as_deref());

    // Resolve workspace path via relay proxy (WebRTC-first, relay fallback).
    let mut response = relay_host
        .proxy_http(&Method::GET, &api_path, &HeaderMap::new(), &[])
        .await?;

    if response.status != StatusCode::OK {
        return Err(ApiError::BadGateway(format!(
            "Editor path request failed with status {}",
            response.status
        )));
    }

    let mut body = Vec::new();
    while let Some(chunk) = response.body.next().await {
        let chunk =
            chunk.map_err(|e| ApiError::BadGateway(format!("Failed to read response: {e}")))?;
        body.extend_from_slice(&chunk);
    }

    let payload: ApiResponse<EditorPathResponse> = serde_json::from_slice(&body)
        .map_err(|e| ApiError::BadGateway(format!("Failed to parse editor path response: {e}")))?;

    let workspace_path = payload
        .into_data()
        .ok_or_else(|| ApiError::BadGateway("Editor path response missing workspace path".into()))?
        .workspace_path;

    // Create SSH tunnel.
    let local_port = relay_host.get_or_create_ssh_tunnel().await.map_err(|e| {
        warn!(%e, "Failed to create SSH tunnel");
        ApiError::BadGateway(format!("Failed to create SSH tunnel: {e}"))
    })?;

    let response = desktop_bridge::service::open_remote_editor(
        local_port,
        deployment.relay_signing(),
        &req.host_id.to_string(),
        &workspace_path,
        req.editor_type.as_deref(),
    )
    .map_err(|detail| {
        warn!(%detail, "Failed to open remote editor");
        ApiError::BadGateway(format!("Failed to set up SSH for remote editor: {detail}"))
    })?;
    Ok(Json(ApiResponse::success(response)))
}

fn build_editor_path_api_path(workspace_id: Uuid, file_path: Option<&str>) -> String {
    let base = format!("/api/workspaces/{workspace_id}/integration/editor/path");
    let Some(file_path) = file_path.filter(|v| !v.is_empty()) else {
        return base;
    };

    let query = url::form_urlencoded::Serializer::new(String::new())
        .append_pair("file_path", file_path)
        .finish();
    format!("{base}?{query}")
}
