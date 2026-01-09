use axum::{
    Router,
    extract::{Query, State},
    response::Json as ResponseJson,
    routing::get,
};
use db::models::workspace::{Workspace, WorkspaceContext};
use deployment::Deployment;
use serde::{Deserialize, Serialize};
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

#[derive(Debug, Deserialize, Serialize)]
pub struct ContainerQuery {
    #[serde(rename = "ref")]
    pub container_ref: String,
}

/// Minimal container info for VSCode extension compatibility.
/// Maps workspace_id to attempt_id since the extension expects the old naming.
#[derive(Debug, Serialize)]
pub struct ContainerInfo {
    pub project_id: Uuid,
    pub task_id: Uuid,
    pub attempt_id: Uuid,
}

pub async fn get_container_info(
    Query(query): Query<ContainerQuery>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<ContainerInfo>>, ApiError> {
    let info = Workspace::resolve_container_ref(&deployment.db().pool, &query.container_ref)
        .await
        .map_err(ApiError::Database)?;

    Ok(ResponseJson(ApiResponse::success(ContainerInfo {
        project_id: info.project_id,
        task_id: info.task_id,
        attempt_id: info.workspace_id,
    })))
}

pub async fn get_context(
    State(deployment): State<DeploymentImpl>,
    Query(payload): Query<ContainerQuery>,
) -> Result<ResponseJson<ApiResponse<WorkspaceContext>>, ApiError> {
    let result =
        Workspace::resolve_container_ref(&deployment.db().pool, &payload.container_ref).await;

    match result {
        Ok(info) => {
            let ctx = Workspace::load_context(
                &deployment.db().pool,
                info.workspace_id,
                info.task_id,
                info.project_id,
            )
            .await?;
            Ok(ResponseJson(ApiResponse::success(ctx)))
        }
        Err(e) => Err(ApiError::Database(e)),
    }
}

pub fn router(_deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    Router::new()
        .route("/containers/info", get(get_container_info))
        .route("/containers/attempt-context", get(get_context))
}
