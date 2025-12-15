use axum::{
    Router,
    extract::{Query, State},
    response::Json as ResponseJson,
    routing::get,
};
use db::models::task_attempt::{TaskAttempt, TaskAttemptContext};
use deployment::Deployment;
use serde::{Deserialize, Serialize};
use utils::response::ApiResponse;

use crate::{DeploymentImpl, error::ApiError};

#[derive(Debug, Deserialize, Serialize)]
pub struct ContainerQuery {
    #[serde(rename = "ref")]
    pub container_ref: String,
}

pub async fn get_context(
    State(deployment): State<DeploymentImpl>,
    Query(payload): Query<ContainerQuery>,
) -> Result<ResponseJson<ApiResponse<TaskAttemptContext>>, ApiError> {
    let result =
        TaskAttempt::resolve_container_ref(&deployment.db().pool, &payload.container_ref).await;

    match result {
        Ok(info) => {
            let ctx = TaskAttempt::load_context(
                &deployment.db().pool,
                info.attempt_id,
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
    Router::new().route("/containers/attempt-context", get(get_context))
}
