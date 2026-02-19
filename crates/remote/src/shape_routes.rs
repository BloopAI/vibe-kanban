//! All shape route declarations with authorization scope and optional REST fallback.

use crate::shape_route_builder::{ShapeRouteBuilder, ShapeRouteDefinition, ShapeScope};
use crate::shapes;

/// All shape route builders, declaring scope and optional fallback.
///
/// The `shape_routes!` macro pairs each const identifier with its scope
/// (and optional fallback URL), similar to the `named_shapes!` pattern
/// in `shapes.rs`.
pub fn all_shape_route_builders() -> Vec<ShapeRouteBuilder> {
    vec![
        // =================================================================
        // Organization-scoped shapes
        // =================================================================
        ShapeRouteBuilder::new(&shapes::PROJECTS_SHAPE, ShapeScope::Org)
            .fallback("/v1/projects"),
        ShapeRouteBuilder::new(&shapes::NOTIFICATIONS_SHAPE, ShapeScope::OrgWithUser),
        ShapeRouteBuilder::new(&shapes::ORGANIZATION_MEMBERS_SHAPE, ShapeScope::Org),
        ShapeRouteBuilder::new(&shapes::USERS_SHAPE, ShapeScope::Org),
        // =================================================================
        // Project-scoped shapes
        // =================================================================
        ShapeRouteBuilder::new(&shapes::PROJECT_TAGS_SHAPE, ShapeScope::Project),
        ShapeRouteBuilder::new(&shapes::PROJECT_PROJECT_STATUSES_SHAPE, ShapeScope::Project)
            .fallback("/v1/project_statuses"),
        ShapeRouteBuilder::new(&shapes::PROJECT_ISSUES_SHAPE, ShapeScope::Project)
            .fallback("/v1/issues"),
        ShapeRouteBuilder::new(&shapes::USER_WORKSPACES_SHAPE, ShapeScope::User),
        ShapeRouteBuilder::new(&shapes::PROJECT_WORKSPACES_SHAPE, ShapeScope::Project),
        // =================================================================
        // Project-scoped issue-related shapes
        // =================================================================
        ShapeRouteBuilder::new(&shapes::PROJECT_ISSUE_ASSIGNEES_SHAPE, ShapeScope::Project),
        ShapeRouteBuilder::new(&shapes::PROJECT_ISSUE_FOLLOWERS_SHAPE, ShapeScope::Project),
        ShapeRouteBuilder::new(&shapes::PROJECT_ISSUE_TAGS_SHAPE, ShapeScope::Project),
        ShapeRouteBuilder::new(&shapes::PROJECT_ISSUE_RELATIONSHIPS_SHAPE, ShapeScope::Project),
        ShapeRouteBuilder::new(&shapes::PROJECT_PULL_REQUESTS_SHAPE, ShapeScope::Project),
        // =================================================================
        // Issue-scoped shapes
        // =================================================================
        ShapeRouteBuilder::new(&shapes::ISSUE_COMMENTS_SHAPE, ShapeScope::Issue),
        ShapeRouteBuilder::new(&shapes::ISSUE_REACTIONS_SHAPE, ShapeScope::Issue),
    ]
}

/// Collect all shape route definitions for TypeScript code generation.
///
/// Uses the `named_shape_routes!` macro to pair each builder with its
/// const name for codegen output (e.g. `"PROJECTS_SHAPE"`).
pub fn all_shape_route_definitions() -> Vec<ShapeRouteDefinition> {
    macro_rules! named_shape_routes {
        ($($name:ident => $scope:expr $(, fallback($url:expr))? );* $(;)?) => {
            vec![$(
                ShapeRouteBuilder::new(&shapes::$name, $scope)
                    $(.fallback($url))?
                    .definition(stringify!($name))
            ),*]
        };
    }
    named_shape_routes![
        // Organization-scoped
        PROJECTS_SHAPE => ShapeScope::Org, fallback("/v1/projects");
        NOTIFICATIONS_SHAPE => ShapeScope::OrgWithUser;
        ORGANIZATION_MEMBERS_SHAPE => ShapeScope::Org;
        USERS_SHAPE => ShapeScope::Org;
        // Project-scoped
        PROJECT_TAGS_SHAPE => ShapeScope::Project;
        PROJECT_PROJECT_STATUSES_SHAPE => ShapeScope::Project, fallback("/v1/project_statuses");
        PROJECT_ISSUES_SHAPE => ShapeScope::Project, fallback("/v1/issues");
        USER_WORKSPACES_SHAPE => ShapeScope::User;
        PROJECT_WORKSPACES_SHAPE => ShapeScope::Project;
        // Project-scoped issue-related
        PROJECT_ISSUE_ASSIGNEES_SHAPE => ShapeScope::Project;
        PROJECT_ISSUE_FOLLOWERS_SHAPE => ShapeScope::Project;
        PROJECT_ISSUE_TAGS_SHAPE => ShapeScope::Project;
        PROJECT_ISSUE_RELATIONSHIPS_SHAPE => ShapeScope::Project;
        PROJECT_PULL_REQUESTS_SHAPE => ShapeScope::Project;
        // Issue-scoped
        ISSUE_COMMENTS_SHAPE => ShapeScope::Issue;
        ISSUE_REACTIONS_SHAPE => ShapeScope::Issue
    ]
}
