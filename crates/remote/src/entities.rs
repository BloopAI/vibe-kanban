//! Entity shape definitions for realtime streaming.
//!
//! This module defines all entity shapes using the `define_entity!` macro, which generates
//! shape definitions for Electric realtime streaming with compile-time SQL validation.

use crate::db::{
    organization_members::OrganizationMember, pull_requests::PullRequest, users::User,
    workspaces::Workspace,
};
use utils::api::entities::{
    Issue, IssueAssignee, IssueComment, IssueCommentReaction, IssueFollower, IssueRelationship,
    IssueTag, Notification, Project, ProjectStatus, Tag,
};

// =============================================================================
// Organization-scoped shapes
// =============================================================================

crate::define_entity!(
    Project,
    table: "projects",
    shape: {
        where_clause: r#""organization_id" = $1"#,
        params: ["organization_id"],
        url: "/shape/projects",
    },
);

crate::define_entity!(
    Notification,
    table: "notifications",
    shape: {
        where_clause: r#""organization_id" = $1 AND "user_id" = $2"#,
        params: ["organization_id", "user_id"],
        url: "/shape/notifications",
    },
);

crate::define_entity!(
    OrganizationMember,
    table: "organization_member_metadata",
    shape: {
        where_clause: r#""organization_id" = $1"#,
        params: ["organization_id"],
        url: "/shape/organization_members",
    },
);

crate::define_entity!(
    User,
    table: "users",
    shape: {
        where_clause: r#""id" IN (SELECT user_id FROM organization_member_metadata WHERE "organization_id" = $1)"#,
        params: ["organization_id"],
        url: "/shape/users",
    },
);

// =============================================================================
// Project-scoped shapes
// =============================================================================

crate::define_entity!(
    Tag,
    table: "tags",
    shape: {
        where_clause: r#""project_id" = $1"#,
        params: ["project_id"],
        url: "/shape/project/{project_id}/tags",
    },
);

crate::define_entity!(
    ProjectStatus,
    table: "project_statuses",
    shape: {
        where_clause: r#""project_id" = $1"#,
        params: ["project_id"],
        url: "/shape/project/{project_id}/project_statuses",
    },
);

crate::define_entity!(
    Issue,
    table: "issues",
    shape: {
        where_clause: r#""project_id" = $1"#,
        params: ["project_id"],
        url: "/shape/project/{project_id}/issues",
    },
);

crate::define_entity!(
    Workspace,
    table: "workspaces",
    shape: {
        where_clause: r#""owner_user_id" = $1"#,
        params: ["owner_user_id"],
        url: "/shape/user/workspaces",
    },
);

// =============================================================================
// Issue-related shapes (streamed at project level)
// =============================================================================

crate::define_entity!(
    IssueAssignee,
    table: "issue_assignees",
    shape: {
        where_clause: r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
        params: ["project_id"],
        url: "/shape/project/{project_id}/issue_assignees",
    },
);

crate::define_entity!(
    IssueFollower,
    table: "issue_followers",
    shape: {
        where_clause: r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
        params: ["project_id"],
        url: "/shape/project/{project_id}/issue_followers",
    },
);

crate::define_entity!(
    IssueTag,
    table: "issue_tags",
    shape: {
        where_clause: r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
        params: ["project_id"],
        url: "/shape/project/{project_id}/issue_tags",
    },
);

crate::define_entity!(
    IssueRelationship,
    table: "issue_relationships",
    shape: {
        where_clause: r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
        params: ["project_id"],
        url: "/shape/project/{project_id}/issue_relationships",
    },
);

crate::define_entity!(
    PullRequest,
    table: "pull_requests",
    shape: {
        where_clause: r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
        params: ["project_id"],
        url: "/shape/project/{project_id}/pull_requests",
    },
);

// =============================================================================
// Issue-scoped shapes
// =============================================================================

crate::define_entity!(
    IssueComment,
    table: "issue_comments",
    shape: {
        where_clause: r#""issue_id" = $1"#,
        params: ["issue_id"],
        url: "/shape/issue/{issue_id}/comments",
    },
);

crate::define_entity!(
    IssueCommentReaction,
    table: "issue_comment_reactions",
    shape: {
        where_clause: r#""comment_id" IN (SELECT id FROM issue_comments WHERE "issue_id" = $1)"#,
        params: ["issue_id"],
        url: "/shape/issue/{issue_id}/reactions",
    },
);

// =============================================================================
// Export functions
// =============================================================================

/// All shape definitions for realtime streaming
pub fn all_shapes() -> Vec<&'static dyn crate::shapes::ShapeExport> {
    vec![
        &PROJECT_SHAPE,
        &NOTIFICATION_SHAPE,
        &ORGANIZATION_MEMBER_SHAPE,
        &USER_SHAPE,
        &TAG_SHAPE,
        &PROJECT_STATUS_SHAPE,
        &ISSUE_SHAPE,
        &WORKSPACE_SHAPE,
        &ISSUE_ASSIGNEE_SHAPE,
        &ISSUE_FOLLOWER_SHAPE,
        &ISSUE_TAG_SHAPE,
        &ISSUE_RELATIONSHIP_SHAPE,
        &PULL_REQUEST_SHAPE,
        &ISSUE_COMMENT_SHAPE,
        &ISSUE_COMMENT_REACTION_SHAPE,
    ]
}
