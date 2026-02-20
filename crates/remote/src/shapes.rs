//! All shape constant instances for realtime streaming.

use crate::shape_definition::ShapeDefinition;
use api_types::{
    Issue, IssueAssignee, IssueComment, IssueCommentReaction, IssueFollower, IssueRelationship,
    IssueTag, Notification, OrganizationMember, Project, ProjectStatus, PullRequest, Tag, User,
    Workspace,
};

// =============================================================================
// Organization-scoped shapes
// =============================================================================

pub const PROJECTS_SHAPE: ShapeDefinition<Project> = crate::define_shape!(
    name: "PROJECTS_SHAPE",
    table: "projects",
    where_clause: r#""organization_id" = $1"#,
    url: "/shape/projects",
    params: ["organization_id"],
);

pub const NOTIFICATIONS_SHAPE: ShapeDefinition<Notification> = crate::define_shape!(
    name: "NOTIFICATIONS_SHAPE",
    table: "notifications",
    where_clause: r#""organization_id" = $1 AND "user_id" = $2"#,
    url: "/shape/notifications",
    params: ["organization_id", "user_id"],
);

pub const ORGANIZATION_MEMBERS_SHAPE: ShapeDefinition<OrganizationMember> = crate::define_shape!(
    name: "ORGANIZATION_MEMBERS_SHAPE",
    table: "organization_member_metadata",
    where_clause: r#""organization_id" = $1"#,
    url: "/shape/organization_members",
    params: ["organization_id"],
);

pub const USERS_SHAPE: ShapeDefinition<User> = crate::define_shape!(
    name: "USERS_SHAPE",
    table: "users",
    where_clause: r#""id" IN (SELECT user_id FROM organization_member_metadata WHERE "organization_id" = $1)"#,
    url: "/shape/users",
    params: ["organization_id"],
);

// =============================================================================
// Project-scoped shapes
// =============================================================================

pub const PROJECT_TAGS_SHAPE: ShapeDefinition<Tag> = crate::define_shape!(
    name: "PROJECT_TAGS_SHAPE",
    table: "tags",
    where_clause: r#""project_id" = $1"#,
    url: "/shape/project/{project_id}/tags",
    params: ["project_id"],
);

pub const PROJECT_PROJECT_STATUSES_SHAPE: ShapeDefinition<ProjectStatus> = crate::define_shape!(
    name: "PROJECT_PROJECT_STATUSES_SHAPE",
    table: "project_statuses",
    where_clause: r#""project_id" = $1"#,
    url: "/shape/project/{project_id}/project_statuses",
    params: ["project_id"],
);

pub const PROJECT_ISSUES_SHAPE: ShapeDefinition<Issue> = crate::define_shape!(
    name: "PROJECT_ISSUES_SHAPE",
    table: "issues",
    where_clause: r#""project_id" = $1"#,
    url: "/shape/project/{project_id}/issues",
    params: ["project_id"],
);

pub const USER_WORKSPACES_SHAPE: ShapeDefinition<Workspace> = crate::define_shape!(
    name: "USER_WORKSPACES_SHAPE",
    table: "workspaces",
    where_clause: r#""owner_user_id" = $1"#,
    url: "/shape/user/workspaces",
    params: ["owner_user_id"],
);

pub const PROJECT_WORKSPACES_SHAPE: ShapeDefinition<Workspace> = crate::define_shape!(
    name: "PROJECT_WORKSPACES_SHAPE",
    table: "workspaces",
    where_clause: r#""project_id" = $1"#,
    url: "/shape/project/{project_id}/workspaces",
    params: ["project_id"],
);

// =============================================================================
// Issue-related shapes (streamed at project level)
// =============================================================================

pub const PROJECT_ISSUE_ASSIGNEES_SHAPE: ShapeDefinition<IssueAssignee> = crate::define_shape!(
    name: "PROJECT_ISSUE_ASSIGNEES_SHAPE",
    table: "issue_assignees",
    where_clause: r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
    url: "/shape/project/{project_id}/issue_assignees",
    params: ["project_id"],
);

pub const PROJECT_ISSUE_FOLLOWERS_SHAPE: ShapeDefinition<IssueFollower> = crate::define_shape!(
    name: "PROJECT_ISSUE_FOLLOWERS_SHAPE",
    table: "issue_followers",
    where_clause: r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
    url: "/shape/project/{project_id}/issue_followers",
    params: ["project_id"],
);

pub const PROJECT_ISSUE_TAGS_SHAPE: ShapeDefinition<IssueTag> = crate::define_shape!(
    name: "PROJECT_ISSUE_TAGS_SHAPE",
    table: "issue_tags",
    where_clause: r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
    url: "/shape/project/{project_id}/issue_tags",
    params: ["project_id"],
);

pub const PROJECT_ISSUE_RELATIONSHIPS_SHAPE: ShapeDefinition<IssueRelationship> = crate::define_shape!(
    name: "PROJECT_ISSUE_RELATIONSHIPS_SHAPE",
    table: "issue_relationships",
    where_clause: r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
    url: "/shape/project/{project_id}/issue_relationships",
    params: ["project_id"],
);

pub const PROJECT_PULL_REQUESTS_SHAPE: ShapeDefinition<PullRequest> = crate::define_shape!(
    name: "PROJECT_PULL_REQUESTS_SHAPE",
    table: "pull_requests",
    where_clause: r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
    url: "/shape/project/{project_id}/pull_requests",
    params: ["project_id"],
);

// =============================================================================
// Issue-scoped shapes
// =============================================================================

pub const ISSUE_COMMENTS_SHAPE: ShapeDefinition<IssueComment> = crate::define_shape!(
    name: "ISSUE_COMMENTS_SHAPE",
    table: "issue_comments",
    where_clause: r#""issue_id" = $1"#,
    url: "/shape/issue/{issue_id}/comments",
    params: ["issue_id"],
);

pub const ISSUE_REACTIONS_SHAPE: ShapeDefinition<IssueCommentReaction> = crate::define_shape!(
    name: "ISSUE_REACTIONS_SHAPE",
    table: "issue_comment_reactions",
    where_clause: r#""comment_id" IN (SELECT id FROM issue_comments WHERE "issue_id" = $1)"#,
    url: "/shape/issue/{issue_id}/reactions",
    params: ["issue_id"],
);

