use axum::{
    extract::{Path, State},
    response::Json as ResponseJson,
};
use db::models::kanban::issue_assignee::{CreateKanbanIssueAssignee, KanbanIssueAssignee};
use deployment::Deployment;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

pub async fn create(
    State(deployment): State<DeploymentImpl>,
    ResponseJson(payload): ResponseJson<CreateKanbanIssueAssignee>,
) -> Result<ResponseJson<ApiResponse<KanbanIssueAssignee>>, ApiError> {
    let pool = &deployment.db().pool;
    let assignee = KanbanIssueAssignee::create(pool, &payload).await?;
    Ok(ResponseJson(ApiResponse::success(assignee)))
}

pub async fn remove(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let pool = &deployment.db().pool;
    KanbanIssueAssignee::delete(pool, id).await?;
    Ok(ResponseJson(ApiResponse::success(())))
}
