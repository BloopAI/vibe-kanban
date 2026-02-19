//! All shape route declarations with authorization scope and optional REST fallback.

use std::collections::HashMap;

use api_types::{ListIssuesResponse, ListProjectStatusesResponse, ListProjectsResponse};
use axum::{
    Json,
    extract::{Extension, Query, State},
    http::StatusCode,
};

use crate::{
    AppState,
    auth::RequestContext,
    db::{
        issues::IssueRepository, project_statuses::ProjectStatusRepository,
        projects::ProjectRepository,
    },
    routes::{
        error::ErrorResponse,
        organization_members::{ensure_member_access, ensure_project_access},
    },
    shape_route_builder::{
        BuiltShapeRoute, OrgFallbackQuery, ProjectFallbackQuery, ShapeRouteBuilder, ShapeScope,
    },
    shapes,
};

/// All shape routes: built and type-erased.
///
/// This is the single source of truth for shape registration and codegen.
pub fn all_shape_routes() -> Vec<BuiltShapeRoute> {
    vec![
        // =================================================================
        // Organization-scoped shapes
        // =================================================================
        ShapeRouteBuilder::new(&shapes::PROJECTS_SHAPE, ShapeScope::Org)
            .fallback("/fallback/projects", fallback_list_projects)
            .build(),
        ShapeRouteBuilder::new(&shapes::NOTIFICATIONS_SHAPE, ShapeScope::OrgWithUser).build(),
        ShapeRouteBuilder::new(&shapes::ORGANIZATION_MEMBERS_SHAPE, ShapeScope::Org).build(),
        ShapeRouteBuilder::new(&shapes::USERS_SHAPE, ShapeScope::Org).build(),
        // =================================================================
        // Project-scoped shapes
        // =================================================================
        ShapeRouteBuilder::new(&shapes::PROJECT_TAGS_SHAPE, ShapeScope::Project).build(),
        ShapeRouteBuilder::new(&shapes::PROJECT_PROJECT_STATUSES_SHAPE, ShapeScope::Project)
            .fallback("/fallback/project_statuses", fallback_list_project_statuses)
            .build(),
        ShapeRouteBuilder::new(&shapes::PROJECT_ISSUES_SHAPE, ShapeScope::Project)
            .fallback("/fallback/issues", fallback_list_issues)
            .build(),
        ShapeRouteBuilder::new(&shapes::USER_WORKSPACES_SHAPE, ShapeScope::User).build(),
        ShapeRouteBuilder::new(&shapes::PROJECT_WORKSPACES_SHAPE, ShapeScope::Project).build(),
        // =================================================================
        // Project-scoped issue-related shapes
        // =================================================================
        ShapeRouteBuilder::new(&shapes::PROJECT_ISSUE_ASSIGNEES_SHAPE, ShapeScope::Project).build(),
        ShapeRouteBuilder::new(&shapes::PROJECT_ISSUE_FOLLOWERS_SHAPE, ShapeScope::Project).build(),
        ShapeRouteBuilder::new(&shapes::PROJECT_ISSUE_TAGS_SHAPE, ShapeScope::Project).build(),
        ShapeRouteBuilder::new(
            &shapes::PROJECT_ISSUE_RELATIONSHIPS_SHAPE,
            ShapeScope::Project,
        )
        .build(),
        ShapeRouteBuilder::new(&shapes::PROJECT_PULL_REQUESTS_SHAPE, ShapeScope::Project).build(),
        // =================================================================
        // Issue-scoped shapes
        // =================================================================
        ShapeRouteBuilder::new(&shapes::ISSUE_COMMENTS_SHAPE, ShapeScope::Issue).build(),
        ShapeRouteBuilder::new(&shapes::ISSUE_REACTIONS_SHAPE, ShapeScope::Issue).build(),
    ]
}

/// Map of shape URL → fallback URL for codegen.
///
/// Codegen uses `shapes::all_shapes()` for const names + shape metadata and
/// this map to look up which shapes have REST fallback routes.
pub fn fallback_urls() -> HashMap<&'static str, &'static str> {
    all_shape_routes()
        .into_iter()
        .filter_map(|route| route.fallback_url.map(|fb| (route.url, fb)))
        .collect()
}

// =============================================================================
// Dedicated fallback handlers
// =============================================================================

async fn fallback_list_projects(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(query): Query<OrgFallbackQuery>,
) -> Result<Json<ListProjectsResponse>, ErrorResponse> {
    ensure_member_access(state.pool(), query.organization_id, ctx.user.id).await?;

    let projects = ProjectRepository::list_by_organization(state.pool(), query.organization_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, organization_id = %query.organization_id, "failed to list projects (fallback)");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to list projects")
        })?;

    Ok(Json(ListProjectsResponse { projects }))
}

async fn fallback_list_issues(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(query): Query<ProjectFallbackQuery>,
) -> Result<Json<ListIssuesResponse>, ErrorResponse> {
    ensure_project_access(state.pool(), ctx.user.id, query.project_id).await?;

    let issues = IssueRepository::list_by_project(state.pool(), query.project_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, project_id = %query.project_id, "failed to list issues (fallback)");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to list issues")
        })?;

    Ok(Json(ListIssuesResponse { issues }))
}

async fn fallback_list_project_statuses(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(query): Query<ProjectFallbackQuery>,
) -> Result<Json<ListProjectStatusesResponse>, ErrorResponse> {
    ensure_project_access(state.pool(), ctx.user.id, query.project_id).await?;

    let project_statuses =
        ProjectStatusRepository::list_by_project(state.pool(), query.project_id)
            .await
            .map_err(|error| {
                tracing::error!(?error, project_id = %query.project_id, "failed to list project statuses (fallback)");
                ErrorResponse::new(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "failed to list project statuses",
                )
            })?;

    Ok(Json(ListProjectStatusesResponse { project_statuses }))
}
