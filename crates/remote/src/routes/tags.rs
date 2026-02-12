use axum::{
    Json,
    extract::{Extension, Path, Query, State},
    http::StatusCode,
};
use tracing::instrument;
use uuid::Uuid;

use super::{
    error::{ErrorResponse, db_error},
    organization_members::ensure_project_access,
};
use api_types::{DeleteResponse, MutationResponse};
use crate::{
    AppState,
    auth::RequestContext,
    db::{tags::TagRepository, types::is_valid_hsl_color},
    mutation_definition::MutationBuilder,
};
use api_types::{CreateTagRequest, ListTagsQuery, ListTagsResponse, Tag, UpdateTagRequest};

/// Mutation definition for Tags - provides both router and TypeScript metadata.
pub fn mutation() -> MutationBuilder<Tag, CreateTagRequest, UpdateTagRequest> {
    MutationBuilder::new("tags")
        .list(list_tags)
        .get(get_tag)
        .create(create_tag)
        .update(update_tag)
        .delete(delete_tag)
}

pub fn router() -> axum::Router<AppState> {
    mutation().router()
}

#[utoipa::path(
    get, path = "/v1/tags",
    tag = "Tags",
    params(("project_id" = Uuid, Query, description = "Project ID")),
    responses(
        (status = 200, description = "List of tags"),
        (status = 403, description = "Forbidden")
    ),
    security(("bearer_auth" = []))
)]
#[instrument(
    name = "tags.list_tags",
    skip(state, ctx),
    fields(project_id = %query.project_id, user_id = %ctx.user.id)
)]
pub(crate) async fn list_tags(
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

#[utoipa::path(
    get, path = "/v1/tags/{id}",
    tag = "Tags",
    params(("id" = Uuid, Path, description = "Tag ID")),
    responses(
        (status = 200, description = "Tag found"),
        (status = 404, description = "Tag not found"),
        (status = 403, description = "Forbidden")
    ),
    security(("bearer_auth" = []))
)]
#[instrument(
    name = "tags.get_tag",
    skip(state, ctx),
    fields(tag_id = %tag_id, user_id = %ctx.user.id)
)]
pub(crate) async fn get_tag(
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

#[utoipa::path(
    post, path = "/v1/tags",
    tag = "Tags",
    request_body = CreateTagRequest,
    responses(
        (status = 200, description = "Tag created"),
        (status = 400, description = "Bad request"),
        (status = 403, description = "Forbidden")
    ),
    security(("bearer_auth" = []))
)]
#[instrument(
    name = "tags.create_tag",
    skip(state, ctx, payload),
    fields(project_id = %payload.project_id, user_id = %ctx.user.id)
)]
pub(crate) async fn create_tag(
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
        db_error(error, "failed to create tag")
    })?;

    Ok(Json(response))
}

#[utoipa::path(
    patch, path = "/v1/tags/{id}",
    tag = "Tags",
    params(("id" = Uuid, Path, description = "Tag ID")),
    request_body = UpdateTagRequest,
    responses(
        (status = 200, description = "Tag updated"),
        (status = 400, description = "Bad request"),
        (status = 404, description = "Tag not found"),
        (status = 403, description = "Forbidden")
    ),
    security(("bearer_auth" = []))
)]
#[instrument(
    name = "tags.update_tag",
    skip(state, ctx, payload),
    fields(tag_id = %tag_id, user_id = %ctx.user.id)
)]
pub(crate) async fn update_tag(
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

#[utoipa::path(
    delete, path = "/v1/tags/{id}",
    tag = "Tags",
    params(("id" = Uuid, Path, description = "Tag ID")),
    responses(
        (status = 200, description = "Tag deleted"),
        (status = 404, description = "Tag not found"),
        (status = 403, description = "Forbidden")
    ),
    security(("bearer_auth" = []))
)]
#[instrument(
    name = "tags.delete_tag",
    skip(state, ctx),
    fields(tag_id = %tag_id, user_id = %ctx.user.id)
)]
pub(crate) async fn delete_tag(
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
