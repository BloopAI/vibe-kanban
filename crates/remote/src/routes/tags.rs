use axum::{
    Json,
    extract::{Extension, Path, Query, State},
    http::StatusCode,
};
use tracing::instrument;
use uuid::Uuid;

use super::{error::ErrorResponse, organization_members::ensure_project_access};
use crate::{
    AppState,
    auth::RequestContext,
    db::{
        tags::{Tag, TagRepository},
        types::is_valid_hsl_color,
    },
    define_mutation_router,
    entities::{CreateTagRequest, ListTagsQuery, ListTagsResponse, UpdateTagRequest},
    mutation_types::{DeleteResponse, MutationResponse},
};

// Generate router that references handlers below
define_mutation_router!(Tag, table: "tags");

#[instrument(
    name = "tags.list_tags",
    skip(state, ctx),
    fields(project_id = %query.project_id, user_id = %ctx.user.id)
)]
async fn list_tags(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(query): Query<ListTagsQuery>,
) -> Result<Json<ListTagsResponse>, ErrorResponse> {
    ensure_project_access(state.pool(), ctx.user.id, query.project_id).await?;

    let tags = TagRepository::list_by_project(state.pool(), query.project_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, project_id = %query.project_id, "failed to list tags");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to list tags")
        })?;

    Ok(Json(ListTagsResponse { tags }))
}

#[instrument(
    name = "tags.get_tag",
    skip(state, ctx),
    fields(tag_id = %tag_id, user_id = %ctx.user.id)
)]
async fn get_tag(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(tag_id): Path<Uuid>,
) -> Result<Json<Tag>, ErrorResponse> {
    let tag = TagRepository::find_by_id(state.pool(), tag_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %tag_id, "failed to load tag");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to load tag")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "tag not found"))?;

    ensure_project_access(state.pool(), ctx.user.id, tag.project_id).await?;

    Ok(Json(tag))
}

#[instrument(
    name = "tags.create_tag",
    skip(state, ctx, payload),
    fields(project_id = %payload.project_id, user_id = %ctx.user.id)
)]
async fn create_tag(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<CreateTagRequest>,
) -> Result<Json<MutationResponse<Tag>>, ErrorResponse> {
    ensure_project_access(state.pool(), ctx.user.id, payload.project_id).await?;

    if !is_valid_hsl_color(&payload.color) {
        return Err(ErrorResponse::new(
            StatusCode::BAD_REQUEST,
            "Invalid color format. Expected HSL format: 'H S% L%'",
        ));
    }

    let response = TagRepository::create(
        state.pool(),
        payload.id,
        payload.project_id,
        payload.name,
        payload.color,
    )
    .await
    .map_err(|error| {
        tracing::error!(?error, "failed to create tag");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;

    Ok(Json(response))
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
) -> Result<Json<MutationResponse<Tag>>, ErrorResponse> {
    let tag = TagRepository::find_by_id(state.pool(), tag_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %tag_id, "failed to load tag");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to load tag")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "tag not found"))?;

    ensure_project_access(state.pool(), ctx.user.id, tag.project_id).await?;

    if let Some(ref color) = payload.color
        && !is_valid_hsl_color(color)
    {
        return Err(ErrorResponse::new(
            StatusCode::BAD_REQUEST,
            "Invalid color format. Expected HSL format: 'H S% L%'",
        ));
    }

    // Partial update - use existing values if not provided
    let response = TagRepository::update(state.pool(), tag_id, payload.name, payload.color)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to update tag");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?;

    Ok(Json(response))
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
) -> Result<Json<DeleteResponse>, ErrorResponse> {
    let tag = TagRepository::find_by_id(state.pool(), tag_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %tag_id, "failed to load tag");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to load tag")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "tag not found"))?;

    ensure_project_access(state.pool(), ctx.user.id, tag.project_id).await?;

    let response = TagRepository::delete(state.pool(), tag_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to delete tag");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?;

    Ok(Json(response))
}
