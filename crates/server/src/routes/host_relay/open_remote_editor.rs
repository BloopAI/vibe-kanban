use axum::{Json, Router, extract::State, routing::post};
use deployment::Deployment;
use serde::{Deserialize, Serialize};
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

async fn open_remote_workspace_in_editor(
    State(deployment): State<DeploymentImpl>,
    Json(req): Json<OpenRemoteWorkspaceInEditorRequest>,
) -> Result<Json<ApiResponse<desktop_bridge::service::OpenRemoteEditorResponse>>, ApiError> {
    let relay_hosts = deployment.relay_hosts()?;
    let relay_host = relay_hosts.host(req.host_id).await?;
    let response = relay_host
        .open_workspace_in_editor(
            deployment.tunnel_manager().as_ref(),
            req.workspace_id,
            req.editor_type.as_deref(),
            req.file_path.as_deref(),
        )
        .await?;
    Ok(Json(ApiResponse::success(response)))
}
