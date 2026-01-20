use axum::{
    Json, Router,
    extract::{Extension, Path, State},
    http::StatusCode,
    routing::{get, patch},
};
use serde::{Deserialize, Serialize};
use tracing::instrument;
use uuid::Uuid;

use super::{error::ErrorResponse, organization_members::ensure_project_access};
use crate::{
    AppState,
    auth::RequestContext,
    db::tags::{Tag, TagRepository},
};

#[derive(Debug, Serialize)]
pub struct ListTagsResponse {
    pub tags: Vec<Tag>,
}

#[derive(Debug, Deserialize)]
pub struct CreateTagRequest {
    pub name: String,
    pub color: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTagRequest {
    pub name: String,
    pub color: String,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/projects/{project_id}/tags",
            get(list_tags).post(create_tag),
        )
        .route("/tags/{tag_id}", patch(update_tag).delete(delete_tag))
}

#[instrument(
    name = "tags.list_tags",
    skip(state, ctx),
    fields(project_id = %project_id, user_id = %ctx.user.id)
)]
async fn list_tags(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(project_id): Path<Uuid>,
) -> Result<Json<ListTagsResponse>, ErrorResponse> {
    ensure_project_access(state.pool(), ctx.user.id, project_id).await?;

    let tags = TagRepository::list_by_project(state.pool(), project_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %project_id, "failed to list tags");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to list tags")
        })?;

    Ok(Json(ListTagsResponse { tags }))
}

#[instrument(
    name = "tags.create_tag",
    skip(state, ctx, payload),
    fields(project_id = %project_id, user_id = %ctx.user.id)
)]
async fn create_tag(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(project_id): Path<Uuid>,
    Json(payload): Json<CreateTagRequest>,
) -> Result<Json<Tag>, ErrorResponse> {
    ensure_project_access(state.pool(), ctx.user.id, project_id).await?;

    let tag = TagRepository::create(state.pool(), project_id, payload.name, payload.color)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to create tag");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?;

    Ok(Json(tag))
}

#[instrument(
    name = "tags.update_tag",
    skip(state, ctx, payload),
    fields(tag_id = %tag_id, user_id = %ctx.user.id)
)]
async fn update_tag(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(tag_id): Path<Uuid>,
    Json(payload): Json<UpdateTagRequest>,
) -> Result<Json<Tag>, ErrorResponse> {
    let tag = TagRepository::find_by_id(state.pool(), tag_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %tag_id, "failed to load tag");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to load tag")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "tag not found"))?;

    ensure_project_access(state.pool(), ctx.user.id, tag.project_id).await?;

    let updated_tag = TagRepository::update(state.pool(), tag_id, payload.name, payload.color)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to update tag");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?;

    Ok(Json(updated_tag))
}

#[instrument(
    name = "tags.delete_tag",
    skip(state, ctx),
    fields(tag_id = %tag_id, user_id = %ctx.user.id)
)]
async fn delete_tag(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(tag_id): Path<Uuid>,
) -> Result<StatusCode, ErrorResponse> {
    let tag = TagRepository::find_by_id(state.pool(), tag_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %tag_id, "failed to load tag");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to load tag")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "tag not found"))?;

    ensure_project_access(state.pool(), ctx.user.id, tag.project_id).await?;

    TagRepository::delete(state.pool(), tag_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to delete tag");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?;

    Ok(StatusCode::NO_CONTENT)
}
