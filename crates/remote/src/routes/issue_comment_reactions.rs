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
    db::{
        issue_comment_reactions::{IssueCommentReaction, IssueCommentReactionRepository},
        issue_comments::IssueCommentRepository,
    },
    define_mutation_router,
    entities::{
        CreateIssueCommentReactionRequest, ListIssueCommentReactionsQuery,
        ListIssueCommentReactionsResponse, UpdateIssueCommentReactionRequest,
    },
    mutation_types::{DeleteResponse, MutationResponse},
};

// Generate router that references handlers below
define_mutation_router!(IssueCommentReaction, table: "issue_comment_reactions");

#[instrument(
    name = "issue_comment_reactions.list_issue_comment_reactions",
    skip(state, ctx),
    fields(comment_id = %query.comment_id, user_id = %ctx.user.id)
)]
async fn list_issue_comment_reactions(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(query): Query<ListIssueCommentReactionsQuery>,
) -> Result<Json<ListIssueCommentReactionsResponse>, ErrorResponse> {
    let comment = IssueCommentRepository::find_by_id(state.pool(), query.comment_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, comment_id = %query.comment_id, "failed to load comment");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to load comment")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "comment not found"))?;

    ensure_issue_access(state.pool(), ctx.user.id, comment.issue_id).await?;

    let issue_comment_reactions =
        IssueCommentReactionRepository::list_by_comment(state.pool(), query.comment_id)
            .await
            .map_err(|error| {
                tracing::error!(?error, comment_id = %query.comment_id, "failed to list reactions");
                ErrorResponse::new(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "failed to list reactions",
                )
            })?;

    Ok(Json(ListIssueCommentReactionsResponse {
        issue_comment_reactions,
    }))
}

#[instrument(
    name = "issue_comment_reactions.get_issue_comment_reaction",
    skip(state, ctx),
    fields(issue_comment_reaction_id = %issue_comment_reaction_id, user_id = %ctx.user.id)
)]
async fn get_issue_comment_reaction(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(issue_comment_reaction_id): Path<Uuid>,
) -> Result<Json<IssueCommentReaction>, ErrorResponse> {
    let reaction =
        IssueCommentReactionRepository::find_by_id(state.pool(), issue_comment_reaction_id)
            .await
            .map_err(|error| {
                tracing::error!(?error, %issue_comment_reaction_id, "failed to load reaction");
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to load reaction")
            })?
            .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "reaction not found"))?;

    let comment = IssueCommentRepository::find_by_id(state.pool(), reaction.comment_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, comment_id = %reaction.comment_id, "failed to load comment");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to load comment")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "comment not found"))?;

    ensure_issue_access(state.pool(), ctx.user.id, comment.issue_id).await?;

    Ok(Json(reaction))
}

#[instrument(
    name = "issue_comment_reactions.create_issue_comment_reaction",
    skip(state, ctx, payload),
    fields(comment_id = %payload.comment_id, user_id = %ctx.user.id)
)]
async fn create_issue_comment_reaction(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<CreateIssueCommentReactionRequest>,
) -> Result<Json<MutationResponse<IssueCommentReaction>>, ErrorResponse> {
    let comment = IssueCommentRepository::find_by_id(state.pool(), payload.comment_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, comment_id = %payload.comment_id, "failed to load comment");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to load comment")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "comment not found"))?;

    ensure_issue_access(state.pool(), ctx.user.id, comment.issue_id).await?;

    let response = IssueCommentReactionRepository::create(
        state.pool(),
        payload.id,
        payload.comment_id,
        ctx.user.id,
        payload.emoji,
    )
    .await
    .map_err(|error| {
        tracing::error!(?error, "failed to create reaction");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;

    Ok(Json(response))
}

#[instrument(
    name = "issue_comment_reactions.update_issue_comment_reaction",
    skip(state, ctx, payload),
    fields(issue_comment_reaction_id = %issue_comment_reaction_id, user_id = %ctx.user.id)
)]
async fn update_issue_comment_reaction(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(issue_comment_reaction_id): Path<Uuid>,
    Json(payload): Json<UpdateIssueCommentReactionRequest>,
) -> Result<Json<MutationResponse<IssueCommentReaction>>, ErrorResponse> {
    let reaction =
        IssueCommentReactionRepository::find_by_id(state.pool(), issue_comment_reaction_id)
            .await
            .map_err(|error| {
                tracing::error!(?error, %issue_comment_reaction_id, "failed to load reaction");
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

    let response = IssueCommentReactionRepository::update(
        state.pool(),
        issue_comment_reaction_id,
        payload.emoji,
    )
    .await
    .map_err(|error| {
        tracing::error!(?error, "failed to update reaction");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;

    Ok(Json(response))
}

#[instrument(
    name = "issue_comment_reactions.delete_issue_comment_reaction",
    skip(state, ctx),
    fields(issue_comment_reaction_id = %issue_comment_reaction_id, user_id = %ctx.user.id)
)]
async fn delete_issue_comment_reaction(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(issue_comment_reaction_id): Path<Uuid>,
) -> Result<Json<DeleteResponse>, ErrorResponse> {
    let reaction =
        IssueCommentReactionRepository::find_by_id(state.pool(), issue_comment_reaction_id)
            .await
            .map_err(|error| {
                tracing::error!(?error, %issue_comment_reaction_id, "failed to load reaction");
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

    let response = IssueCommentReactionRepository::delete(state.pool(), issue_comment_reaction_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to delete reaction");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?;

    Ok(Json(response))
}
