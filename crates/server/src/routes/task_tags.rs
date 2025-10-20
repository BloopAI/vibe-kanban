use axum::{
    Extension, Json, Router, extract::State, middleware::from_fn_with_state,
    response::Json as ResponseJson, routing::get,
};
use db::models::task_tag::{CreateTaskTag, TaskTag, UpdateTaskTag};
use deployment::Deployment;
use utils::response::ApiResponse;

use crate::{DeploymentImpl, error::ApiError, middleware::load_task_tag_middleware};

pub async fn get_tags(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<TaskTag>>>, ApiError> {
    let tags = TaskTag::find_all(&deployment.db().pool).await?;
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
                "tag_name": tag.tag_name,
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
                "tag_name": updated_tag.tag_name,
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
        Err(ApiError::Database(sqlx::Error::RowNotFound))
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
