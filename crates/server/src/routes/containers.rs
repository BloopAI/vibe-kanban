use axum::{
    extract::{Query, State},
    response::Json as ResponseJson,
    routing::get,
    Router,
};
use db::models::task_attempt::TaskAttempt;
use deployment::Deployment;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{error::ApiError, DeploymentImpl};

#[derive(Debug, Serialize, TS)]
pub struct ContainerInfo {
    pub attempt_id: Uuid,
    pub task_id: Uuid,
    pub project_id: Uuid,
}

#[derive(Debug, Deserialize)]
pub struct ContainerQuery {
    #[serde(rename = "ref")]
    pub container_ref: String,
}

pub async fn get_container_info(
    Query(query): Query<ContainerQuery>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<ContainerInfo>>, ApiError> {
    let pool = &deployment.db().pool;

    let (attempt_id, task_id, project_id) =
        TaskAttempt::resolve_container_ref(pool, &query.container_ref)
            .await
            .map_err(|e| match e {
                sqlx::Error::RowNotFound => ApiError::Database(e),
                _ => ApiError::Database(e),
            })?;

    let container_info = ContainerInfo {
        attempt_id,
        task_id,
        project_id,
    };

    Ok(ResponseJson(ApiResponse::success(container_info)))
}

pub fn router(_deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    Router::new().route("/containers/info", get(get_container_info))
}
