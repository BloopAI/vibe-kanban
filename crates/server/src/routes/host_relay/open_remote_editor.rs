use axum::{Json, Router, extract::State, routing::post};
use deployment::Deployment;
use serde::{Deserialize, Serialize};
use tracing::warn;
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

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
) -> Result<Json<ApiResponse<desktop_bridge::service::OpenRemoteEditorResponse>>, ApiError> {
    let relay_hosts = deployment.relay_hosts()?;
    let relay_host = relay_hosts.host(req.host_id).await?;
    let setup = relay_host
        .prepare_workspace_editor(req.workspace_id, req.file_path.as_deref())
        .await?;
    let response = desktop_bridge::service::open_remote_editor(
        setup.local_port,
        deployment.relay_signing(),
        &req.host_id.to_string(),
        &setup.workspace_path,
        req.editor_type.as_deref(),
    )
    .map_err(|detail| {
        warn!(%detail, "Failed to open remote editor");
        ApiError::BadGateway(format!("Failed to set up SSH for remote editor: {detail}"))
    })?;
    Ok(Json(ApiResponse::success(response)))
}
