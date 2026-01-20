//! Centralized mutation type definitions.
//!
//! This module defines all mutation request/response types using the `define_mutation_types!` macro.
//! Similar to `shapes.rs`, this centralizes type definitions in one place.
//!
//! Route files import these types and use `define_mutation_router!` to generate routers.

use chrono::{DateTime, Utc};
use serde_json::Value;

use crate::db::{
    issue_comment_reactions::IssueCommentReaction, issue_comments::IssueComment, issues::Issue,
    notifications::Notification, project_statuses::ProjectStatus, projects::Project, tags::Tag,
    types::IssuePriority,
};

// Organization-scoped mutations
crate::define_mutation_types!(
    Project,
    table: "projects",
    scope: Organization,
    fields: [name: String, color: String],
);

crate::define_mutation_types!(
    Notification,
    table: "notifications",
    scope: Organization,
    fields: [seen: bool],
);

// Project-scoped mutations
crate::define_mutation_types!(
    Tag,
    table: "tags",
    scope: Project,
    fields: [name: String, color: String],
);

crate::define_mutation_types!(
    ProjectStatus,
    table: "project_statuses",
    scope: Project,
    fields: [name: String, color: String, sort_order: i32],
);

crate::define_mutation_types!(
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

// Issue-scoped mutations
crate::define_mutation_types!(
    IssueComment,
    table: "issue_comments",
    scope: Issue,
    fields: [message: String],
);

// Comment-scoped mutations
crate::define_mutation_types!(
    IssueCommentReaction,
    table: "issue_comment_reactions",
    scope: Comment,
    fields: [emoji: String],
);
