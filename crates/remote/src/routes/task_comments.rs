use axum::{
    Json, Router,
    extract::{Extension, Path, State},
    http::StatusCode,
    routing::{get, patch},
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tracing::instrument;
use uuid::Uuid;

use super::{error::ErrorResponse, organization_members::ensure_member_access};
use crate::{
    AppState,
    auth::RequestContext,
    db::{
        task_comments::{TaskComment, TaskCommentRepository},
        tasks::SharedTaskRepository,
    },
};

#[derive(Debug, Serialize)]
pub struct TaskCommentResponse {
    pub id: Uuid,
    pub task_id: Uuid,
    pub author_id: Uuid,
    pub message: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct ListCommentsResponse {
    pub comments: Vec<TaskCommentResponse>,
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
            "/tasks/{task_id}/comments",
            get(list_comments).post(create_comment),
        )
        .route(
            "/comments/{comment_id}",
            patch(update_comment).delete(delete_comment),
        )
}

async fn ensure_task_access(
    state: &AppState,
    ctx: &RequestContext,
    task_id: Uuid,
) -> Result<(), ErrorResponse> {
    let organization_id = SharedTaskRepository::organization_id(state.pool(), task_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %task_id, "failed to load task organization");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to load task")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "task not found"))?;

    ensure_member_access(state.pool(), organization_id, ctx.user.id).await?;
    Ok(())
}

#[instrument(
    name = "task_comments.list_comments",
    skip(state, ctx),
    fields(task_id = %task_id, user_id = %ctx.user.id)
)]
async fn list_comments(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(task_id): Path<Uuid>,
) -> Result<Json<ListCommentsResponse>, ErrorResponse> {
    ensure_task_access(&state, &ctx, task_id).await?;

    let comments = TaskCommentRepository::list_by_task(state.pool(), task_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %task_id, "failed to list task comments");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to list task comments",
            )
        })?
        .into_iter()
        .map(to_comment_response)
        .collect();

    Ok(Json(ListCommentsResponse { comments }))
}

#[instrument(
    name = "task_comments.create_comment",
    skip(state, ctx, payload),
    fields(task_id = %task_id, user_id = %ctx.user.id)
)]
async fn create_comment(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(task_id): Path<Uuid>,
    Json(payload): Json<CreateCommentRequest>,
) -> Result<Json<TaskCommentResponse>, ErrorResponse> {
    ensure_task_access(&state, &ctx, task_id).await?;

    let comment =
        TaskCommentRepository::create(state.pool(), task_id, ctx.user.id, payload.message)
            .await
            .map_err(|error| {
                tracing::error!(?error, "failed to create task comment");
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
            })?;

    Ok(Json(to_comment_response(comment)))
}

#[instrument(
    name = "task_comments.update_comment",
    skip(state, ctx, payload),
    fields(comment_id = %comment_id, user_id = %ctx.user.id)
)]
async fn update_comment(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(comment_id): Path<Uuid>,
    Json(payload): Json<UpdateCommentRequest>,
) -> Result<Json<TaskCommentResponse>, ErrorResponse> {
    let comment = TaskCommentRepository::find_by_id(state.pool(), comment_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %comment_id, "failed to load task comment");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to load task comment",
            )
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "comment not found"))?;

    if comment.author_id != ctx.user.id {
        return Err(ErrorResponse::new(
            StatusCode::FORBIDDEN,
            "you are not the author of this comment",
        ));
    }

    ensure_task_access(&state, &ctx, comment.task_id).await?;

    let updated_comment = TaskCommentRepository::update(state.pool(), comment_id, payload.message)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to update task comment");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?;

    Ok(Json(to_comment_response(updated_comment)))
}

#[instrument(
    name = "task_comments.delete_comment",
    skip(state, ctx),
    fields(comment_id = %comment_id, user_id = %ctx.user.id)
)]
async fn delete_comment(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(comment_id): Path<Uuid>,
) -> Result<StatusCode, ErrorResponse> {
    let comment = TaskCommentRepository::find_by_id(state.pool(), comment_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %comment_id, "failed to load task comment");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to load task comment",
            )
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "comment not found"))?;

    if comment.author_id != ctx.user.id {
        return Err(ErrorResponse::new(
            StatusCode::FORBIDDEN,
            "you are not the author of this comment",
        ));
    }

    ensure_task_access(&state, &ctx, comment.task_id).await?;

    TaskCommentRepository::delete(state.pool(), comment_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to delete task comment");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?;

    Ok(StatusCode::NO_CONTENT)
}

fn to_comment_response(comment: TaskComment) -> TaskCommentResponse {
    TaskCommentResponse {
        id: comment.id,
        task_id: comment.task_id,
        author_id: comment.author_id,
        message: comment.message,
        created_at: comment.created_at,
        updated_at: comment.updated_at,
    }
}
