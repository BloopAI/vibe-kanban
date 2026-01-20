//! Centralized mutation type definitions.
//!
//! This module defines all mutation request/response types using the `define_mutation_types!` macro.
//! Similar to `shapes.rs`, this centralizes type definitions in one place.
//!
//! Route files import these types and use `define_mutation_router!` to generate routers.

use crate::db::{
    issue_comment_reactions::IssueCommentReaction, issue_comments::IssueComment,
    project_statuses::ProjectStatus, tags::Tag,
};

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
