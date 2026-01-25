//! Unified entity definitions for realtime streaming and mutations.
//!
//! This module defines all entities using the `define_entity!` macro, which generates
//! both shape definitions (for realtime streaming) and mutation types (for CRUD operations).
//!
//! Route files import the generated types and use `define_mutation_router!` for routing.

use chrono::{DateTime, Utc};
use serde_json::Value;

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
        types::{IssuePriority, IssueRelationshipType},
        users::User,
        workspaces::Workspace,
    },
    entity::EntityExport,
};

// =============================================================================
// Organization-scoped entities
// =============================================================================

// Project: simple case - same scope for mutations and streaming
crate::define_entity!(
    Project,
    table: "projects",
    mutation_scope: Organization,
    shape: {
        where_clause: r#""organization_id" = $1"#,
        params: ["organization_id"],
        url: "/shape/projects",
    },
    fields: [name: String, color: String],
);

// Notification: custom shape with multiple params (organization_id AND user_id)
crate::define_entity!(
    Notification,
    table: "notifications",
    mutation_scope: Organization,
    shape: {
        where_clause: r#""organization_id" = $1 AND "user_id" = $2"#,
        params: ["organization_id", "user_id"],
        url: "/shape/notifications",
    },
    fields: [seen: bool],
);

// OrganizationMember: shape-only (no mutations)
crate::define_entity!(
    OrganizationMember,
    table: "organization_member_metadata",
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
    shape: {
        where_clause: r#""id" IN (SELECT user_id FROM organization_member_metadata WHERE "organization_id" = $1)"#,
        params: ["organization_id"],
        url: "/shape/users",
    },
);

// =============================================================================
// Project-scoped entities
// =============================================================================

// Tag: simple project scope
crate::define_entity!(
    Tag,
    table: "tags",
    scope: Project,
    fields: [name: String, color: String],
);

// ProjectStatus: simple project scope
crate::define_entity!(
    ProjectStatus,
    table: "project_statuses",
    scope: Project,
    fields: [name: String, color: String, sort_order: i32, hidden: bool],
);

// Issue: simple project scope with many fields
crate::define_entity!(
    Issue,
    table: "issues",
    scope: Project,
    fields: [
        status_id: uuid::Uuid,
        title: String,
        description: Option<String>,
        priority: IssuePriority,
        start_date: Option<DateTime<Utc>>,
        target_date: Option<DateTime<Utc>>,
        completed_at: Option<DateTime<Utc>>,
        sort_order: f64,
        parent_issue_id: Option<uuid::Uuid>,
        extension_metadata: Value,
    ],
);

// Workspace: shape-only (no mutations) with custom URL
crate::define_entity!(
    Workspace,
    table: "workspaces",
    shape: {
        where_clause: r#""project_id" = $1"#,
        params: ["project_id"],
        url: "/shape/project/{project_id}/workspaces",
    },
);

// =============================================================================
// Issue-scoped mutations that stream at Project level
// =============================================================================

// IssueAssignee: mutations use issue_id, but streaming aggregates at project level
crate::define_entity!(
    IssueAssignee,
    table: "issue_assignees",
    mutation_scope: Issue,
    shape_scope: Project,
    shape_where: r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
    fields: [user_id: uuid::Uuid],
);

// IssueFollower: mutations use issue_id, streaming at project level
crate::define_entity!(
    IssueFollower,
    table: "issue_followers",
    mutation_scope: Issue,
    shape_scope: Project,
    shape_where: r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
    fields: [user_id: uuid::Uuid],
);

// IssueTag: mutations use issue_id, streaming at project level
crate::define_entity!(
    IssueTag,
    table: "issue_tags",
    mutation_scope: Issue,
    shape_scope: Project,
    shape_where: r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
    fields: [tag_id: uuid::Uuid],
);

// IssueRelationship: mutations use issue_id, streaming at project level
crate::define_entity!(
    IssueRelationship,
    table: "issue_relationships",
    mutation_scope: Issue,
    shape_scope: Project,
    shape_where: r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
    fields: [related_issue_id: uuid::Uuid, relationship_type: IssueRelationshipType],
);

// PullRequest: streaming at project level, no mutations
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
// Issue-scoped entities (both mutations and streaming at issue level)
// =============================================================================

// IssueComment: simple issue scope with custom URL for streaming
crate::define_entity!(
    IssueComment,
    table: "issue_comments",
    mutation_scope: Issue,
    shape: {
        where_clause: r#""issue_id" = $1"#,
        params: ["issue_id"],
        url: "/shape/issue/{issue_id}/comments",
    },
    fields: [message: String],
);

// =============================================================================
// Comment-scoped entities
// =============================================================================

// IssueCommentReaction: mutations use comment_id, streaming at issue level
crate::define_entity!(
    IssueCommentReaction,
    table: "issue_comment_reactions",
    mutation_scope: Comment,
    shape: {
        where_clause: r#""comment_id" IN (SELECT id FROM issue_comments WHERE "issue_id" = $1)"#,
        params: ["issue_id"],
        url: "/shape/issue/{issue_id}/reactions",
    },
    fields: [emoji: String],
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
