use axum::{
    Json,
    extract::{Extension, Path, Query, State},
    http::StatusCode,
};
use tracing::instrument;
use uuid::Uuid;

use super::{error::ErrorResponse, organization_members::ensure_issue_access};
use crate::{
    AppState,
    auth::RequestContext,
    db::issue_tags::{IssueTag, IssueTagRepository},
    define_mutation_router,
    entities::{
        CreateIssueTagRequest, ListIssueTagsQuery, ListIssueTagsResponse, UpdateIssueTagRequest,
    },
    mutation_types::{DeleteResponse, MutationResponse},
};

// Generate router that references handlers below
define_mutation_router!(IssueTag, table: "issue_tags");

#[instrument(
    name = "issue_tags.list_issue_tags",
    skip(state, ctx),
    fields(issue_id = %query.issue_id, user_id = %ctx.user.id)
)]
async fn list_issue_tags(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(query): Query<ListIssueTagsQuery>,
) -> Result<Json<ListIssueTagsResponse>, ErrorResponse> {
    ensure_issue_access(state.pool(), ctx.user.id, query.issue_id).await?;

    let issue_tags = IssueTagRepository::list_by_issue(state.pool(), query.issue_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, issue_id = %query.issue_id, "failed to list issue tags");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to list issue tags",
            )
        })?;

    Ok(Json(ListIssueTagsResponse { issue_tags }))
}

#[instrument(
    name = "issue_tags.get_issue_tag",
    skip(state, ctx),
    fields(issue_tag_id = %issue_tag_id, user_id = %ctx.user.id)
)]
async fn get_issue_tag(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(issue_tag_id): Path<Uuid>,
) -> Result<Json<IssueTag>, ErrorResponse> {
    let issue_tag = IssueTagRepository::find_by_id(state.pool(), issue_tag_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %issue_tag_id, "failed to load issue tag");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to load issue tag",
            )
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "issue tag not found"))?;

    ensure_issue_access(state.pool(), ctx.user.id, issue_tag.issue_id).await?;

    Ok(Json(issue_tag))
}

#[instrument(
    name = "issue_tags.create_issue_tag",
    skip(state, ctx, payload),
    fields(issue_id = %payload.issue_id, user_id = %ctx.user.id)
)]
async fn create_issue_tag(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<CreateIssueTagRequest>,
) -> Result<Json<MutationResponse<IssueTag>>, ErrorResponse> {
    ensure_issue_access(state.pool(), ctx.user.id, payload.issue_id).await?;

    let response =
        IssueTagRepository::create(state.pool(), payload.id, payload.issue_id, payload.tag_id)
            .await
            .map_err(|error| {
                tracing::error!(?error, "failed to create issue tag");
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
            })?;

    Ok(Json(response))
}

#[instrument(
    name = "issue_tags.update_issue_tag",
    skip(_state, _ctx, _payload),
    fields(issue_tag_id = %_issue_tag_id)
)]
async fn update_issue_tag(
    State(_state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    Path(_issue_tag_id): Path<Uuid>,
    Json(_payload): Json<UpdateIssueTagRequest>,
) -> Result<Json<MutationResponse<IssueTag>>, ErrorResponse> {
    Err(ErrorResponse::new(
        StatusCode::METHOD_NOT_ALLOWED,
        "issue tags cannot be updated, only created or deleted",
    ))
}

#[instrument(
    name = "issue_tags.delete_issue_tag",
    skip(state, ctx),
    fields(issue_tag_id = %issue_tag_id, user_id = %ctx.user.id)
)]
async fn delete_issue_tag(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(issue_tag_id): Path<Uuid>,
) -> Result<Json<DeleteResponse>, ErrorResponse> {
    let issue_tag = IssueTagRepository::find_by_id(state.pool(), issue_tag_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %issue_tag_id, "failed to load issue tag");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to load issue tag",
            )
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "issue tag not found"))?;

    ensure_issue_access(state.pool(), ctx.user.id, issue_tag.issue_id).await?;

    let response = IssueTagRepository::delete(state.pool(), issue_tag_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to delete issue tag");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?;

    Ok(Json(response))
}
