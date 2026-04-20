use axum::{
    extract::{Path, State},
    response::Json as ResponseJson,
};
use db::models::kanban::issue::{
    BulkUpdateKanbanIssueItem, CreateKanbanIssue, KanbanIssue, UpdateKanbanIssue,
};
use deployment::Deployment;
use serde::Deserialize;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

#[derive(Deserialize)]
pub struct BulkUpdateBody {
    pub updates: Vec<BulkUpdateKanbanIssueItem>,
}

pub async fn list(
    State(deployment): State<DeploymentImpl>,
    Path(project_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<Vec<KanbanIssue>>>, ApiError> {
    let pool = &deployment.db().pool;
    let issues = KanbanIssue::find_by_project(pool, project_id).await?;
    Ok(ResponseJson(ApiResponse::success(issues)))
}

pub async fn get_one(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<KanbanIssue>>, ApiError> {
    let pool = &deployment.db().pool;
    let issue = KanbanIssue::find_by_id(pool, id)
        .await?
        .ok_or_else(|| ApiError::BadRequest("Kanban issue not found".to_string()))?;
    Ok(ResponseJson(ApiResponse::success(issue)))
}

pub async fn create(
    State(deployment): State<DeploymentImpl>,
    Path(project_id): Path<Uuid>,
    ResponseJson(mut payload): ResponseJson<CreateKanbanIssue>,
) -> Result<ResponseJson<ApiResponse<KanbanIssue>>, ApiError> {
    let pool = &deployment.db().pool;
    payload.project_id = project_id;
    let issue = KanbanIssue::create(pool, &payload).await?;
    Ok(ResponseJson(ApiResponse::success(issue)))
}

pub async fn update(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<Uuid>,
    ResponseJson(payload): ResponseJson<UpdateKanbanIssue>,
) -> Result<ResponseJson<ApiResponse<KanbanIssue>>, ApiError> {
    let pool = &deployment.db().pool;
    let issue = KanbanIssue::update(pool, id, &payload).await?;
    Ok(ResponseJson(ApiResponse::success(issue)))
}

pub async fn bulk_update(
    State(deployment): State<DeploymentImpl>,
    ResponseJson(body): ResponseJson<BulkUpdateBody>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let pool = &deployment.db().pool;
    KanbanIssue::bulk_update(pool, &body.updates).await?;
    Ok(ResponseJson(ApiResponse::success(())))
}

pub async fn remove(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let pool = &deployment.db().pool;
    KanbanIssue::delete(pool, id).await?;
    Ok(ResponseJson(ApiResponse::success(())))
}
