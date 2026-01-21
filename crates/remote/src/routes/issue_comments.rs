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
    db::issue_comments::{IssueComment, IssueCommentRepository},
    define_mutation_router,
    entities::{
        CreateIssueCommentRequest, ListIssueCommentsQuery, ListIssueCommentsResponse,
        UpdateIssueCommentRequest,
    },
    mutation_types::{DeleteResponse, MutationResponse},
};

// Generate router that references handlers below
define_mutation_router!(IssueComment, table: "issue_comments");

#[instrument(
    name = "issue_comments.list_issue_comments",
    skip(state, ctx),
    fields(issue_id = %query.issue_id, user_id = %ctx.user.id)
)]
async fn list_issue_comments(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(query): Query<ListIssueCommentsQuery>,
) -> Result<Json<ListIssueCommentsResponse>, ErrorResponse> {
    ensure_issue_access(state.pool(), ctx.user.id, query.issue_id).await?;

    let issue_comments = IssueCommentRepository::list_by_issue(state.pool(), query.issue_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, issue_id = %query.issue_id, "failed to list issue comments");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to list issue comments",
            )
        })?;

    Ok(Json(ListIssueCommentsResponse { issue_comments }))
}

#[instrument(
    name = "issue_comments.get_issue_comment",
    skip(state, ctx),
    fields(issue_comment_id = %issue_comment_id, user_id = %ctx.user.id)
)]
async fn get_issue_comment(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(issue_comment_id): Path<Uuid>,
) -> Result<Json<IssueComment>, ErrorResponse> {
    let comment = IssueCommentRepository::find_by_id(state.pool(), issue_comment_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %issue_comment_id, "failed to load issue comment");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to load issue comment",
            )
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "issue comment not found"))?;

    ensure_issue_access(state.pool(), ctx.user.id, comment.issue_id).await?;

    Ok(Json(comment))
}

#[instrument(
    name = "issue_comments.create_issue_comment",
    skip(state, ctx, payload),
    fields(issue_id = %payload.issue_id, user_id = %ctx.user.id)
)]
async fn create_issue_comment(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<CreateIssueCommentRequest>,
) -> Result<Json<MutationResponse<IssueComment>>, ErrorResponse> {
    ensure_issue_access(state.pool(), ctx.user.id, payload.issue_id).await?;

    let response = IssueCommentRepository::create(
        state.pool(),
        payload.id,
        payload.issue_id,
        ctx.user.id,
        payload.message,
    )
    .await
    .map_err(|error| {
        tracing::error!(?error, "failed to create issue comment");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;

    Ok(Json(response))
}

#[instrument(
    name = "issue_comments.update_issue_comment",
    skip(state, ctx, payload),
    fields(issue_comment_id = %issue_comment_id, user_id = %ctx.user.id)
)]
async fn update_issue_comment(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(issue_comment_id): Path<Uuid>,
    Json(payload): Json<UpdateIssueCommentRequest>,
) -> Result<Json<MutationResponse<IssueComment>>, ErrorResponse> {
    let comment = IssueCommentRepository::find_by_id(state.pool(), issue_comment_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %issue_comment_id, "failed to load issue comment");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to load issue comment",
            )
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "issue comment not found"))?;

    if comment.author_id != ctx.user.id {
        return Err(ErrorResponse::new(
            StatusCode::FORBIDDEN,
            "you are not the author of this comment",
        ));
    }

    ensure_issue_access(state.pool(), ctx.user.id, comment.issue_id).await?;

    let response = IssueCommentRepository::update(state.pool(), issue_comment_id, payload.message)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to update issue comment");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?;

    Ok(Json(response))
}

#[instrument(
    name = "issue_comments.delete_issue_comment",
    skip(state, ctx),
    fields(issue_comment_id = %issue_comment_id, user_id = %ctx.user.id)
)]
async fn delete_issue_comment(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(issue_comment_id): Path<Uuid>,
) -> Result<Json<DeleteResponse>, ErrorResponse> {
    let comment = IssueCommentRepository::find_by_id(state.pool(), issue_comment_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %issue_comment_id, "failed to load issue comment");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to load issue comment",
            )
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "issue comment not found"))?;

    if comment.author_id != ctx.user.id {
        return Err(ErrorResponse::new(
            StatusCode::FORBIDDEN,
            "you are not the author of this comment",
        ));
    }

    ensure_issue_access(state.pool(), ctx.user.id, comment.issue_id).await?;

    let response = IssueCommentRepository::delete(state.pool(), issue_comment_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to delete issue comment");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?;

    Ok(Json(response))
}
