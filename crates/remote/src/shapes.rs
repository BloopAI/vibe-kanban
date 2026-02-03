//! Shape definitions for realtime streaming.
//!
//! This module provides the core shape infrastructure:
//! - `ShapeDefinition<T>` struct for shape metadata
//! - `ShapeExport` trait for heterogeneous shape collections
//! - `define_shape!` macro for compile-time SQL validation
//!
//! The `define_entity!` macro in the `entity` module uses `define_shape!` internally.
//! Shape constants are re-exported from the `entities` module for convenience.

use std::marker::PhantomData;

use ts_rs::TS;

#[derive(Debug)]
pub struct ShapeDefinition<T: TS> {
    pub table: &'static str,
    pub where_clause: &'static str,
    pub params: &'static [&'static str],
    pub url: &'static str,
    pub _phantom: PhantomData<T>,
}

/// Trait to allow heterogeneous collection of shapes for export
pub trait ShapeExport: Sync {
    fn table(&self) -> &'static str;
    fn where_clause(&self) -> &'static str;
    fn params(&self) -> &'static [&'static str];
    fn url(&self) -> &'static str;
    fn ts_type_name(&self) -> String;
}

impl<T: TS + Sync> ShapeExport for ShapeDefinition<T> {
    fn table(&self) -> &'static str {
        self.table
    }
    fn where_clause(&self) -> &'static str {
        self.where_clause
    }
    fn params(&self) -> &'static [&'static str] {
        self.params
    }
    fn url(&self) -> &'static str {
        self.url
    }
    fn ts_type_name(&self) -> String {
        T::name()
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
/// pub const PROJECT_SHAPE: ShapeDefinition<Project> = define_shape!(
///     table: "projects",
///     where_clause: r#""organization_id" = $1"#,
///     url: "/shape/projects",
///     params: ["organization_id"]
/// );
/// ```
#[macro_export]
macro_rules! define_shape {
    (
        table: $table:literal,
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
            where_clause: $where,
            params: &[$($param),*],
            url: $url,
            _phantom: std::marker::PhantomData,
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
