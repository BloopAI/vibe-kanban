use axum::{
    Json,
    extract::{Extension, Path, Query, State},
    http::StatusCode,
};
use tracing::instrument;
use uuid::Uuid;

use super::{
    error::{ErrorResponse, db_error},
    organization_members::{ensure_issue_access, ensure_project_access},
};
use api_types::{DeleteResponse, MutationResponse};
use crate::{
    AppState,
    auth::RequestContext,
    db::issue_relationships::IssueRelationshipRepository,
    mutation_definition::{MutationBuilder, NoUpdate},
};
use api_types::{
    CreateIssueRelationshipRequest, IssueRelationship, ListIssueRelationshipsQuery,
    ListIssueRelationshipsResponse,
};

/// Mutation definition for IssueRelationship - provides both router and TypeScript metadata.
pub fn mutation(
) -> MutationBuilder<IssueRelationship, CreateIssueRelationshipRequest, NoUpdate> {
    MutationBuilder::new("issue_relationships")
        .list(list_issue_relationships)
        .get(get_issue_relationship)
        .create(create_issue_relationship)
        .delete(delete_issue_relationship)
        .fallback_list_url("/issue_relationships?project_id={project_id}")
}

pub fn router() -> axum::Router<AppState> {
    mutation().router()
}

#[instrument(
    name = "issue_relationships.list_issue_relationships",
    skip(state, ctx),
    fields(user_id = %ctx.user.id)
)]
async fn list_issue_relationships(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(query): Query<ListIssueRelationshipsQuery>,
) -> Result<Json<ListIssueRelationshipsResponse>, ErrorResponse> {
    let issue_relationships = match (query.issue_id, query.project_id) {
        (Some(issue_id), None) => {
            ensure_issue_access(state.pool(), ctx.user.id, issue_id).await?;
            IssueRelationshipRepository::list_by_issue(state.pool(), issue_id).await
        }
        (None, Some(project_id)) => {
            ensure_project_access(state.pool(), ctx.user.id, project_id).await?;
            IssueRelationshipRepository::list_by_project(state.pool(), project_id).await
        }
        _ => {
            return Err(ErrorResponse::new(
                StatusCode::BAD_REQUEST,
                "exactly one of issue_id or project_id is required",
            ));
        }
    }
    .map_err(|error| {
        tracing::error!(?error, "failed to list issue relationships");
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
        db_error(error, "failed to create issue relationship")
    })?;

    Ok(Json(response))
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
