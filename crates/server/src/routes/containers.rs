use axum::{
    Router,
    extract::{Query, State},
    response::Json as ResponseJson,
    routing::get,
};
use db::models::{
    requests::ContainerQuery,
    workspace::{Workspace, WorkspaceContext},
};
use deployment::Deployment;
use serde::Serialize;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

#[derive(Debug, Serialize)]
pub struct ContainerInfo {
    pub attempt_id: Uuid,
}

pub async fn get_container_info(
    Query(query): Query<ContainerQuery>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<ContainerInfo>>, ApiError> {
    let info =
        Workspace::resolve_container_ref_by_prefix(&deployment.db().pool, &query.container_ref)
            .await
            .map_err(ApiError::Database)?;

    Ok(ResponseJson(ApiResponse::success(ContainerInfo {
        attempt_id: info.workspace_id,
    })))
}

pub async fn get_context(
    State(deployment): State<DeploymentImpl>,
    Query(payload): Query<ContainerQuery>,
) -> Result<ResponseJson<ApiResponse<WorkspaceContext>>, ApiError> {
    let info =
        Workspace::resolve_container_ref_by_prefix(&deployment.db().pool, &payload.container_ref)
            .await
            .map_err(ApiError::Database)?;

    let ctx = Workspace::load_context(&deployment.db().pool, info.workspace_id).await?;
    Ok(ResponseJson(ApiResponse::success(ctx)))
}

pub fn router(_deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    Router::new()
        // NOTE: /containers/info is required by the VSCode extension (vibe-kanban-vscode)
        // to auto-detect workspaces. It maps workspace_id to attempt_id for compatibility.
        // Do not remove this endpoint without updating the extension.
        .route("/containers/info", get(get_container_info))
        .route("/containers/attempt-context", get(get_context))
}
