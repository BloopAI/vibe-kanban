use axum::{
    Extension, Json, Router,
    extract::{Path, State},
    middleware::from_fn_with_state,
    response::Json as ResponseJson,
    routing::{delete, get, put},
};
use db::models::{
    project::Project,
    task::Task,
    task_dependency::{CreateTaskDependency, TaskDependency},
};
use deployment::Deployment;
use serde::Deserialize;
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError, middleware::load_project_middleware};

/// Request body for creating a dependency
#[derive(Debug, Deserialize, TS)]
pub struct CreateDependencyRequest {
    pub task_id: Uuid,
    pub depends_on_task_id: Uuid,
    pub created_by: Option<db::models::task_dependency::DependencyCreator>,
}

/// Request body for updating task position
#[derive(Debug, Deserialize, TS)]
pub struct UpdatePositionRequest {
    pub position: i32,
}

/// Get all dependencies for tasks in a project
pub async fn get_project_dependencies(
    Extension(project): Extension<Project>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<TaskDependency>>>, ApiError> {
    let dependencies =
        TaskDependency::find_by_project_id(&deployment.db().pool, project.id).await?;
    Ok(ResponseJson(ApiResponse::success(dependencies)))
}

/// Create a new dependency between tasks
pub async fn create_dependency(
    Extension(project): Extension<Project>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateDependencyRequest>,
) -> Result<ResponseJson<ApiResponse<TaskDependency>>, ApiError> {
    let pool = &deployment.db().pool;

    // 自己参照チェック
    if payload.task_id == payload.depends_on_task_id {
        return Err(ApiError::BadRequest(
            "タスクは自分自身に依存することはできません".to_string(),
        ));
    }

    // タスク存在チェック（task_id）
    let task = Task::find_by_id(pool, payload.task_id)
        .await?
        .ok_or_else(|| {
            ApiError::NotFound(format!(
                "タスクが見つかりません: {}",
                payload.task_id
            ))
        })?;

    // タスクがプロジェクトに属しているかチェック
    if task.project_id != project.id {
        return Err(ApiError::BadRequest(
            "タスクはこのプロジェクトに属していません".to_string(),
        ));
    }

    // タスク存在チェック（depends_on_task_id）
    let depends_on_task = Task::find_by_id(pool, payload.depends_on_task_id)
        .await?
        .ok_or_else(|| {
            ApiError::NotFound(format!(
                "依存先タスクが見つかりません: {}",
                payload.depends_on_task_id
            ))
        })?;

    // 依存先タスクもプロジェクトに属しているかチェック
    if depends_on_task.project_id != project.id {
        return Err(ApiError::BadRequest(
            "依存先タスクはこのプロジェクトに属していません".to_string(),
        ));
    }

    // 重複チェック
    if TaskDependency::exists(pool, payload.task_id, payload.depends_on_task_id).await? {
        return Err(ApiError::Conflict(
            "この依存関係は既に存在します".to_string(),
        ));
    }

    // 循環依存チェック
    if TaskDependency::would_create_cycle(pool, payload.task_id, payload.depends_on_task_id).await?
    {
        return Err(ApiError::Conflict(
            "この依存関係を追加すると循環依存が発生します".to_string(),
        ));
    }

    // 依存関係を作成
    let create_data = CreateTaskDependency {
        task_id: payload.task_id,
        depends_on_task_id: payload.depends_on_task_id,
        created_by: payload.created_by,
    };

    let dependency = TaskDependency::create(pool, &create_data).await?;

    tracing::info!(
        "Created dependency: task {} depends on task {}",
        payload.task_id,
        payload.depends_on_task_id
    );

    Ok(ResponseJson(ApiResponse::success(dependency)))
}

/// Delete a dependency by ID
pub async fn delete_dependency(
    State(deployment): State<DeploymentImpl>,
    Path(dependency_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let pool = &deployment.db().pool;

    // 依存関係が存在するかチェック
    let dependency = TaskDependency::find_by_id(pool, dependency_id)
        .await?
        .ok_or_else(|| {
            ApiError::NotFound(format!(
                "依存関係が見つかりません: {}",
                dependency_id
            ))
        })?;

    // 削除実行
    let rows_affected = TaskDependency::delete(pool, dependency_id).await?;

    if rows_affected == 0 {
        return Err(ApiError::NotFound(
            "依存関係の削除に失敗しました".to_string(),
        ));
    }

    tracing::info!(
        "Deleted dependency {}: task {} no longer depends on task {}",
        dependency_id,
        dependency.task_id,
        dependency.depends_on_task_id
    );

    Ok(ResponseJson(ApiResponse::success(())))
}

/// Update task position
pub async fn update_task_position(
    State(deployment): State<DeploymentImpl>,
    Path(task_id): Path<Uuid>,
    Json(payload): Json<UpdatePositionRequest>,
) -> Result<ResponseJson<ApiResponse<Task>>, ApiError> {
    let pool = &deployment.db().pool;

    // タスク存在チェック
    Task::find_by_id(pool, task_id)
        .await?
        .ok_or_else(|| {
            ApiError::NotFound(format!("タスクが見つかりません: {}", task_id))
        })?;

    // 位置を更新
    let updated_task = Task::update_position(pool, task_id, payload.position).await?;

    tracing::info!(
        "Updated task {} position to {}",
        task_id,
        payload.position
    );

    Ok(ResponseJson(ApiResponse::success(updated_task)))
}

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    // プロジェクト内の依存関係操作（project_idが必要）
    let project_dependencies_router = Router::new()
        .route("/dependencies", get(get_project_dependencies).post(create_dependency))
        .layer(from_fn_with_state(
            deployment.clone(),
            load_project_middleware,
        ));

    // 依存関係の直接操作（dependency_idのみ）
    let dependencies_router = Router::new()
        .route("/{dependency_id}", delete(delete_dependency));

    // タスク位置の更新
    let task_position_router = Router::new()
        .route("/{task_id}/position", put(update_task_position));

    Router::new()
        .nest("/projects/{id}", project_dependencies_router)
        .nest("/dependencies", dependencies_router)
        .nest("/tasks", task_position_router)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_dependency_request_deserialize() {
        let json = r#"{"task_id": "00000000-0000-0000-0000-000000000001", "depends_on_task_id": "00000000-0000-0000-0000-000000000002"}"#;
        let request: CreateDependencyRequest = serde_json::from_str(json).unwrap();
        assert_eq!(
            request.task_id,
            Uuid::parse_str("00000000-0000-0000-0000-000000000001").unwrap()
        );
        assert_eq!(
            request.depends_on_task_id,
            Uuid::parse_str("00000000-0000-0000-0000-000000000002").unwrap()
        );
        assert!(request.created_by.is_none());
    }

    #[test]
    fn test_update_position_request_deserialize() {
        let json = r#"{"position": 5}"#;
        let request: UpdatePositionRequest = serde_json::from_str(json).unwrap();
        assert_eq!(request.position, 5);
    }
}
