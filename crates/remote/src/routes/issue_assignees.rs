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
    db::issue_assignees::IssueAssigneeRepository,
    mutation_definition::{MutationBuilder, NoUpdate},
};
use api_types::{
    CreateIssueAssigneeRequest, IssueAssignee, ListIssueAssigneesQuery, ListIssueAssigneesResponse,
};

/// Mutation definition for IssueAssignee - provides both router and TypeScript metadata.
pub fn mutation() -> MutationBuilder<IssueAssignee, CreateIssueAssigneeRequest, NoUpdate> {
    MutationBuilder::new("issue_assignees")
        .list(list_issue_assignees)
        .get(get_issue_assignee)
        .create(create_issue_assignee)
        .delete(delete_issue_assignee)
}

pub fn router() -> axum::Router<AppState> {
    mutation().router()
}

#[utoipa::path(
    get, path = "/v1/issue_assignees",
    tag = "IssueAssignees",
    params(("issue_id" = Uuid, Query, description = "Issue ID")),
    responses(
        (status = 200, description = "List of issue assignees"),
        (status = 403, description = "Forbidden")
    ),
    security(("bearer_auth" = []))
)]
#[instrument(
    name = "issue_assignees.list_issue_assignees",
    skip(state, ctx),
    fields(issue_id = %query.issue_id, user_id = %ctx.user.id)
)]
pub(crate) async fn list_issue_assignees(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(query): Query<ListIssueAssigneesQuery>,
) -> Result<Json<ListIssueAssigneesResponse>, ErrorResponse> {
    ensure_issue_access(state.pool(), ctx.user.id, query.issue_id).await?;

    let issue_assignees = IssueAssigneeRepository::list_by_issue(state.pool(), query.issue_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, issue_id = %query.issue_id, "failed to list issue assignees");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to list issue assignees",
            )
        })?;

    Ok(Json(ListIssueAssigneesResponse { issue_assignees }))
}

#[utoipa::path(
    get, path = "/v1/issue_assignees/{id}",
    tag = "IssueAssignees",
    params(("id" = Uuid, Path, description = "Issue assignee ID")),
    responses(
        (status = 200, description = "Issue assignee found"),
        (status = 404, description = "Issue assignee not found"),
        (status = 403, description = "Forbidden")
    ),
    security(("bearer_auth" = []))
)]
#[instrument(
    name = "issue_assignees.get_issue_assignee",
    skip(state, ctx),
    fields(issue_assignee_id = %issue_assignee_id, user_id = %ctx.user.id)
)]
pub(crate) async fn get_issue_assignee(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(issue_assignee_id): Path<Uuid>,
) -> Result<Json<IssueAssignee>, ErrorResponse> {
    let assignee = IssueAssigneeRepository::find_by_id(state.pool(), issue_assignee_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %issue_assignee_id, "failed to load issue assignee");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to load issue assignee",
            )
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "issue assignee not found"))?;

    ensure_issue_access(state.pool(), ctx.user.id, assignee.issue_id).await?;

    Ok(Json(assignee))
}

#[utoipa::path(
    post, path = "/v1/issue_assignees",
    tag = "IssueAssignees",
    request_body = CreateIssueAssigneeRequest,
    responses(
        (status = 200, description = "Issue assignee created"),
        (status = 403, description = "Forbidden")
    ),
    security(("bearer_auth" = []))
)]
#[instrument(
    name = "issue_assignees.create_issue_assignee",
    skip(state, ctx, payload),
    fields(issue_id = %payload.issue_id, user_id = %ctx.user.id)
)]
pub(crate) async fn create_issue_assignee(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<CreateIssueAssigneeRequest>,
) -> Result<Json<MutationResponse<IssueAssignee>>, ErrorResponse> {
    ensure_issue_access(state.pool(), ctx.user.id, payload.issue_id).await?;

    let response = IssueAssigneeRepository::create(
        state.pool(),
        payload.id,
        payload.issue_id,
        payload.user_id,
    )
    .await
    .map_err(|error| {
        tracing::error!(?error, "failed to create issue assignee");
        db_error(error, "failed to create issue assignee")
    })?;

    Ok(Json(response))
}

#[utoipa::path(
    delete, path = "/v1/issue_assignees/{id}",
    tag = "IssueAssignees",
    params(("id" = Uuid, Path, description = "Issue assignee ID")),
    responses(
        (status = 200, description = "Issue assignee deleted"),
        (status = 404, description = "Issue assignee not found"),
        (status = 403, description = "Forbidden")
    ),
    security(("bearer_auth" = []))
)]
#[instrument(
    name = "issue_assignees.delete_issue_assignee",
    skip(state, ctx),
    fields(issue_assignee_id = %issue_assignee_id, user_id = %ctx.user.id)
)]
pub(crate) async fn delete_issue_assignee(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(issue_assignee_id): Path<Uuid>,
) -> Result<Json<DeleteResponse>, ErrorResponse> {
    let assignee = IssueAssigneeRepository::find_by_id(state.pool(), issue_assignee_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %issue_assignee_id, "failed to load issue assignee");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to load issue assignee",
            )
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "issue assignee not found"))?;

    ensure_issue_access(state.pool(), ctx.user.id, assignee.issue_id).await?;

    let response = IssueAssigneeRepository::delete(state.pool(), issue_assignee_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to delete issue assignee");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?;

    Ok(Json(response))
}
