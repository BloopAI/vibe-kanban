use axum::{
    Json, Router,
    extract::{Path, State},
    response::Json as ResponseJson,
    routing::{delete, post},
};
use db::models::task::Task;
use deployment::Deployment;
use remote::routes::tasks::SharedTaskResponse;
use serde::Deserialize;
use services::services::share::{ShareError, SharedTaskDetails};
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

#[derive(Debug, Clone, Deserialize, TS)]
#[ts(export)]
pub struct AssignSharedTaskRequest {
    pub new_assignee_user_id: Option<String>,
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route(
            "/shared-tasks/{shared_task_id}/assign",
            post(assign_shared_task),
        )
        .route("/shared-tasks/{shared_task_id}", delete(delete_shared_task))
        .route(
            "/shared-tasks/link-to-local",
            post(link_shared_task_to_local),
        )
}

pub async fn assign_shared_task(
    Path(shared_task_id): Path<Uuid>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<AssignSharedTaskRequest>,
) -> Result<ResponseJson<ApiResponse<SharedTaskResponse>>, ApiError> {
    let Ok(publisher) = deployment.share_publisher() else {
        return Err(ShareError::MissingConfig("share publisher unavailable").into());
    };

    let updated_shared_task = publisher
        .assign_shared_task(shared_task_id, payload.new_assignee_user_id.clone())
        .await?;

    let props = serde_json::json!({
        "shared_task_id": shared_task_id,
        "new_assignee_user_id": payload.new_assignee_user_id,
    });
    deployment
        .track_if_analytics_allowed("reassign_shared_task", props)
        .await;

    Ok(ResponseJson(ApiResponse::success(updated_shared_task)))
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

pub async fn link_shared_task_to_local(
    State(deployment): State<DeploymentImpl>,
    Json(shared_task_details): Json<SharedTaskDetails>,
) -> Result<ResponseJson<ApiResponse<Option<Task>>>, ApiError> {
    let Ok(publisher) = deployment.share_publisher() else {
        return Err(ShareError::MissingConfig("share publisher unavailable").into());
    };

    let task = publisher.link_shared_task(shared_task_details).await?;

    if let Some(ref task) = task {
        let props = serde_json::json!({
            "shared_task_id": task.shared_task_id,
            "task_id": task.id,
            "project_id": task.project_id,
        });
        deployment
            .track_if_analytics_allowed("link_shared_task_to_local", props)
            .await;
    }

    Ok(ResponseJson(ApiResponse::success(task)))
}
