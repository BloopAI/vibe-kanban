use axum::{
    extract::{Path, State},
    response::Json as ResponseJson,
};
use db::models::kanban::tag::{CreateKanbanTag, KanbanTag, UpdateKanbanTag};
use deployment::Deployment;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

pub async fn list(
    State(deployment): State<DeploymentImpl>,
    Path(project_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<Vec<KanbanTag>>>, ApiError> {
    let pool = &deployment.db().pool;
    let tags = KanbanTag::find_by_project(pool, project_id).await?;
    Ok(ResponseJson(ApiResponse::success(tags)))
}

pub async fn create(
    State(deployment): State<DeploymentImpl>,
    Path(project_id): Path<Uuid>,
    ResponseJson(mut payload): ResponseJson<CreateKanbanTag>,
) -> Result<ResponseJson<ApiResponse<KanbanTag>>, ApiError> {
    let pool = &deployment.db().pool;
    payload.project_id = project_id;
    let tag = KanbanTag::create(pool, &payload).await?;
    Ok(ResponseJson(ApiResponse::success(tag)))
}

pub async fn update(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<Uuid>,
    ResponseJson(payload): ResponseJson<UpdateKanbanTag>,
) -> Result<ResponseJson<ApiResponse<KanbanTag>>, ApiError> {
    let pool = &deployment.db().pool;
    let tag = KanbanTag::update(pool, id, &payload).await?;
    Ok(ResponseJson(ApiResponse::success(tag)))
}

pub async fn remove(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let pool = &deployment.db().pool;
    KanbanTag::delete(pool, id).await?;
    Ok(ResponseJson(ApiResponse::success(())))
}
