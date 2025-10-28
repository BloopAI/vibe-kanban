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

use crate::{
    DeploymentImpl,
    error::ApiError,
    middleware::{ClerkSessionMaybe, require_clerk_session},
};

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

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    Router::new()
        .route(
            "/shared-tasks/{shared_task_id}/assign",
            post(assign_shared_task),
        )
        .route("/shared-tasks/{shared_task_id}", delete(delete_shared_task))
        .layer(axum::middleware::from_fn_with_state(
            deployment.clone(),
            require_clerk_session,
        ))
}

#[allow(clippy::too_many_arguments)]
pub async fn assign_shared_task(
    Path(shared_task_id): Path<Uuid>,
    State(deployment): State<DeploymentImpl>,
    session: ClerkSessionMaybe,
    Json(payload): Json<AssignSharedTaskRequest>,
) -> Result<ResponseJson<ApiResponse<AssignSharedTaskResponse>>, ApiError> {
    let Some(publisher) = deployment.share_publisher() else {
        return Err(ShareError::MissingConfig("share publisher unavailable").into());
    };

    let acting_session = session.require()?;
    let Some(org_id) = acting_session.org_id.clone() else {
        return Err(ApiError::Forbidden("organization context required".into()));
    };

    let shared_task = SharedTask::find_by_id(&deployment.db().pool, shared_task_id)
        .await?
        .ok_or_else(|| ApiError::Conflict("shared task not found".into()))?;

    if shared_task.organization_id != org_id {
        return Err(ApiError::Forbidden(
            "shared task belongs to a different organization".into(),
        ));
    }

    if shared_task.assignee_user_id.as_deref() != Some(&acting_session.user_id) {
        return Err(ApiError::Forbidden(
            "only the current assignee can assign the task".into(),
        ));
    }

    let updated_shared_task = publisher
        .assign_shared_task(
            &shared_task,
            Some(acting_session),
            payload.new_assignee_user_id.clone(),
            payload.version,
        )
        .await?;

    Ok(ResponseJson(ApiResponse::success(
        AssignSharedTaskResponse {
            shared_task: updated_shared_task,
        },
    )))
}

pub async fn delete_shared_task(
    Path(shared_task_id): Path<Uuid>,
    State(deployment): State<DeploymentImpl>,
    session: ClerkSessionMaybe,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let Some(publisher) = deployment.share_publisher() else {
        return Err(ShareError::MissingConfig("share publisher unavailable").into());
    };

    let acting_session = session.require()?;
    let Some(org_id) = acting_session.org_id.clone() else {
        return Err(ApiError::Forbidden("organization context required".into()));
    };

    let shared_task = SharedTask::find_by_id(&deployment.db().pool, shared_task_id)
        .await?
        .ok_or_else(|| ApiError::Conflict("shared task not found".into()))?;

    if shared_task.organization_id != org_id {
        return Err(ApiError::Forbidden(
            "shared task belongs to a different organization".into(),
        ));
    }

    if shared_task.assignee_user_id.as_deref() != Some(&acting_session.user_id) {
        return Err(ApiError::Forbidden(
            "only the current assignee can stop sharing the task".into(),
        ));
    }

    publisher
        .delete_shared_task(shared_task_id, Some(acting_session))
        .await?;

    Ok(ResponseJson(ApiResponse::success(())))
}
