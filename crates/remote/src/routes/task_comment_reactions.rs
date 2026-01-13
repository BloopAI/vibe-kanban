use axum::{
    Json, Router,
    extract::{Extension, Path, State},
    http::StatusCode,
    routing::{delete, get},
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
        project_tasks::ProjectTaskRepository,
        task_comment_reactions::{TaskCommentReaction, TaskCommentReactionRepository},
        task_comments::TaskCommentRepository,
    },
};

#[derive(Debug, Serialize)]
pub struct TaskCommentReactionResponse {
    pub id: Uuid,
    pub comment_id: Uuid,
    pub user_id: Uuid,
    pub emoji: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct ListReactionsResponse {
    pub reactions: Vec<TaskCommentReactionResponse>,
}

#[derive(Debug, Deserialize)]
pub struct CreateReactionRequest {
    pub emoji: String,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/comments/{comment_id}/reactions",
            get(list_reactions).post(create_reaction),
        )
        .route("/reactions/{reaction_id}", delete(delete_reaction))
}

async fn ensure_task_access(
    state: &AppState,
    ctx: &RequestContext,
    task_id: Uuid,
) -> Result<(), ErrorResponse> {
    let organization_id = ProjectTaskRepository::organization_id(state.pool(), task_id)
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
    name = "task_comment_reactions.list_reactions",
    skip(state, ctx),
    fields(comment_id = %comment_id, user_id = %ctx.user.id)
)]
async fn list_reactions(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(comment_id): Path<Uuid>,
) -> Result<Json<ListReactionsResponse>, ErrorResponse> {
    let comment = TaskCommentRepository::find_by_id(state.pool(), comment_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %comment_id, "failed to load comment");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to load comment")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "comment not found"))?;

    ensure_task_access(&state, &ctx, comment.task_id).await?;

    let reactions = TaskCommentReactionRepository::list_by_comment(state.pool(), comment_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %comment_id, "failed to list reactions");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to list reactions",
            )
        })?
        .into_iter()
        .map(to_reaction_response)
        .collect();

    Ok(Json(ListReactionsResponse { reactions }))
}

#[instrument(
    name = "task_comment_reactions.create_reaction",
    skip(state, ctx, payload),
    fields(comment_id = %comment_id, user_id = %ctx.user.id)
)]
async fn create_reaction(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(comment_id): Path<Uuid>,
    Json(payload): Json<CreateReactionRequest>,
) -> Result<Json<TaskCommentReactionResponse>, ErrorResponse> {
    let comment = TaskCommentRepository::find_by_id(state.pool(), comment_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %comment_id, "failed to load comment");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to load comment")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "comment not found"))?;

    ensure_task_access(&state, &ctx, comment.task_id).await?;

    let reaction =
        TaskCommentReactionRepository::create(state.pool(), comment_id, ctx.user.id, payload.emoji)
            .await
            .map_err(|error| {
                tracing::error!(?error, "failed to create reaction");
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
            })?;

    Ok(Json(to_reaction_response(reaction)))
}

#[instrument(
    name = "task_comment_reactions.delete_reaction",
    skip(state, ctx),
    fields(reaction_id = %reaction_id, user_id = %ctx.user.id)
)]
async fn delete_reaction(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(reaction_id): Path<Uuid>,
) -> Result<StatusCode, ErrorResponse> {
    let reaction = TaskCommentReactionRepository::find_by_id(state.pool(), reaction_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %reaction_id, "failed to load reaction");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to load reaction")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "reaction not found"))?;

    if reaction.user_id != ctx.user.id {
        return Err(ErrorResponse::new(
            StatusCode::FORBIDDEN,
            "you are not the author of this reaction",
        ));
    }

    let comment = TaskCommentRepository::find_by_id(state.pool(), reaction.comment_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, comment_id = %reaction.comment_id, "failed to load comment");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to load comment")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "comment not found"))?;

    ensure_task_access(&state, &ctx, comment.task_id).await?;

    TaskCommentReactionRepository::delete(state.pool(), reaction_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to delete reaction");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?;

    Ok(StatusCode::NO_CONTENT)
}

fn to_reaction_response(reaction: TaskCommentReaction) -> TaskCommentReactionResponse {
    TaskCommentReactionResponse {
        id: reaction.id,
        comment_id: reaction.comment_id,
        user_id: reaction.user_id,
        emoji: reaction.emoji,
        created_at: reaction.created_at,
    }
}
