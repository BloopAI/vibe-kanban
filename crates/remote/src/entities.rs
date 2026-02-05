//! Shape definitions for realtime streaming.
//!
//! This module defines all shapes using the `define_shape!` macro, which provides
//! compile-time SQL validation for each shape's table and WHERE clause.

use crate::shapes::ShapeDefinition;

// =============================================================================
// Organization-scoped shapes
// =============================================================================

pub const PROJECT_SHAPE: ShapeDefinition = crate::define_shape!(
    table: "projects",
    ts_type_name: "Project",
    where_clause: r#""organization_id" = $1"#,
    url: "/shape/projects",
    params: ["organization_id"],
);

pub const NOTIFICATION_SHAPE: ShapeDefinition = crate::define_shape!(
    table: "notifications",
    ts_type_name: "Notification",
    where_clause: r#""organization_id" = $1 AND "user_id" = $2"#,
    url: "/shape/notifications",
    params: ["organization_id", "user_id"],
);

pub const ORGANIZATION_MEMBER_SHAPE: ShapeDefinition = crate::define_shape!(
    table: "organization_member_metadata",
    ts_type_name: "OrganizationMember",
    where_clause: r#""organization_id" = $1"#,
    url: "/shape/organization_members",
    params: ["organization_id"],
);

pub const USER_SHAPE: ShapeDefinition = crate::define_shape!(
    table: "users",
    ts_type_name: "User",
    where_clause: r#""id" IN (SELECT user_id FROM organization_member_metadata WHERE "organization_id" = $1)"#,
    url: "/shape/users",
    params: ["organization_id"],
);

// =============================================================================
// Project-scoped shapes
// =============================================================================

pub const TAG_SHAPE: ShapeDefinition = crate::define_shape!(
    table: "tags",
    ts_type_name: "Tag",
    where_clause: r#""project_id" = $1"#,
    url: "/shape/project/{project_id}/tags",
    params: ["project_id"],
);

pub const PROJECT_STATUS_SHAPE: ShapeDefinition = crate::define_shape!(
    table: "project_statuses",
    ts_type_name: "ProjectStatus",
    where_clause: r#""project_id" = $1"#,
    url: "/shape/project/{project_id}/project_statuses",
    params: ["project_id"],
);

pub const ISSUE_SHAPE: ShapeDefinition = crate::define_shape!(
    table: "issues",
    ts_type_name: "Issue",
    where_clause: r#""project_id" = $1"#,
    url: "/shape/project/{project_id}/issues",
    params: ["project_id"],
);

pub const WORKSPACE_SHAPE: ShapeDefinition = crate::define_shape!(
    table: "workspaces",
    ts_type_name: "Workspace",
    where_clause: r#""owner_user_id" = $1"#,
    url: "/shape/user/workspaces",
    params: ["owner_user_id"],
);

pub const PROJECT_WORKSPACE_SHAPE: ShapeDefinition<Workspace> = crate::define_shape!(
    table: "workspaces",
    where_clause: r#""project_id" = $1"#,
    url: "/shape/project/{project_id}/workspaces",
    params: ["project_id"],
);

// =============================================================================
// Issue-related shapes (streamed at project level)
// =============================================================================

pub const ISSUE_ASSIGNEE_SHAPE: ShapeDefinition = crate::define_shape!(
    table: "issue_assignees",
    ts_type_name: "IssueAssignee",
    where_clause: r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
    url: "/shape/project/{project_id}/issue_assignees",
    params: ["project_id"],
);

pub const ISSUE_FOLLOWER_SHAPE: ShapeDefinition = crate::define_shape!(
    table: "issue_followers",
    ts_type_name: "IssueFollower",
    where_clause: r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
    url: "/shape/project/{project_id}/issue_followers",
    params: ["project_id"],
);

pub const ISSUE_TAG_SHAPE: ShapeDefinition = crate::define_shape!(
    table: "issue_tags",
    ts_type_name: "IssueTag",
    where_clause: r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
    url: "/shape/project/{project_id}/issue_tags",
    params: ["project_id"],
);

pub const ISSUE_RELATIONSHIP_SHAPE: ShapeDefinition = crate::define_shape!(
    table: "issue_relationships",
    ts_type_name: "IssueRelationship",
    where_clause: r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
    url: "/shape/project/{project_id}/issue_relationships",
    params: ["project_id"],
);

pub const PULL_REQUEST_SHAPE: ShapeDefinition = crate::define_shape!(
    table: "pull_requests",
    ts_type_name: "PullRequest",
    where_clause: r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
    url: "/shape/project/{project_id}/pull_requests",
    params: ["project_id"],
);

// =============================================================================
// Issue-scoped shapes
// =============================================================================

pub const ISSUE_COMMENT_SHAPE: ShapeDefinition = crate::define_shape!(
    table: "issue_comments",
    ts_type_name: "IssueComment",
    where_clause: r#""issue_id" = $1"#,
    url: "/shape/issue/{issue_id}/comments",
    params: ["issue_id"],
);

pub const ISSUE_COMMENT_REACTION_SHAPE: ShapeDefinition = crate::define_shape!(
    table: "issue_comment_reactions",
    ts_type_name: "IssueCommentReaction",
    where_clause: r#""comment_id" IN (SELECT id FROM issue_comments WHERE "issue_id" = $1)"#,
    url: "/shape/issue/{issue_id}/reactions",
    params: ["issue_id"],
);

// =============================================================================
// Export functions
// =============================================================================

/// All shape definitions for realtime streaming
pub fn all_shapes() -> Vec<&'static ShapeDefinition> {
    vec![
        &PROJECT_SHAPE,
        &NOTIFICATION_SHAPE,
        &ORGANIZATION_MEMBER_SHAPE,
        &USER_SHAPE,
        &TAG_SHAPE,
        &PROJECT_STATUS_SHAPE,
        &ISSUE_SHAPE,
        &WORKSPACE_SHAPE,
        &PROJECT_WORKSPACE_SHAPE,
        &ISSUE_ASSIGNEE_SHAPE,
        &ISSUE_FOLLOWER_SHAPE,
        &ISSUE_TAG_SHAPE,
        &ISSUE_RELATIONSHIP_SHAPE,
        &PULL_REQUEST_SHAPE,
        &ISSUE_COMMENT_SHAPE,
        &ISSUE_COMMENT_REACTION_SHAPE,
    ]
}
