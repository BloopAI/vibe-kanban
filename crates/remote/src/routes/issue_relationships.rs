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
    db::issue_relationships::{IssueRelationship, IssueRelationshipRepository},
    define_mutation_router,
    entities::{
        CreateIssueRelationshipRequest, ListIssueRelationshipsQuery,
        ListIssueRelationshipsResponse, UpdateIssueRelationshipRequest,
    },
    mutation_types::{DeleteResponse, MutationResponse},
};

// Generate router that references handlers below
define_mutation_router!(IssueRelationship, table: "issue_relationships");

#[instrument(
    name = "issue_relationships.list_issue_relationships",
    skip(state, ctx),
    fields(issue_id = %query.issue_id, user_id = %ctx.user.id)
)]
async fn list_issue_relationships(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(query): Query<ListIssueRelationshipsQuery>,
) -> Result<Json<ListIssueRelationshipsResponse>, ErrorResponse> {
    ensure_issue_access(state.pool(), ctx.user.id, query.issue_id).await?;

    let issue_relationships = IssueRelationshipRepository::list_by_issue(
        state.pool(),
        query.issue_id,
    )
    .await
    .map_err(|error| {
        tracing::error!(?error, issue_id = %query.issue_id, "failed to list issue relationships");
        ErrorResponse::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "failed to list issue relationships",
        )
    })?;

    Ok(Json(ListIssueRelationshipsResponse {
        issue_relationships,
    }))
}

#[instrument(
    name = "issue_relationships.get_issue_relationship",
    skip(state, ctx),
    fields(issue_relationship_id = %issue_relationship_id, user_id = %ctx.user.id)
)]
async fn get_issue_relationship(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(issue_relationship_id): Path<Uuid>,
) -> Result<Json<IssueRelationship>, ErrorResponse> {
    let relationship = IssueRelationshipRepository::find_by_id(state.pool(), issue_relationship_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %issue_relationship_id, "failed to load issue relationship");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to load issue relationship",
            )
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "issue relationship not found"))?;

    ensure_issue_access(state.pool(), ctx.user.id, relationship.issue_id).await?;

    Ok(Json(relationship))
}

#[instrument(
    name = "issue_relationships.create_issue_relationship",
    skip(state, ctx, payload),
    fields(issue_id = %payload.issue_id, user_id = %ctx.user.id)
)]
async fn create_issue_relationship(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<CreateIssueRelationshipRequest>,
) -> Result<Json<MutationResponse<IssueRelationship>>, ErrorResponse> {
    ensure_issue_access(state.pool(), ctx.user.id, payload.issue_id).await?;

    let response = IssueRelationshipRepository::create(
        state.pool(),
        payload.id,
        payload.issue_id,
        payload.related_issue_id,
        payload.relationship_type,
    )
    .await
    .map_err(|error| {
        tracing::error!(?error, "failed to create issue relationship");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;

    Ok(Json(response))
}

#[instrument(
    name = "issue_relationships.update_issue_relationship",
    skip(_state, _ctx, _payload),
    fields(issue_relationship_id = %_issue_relationship_id)
)]
async fn update_issue_relationship(
    State(_state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    Path(_issue_relationship_id): Path<Uuid>,
    Json(_payload): Json<UpdateIssueRelationshipRequest>,
) -> Result<Json<MutationResponse<IssueRelationship>>, ErrorResponse> {
    Err(ErrorResponse::new(
        StatusCode::METHOD_NOT_ALLOWED,
        "issue relationships cannot be updated, only created or deleted",
    ))
}

#[instrument(
    name = "issue_relationships.delete_issue_relationship",
    skip(state, ctx),
    fields(issue_relationship_id = %issue_relationship_id, user_id = %ctx.user.id)
)]
async fn delete_issue_relationship(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(issue_relationship_id): Path<Uuid>,
) -> Result<Json<DeleteResponse>, ErrorResponse> {
    let relationship = IssueRelationshipRepository::find_by_id(state.pool(), issue_relationship_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %issue_relationship_id, "failed to load issue relationship");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to load issue relationship",
            )
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "issue relationship not found"))?;

    ensure_issue_access(state.pool(), ctx.user.id, relationship.issue_id).await?;

    let response = IssueRelationshipRepository::delete(state.pool(), issue_relationship_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to delete issue relationship");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?;

    Ok(Json(response))
}
