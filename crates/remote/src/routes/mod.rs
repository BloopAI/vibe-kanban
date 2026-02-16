use axum::{
    Json, Router,
    http::{Request, header::HeaderName},
    middleware,
    routing::get,
};
use serde::Serialize;
use tower_http::{
    cors::{AllowHeaders, AllowMethods, AllowOrigin, CorsLayer},
    request_id::{MakeRequestUuid, PropagateRequestIdLayer, RequestId, SetRequestIdLayer},
    services::{ServeDir, ServeFile},
    trace::{DefaultOnFailure, TraceLayer},
};
use tracing::{Level, Span, field};
use utoipa::OpenApi;

use crate::{AppState, auth::require_session};

#[cfg(feature = "vk-billing")]
mod billing;
#[cfg(not(feature = "vk-billing"))]
mod billing {
    use axum::Router;

    use crate::AppState;
    pub fn public_router() -> Router<AppState> {
        Router::new()
    }
    pub fn protected_router() -> Router<AppState> {
        Router::new()
    }
}
mod electric_proxy;
pub(crate) mod error;
pub mod attachments;
pub(crate) mod github_app;
pub(crate) mod identity;
pub mod issue_assignees;
pub mod issue_comment_reactions;
pub mod issue_comments;
pub mod issue_followers;
pub mod issue_relationships;
pub mod issue_tags;
pub mod issues;
pub(crate) mod migration;
pub mod notifications;
pub(crate) mod oauth;
pub(crate) mod organization_members;
pub(crate) mod organizations;
pub mod project_statuses;
pub mod projects;
pub(crate) mod pull_requests;
pub(crate) mod review;
pub mod tags;
pub(crate) mod tokens;
pub(crate) mod workspaces;

// =============================================================================
// OpenAPI Documentation
// =============================================================================

#[derive(OpenApi)]
#[openapi(
    info(
        title = "Vibe Kanban Remote API",
        version = env!("CARGO_PKG_VERSION"),
        description = "Remote collaboration API for Vibe Kanban"
    ),
    paths(
        // Health
        health,
        // Tags
        tags::list_tags,
        tags::get_tag,
        tags::create_tag,
        tags::update_tag,
        tags::delete_tag,
        // Issues
        issues::list_issues,
        issues::get_issue,
        issues::create_issue,
        issues::update_issue,
        issues::delete_issue,
        issues::bulk_update_issues,
        // Projects
        projects::list_projects,
        projects::get_project,
        projects::create_project,
        projects::update_project,
        projects::delete_project,
        // Project Statuses
        project_statuses::list_project_statuses,
        project_statuses::get_project_status,
        project_statuses::create_project_status,
        project_statuses::update_project_status,
        project_statuses::delete_project_status,
        project_statuses::bulk_update_project_statuses,
        // Issue Assignees
        issue_assignees::list_issue_assignees,
        issue_assignees::get_issue_assignee,
        issue_assignees::create_issue_assignee,
        issue_assignees::delete_issue_assignee,
        // Issue Followers
        issue_followers::list_issue_followers,
        issue_followers::get_issue_follower,
        issue_followers::create_issue_follower,
        issue_followers::delete_issue_follower,
        // Issue Tags
        issue_tags::list_issue_tags,
        issue_tags::get_issue_tag,
        issue_tags::create_issue_tag,
        issue_tags::delete_issue_tag,
        // Issue Relationships
        issue_relationships::list_issue_relationships,
        issue_relationships::get_issue_relationship,
        issue_relationships::create_issue_relationship,
        issue_relationships::delete_issue_relationship,
        // Issue Comments
        issue_comments::list_issue_comments,
        issue_comments::get_issue_comment,
        issue_comments::create_issue_comment,
        issue_comments::update_issue_comment,
        issue_comments::delete_issue_comment,
        // Issue Comment Reactions
        issue_comment_reactions::list_issue_comment_reactions,
        issue_comment_reactions::get_issue_comment_reaction,
        issue_comment_reactions::create_issue_comment_reaction,
        issue_comment_reactions::update_issue_comment_reaction,
        issue_comment_reactions::delete_issue_comment_reaction,
        // Notifications
        notifications::list_notifications,
        notifications::get_notification,
        notifications::update_notification,
        notifications::delete_notification,
        notifications::mark_all_seen,
        notifications::unread_count,
        // Workspaces
        workspaces::create_workspace,
        workspaces::update_workspace,
        workspaces::delete_workspace,
        workspaces::unlink_workspace,
        workspaces::get_workspace_by_local_id,
        workspaces::workspace_exists,
        // Organizations
        organizations::create_organization,
        organizations::list_organizations,
        organizations::get_organization,
        organizations::update_organization,
        organizations::delete_organization,
        // Organization Members
        organization_members::create_invitation,
        organization_members::list_invitations,
        organization_members::get_invitation,
        organization_members::revoke_invitation,
        organization_members::accept_invitation,
        organization_members::list_members,
        organization_members::remove_member,
        organization_members::update_member_role,
        // Auth (OAuth)
        oauth::web_init,
        oauth::web_redeem,
        oauth::authorize_start,
        oauth::authorize_callback,
        oauth::profile,
        oauth::logout,
        // Identity
        identity::get_identity,
        // Tokens
        tokens::refresh_token,
        // Pull Requests
        pull_requests::create_pull_request,
        pull_requests::update_pull_request,
        pull_requests::upsert_pull_request,
        // GitHub App
        github_app::get_install_url,
        github_app::get_status,
        github_app::uninstall,
        github_app::update_repo_review_enabled,
        github_app::fetch_repositories,
        github_app::bulk_update_review_enabled,
        github_app::handle_callback,
        github_app::handle_webhook,
        github_app::trigger_pr_review,
        // Review
        review::init_review_upload,
        review::start_review,
        review::get_review_status,
        review::get_review_metadata,
        review::get_review,
        review::get_review_file,
        review::get_review_diff,
        review::review_success,
        review::review_failed,
        // Migration
        migration::migrate_projects,
        migration::migrate_issues,
        migration::migrate_pull_requests,
        migration::migrate_workspaces,
    ),
    components(schemas(
        // Tags
        api_types::Tag,
        api_types::CreateTagRequest,
        api_types::UpdateTagRequest,
        api_types::ListTagsResponse,
        // Issues
        api_types::Issue,
        api_types::IssuePriority,
        api_types::CreateIssueRequest,
        api_types::UpdateIssueRequest,
        api_types::ListIssuesResponse,
        // Projects
        api_types::Project,
        api_types::CreateProjectRequest,
        api_types::UpdateProjectRequest,
        api_types::ListProjectsResponse,
        // Project Statuses
        api_types::ProjectStatus,
        api_types::CreateProjectStatusRequest,
        api_types::UpdateProjectStatusRequest,
        api_types::ListProjectStatusesResponse,
        // Issue Assignees
        api_types::IssueAssignee,
        api_types::CreateIssueAssigneeRequest,
        api_types::ListIssueAssigneesResponse,
        // Issue Followers
        api_types::IssueFollower,
        api_types::CreateIssueFollowerRequest,
        api_types::ListIssueFollowersResponse,
        // Issue Tags
        api_types::IssueTag,
        api_types::CreateIssueTagRequest,
        api_types::ListIssueTagsResponse,
        // Issue Relationships
        api_types::IssueRelationship,
        api_types::IssueRelationshipType,
        api_types::CreateIssueRelationshipRequest,
        api_types::ListIssueRelationshipsResponse,
        // Issue Comments
        api_types::IssueComment,
        api_types::CreateIssueCommentRequest,
        api_types::UpdateIssueCommentRequest,
        api_types::ListIssueCommentsResponse,
        // Issue Comment Reactions
        api_types::IssueCommentReaction,
        api_types::CreateIssueCommentReactionRequest,
        api_types::UpdateIssueCommentReactionRequest,
        api_types::ListIssueCommentReactionsResponse,
        // Notifications
        api_types::Notification,
        api_types::NotificationType,
        api_types::UpdateNotificationRequest,
        // Workspaces
        api_types::Workspace,
        api_types::UpdateWorkspaceRequest,
        api_types::DeleteWorkspaceRequest,
        // Organizations
        api_types::Organization,
        api_types::MemberRole,
        api_types::CreateOrganizationRequest,
        api_types::CreateOrganizationResponse,
        api_types::ListOrganizationsResponse,
        api_types::GetOrganizationResponse,
        api_types::UpdateOrganizationRequest,
        api_types::OrganizationMemberWithProfile,
        api_types::ListMembersResponse,
        api_types::RevokeInvitationRequest,
        api_types::UpdateMemberRoleRequest,
        api_types::UpdateMemberRoleResponse,
        // OAuth / Auth
        api_types::HandoffInitRequest,
        api_types::HandoffInitResponse,
        api_types::HandoffRedeemRequest,
        api_types::HandoffRedeemResponse,
        api_types::ProfileResponse,
        api_types::ProviderProfile,
        // Tokens
        api_types::TokenRefreshRequest,
        api_types::TokenRefreshResponse,
        // Pull Requests
        api_types::PullRequest,
        api_types::PullRequestStatus,
        api_types::UpsertPullRequestRequest,
        // Mutation Response + Delete
        api_types::DeleteResponse,
        // Migration
        api_types::BulkMigrateResponse,
        api_types::MigrateProjectRequest,
        api_types::MigrateIssueRequest,
        api_types::MigratePullRequestRequest,
        api_types::MigrateWorkspaceRequest,
    )),
    tags(
        (name = "Tags", description = "Tag management"),
        (name = "Issues", description = "Issue management"),
        (name = "Projects", description = "Project management"),
        (name = "ProjectStatuses", description = "Project status management"),
        (name = "IssueAssignees", description = "Issue assignee management"),
        (name = "IssueFollowers", description = "Issue follower management"),
        (name = "IssueTags", description = "Issue tag management"),
        (name = "IssueRelationships", description = "Issue relationship management"),
        (name = "IssueComments", description = "Issue comment management"),
        (name = "IssueCommentReactions", description = "Comment reaction management"),
        (name = "Notifications", description = "Notification management"),
        (name = "Workspaces", description = "Workspace management"),
        (name = "Organizations", description = "Organization management"),
        (name = "OrganizationMembers", description = "Organization member management"),
        (name = "Auth", description = "Authentication"),
        (name = "Identity", description = "User identity"),
        (name = "Tokens", description = "Token management"),
        (name = "PullRequests", description = "Pull request management"),
        (name = "GitHubApp", description = "GitHub App integration"),
        (name = "Review", description = "Code review"),
        (name = "Migration", description = "Data migration"),
        (name = "Health", description = "Health check"),
    ),
    modifiers(&SecurityAddon)
)]
pub struct ApiDoc;

struct SecurityAddon;

impl utoipa::Modify for SecurityAddon {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        if let Some(components) = openapi.components.as_mut() {
            components.add_security_scheme(
                "bearer_auth",
                utoipa::openapi::security::SecurityScheme::Http(
                    utoipa::openapi::security::Http::new(
                        utoipa::openapi::security::HttpAuthScheme::Bearer,
                    ),
                ),
            );
        }
    }
}

// =============================================================================
// Router
// =============================================================================

pub fn router(state: AppState) -> Router {
    let trace_layer = TraceLayer::new_for_http()
        .make_span_with(|request: &Request<_>| {
            let request_id = request
                .extensions()
                .get::<RequestId>()
                .and_then(|id| id.header_value().to_str().ok());
            let is_health = request.uri().path() == "/health";
            let span = if is_health {
                tracing::trace_span!(
                    "http_request",
                    method = %request.method(),
                    uri = %request.uri(),
                    request_id = field::Empty
                )
            } else {
                tracing::debug_span!(
                    "http_request",
                    method = %request.method(),
                    uri = %request.uri(),
                    request_id = field::Empty
                )
            };
            if let Some(request_id) = request_id {
                span.record("request_id", field::display(request_id));
            }
            span
        })
        .on_response(
            |response: &axum::http::Response<_>, latency: std::time::Duration, span: &Span| {
                if span.is_disabled() {
                    return;
                }
                let status = response.status().as_u16();
                let latency_ms = latency.as_millis();
                if status >= 500 {
                    tracing::error!(status, latency_ms, "server error");
                } else if status >= 400 {
                    tracing::warn!(status, latency_ms, "client error");
                } else {
                    tracing::debug!(status, latency_ms, "request completed");
                }
            },
        )
        .on_failure(DefaultOnFailure::new().level(Level::ERROR));

    let v1_public = Router::<AppState>::new()
        .route("/health", get(health))
        .route("/openapi.json", get(|| async { Json(ApiDoc::openapi()) }))
        .merge(oauth::public_router())
        .merge(organization_members::public_router())
        .merge(tokens::public_router())
        .merge(review::public_router())
        .merge(github_app::public_router())
        .merge(billing::public_router());

    let v1_protected = Router::<AppState>::new()
        .merge(identity::router())
        .merge(projects::router())
        .merge(organizations::router())
        .merge(organization_members::protected_router())
        .merge(oauth::protected_router())
        .merge(electric_proxy::router())
        .merge(github_app::protected_router())
        .merge(project_statuses::router())
        .merge(tags::router())
        .merge(issue_comments::router())
        .merge(issue_comment_reactions::router())
        .merge(issues::router())
        .merge(issue_assignees::router())
        .merge(attachments::router())
        .merge(issue_followers::router())
        .merge(issue_tags::router())
        .merge(issue_relationships::router())
        .merge(pull_requests::router())
        .merge(notifications::router())
        .merge(workspaces::router())
        .merge(billing::protected_router())
        .merge(migration::router())
        .layer(middleware::from_fn_with_state(
            state.clone(),
            require_session,
        ));

    #[allow(unused_mut)]
    let mut router = Router::<AppState>::new()
        .nest("/v1", v1_public)
        .nest("/v1", v1_protected);

    #[cfg(feature = "swagger-ui")]
    {
        router = router.merge(
            utoipa_swagger_ui::SwaggerUi::new("/v1/swagger-ui")
                .url("/v1/openapi.json", ApiDoc::openapi()),
        );
    }

    let static_dir = "/srv/static";
    let spa =
        ServeDir::new(static_dir).fallback(ServeFile::new(format!("{static_dir}/index.html")));

    router
        .fallback_service(spa)
        .layer(middleware::from_fn(
            crate::middleware::version::add_version_headers,
        ))
        .layer(
            CorsLayer::new()
                .allow_origin(AllowOrigin::mirror_request())
                .allow_methods(AllowMethods::mirror_request())
                .allow_headers(AllowHeaders::mirror_request())
                .allow_credentials(true),
        )
        .layer(trace_layer)
        .layer(PropagateRequestIdLayer::new(HeaderName::from_static(
            "x-request-id",
        )))
        .layer(SetRequestIdLayer::new(
            HeaderName::from_static("x-request-id"),
            MakeRequestUuid {},
        ))
        .with_state(state)
}

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    version: &'static str,
}

#[utoipa::path(
    get, path = "/v1/health",
    tag = "Health",
    responses((status = 200, description = "Service is healthy"))
)]
pub(crate) async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
    })
}

#[cfg(test)]
mod openapi_tests {
    use super::*;

    #[test]
    fn openapi_spec_is_valid_json() {
        let spec = ApiDoc::openapi();
        let json = serde_json::to_string_pretty(&spec).unwrap();
        assert!(!json.is_empty());
        assert!(!spec.paths.paths.is_empty());
    }

    #[test]
    fn openapi_spec_has_all_tags() {
        let spec = ApiDoc::openapi();
        let tags: Vec<&str> = spec
            .tags
            .as_ref()
            .unwrap()
            .iter()
            .map(|t| t.name.as_str())
            .collect();
        assert!(tags.contains(&"Health"));
        assert!(tags.contains(&"Tags"));
        assert!(tags.contains(&"Issues"));
        assert!(tags.contains(&"Projects"));
    }
}

/// Collect all mutation definitions for TypeScript generation.
pub fn all_mutation_definitions() -> Vec<crate::mutation_definition::MutationDefinition> {
    vec![
        projects::mutation().definition(),
        notifications::mutation().definition(),
        tags::mutation().definition(),
        project_statuses::mutation().definition(),
        issues::mutation().definition(),
        issue_assignees::mutation().definition(),
        issue_followers::mutation().definition(),
        issue_tags::mutation().definition(),
        issue_relationships::mutation().definition(),
        issue_comments::mutation().definition(),
        issue_comment_reactions::mutation().definition(),
    ]
}
