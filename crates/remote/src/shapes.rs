//! Shape definitions for realtime streaming.
//!
//! This module provides the core shape infrastructure:
//! - `ShapeDefinition` struct for shape metadata
//! - `define_shape!` macro for compile-time SQL validation

#[derive(Debug)]
pub struct ShapeDefinition {
    pub table: &'static str,
    pub ts_type_name: &'static str,
    pub where_clause: &'static str,
    pub params: &'static [&'static str],
    pub url: &'static str,
}

impl ShapeDefinition {
    pub fn table(&self) -> &'static str {
        self.table
    }
    pub fn ts_type_name(&self) -> &'static str {
        self.ts_type_name
    }
    pub fn where_clause(&self) -> &'static str {
        self.where_clause
    }
    pub fn params(&self) -> &'static [&'static str] {
        self.params
    }
    pub fn url(&self) -> &'static str {
        self.url
    }
}

/// Macro to construct a `ShapeDefinition` with compile-time SQL validation.
///
/// The SQL validation uses `sqlx::query!` to ensure at compile time that:
/// - The table exists
/// - The columns in the WHERE clause exist
/// - The SQL syntax is correct
///
/// Usage:
/// ```ignore
/// pub const PROJECT_SHAPE: ShapeDefinition = define_shape!(
///     table: "projects",
///     ts_type_name: "Project",
///     where_clause: r#""organization_id" = $1"#,
///     url: "/shape/projects",
///     params: ["organization_id"]
/// );
/// ```
#[macro_export]
macro_rules! define_shape {
    (
        table: $table:literal,
        ts_type_name: $ts_type_name:literal,
        where_clause: $where:literal,
        url: $url:expr,
        params: [$($param:literal),* $(,)?] $(,)?
    ) => {{
        #[allow(dead_code)]
        fn _validate() {
            let _ = sqlx::query!(
                "SELECT 1 AS v FROM " + $table + " WHERE " + $where
                $(, { let _ = stringify!($param); uuid::Uuid::nil() })*
            );
        }

        $crate::shapes::ShapeDefinition {
            table: $table,
            ts_type_name: $ts_type_name,
            where_clause: $where,
            params: &[$($param),*],
            url: $url,
        }
    }};
}

// Re-export shape constants from entities module for backward compatibility
pub use crate::entities::{
    ISSUE_ASSIGNEE_SHAPE as ISSUE_ASSIGNEES,
    ISSUE_COMMENT_REACTION_SHAPE as ISSUE_COMMENT_REACTIONS, ISSUE_COMMENT_SHAPE as ISSUE_COMMENTS,
    ISSUE_FOLLOWER_SHAPE as ISSUE_FOLLOWERS, ISSUE_RELATIONSHIP_SHAPE as ISSUE_RELATIONSHIPS,
    ISSUE_SHAPE as ISSUES, ISSUE_TAG_SHAPE as ISSUE_TAGS, NOTIFICATION_SHAPE as NOTIFICATIONS,
    ORGANIZATION_MEMBER_SHAPE as ORGANIZATION_MEMBERS, PROJECT_SHAPE as PROJECTS,
    PROJECT_STATUS_SHAPE as PROJECT_STATUSES, PROJECT_WORKSPACE_SHAPE as PROJECT_WORKSPACES,
    PULL_REQUEST_SHAPE as PULL_REQUESTS, TAG_SHAPE as TAGS, USER_SHAPE as USERS,
    WORKSPACE_SHAPE as WORKSPACES, all_shapes,
};
