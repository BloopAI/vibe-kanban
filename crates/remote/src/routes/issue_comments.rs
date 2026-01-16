use axum::{
    Json, Router,
    extract::{Extension, Path, State},
    http::StatusCode,
    routing::{get, patch},
};
use serde::{Deserialize, Serialize};
use tracing::instrument;
use uuid::Uuid;

use super::{error::ErrorResponse, organization_members::ensure_issue_access};
use crate::{
    AppState,
    auth::RequestContext,
    db::issue_comments::{IssueComment, IssueCommentRepository},
};

#[derive(Debug, Serialize)]
pub struct ListCommentsResponse {
    pub comments: Vec<IssueComment>,
}

#[derive(Debug, Deserialize)]
pub struct CreateCommentRequest {
    pub message: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateCommentRequest {
    pub message: String,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/issues/{issue_id}/comments",
            get(list_comments).post(create_comment),
        )
        .route(
            "/comments/{comment_id}",
            patch(update_comment).delete(delete_comment),
        )
}

#[instrument(
    name = "issue_comments.list_comments",
    skip(state, ctx),
    fields(issue_id = %issue_id, user_id = %ctx.user.id)
)]
async fn list_comments(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(issue_id): Path<Uuid>,
) -> Result<Json<ListCommentsResponse>, ErrorResponse> {
    ensure_issue_access(state.pool(), ctx.user.id, issue_id).await?;

    let comments = IssueCommentRepository::list_by_issue(state.pool(), issue_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %issue_id, "failed to list issue comments");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to list issue comments",
            )
        })?;

    Ok(Json(ListCommentsResponse { comments }))
}

#[instrument(
    name = "issue_comments.create_comment",
    skip(state, ctx, payload),
    fields(issue_id = %issue_id, user_id = %ctx.user.id)
)]
async fn create_comment(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(issue_id): Path<Uuid>,
    Json(payload): Json<CreateCommentRequest>,
) -> Result<Json<IssueComment>, ErrorResponse> {
    ensure_issue_access(state.pool(), ctx.user.id, issue_id).await?;

    let comment =
        IssueCommentRepository::create(state.pool(), issue_id, ctx.user.id, payload.message)
            .await
            .map_err(|error| {
                tracing::error!(?error, "failed to create issue comment");
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
            })?;

    Ok(Json(comment))
}

#[instrument(
    name = "issue_comments.update_comment",
    skip(state, ctx, payload),
    fields(comment_id = %comment_id, user_id = %ctx.user.id)
)]
async fn update_comment(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(comment_id): Path<Uuid>,
    Json(payload): Json<UpdateCommentRequest>,
) -> Result<Json<IssueComment>, ErrorResponse> {
    let comment = IssueCommentRepository::find_by_id(state.pool(), comment_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %comment_id, "failed to load issue comment");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to load issue comment",
            )
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "comment not found"))?;

    if comment.author_id != ctx.user.id {
        return Err(ErrorResponse::new(
            StatusCode::FORBIDDEN,
            "you are not the author of this comment",
        ));
    }

    ensure_issue_access(state.pool(), ctx.user.id, comment.issue_id).await?;

    let updated_comment = IssueCommentRepository::update(state.pool(), comment_id, payload.message)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to update issue comment");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?;

    Ok(Json(updated_comment))
}

#[instrument(
    name = "issue_comments.delete_comment",
    skip(state, ctx),
    fields(comment_id = %comment_id, user_id = %ctx.user.id)
)]
async fn delete_comment(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(comment_id): Path<Uuid>,
) -> Result<StatusCode, ErrorResponse> {
    let comment = IssueCommentRepository::find_by_id(state.pool(), comment_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %comment_id, "failed to load issue comment");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to load issue comment",
            )
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "comment not found"))?;

    if comment.author_id != ctx.user.id {
        return Err(ErrorResponse::new(
            StatusCode::FORBIDDEN,
            "you are not the author of this comment",
        ));
    }

    ensure_issue_access(state.pool(), ctx.user.id, comment.issue_id).await?;

    IssueCommentRepository::delete(state.pool(), comment_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to delete issue comment");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?;

    Ok(StatusCode::NO_CONTENT)
}
