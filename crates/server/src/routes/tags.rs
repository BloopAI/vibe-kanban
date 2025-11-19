use axum::{
    Extension, Json, Router,
    extract::{Query, State},
    middleware::from_fn_with_state,
    response::Json as ResponseJson,
    routing::{get, put},
};
use db::models::tag::{CreateTag, Tag, UpdateTag};
use deployment::Deployment;
use serde::Deserialize;
use ts_rs::TS;
use utils::response::ApiResponse;

use crate::{DeploymentImpl, error::ApiError, middleware::load_tag_middleware};

#[derive(Deserialize, TS)]
pub struct TagSearchParams {
    #[serde(default)]
    pub search: Option<String>,
}

pub async fn get_tags(
    State(deployment): State<DeploymentImpl>,
    Query(params): Query<TagSearchParams>,
) -> Result<ResponseJson<ApiResponse<Vec<Tag>>>, ApiError> {
    let mut tags = Tag::find_all(&deployment.db().pool).await?;

    // Filter by search query if provided
    if let Some(search_query) = params.search {
        let search_lower = search_query.to_lowercase();
        tags.retain(|tag| tag.tag_name.to_lowercase().contains(&search_lower));
    }

    Ok(ResponseJson(ApiResponse::success(tags)))
}

pub async fn create_tag(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateTag>,
) -> Result<ResponseJson<ApiResponse<Tag>>, ApiError> {
    let tag = Tag::create(&deployment.db().pool, &payload).await?;

    deployment
        .track_if_analytics_allowed(
            "tag_created",
            serde_json::json!({
                "tag_id": tag.id.to_string(),
                "tag_name": tag.tag_name,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(tag)))
}

pub async fn update_tag(
    Extension(tag): Extension<Tag>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<UpdateTag>,
) -> Result<ResponseJson<ApiResponse<Tag>>, ApiError> {
    let updated_tag = Tag::update(&deployment.db().pool, tag.id, &payload).await?;

    deployment
        .track_if_analytics_allowed(
            "tag_updated",
            serde_json::json!({
                "tag_id": tag.id.to_string(),
                "tag_name": updated_tag.tag_name,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(updated_tag)))
}

pub async fn delete_tag(
    Extension(tag): Extension<Tag>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let rows_affected = Tag::delete(&deployment.db().pool, tag.id).await?;
    if rows_affected == 0 {
        Err(ApiError::Database(sqlx::Error::RowNotFound))
    } else {
        Ok(ResponseJson(ApiResponse::success(())))
    }
}

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let tag_router = Router::new()
        .route("/", put(update_tag).delete(delete_tag))
        .layer(from_fn_with_state(deployment.clone(), load_tag_middleware));

    let inner = Router::new()
        .route("/", get(get_tags).post(create_tag))
        .nest("/{tag_id}", tag_router);

    Router::new().nest("/tags", inner)
}
