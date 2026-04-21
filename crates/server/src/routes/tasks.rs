use axum::{
    Json, Router,
    extract::{Path, Query, State},
    response::Json as ResponseJson,
    routing::get,
};
use db::models::task::{CreateTask, Task, UpdateTask};
use deployment::Deployment;
use serde::Deserialize;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

#[derive(Deserialize)]
pub struct ListQuery {
    #[serde(default)]
    pub parent_workspace_id: Option<Uuid>,
}

pub async fn create_task(
    State(deployment): State<DeploymentImpl>,
    Json(body): Json<CreateTask>,
) -> Result<ResponseJson<ApiResponse<Task>>, ApiError> {
    let task = Task::create(&deployment.db().pool, body).await?;
    Ok(ResponseJson(ApiResponse::success(task)))
}

pub async fn list_tasks(
    State(deployment): State<DeploymentImpl>,
    Query(ListQuery {
        parent_workspace_id,
    }): Query<ListQuery>,
) -> Result<ResponseJson<ApiResponse<Vec<Task>>>, ApiError> {
    let tasks = match parent_workspace_id {
        Some(parent) => Task::find_by_parent_workspace_id(&deployment.db().pool, parent).await?,
        None => Task::find_all(&deployment.db().pool).await?,
    };
    Ok(ResponseJson(ApiResponse::success(tasks)))
}

pub async fn get_task(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<Task>>, ApiError> {
    let task = Task::find_by_id(&deployment.db().pool, id)
        .await?
        .ok_or_else(|| ApiError::BadRequest(format!("task {id} not found")))?;
    Ok(ResponseJson(ApiResponse::success(task)))
}

pub async fn update_task(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateTask>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    Task::update(&deployment.db().pool, id, body).await?;
    Ok(ResponseJson(ApiResponse::success(())))
}

pub async fn delete_task(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    match Task::delete(&deployment.db().pool, id).await {
        Ok(()) => Ok(ResponseJson(ApiResponse::success(()))),
        Err(sqlx::Error::RowNotFound) => Err(ApiError::BadRequest(format!("task {id} not found"))),
        Err(e) => Err(e.into()),
    }
}

pub fn router(_deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    Router::new()
        .route("/tasks", get(list_tasks).post(create_task))
        .route(
            "/tasks/{id}",
            get(get_task).put(update_task).delete(delete_task),
        )
}
