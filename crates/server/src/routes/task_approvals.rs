use axum::{
    Extension, Router,
    http::{HeaderMap, StatusCode},
    response::Json as ResponseJson,
    routing::{delete, get, post},
    extract::State,
};
use db::models::{
    task::Task,
    task_approval::{TaskApproval, TaskApprovalWithUser},
};
use utils::response::ApiResponse;

use deployment::Deployment;

use crate::{
    DeploymentImpl,
    error::ApiError,
    middleware::try_get_authenticated_user,
};

pub async fn list_task_approvals(
    Extension(task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<TaskApprovalWithUser>>>, ApiError> {
    let approvals =
        TaskApproval::find_by_task_id_with_users(&deployment.db().pool, task.id).await?;

    Ok(ResponseJson(ApiResponse::success(approvals)))
}

pub async fn approve_task(
    Extension(task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,
    headers: HeaderMap,
) -> Result<(StatusCode, ResponseJson<ApiResponse<TaskApprovalWithUser>>), ApiError> {
    let user = try_get_authenticated_user(&deployment, &headers)
        .await
        .ok_or(ApiError::Unauthorized)?;

    let pool = &deployment.db().pool;

    // Check if already approved
    if TaskApproval::exists(pool, task.id, user.id).await? {
        return Err(ApiError::BadRequest(
            "You have already approved this task".to_string(),
        ));
    }

    let approval = TaskApproval::create(pool, task.id, user.id).await?;

    let approval_with_user = TaskApprovalWithUser {
        approval,
        user: user.into(),
    };

    Ok((
        StatusCode::CREATED,
        ResponseJson(ApiResponse::success(approval_with_user)),
    ))
}

pub async fn unapprove_task(
    Extension(task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,
    headers: HeaderMap,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let user = try_get_authenticated_user(&deployment, &headers)
        .await
        .ok_or(ApiError::Unauthorized)?;

    let rows_affected = TaskApproval::delete(&deployment.db().pool, task.id, user.id).await?;

    if rows_affected == 0 {
        return Err(ApiError::BadRequest(
            "You have not approved this task".to_string(),
        ));
    }

    Ok(ResponseJson(ApiResponse::success(())))
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/", get(list_task_approvals))
        .route("/", post(approve_task))
        .route("/", delete(unapprove_task))
}
