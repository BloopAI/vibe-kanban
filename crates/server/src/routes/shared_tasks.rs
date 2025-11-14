use axum::{
    Json, Router,
    extract::{Path, State},
    response::Json as ResponseJson,
    routing::{delete, post},
};
use db::models::shared_task::SharedTask;
use deployment::Deployment;
use serde::{Deserialize, Serialize};
use services::services::share::ShareError;
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

#[derive(Debug, Clone, Deserialize, TS)]
#[ts(export)]
pub struct AssignSharedTaskRequest {
    pub new_assignee_user_id: Option<String>,
    pub version: Option<i64>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct AssignSharedTaskResponse {
    pub shared_task: SharedTask,
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route(
            "/shared-tasks/{shared_task_id}/assign",
            post(assign_shared_task),
        )
        .route("/shared-tasks/{shared_task_id}", delete(delete_shared_task))
}

pub async fn assign_shared_task(
    Path(shared_task_id): Path<Uuid>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<AssignSharedTaskRequest>,
) -> Result<ResponseJson<ApiResponse<AssignSharedTaskResponse>>, ApiError> {
    let Ok(publisher) = deployment.share_publisher() else {
        return Err(ShareError::MissingConfig("share publisher unavailable").into());
    };

    let shared_task = SharedTask::find_by_id(&deployment.db().pool, shared_task_id)
        .await?
        .ok_or_else(|| ApiError::Conflict("shared task not found".into()))?;

    let updated_shared_task = publisher
        .assign_shared_task(
            &shared_task,
            payload.new_assignee_user_id.clone(),
            payload.version,
        )
        .await?;

    let props = serde_json::json!({
        "shared_task_id": shared_task_id,
        "new_assignee_user_id": payload.new_assignee_user_id,
    });
    deployment
        .track_if_analytics_allowed("reassign_shared_task", props)
        .await;

    Ok(ResponseJson(ApiResponse::success(
        AssignSharedTaskResponse {
            shared_task: updated_shared_task,
        },
    )))
}

pub async fn delete_shared_task(
    Path(shared_task_id): Path<Uuid>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let Ok(publisher) = deployment.share_publisher() else {
        return Err(ShareError::MissingConfig("share publisher unavailable").into());
    };

    publisher.delete_shared_task(shared_task_id).await?;

    let props = serde_json::json!({
        "shared_task_id": shared_task_id,
    });
    deployment
        .track_if_analytics_allowed("stop_sharing_task", props)
        .await;

    Ok(ResponseJson(ApiResponse::success(())))
}
