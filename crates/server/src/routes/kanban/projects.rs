use axum::{
    extract::{Path, State},
    response::Json as ResponseJson,
};
use db::models::kanban::{
    project::{CreateKanbanProject, KanbanProject, UpdateKanbanProject},
    status::KanbanProjectStatus,
};
use deployment::Deployment;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

pub async fn list(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<KanbanProject>>>, ApiError> {
    let pool = &deployment.db().pool;
    let projects = KanbanProject::find_all(pool).await?;
    Ok(ResponseJson(ApiResponse::success(projects)))
}

pub async fn get_one(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<KanbanProject>>, ApiError> {
    let pool = &deployment.db().pool;
    let project = KanbanProject::find_by_id(pool, id)
        .await?
        .ok_or_else(|| ApiError::BadRequest("Kanban project not found".to_string()))?;
    Ok(ResponseJson(ApiResponse::success(project)))
}

pub async fn create(
    State(deployment): State<DeploymentImpl>,
    ResponseJson(payload): ResponseJson<CreateKanbanProject>,
) -> Result<ResponseJson<ApiResponse<KanbanProject>>, ApiError> {
    let pool = &deployment.db().pool;
    let project = KanbanProject::create(pool, &payload).await?;
    // Seed default statuses for the new project
    KanbanProjectStatus::create_defaults(pool, project.id).await?;
    Ok(ResponseJson(ApiResponse::success(project)))
}

pub async fn update(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<Uuid>,
    ResponseJson(payload): ResponseJson<UpdateKanbanProject>,
) -> Result<ResponseJson<ApiResponse<KanbanProject>>, ApiError> {
    let pool = &deployment.db().pool;
    let project = KanbanProject::update(pool, id, &payload).await?;
    Ok(ResponseJson(ApiResponse::success(project)))
}

pub async fn remove(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let pool = &deployment.db().pool;
    KanbanProject::delete(pool, id).await?;
    Ok(ResponseJson(ApiResponse::success(())))
}
