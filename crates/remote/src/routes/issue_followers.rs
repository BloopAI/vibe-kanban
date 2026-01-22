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
    db::issue_followers::{IssueFollower, IssueFollowerRepository},
    define_mutation_router,
    entities::{
        CreateIssueFollowerRequest, ListIssueFollowersQuery, ListIssueFollowersResponse,
        UpdateIssueFollowerRequest,
    },
    mutation_types::{DeleteResponse, MutationResponse},
};

// Generate router that references handlers below
define_mutation_router!(IssueFollower, table: "issue_followers");

#[instrument(
    name = "issue_followers.list_issue_followers",
    skip(state, ctx),
    fields(issue_id = %query.issue_id, user_id = %ctx.user.id)
)]
async fn list_issue_followers(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(query): Query<ListIssueFollowersQuery>,
) -> Result<Json<ListIssueFollowersResponse>, ErrorResponse> {
    ensure_issue_access(state.pool(), ctx.user.id, query.issue_id).await?;

    let issue_followers = IssueFollowerRepository::list_by_issue(state.pool(), query.issue_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, issue_id = %query.issue_id, "failed to list issue followers");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to list issue followers",
            )
        })?;

    Ok(Json(ListIssueFollowersResponse { issue_followers }))
}

#[instrument(
    name = "issue_followers.get_issue_follower",
    skip(state, ctx),
    fields(issue_follower_id = %issue_follower_id, user_id = %ctx.user.id)
)]
async fn get_issue_follower(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(issue_follower_id): Path<Uuid>,
) -> Result<Json<IssueFollower>, ErrorResponse> {
    let follower = IssueFollowerRepository::find_by_id(state.pool(), issue_follower_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %issue_follower_id, "failed to load issue follower");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to load issue follower",
            )
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "issue follower not found"))?;

    ensure_issue_access(state.pool(), ctx.user.id, follower.issue_id).await?;

    Ok(Json(follower))
}

#[instrument(
    name = "issue_followers.create_issue_follower",
    skip(state, ctx, payload),
    fields(issue_id = %payload.issue_id, user_id = %ctx.user.id)
)]
async fn create_issue_follower(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<CreateIssueFollowerRequest>,
) -> Result<Json<MutationResponse<IssueFollower>>, ErrorResponse> {
    ensure_issue_access(state.pool(), ctx.user.id, payload.issue_id).await?;

    let response = IssueFollowerRepository::create(
        state.pool(),
        payload.id,
        payload.issue_id,
        payload.user_id,
    )
    .await
    .map_err(|error| {
        tracing::error!(?error, "failed to create issue follower");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;

    Ok(Json(response))
}

#[instrument(
    name = "issue_followers.update_issue_follower",
    skip(_state, _ctx, _payload),
    fields(issue_follower_id = %_issue_follower_id)
)]
async fn update_issue_follower(
    State(_state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    Path(_issue_follower_id): Path<Uuid>,
    Json(_payload): Json<UpdateIssueFollowerRequest>,
) -> Result<Json<MutationResponse<IssueFollower>>, ErrorResponse> {
    Err(ErrorResponse::new(
        StatusCode::METHOD_NOT_ALLOWED,
        "issue followers cannot be updated, only created or deleted",
    ))
}

#[instrument(
    name = "issue_followers.delete_issue_follower",
    skip(state, ctx),
    fields(issue_follower_id = %issue_follower_id, user_id = %ctx.user.id)
)]
async fn delete_issue_follower(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(issue_follower_id): Path<Uuid>,
) -> Result<Json<DeleteResponse>, ErrorResponse> {
    let follower = IssueFollowerRepository::find_by_id(state.pool(), issue_follower_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %issue_follower_id, "failed to load issue follower");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to load issue follower",
            )
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "issue follower not found"))?;

    ensure_issue_access(state.pool(), ctx.user.id, follower.issue_id).await?;

    let response = IssueFollowerRepository::delete(state.pool(), issue_follower_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to delete issue follower");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?;

    Ok(Json(response))
}
