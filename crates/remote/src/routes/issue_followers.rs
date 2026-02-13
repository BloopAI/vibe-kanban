use axum::{
    Json,
    extract::{Extension, Path, Query, State},
    http::StatusCode,
};
use tracing::instrument;
use uuid::Uuid;

use super::{
    error::{ErrorResponse, db_error},
    organization_members::ensure_issue_access,
};
use api_types::{DeleteResponse, MutationResponse};
use crate::{
    AppState,
    auth::RequestContext,
    db::issue_followers::IssueFollowerRepository,
    mutation_definition::{MutationBuilder, NoUpdate},
};
use api_types::{
    CreateIssueFollowerRequest, IssueFollower, ListIssueFollowersQuery, ListIssueFollowersResponse,
};

/// Mutation definition for IssueFollower - provides both router and TypeScript metadata.
pub fn mutation() -> MutationBuilder<IssueFollower, CreateIssueFollowerRequest, NoUpdate> {
    MutationBuilder::new("issue_followers")
        .list(list_issue_followers)
        .get(get_issue_follower)
        .create(create_issue_follower)
        .delete(delete_issue_follower)
}

pub fn router() -> axum::Router<AppState> {
    mutation().router()
}

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
        db_error(error, "failed to create issue follower")
    })?;

    Ok(Json(response))
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
