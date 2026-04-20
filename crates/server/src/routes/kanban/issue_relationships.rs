use axum::{
    extract::{Path, State},
    response::Json as ResponseJson,
};
use db::models::kanban::issue_relationship::{
    CreateKanbanIssueRelationship, KanbanIssueRelationship,
};
use deployment::Deployment;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

pub async fn create(
    State(deployment): State<DeploymentImpl>,
    ResponseJson(payload): ResponseJson<CreateKanbanIssueRelationship>,
) -> Result<ResponseJson<ApiResponse<KanbanIssueRelationship>>, ApiError> {
    let pool = &deployment.db().pool;
    let rel = KanbanIssueRelationship::create(pool, &payload).await?;
    Ok(ResponseJson(ApiResponse::success(rel)))
}

pub async fn remove(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let pool = &deployment.db().pool;
    KanbanIssueRelationship::delete(pool, id).await?;
    Ok(ResponseJson(ApiResponse::success(())))
}
