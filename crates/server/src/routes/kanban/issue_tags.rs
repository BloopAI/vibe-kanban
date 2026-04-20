use axum::{
    extract::{Path, State},
    response::Json as ResponseJson,
};
use db::models::kanban::issue_tag::{CreateKanbanIssueTag, KanbanIssueTag};
use deployment::Deployment;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

pub async fn create(
    State(deployment): State<DeploymentImpl>,
    ResponseJson(payload): ResponseJson<CreateKanbanIssueTag>,
) -> Result<ResponseJson<ApiResponse<KanbanIssueTag>>, ApiError> {
    let pool = &deployment.db().pool;
    let issue_tag = KanbanIssueTag::create(pool, &payload).await?;
    Ok(ResponseJson(ApiResponse::success(issue_tag)))
}

pub async fn remove(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let pool = &deployment.db().pool;
    KanbanIssueTag::delete(pool, id).await?;
    Ok(ResponseJson(ApiResponse::success(())))
}
