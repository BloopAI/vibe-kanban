use axum::{
    extract::{Path, State},
    response::Json as ResponseJson,
};
use db::models::kanban::status::{
    CreateKanbanProjectStatus, KanbanProjectStatus, UpdateKanbanProjectStatus,
};
use deployment::Deployment;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

pub async fn list(
    State(deployment): State<DeploymentImpl>,
    Path(project_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<Vec<KanbanProjectStatus>>>, ApiError> {
    let pool = &deployment.db().pool;
    let statuses = KanbanProjectStatus::find_by_project(pool, project_id).await?;
    Ok(ResponseJson(ApiResponse::success(statuses)))
}

pub async fn create(
    State(deployment): State<DeploymentImpl>,
    Path(project_id): Path<Uuid>,
    ResponseJson(mut payload): ResponseJson<CreateKanbanProjectStatus>,
) -> Result<ResponseJson<ApiResponse<KanbanProjectStatus>>, ApiError> {
    let pool = &deployment.db().pool;
    payload.project_id = project_id;
    let status = KanbanProjectStatus::create(pool, &payload).await?;
    Ok(ResponseJson(ApiResponse::success(status)))
}

pub async fn update(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<Uuid>,
    ResponseJson(payload): ResponseJson<UpdateKanbanProjectStatus>,
) -> Result<ResponseJson<ApiResponse<KanbanProjectStatus>>, ApiError> {
    let pool = &deployment.db().pool;
    let status = KanbanProjectStatus::update(pool, id, &payload).await?;
    Ok(ResponseJson(ApiResponse::success(status)))
}

pub async fn remove(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let pool = &deployment.db().pool;
    KanbanProjectStatus::delete(pool, id).await?;
    Ok(ResponseJson(ApiResponse::success(())))
}
