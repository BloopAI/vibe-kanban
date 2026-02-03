//! Shape definitions for realtime streaming.
//!
//! This module defines all shapes using the `define_shape!` macro, which provides
//! compile-time SQL validation for each shape's table and WHERE clause.

use crate::shapes::ShapeDefinition;
use api_types::{
    Issue, IssueAssignee, IssueComment, IssueCommentReaction, IssueFollower, IssueRelationship,
    IssueTag, Notification, OrganizationMember, Project, ProjectStatus, PullRequest, Tag, User,
    Workspace,
};

// =============================================================================
// Organization-scoped shapes
// =============================================================================

pub const PROJECT_SHAPE: ShapeDefinition<Project> = crate::define_shape!(
    table: "projects",
    where_clause: r#""organization_id" = $1"#,
    url: "/shape/projects",
    params: ["organization_id"],
);

pub const NOTIFICATION_SHAPE: ShapeDefinition<Notification> = crate::define_shape!(
    table: "notifications",
    where_clause: r#""organization_id" = $1 AND "user_id" = $2"#,
    url: "/shape/notifications",
    params: ["organization_id", "user_id"],
);

pub const ORGANIZATION_MEMBER_SHAPE: ShapeDefinition<OrganizationMember> = crate::define_shape!(
    table: "organization_member_metadata",
    where_clause: r#""organization_id" = $1"#,
    url: "/shape/organization_members",
    params: ["organization_id"],
);

pub const USER_SHAPE: ShapeDefinition<User> = crate::define_shape!(
    table: "users",
    where_clause: r#""id" IN (SELECT user_id FROM organization_member_metadata WHERE "organization_id" = $1)"#,
    url: "/shape/users",
    params: ["organization_id"],
);

// =============================================================================
// Project-scoped shapes
// =============================================================================

pub const TAG_SHAPE: ShapeDefinition<Tag> = crate::define_shape!(
    table: "tags",
    where_clause: r#""project_id" = $1"#,
    url: "/shape/project/{project_id}/tags",
    params: ["project_id"],
);

pub const PROJECT_STATUS_SHAPE: ShapeDefinition<ProjectStatus> = crate::define_shape!(
    table: "project_statuses",
    where_clause: r#""project_id" = $1"#,
    url: "/shape/project/{project_id}/project_statuses",
    params: ["project_id"],
);

pub const ISSUE_SHAPE: ShapeDefinition<Issue> = crate::define_shape!(
    table: "issues",
    where_clause: r#""project_id" = $1"#,
    url: "/shape/project/{project_id}/issues",
    params: ["project_id"],
);

pub const WORKSPACE_SHAPE: ShapeDefinition<Workspace> = crate::define_shape!(
    table: "workspaces",
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

pub const ISSUE_ASSIGNEE_SHAPE: ShapeDefinition<IssueAssignee> = crate::define_shape!(
    table: "issue_assignees",
    where_clause: r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
    url: "/shape/project/{project_id}/issue_assignees",
    params: ["project_id"],
);

pub const ISSUE_FOLLOWER_SHAPE: ShapeDefinition<IssueFollower> = crate::define_shape!(
    table: "issue_followers",
    where_clause: r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
    url: "/shape/project/{project_id}/issue_followers",
    params: ["project_id"],
);

pub const ISSUE_TAG_SHAPE: ShapeDefinition<IssueTag> = crate::define_shape!(
    table: "issue_tags",
    where_clause: r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
    url: "/shape/project/{project_id}/issue_tags",
    params: ["project_id"],
);

pub const ISSUE_RELATIONSHIP_SHAPE: ShapeDefinition<IssueRelationship> = crate::define_shape!(
    table: "issue_relationships",
    where_clause: r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
    url: "/shape/project/{project_id}/issue_relationships",
    params: ["project_id"],
);

pub const PULL_REQUEST_SHAPE: ShapeDefinition<PullRequest> = crate::define_shape!(
    table: "pull_requests",
    where_clause: r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
    url: "/shape/project/{project_id}/pull_requests",
    params: ["project_id"],
);

// =============================================================================
// Issue-scoped shapes
// =============================================================================

pub const ISSUE_COMMENT_SHAPE: ShapeDefinition<IssueComment> = crate::define_shape!(
    table: "issue_comments",
    where_clause: r#""issue_id" = $1"#,
    url: "/shape/issue/{issue_id}/comments",
    params: ["issue_id"],
);

pub const ISSUE_COMMENT_REACTION_SHAPE: ShapeDefinition<IssueCommentReaction> = crate::define_shape!(
    table: "issue_comment_reactions",
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
