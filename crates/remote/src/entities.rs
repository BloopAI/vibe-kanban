//! Shape definitions for realtime streaming.
//!
//! This module defines all shapes using the `define_shape!` macro, which generates
//! shape definitions for Electric realtime streaming with compile-time SQL validation.

use api_types::{
    Issue, IssueAssignee, IssueComment, IssueCommentReaction, IssueFollower, IssueRelationship,
    IssueTag, Notification, OrganizationMember, Project, ProjectStatus, PullRequest, Tag, User,
    Workspace,
};

// =============================================================================
// Organization-scoped shapes
// =============================================================================

crate::define_shape!(
    Project,
    table: "projects",
    singular: "project",
    where_clause: r#""organization_id" = $1"#,
    url: "/shape/projects",
    params: ["organization_id"],
);

crate::define_shape!(
    Notification,
    table: "notifications",
    singular: "notification",
    where_clause: r#""organization_id" = $1 AND "user_id" = $2"#,
    url: "/shape/notifications",
    params: ["organization_id", "user_id"],
);

crate::define_shape!(
    OrganizationMember,
    table: "organization_member_metadata",
    singular: "organization_member",
    where_clause: r#""organization_id" = $1"#,
    url: "/shape/organization_members",
    params: ["organization_id"],
);

crate::define_shape!(
    User,
    table: "users",
    singular: "user",
    where_clause: r#""id" IN (SELECT user_id FROM organization_member_metadata WHERE "organization_id" = $1)"#,
    url: "/shape/users",
    params: ["organization_id"],
);

// =============================================================================
// Project-scoped shapes
// =============================================================================

crate::define_shape!(
    Tag,
    table: "tags",
    singular: "tag",
    where_clause: r#""project_id" = $1"#,
    url: "/shape/project/{project_id}/tags",
    params: ["project_id"],
);

crate::define_shape!(
    ProjectStatus,
    table: "project_statuses",
    singular: "project_status",
    where_clause: r#""project_id" = $1"#,
    url: "/shape/project/{project_id}/project_statuses",
    params: ["project_id"],
);

crate::define_shape!(
    Issue,
    table: "issues",
    singular: "issue",
    where_clause: r#""project_id" = $1"#,
    url: "/shape/project/{project_id}/issues",
    params: ["project_id"],
);

crate::define_shape!(
    Workspace,
    table: "workspaces",
    singular: "workspace",
    where_clause: r#""owner_user_id" = $1"#,
    url: "/shape/user/workspaces",
    params: ["owner_user_id"],
);

// =============================================================================
// Issue-related shapes (streamed at project level)
// =============================================================================

crate::define_shape!(
    IssueAssignee,
    table: "issue_assignees",
    singular: "issue_assignee",
    where_clause: r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
    url: "/shape/project/{project_id}/issue_assignees",
    params: ["project_id"],
);

crate::define_shape!(
    IssueFollower,
    table: "issue_followers",
    singular: "issue_follower",
    where_clause: r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
    url: "/shape/project/{project_id}/issue_followers",
    params: ["project_id"],
);

crate::define_shape!(
    IssueTag,
    table: "issue_tags",
    singular: "issue_tag",
    where_clause: r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
    url: "/shape/project/{project_id}/issue_tags",
    params: ["project_id"],
);

crate::define_shape!(
    IssueRelationship,
    table: "issue_relationships",
    singular: "issue_relationship",
    where_clause: r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
    url: "/shape/project/{project_id}/issue_relationships",
    params: ["project_id"],
);

crate::define_shape!(
    PullRequest,
    table: "pull_requests",
    singular: "pull_request",
    where_clause: r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
    url: "/shape/project/{project_id}/pull_requests",
    params: ["project_id"],
);

// =============================================================================
// Issue-scoped shapes
// =============================================================================

crate::define_shape!(
    IssueComment,
    table: "issue_comments",
    singular: "issue_comment",
    where_clause: r#""issue_id" = $1"#,
    url: "/shape/issue/{issue_id}/comments",
    params: ["issue_id"],
);

crate::define_shape!(
    IssueCommentReaction,
    table: "issue_comment_reactions",
    singular: "issue_comment_reaction",
    where_clause: r#""comment_id" IN (SELECT id FROM issue_comments WHERE "issue_id" = $1)"#,
    url: "/shape/issue/{issue_id}/reactions",
    params: ["issue_id"],
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
