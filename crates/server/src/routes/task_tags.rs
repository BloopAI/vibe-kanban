use axum::{
    Extension, Json, Router,
    extract::{Query, State},
    middleware::from_fn_with_state,
    response::Json as ResponseJson,
    routing::get,
};
use db::models::task_tag::{CreateTaskTag, TaskTag, UpdateTaskTag};
use deployment::Deployment;
use serde::Deserialize;
use sqlx::Error as SqlxError;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError, middleware::load_task_tag_middleware};

#[derive(Debug, Deserialize)]
pub struct TaskTagQuery {
    global: Option<bool>,
    project_id: Option<Uuid>,
}

pub async fn get_tags(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<TaskTagQuery>,
) -> Result<ResponseJson<ApiResponse<Vec<TaskTag>>>, ApiError> {
    let tags = match (query.global, query.project_id) {
        // All tags: Global and project-specific
        (None, None) => TaskTag::find_all(&deployment.db().pool).await?,
        // Only global tags
        (Some(true), None) => TaskTag::find_by_project_id(&deployment.db().pool, None).await?,
        // Only project-specific tags
        (None | Some(false), Some(project_id)) => {
            TaskTag::find_by_project_id(&deployment.db().pool, Some(project_id)).await?
        }
        // No global tags, but project_id is None, return empty list
        (Some(false), None) => vec![],
        // Invalid combination: Cannot query both global and project-specific tags
        (Some(_), Some(_)) => {
            return Err(ApiError::Database(SqlxError::InvalidArgument(
                "Cannot query both global and project-specific tags".to_string(),
            )));
        }
    };
    Ok(ResponseJson(ApiResponse::success(tags)))
}

pub async fn get_tag(
    Extension(tag): Extension<TaskTag>,
) -> Result<ResponseJson<ApiResponse<TaskTag>>, ApiError> {
    Ok(Json(ApiResponse::success(tag)))
}

pub async fn create_tag(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateTaskTag>,
) -> Result<ResponseJson<ApiResponse<TaskTag>>, ApiError> {
    let tag = TaskTag::create(&deployment.db().pool, &payload).await?;

    deployment
        .track_if_analytics_allowed(
            "task_tag_created",
            serde_json::json!({
                "tag_id": tag.id.to_string(),
                "project_id": tag.project_id.map(|id| id.to_string()),
                "is_global": tag.project_id.is_none(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(tag)))
}

pub async fn update_tag(
    Extension(tag): Extension<TaskTag>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<UpdateTaskTag>,
) -> Result<ResponseJson<ApiResponse<TaskTag>>, ApiError> {
    let updated_tag = TaskTag::update(&deployment.db().pool, tag.id, &payload).await?;

    deployment
        .track_if_analytics_allowed(
            "task_tag_updated",
            serde_json::json!({
                "tag_id": tag.id.to_string(),
                "project_id": tag.project_id.map(|id| id.to_string()),
                "is_global": tag.project_id.is_none(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(updated_tag)))
}

pub async fn delete_tag(
    Extension(tag): Extension<TaskTag>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let rows_affected = TaskTag::delete(&deployment.db().pool, tag.id).await?;
    if rows_affected == 0 {
        Err(ApiError::Database(SqlxError::RowNotFound))
    } else {
        Ok(ResponseJson(ApiResponse::success(())))
    }
}

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let task_tag_router = Router::new()
        .route("/", get(get_tag).put(update_tag).delete(delete_tag))
        .layer(from_fn_with_state(
            deployment.clone(),
            load_task_tag_middleware,
        ));

    let inner = Router::new()
        .route("/", get(get_tags).post(create_tag))
        .nest("/{tag_id}", task_tag_router);

    Router::new().nest("/tags", inner)
}
