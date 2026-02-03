//! Unified entity definitions for realtime streaming and mutations.
//!
//! This module defines all entities using the `define_entity!` macro, which generates
//! shape definitions (for realtime streaming) and entity metadata.
//!
//! Request/response types are defined in `utils::api::entities` and re-exported here.

use crate::{
    db::{
        issue_assignees::IssueAssignee,
        issue_comment_reactions::IssueCommentReaction,
        issue_comments::IssueComment,
        issue_followers::IssueFollower,
        issue_relationships::IssueRelationship,
        issue_tags::IssueTag,
        issues::Issue,
        notifications::Notification,
        organization_members::OrganizationMember,
        project_statuses::ProjectStatus,
        projects::Project,
        pull_requests::PullRequest,
        tags::Tag,
        users::User,
        workspaces::Workspace,
    },
    entity::EntityExport,
};

// Re-export request types from utils for convenience
pub use utils::api::entities::{
    // Issue
    CreateIssueRequest, ListIssuesQuery, UpdateIssueRequest,
    // IssueAssignee
    CreateIssueAssigneeRequest, ListIssueAssigneesQuery, UpdateIssueAssigneeRequest,
    // IssueComment
    CreateIssueCommentRequest, ListIssueCommentsQuery, UpdateIssueCommentRequest,
    // IssueCommentReaction
    CreateIssueCommentReactionRequest, ListIssueCommentReactionsQuery,
    UpdateIssueCommentReactionRequest,
    // IssueFollower
    CreateIssueFollowerRequest, ListIssueFollowersQuery, UpdateIssueFollowerRequest,
    // IssueRelationship
    CreateIssueRelationshipRequest, ListIssueRelationshipsQuery, UpdateIssueRelationshipRequest,
    // IssueTag
    CreateIssueTagRequest, ListIssueTagsQuery, UpdateIssueTagRequest,
    // Notification
    CreateNotificationRequest, ListNotificationsQuery, UpdateNotificationRequest,
    // Project
    CreateProjectRequest, ListProjectsQuery, UpdateProjectRequest,
    // ProjectStatus
    CreateProjectStatusRequest, ListProjectStatusesQuery, UpdateProjectStatusRequest,
    // Tag
    CreateTagRequest, ListTagsQuery, UpdateTagRequest,
};

// List response types (defined locally as they wrap entity types from this crate)
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct ListProjectsResponse {
    pub projects: Vec<Project>,
}

#[derive(Debug, Serialize)]
pub struct ListNotificationsResponse {
    pub notifications: Vec<Notification>,
}

#[derive(Debug, Serialize)]
pub struct ListTagsResponse {
    pub tags: Vec<Tag>,
}

#[derive(Debug, Serialize)]
pub struct ListProjectStatusesResponse {
    pub project_statuses: Vec<ProjectStatus>,
}

#[derive(Debug, Serialize)]
pub struct ListIssuesResponse {
    pub issues: Vec<Issue>,
}

#[derive(Debug, Serialize)]
pub struct ListIssueAssigneesResponse {
    pub issue_assignees: Vec<IssueAssignee>,
}

#[derive(Debug, Serialize)]
pub struct ListIssueFollowersResponse {
    pub issue_followers: Vec<IssueFollower>,
}

#[derive(Debug, Serialize)]
pub struct ListIssueTagsResponse {
    pub issue_tags: Vec<IssueTag>,
}

#[derive(Debug, Serialize)]
pub struct ListIssueRelationshipsResponse {
    pub issue_relationships: Vec<IssueRelationship>,
}

#[derive(Debug, Serialize)]
pub struct ListIssueCommentsResponse {
    pub issue_comments: Vec<IssueComment>,
}

#[derive(Debug, Serialize)]
pub struct ListIssueCommentReactionsResponse {
    pub issue_comment_reactions: Vec<IssueCommentReaction>,
}

// =============================================================================
// Organization-scoped entities
// =============================================================================

// Project: organization-scoped mutations and streaming
crate::define_entity!(
    Project,
    table: "projects",
    mutation_scope: Organization,
    shape_scope: Organization,
    requests: [CreateProjectRequest, UpdateProjectRequest, ListProjectsQuery],
    shape: {
        where_clause: r#""organization_id" = $1"#,
        params: ["organization_id"],
        url: "/shape/projects",
    },
);

// Notification: organization-scoped mutations, custom shape with multiple params
crate::define_entity!(
    Notification,
    table: "notifications",
    mutation_scope: Organization,
    shape_scope: Organization,
    requests: [CreateNotificationRequest, UpdateNotificationRequest, ListNotificationsQuery],
    shape: {
        where_clause: r#""organization_id" = $1 AND "user_id" = $2"#,
        params: ["organization_id", "user_id"],
        url: "/shape/notifications",
    },
);

// OrganizationMember: shape-only (no mutations via this API)
crate::define_entity!(
    OrganizationMember,
    table: "organization_member_metadata",
    shape_scope: None,
    shape: {
        where_clause: r#""organization_id" = $1"#,
        params: ["organization_id"],
        url: "/shape/organization_members",
    },
);

// User: shape-only (no mutations), scoped via organization membership
crate::define_entity!(
    User,
    table: "users",
    shape_scope: None,
    shape: {
        where_clause: r#""id" IN (SELECT user_id FROM organization_member_metadata WHERE "organization_id" = $1)"#,
        params: ["organization_id"],
        url: "/shape/users",
    },
);

// =============================================================================
// Project-scoped entities
// =============================================================================

// Tag: project-scoped mutations and streaming
crate::define_entity!(
    Tag,
    table: "tags",
    mutation_scope: Project,
    shape_scope: Project,
    requests: [CreateTagRequest, UpdateTagRequest, ListTagsQuery],
    shape: {
        where_clause: r#""project_id" = $1"#,
        params: ["project_id"],
        url: "/shape/project/{project_id}/tags",
    },
);

// ProjectStatus: project-scoped mutations and streaming
crate::define_entity!(
    ProjectStatus,
    table: "project_statuses",
    mutation_scope: Project,
    shape_scope: Project,
    requests: [CreateProjectStatusRequest, UpdateProjectStatusRequest, ListProjectStatusesQuery],
    shape: {
        where_clause: r#""project_id" = $1"#,
        params: ["project_id"],
        url: "/shape/project/{project_id}/project_statuses",
    },
);

// Issue: project-scoped mutations and streaming
crate::define_entity!(
    Issue,
    table: "issues",
    mutation_scope: Project,
    shape_scope: Project,
    requests: [CreateIssueRequest, UpdateIssueRequest, ListIssuesQuery],
    shape: {
        where_clause: r#""project_id" = $1"#,
        params: ["project_id"],
        url: "/shape/project/{project_id}/issues",
    },
);

// Workspace: shape-only (no mutations via entity API), scoped by owner user
crate::define_entity!(
    Workspace,
    table: "workspaces",
    shape_scope: None,
    shape: {
        where_clause: r#""owner_user_id" = $1"#,
        params: ["owner_user_id"],
        url: "/shape/user/workspaces",
    },
);

// =============================================================================
// Issue-scoped mutations that stream at Project level
// =============================================================================

// IssueAssignee: issue-scoped mutations, project-level streaming
crate::define_entity!(
    IssueAssignee,
    table: "issue_assignees",
    mutation_scope: Issue,
    shape_scope: Project,
    requests: [CreateIssueAssigneeRequest, UpdateIssueAssigneeRequest, ListIssueAssigneesQuery],
    shape: {
        where_clause: r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
        params: ["project_id"],
        url: "/shape/project/{project_id}/issue_assignees",
    },
);

// IssueFollower: issue-scoped mutations, project-level streaming
crate::define_entity!(
    IssueFollower,
    table: "issue_followers",
    mutation_scope: Issue,
    shape_scope: Project,
    requests: [CreateIssueFollowerRequest, UpdateIssueFollowerRequest, ListIssueFollowersQuery],
    shape: {
        where_clause: r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
        params: ["project_id"],
        url: "/shape/project/{project_id}/issue_followers",
    },
);

// IssueTag: issue-scoped mutations, project-level streaming
crate::define_entity!(
    IssueTag,
    table: "issue_tags",
    mutation_scope: Issue,
    shape_scope: Project,
    requests: [CreateIssueTagRequest, UpdateIssueTagRequest, ListIssueTagsQuery],
    shape: {
        where_clause: r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
        params: ["project_id"],
        url: "/shape/project/{project_id}/issue_tags",
    },
);

// IssueRelationship: issue-scoped mutations, project-level streaming
crate::define_entity!(
    IssueRelationship,
    table: "issue_relationships",
    mutation_scope: Issue,
    shape_scope: Project,
    requests: [CreateIssueRelationshipRequest, UpdateIssueRelationshipRequest, ListIssueRelationshipsQuery],
    shape: {
        where_clause: r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
        params: ["project_id"],
        url: "/shape/project/{project_id}/issue_relationships",
    },
);

// PullRequest: project-level streaming only (no mutations via this API)
crate::define_entity!(
    PullRequest,
    table: "pull_requests",
    shape_scope: None,
    shape: {
        where_clause: r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
        params: ["project_id"],
        url: "/shape/project/{project_id}/pull_requests",
    },
);

// =============================================================================
// Issue-scoped entities (both mutations and streaming at issue level)
// =============================================================================

// IssueComment: issue-scoped mutations and streaming
crate::define_entity!(
    IssueComment,
    table: "issue_comments",
    mutation_scope: Issue,
    shape_scope: Issue,
    requests: [CreateIssueCommentRequest, UpdateIssueCommentRequest, ListIssueCommentsQuery],
    shape: {
        where_clause: r#""issue_id" = $1"#,
        params: ["issue_id"],
        url: "/shape/issue/{issue_id}/comments",
    },
);

// =============================================================================
// Comment-scoped entities
// =============================================================================

// IssueCommentReaction: comment-scoped mutations and streaming
crate::define_entity!(
    IssueCommentReaction,
    table: "issue_comment_reactions",
    mutation_scope: Comment,
    shape_scope: Comment,
    requests: [CreateIssueCommentReactionRequest, UpdateIssueCommentReactionRequest, ListIssueCommentReactionsQuery],
    shape: {
        where_clause: r#""comment_id" IN (SELECT id FROM issue_comments WHERE "issue_id" = $1)"#,
        params: ["issue_id"],
        url: "/shape/issue/{issue_id}/reactions",
    },
);

// =============================================================================
// Export functions
// =============================================================================

/// All entity definitions for SDK generation - uses trait objects for heterogeneous collection
pub fn all_entities() -> Vec<&'static dyn EntityExport> {
    vec![
        // Organization-scoped
        &PROJECT_ENTITY,
        &NOTIFICATION_ENTITY,
        &ORGANIZATION_MEMBER_ENTITY,
        &USER_ENTITY,
        // Project-scoped
        &TAG_ENTITY,
        &PROJECT_STATUS_ENTITY,
        &ISSUE_ENTITY,
        &WORKSPACE_ENTITY,
        // Issue-scoped (project streaming)
        &ISSUE_ASSIGNEE_ENTITY,
        &ISSUE_FOLLOWER_ENTITY,
        &ISSUE_TAG_ENTITY,
        &ISSUE_RELATIONSHIP_ENTITY,
        &PULL_REQUEST_ENTITY,
        // Issue-scoped
        &ISSUE_COMMENT_ENTITY,
        // Comment-scoped
        &ISSUE_COMMENT_REACTION_ENTITY,
    ]
}

/// All shape definitions for realtime streaming - for backward compatibility
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
