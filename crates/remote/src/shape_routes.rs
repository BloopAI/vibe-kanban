//! All shape route declarations with authorization scope and REST fallback.

use api_types::{
    ListIssueAssigneesResponse, ListIssueCommentReactionsResponse, ListIssueCommentsResponse,
    ListIssueFollowersResponse, ListIssueRelationshipsResponse, ListIssueTagsResponse,
    ListIssuesResponse, ListProjectStatusesResponse, ListProjectsResponse,
    ListPullRequestsResponse, ListTagsResponse, Notification, OrganizationMember, User, Workspace,
};
use axum::{
    Json,
    extract::{Extension, Query, State},
    http::StatusCode,
};
use serde::Serialize;

use crate::{
    AppState,
    auth::RequestContext,
    db::{
        issue_assignees::IssueAssigneeRepository,
        issue_comment_reactions::IssueCommentReactionRepository,
        issue_comments::IssueCommentRepository, issue_followers::IssueFollowerRepository,
        issue_relationships::IssueRelationshipRepository, issue_tags::IssueTagRepository,
        issues::IssueRepository, notifications::NotificationRepository, organization_members,
        project_statuses::ProjectStatusRepository, projects::ProjectRepository,
        pull_requests::PullRequestRepository, tags::TagRepository, workspaces::WorkspaceRepository,
    },
    routes::{
        error::ErrorResponse,
        organization_members::{ensure_issue_access, ensure_member_access, ensure_project_access},
    },
    shape_route::{
        IssueFallbackQuery, NoQueryParams, OrgFallbackQuery, ProjectFallbackQuery, ShapeRoute,
        ShapeScope,
    },
    shapes,
};

// =============================================================================
// Response types not defined in api-types (field name must match shape table)
// =============================================================================

#[derive(Debug, Serialize)]
struct ListNotificationsResponse {
    notifications: Vec<Notification>,
}

#[derive(Debug, Serialize)]
struct ListOrganizationMembersResponse {
    organization_member_metadata: Vec<OrganizationMember>,
}

#[derive(Debug, Serialize)]
struct ListUsersResponse {
    users: Vec<User>,
}

#[derive(Debug, Serialize)]
struct ListWorkspacesResponse {
    workspaces: Vec<Workspace>,
}

// =============================================================================
// Shape route registration
// =============================================================================

/// All shape routes: built and type-erased.
///
/// This is the single source of truth for shape registration.
pub fn all_shape_routes() -> Vec<ShapeRoute> {
    vec![
        // Organization-scoped
        ShapeRoute::new(&shapes::PROJECTS_SHAPE, ShapeScope::Org, "/fallback/projects", fallback_list_projects),
        ShapeRoute::new(&shapes::NOTIFICATIONS_SHAPE, ShapeScope::OrgWithUser, "/fallback/notifications", fallback_list_notifications),
        ShapeRoute::new(&shapes::ORGANIZATION_MEMBERS_SHAPE, ShapeScope::Org, "/fallback/organization_members", fallback_list_organization_members),
        ShapeRoute::new(&shapes::USERS_SHAPE, ShapeScope::Org, "/fallback/users", fallback_list_users),
        // Project-scoped
        ShapeRoute::new(&shapes::PROJECT_TAGS_SHAPE, ShapeScope::Project, "/fallback/tags", fallback_list_tags),
        ShapeRoute::new(&shapes::PROJECT_PROJECT_STATUSES_SHAPE, ShapeScope::Project, "/fallback/project_statuses", fallback_list_project_statuses),
        ShapeRoute::new(&shapes::PROJECT_ISSUES_SHAPE, ShapeScope::Project, "/fallback/issues", fallback_list_issues),
        ShapeRoute::new(&shapes::USER_WORKSPACES_SHAPE, ShapeScope::User, "/fallback/user_workspaces", fallback_list_user_workspaces),
        ShapeRoute::new(&shapes::PROJECT_WORKSPACES_SHAPE, ShapeScope::Project, "/fallback/project_workspaces", fallback_list_project_workspaces),
        // Project-scoped issue-related
        ShapeRoute::new(&shapes::PROJECT_ISSUE_ASSIGNEES_SHAPE, ShapeScope::Project, "/fallback/issue_assignees", fallback_list_issue_assignees),
        ShapeRoute::new(&shapes::PROJECT_ISSUE_FOLLOWERS_SHAPE, ShapeScope::Project, "/fallback/issue_followers", fallback_list_issue_followers),
        ShapeRoute::new(&shapes::PROJECT_ISSUE_TAGS_SHAPE, ShapeScope::Project, "/fallback/issue_tags", fallback_list_issue_tags),
        ShapeRoute::new(&shapes::PROJECT_ISSUE_RELATIONSHIPS_SHAPE, ShapeScope::Project, "/fallback/issue_relationships", fallback_list_issue_relationships),
        ShapeRoute::new(&shapes::PROJECT_PULL_REQUESTS_SHAPE, ShapeScope::Project, "/fallback/pull_requests", fallback_list_pull_requests),
        // Issue-scoped
        ShapeRoute::new(&shapes::ISSUE_COMMENTS_SHAPE, ShapeScope::Issue, "/fallback/issue_comments", fallback_list_issue_comments),
        ShapeRoute::new(&shapes::ISSUE_REACTIONS_SHAPE, ShapeScope::Issue, "/fallback/issue_comment_reactions", fallback_list_issue_comment_reactions),
    ]
}

// =============================================================================
// Org-scoped fallback handlers
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

async fn fallback_list_notifications(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(query): Query<OrgFallbackQuery>,
) -> Result<Json<ListNotificationsResponse>, ErrorResponse> {
    ensure_member_access(state.pool(), query.organization_id, ctx.user.id).await?;

    let notifications = NotificationRepository::list_by_organization_and_user(
        state.pool(),
        query.organization_id,
        ctx.user.id,
    )
    .await
    .map_err(|error| {
        tracing::error!(?error, organization_id = %query.organization_id, "failed to list notifications (fallback)");
        ErrorResponse::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "failed to list notifications",
        )
    })?;

    Ok(Json(ListNotificationsResponse { notifications }))
}

async fn fallback_list_organization_members(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(query): Query<OrgFallbackQuery>,
) -> Result<Json<ListOrganizationMembersResponse>, ErrorResponse> {
    ensure_member_access(state.pool(), query.organization_id, ctx.user.id).await?;

    let organization_member_metadata =
        organization_members::list_by_organization(state.pool(), query.organization_id)
            .await
            .map_err(|error| {
                tracing::error!(?error, organization_id = %query.organization_id, "failed to list organization members (fallback)");
                ErrorResponse::new(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "failed to list organization members",
                )
            })?;

    Ok(Json(ListOrganizationMembersResponse {
        organization_member_metadata,
    }))
}

async fn fallback_list_users(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(query): Query<OrgFallbackQuery>,
) -> Result<Json<ListUsersResponse>, ErrorResponse> {
    ensure_member_access(state.pool(), query.organization_id, ctx.user.id).await?;

    let users =
        organization_members::list_users_by_organization(state.pool(), query.organization_id)
            .await
            .map_err(|error| {
                tracing::error!(?error, organization_id = %query.organization_id, "failed to list users (fallback)");
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to list users")
            })?;

    Ok(Json(ListUsersResponse { users }))
}

// =============================================================================
// Project-scoped fallback handlers
// =============================================================================

async fn fallback_list_tags(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(query): Query<ProjectFallbackQuery>,
) -> Result<Json<ListTagsResponse>, ErrorResponse> {
    ensure_project_access(state.pool(), ctx.user.id, query.project_id).await?;

    let tags = TagRepository::list_by_project(state.pool(), query.project_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, project_id = %query.project_id, "failed to list tags (fallback)");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to list tags")
        })?;

    Ok(Json(ListTagsResponse { tags }))
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

async fn fallback_list_project_workspaces(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(query): Query<ProjectFallbackQuery>,
) -> Result<Json<ListWorkspacesResponse>, ErrorResponse> {
    ensure_project_access(state.pool(), ctx.user.id, query.project_id).await?;

    let workspaces = WorkspaceRepository::list_by_project(state.pool(), query.project_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, project_id = %query.project_id, "failed to list workspaces (fallback)");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to list workspaces")
        })?;

    Ok(Json(ListWorkspacesResponse { workspaces }))
}

async fn fallback_list_issue_assignees(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(query): Query<ProjectFallbackQuery>,
) -> Result<Json<ListIssueAssigneesResponse>, ErrorResponse> {
    ensure_project_access(state.pool(), ctx.user.id, query.project_id).await?;

    let issue_assignees =
        IssueAssigneeRepository::list_by_project(state.pool(), query.project_id)
            .await
            .map_err(|error| {
                tracing::error!(?error, project_id = %query.project_id, "failed to list issue assignees (fallback)");
                ErrorResponse::new(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "failed to list issue assignees",
                )
            })?;

    Ok(Json(ListIssueAssigneesResponse { issue_assignees }))
}

async fn fallback_list_issue_followers(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(query): Query<ProjectFallbackQuery>,
) -> Result<Json<ListIssueFollowersResponse>, ErrorResponse> {
    ensure_project_access(state.pool(), ctx.user.id, query.project_id).await?;

    let issue_followers =
        IssueFollowerRepository::list_by_project(state.pool(), query.project_id)
            .await
            .map_err(|error| {
                tracing::error!(?error, project_id = %query.project_id, "failed to list issue followers (fallback)");
                ErrorResponse::new(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "failed to list issue followers",
                )
            })?;

    Ok(Json(ListIssueFollowersResponse { issue_followers }))
}

async fn fallback_list_issue_tags(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(query): Query<ProjectFallbackQuery>,
) -> Result<Json<ListIssueTagsResponse>, ErrorResponse> {
    ensure_project_access(state.pool(), ctx.user.id, query.project_id).await?;

    let issue_tags = IssueTagRepository::list_by_project(state.pool(), query.project_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, project_id = %query.project_id, "failed to list issue tags (fallback)");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to list issue tags",
            )
        })?;

    Ok(Json(ListIssueTagsResponse { issue_tags }))
}

async fn fallback_list_issue_relationships(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(query): Query<ProjectFallbackQuery>,
) -> Result<Json<ListIssueRelationshipsResponse>, ErrorResponse> {
    ensure_project_access(state.pool(), ctx.user.id, query.project_id).await?;

    let issue_relationships =
        IssueRelationshipRepository::list_by_project(state.pool(), query.project_id)
            .await
            .map_err(|error| {
                tracing::error!(?error, project_id = %query.project_id, "failed to list issue relationships (fallback)");
                ErrorResponse::new(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "failed to list issue relationships",
                )
            })?;

    Ok(Json(ListIssueRelationshipsResponse {
        issue_relationships,
    }))
}

async fn fallback_list_pull_requests(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(query): Query<ProjectFallbackQuery>,
) -> Result<Json<ListPullRequestsResponse>, ErrorResponse> {
    ensure_project_access(state.pool(), ctx.user.id, query.project_id).await?;

    let pull_requests = PullRequestRepository::list_by_project(state.pool(), query.project_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, project_id = %query.project_id, "failed to list pull requests (fallback)");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to list pull requests",
            )
        })?;

    Ok(Json(ListPullRequestsResponse { pull_requests }))
}

// =============================================================================
// User-scoped fallback handlers
// =============================================================================

async fn fallback_list_user_workspaces(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(_): Query<NoQueryParams>,
) -> Result<Json<ListWorkspacesResponse>, ErrorResponse> {
    let workspaces = WorkspaceRepository::list_by_owner(state.pool(), ctx.user.id)
        .await
        .map_err(|error| {
            tracing::error!(?error, user_id = %ctx.user.id, "failed to list user workspaces (fallback)");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to list workspaces",
            )
        })?;

    Ok(Json(ListWorkspacesResponse { workspaces }))
}

// =============================================================================
// Issue-scoped fallback handlers
// =============================================================================

async fn fallback_list_issue_comments(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(query): Query<IssueFallbackQuery>,
) -> Result<Json<ListIssueCommentsResponse>, ErrorResponse> {
    ensure_issue_access(state.pool(), ctx.user.id, query.issue_id).await?;

    let issue_comments = IssueCommentRepository::list_by_issue(state.pool(), query.issue_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, issue_id = %query.issue_id, "failed to list issue comments (fallback)");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to list issue comments",
            )
        })?;

    Ok(Json(ListIssueCommentsResponse { issue_comments }))
}

async fn fallback_list_issue_comment_reactions(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(query): Query<IssueFallbackQuery>,
) -> Result<Json<ListIssueCommentReactionsResponse>, ErrorResponse> {
    ensure_issue_access(state.pool(), ctx.user.id, query.issue_id).await?;

    let issue_comment_reactions =
        IssueCommentReactionRepository::list_by_issue(state.pool(), query.issue_id)
            .await
            .map_err(|error| {
                tracing::error!(?error, issue_id = %query.issue_id, "failed to list issue comment reactions (fallback)");
                ErrorResponse::new(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "failed to list issue comment reactions",
                )
            })?;

    Ok(Json(ListIssueCommentReactionsResponse {
        issue_comment_reactions,
    }))
}
