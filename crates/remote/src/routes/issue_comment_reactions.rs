use axum::{
    Json, Router,
    extract::{Extension, Path, State},
    http::StatusCode,
    routing::{delete, get},
};
use serde::{Deserialize, Serialize};
use tracing::instrument;
use uuid::Uuid;

use super::{error::ErrorResponse, organization_members::ensure_issue_access};
use crate::{
    AppState,
    auth::RequestContext,
    db::{
        issue_comment_reactions::{IssueCommentReaction, IssueCommentReactionRepository},
        issue_comments::IssueCommentRepository,
    },
};

#[derive(Debug, Serialize)]
pub struct ListReactionsResponse {
    pub reactions: Vec<IssueCommentReaction>,
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

#[instrument(
    name = "issue_comment_reactions.list_reactions",
    skip(state, ctx),
    fields(comment_id = %comment_id, user_id = %ctx.user.id)
)]
async fn list_reactions(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(comment_id): Path<Uuid>,
) -> Result<Json<ListReactionsResponse>, ErrorResponse> {
    let comment = IssueCommentRepository::find_by_id(state.pool(), comment_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %comment_id, "failed to load comment");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to load comment")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "comment not found"))?;

    ensure_issue_access(state.pool(), ctx.user.id, comment.issue_id).await?;

    let reactions = IssueCommentReactionRepository::list_by_comment(state.pool(), comment_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %comment_id, "failed to list reactions");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to list reactions",
            )
        })?;

    Ok(Json(ListReactionsResponse { reactions }))
}

#[instrument(
    name = "issue_comment_reactions.create_reaction",
    skip(state, ctx, payload),
    fields(comment_id = %comment_id, user_id = %ctx.user.id)
)]
async fn create_reaction(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(comment_id): Path<Uuid>,
    Json(payload): Json<CreateReactionRequest>,
) -> Result<Json<IssueCommentReaction>, ErrorResponse> {
    let comment = IssueCommentRepository::find_by_id(state.pool(), comment_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %comment_id, "failed to load comment");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to load comment")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "comment not found"))?;

    ensure_issue_access(state.pool(), ctx.user.id, comment.issue_id).await?;

    let reaction = IssueCommentReactionRepository::create(
        state.pool(),
        comment_id,
        ctx.user.id,
        payload.emoji,
    )
    .await
    .map_err(|error| {
        tracing::error!(?error, "failed to create reaction");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;

    Ok(Json(reaction))
}

#[instrument(
    name = "issue_comment_reactions.delete_reaction",
    skip(state, ctx),
    fields(reaction_id = %reaction_id, user_id = %ctx.user.id)
)]
async fn delete_reaction(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(reaction_id): Path<Uuid>,
) -> Result<StatusCode, ErrorResponse> {
    let reaction = IssueCommentReactionRepository::find_by_id(state.pool(), reaction_id)
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

    let comment = IssueCommentRepository::find_by_id(state.pool(), reaction.comment_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, comment_id = %reaction.comment_id, "failed to load comment");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to load comment")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "comment not found"))?;

    ensure_issue_access(state.pool(), ctx.user.id, comment.issue_id).await?;

    IssueCommentReactionRepository::delete(state.pool(), reaction_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to delete reaction");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?;

    Ok(StatusCode::NO_CONTENT)
}
