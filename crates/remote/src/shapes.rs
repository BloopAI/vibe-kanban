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

/// Macro to define shapes with compile-time SQL validation.
///
/// The macro validates SQL at compile time using `sqlx::query!`, ensuring that:
/// - The table exists
/// - The columns in the WHERE clause exist
/// - The SQL syntax is correct
///
/// **Note**: Prefer using `define_entity!` from the `entity` module, which generates
/// both shape and mutation types from a single declaration.
///
/// Usage:
/// ```ignore
/// define_shape!(
///     PROJECTS, Project,
///     table: "projects",
///     where_clause: r#""organization_id" = $1"#,
///     url: "/shape/projects",
///     params: ["organization_id"]
/// );
/// ```
#[macro_export]
macro_rules! define_shape {
    (
        $name:ident, $type:ty,
        table: $table:literal,
        where_clause: $where:literal,
        url: $url:expr,
        params: [$($param:literal),* $(,)?]
    ) => {
        pub const $name: $crate::shapes::ShapeDefinition<$type> = {
            // Compile-time SQL validation - this ensures table and columns exist
            // We use dummy UUID values for parameter validation since all shape
            // params are UUIDs
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
        };
    };
}

// Re-export shape constants from entities module for backward compatibility
pub use crate::entities::{
    ISSUE_ASSIGNEE_SHAPE as ISSUE_ASSIGNEES,
    ISSUE_COMMENT_REACTION_SHAPE as ISSUE_COMMENT_REACTIONS, ISSUE_COMMENT_SHAPE as ISSUE_COMMENTS,
    ISSUE_FOLLOWER_SHAPE as ISSUE_FOLLOWERS, ISSUE_RELATIONSHIP_SHAPE as ISSUE_RELATIONSHIPS,
    ISSUE_SHAPE as ISSUES, ISSUE_TAG_SHAPE as ISSUE_TAGS, NOTIFICATION_SHAPE as NOTIFICATIONS,
    PROJECT_SHAPE as PROJECTS, PROJECT_STATUS_SHAPE as PROJECT_STATUSES, TAG_SHAPE as TAGS,
    WORKSPACE_SHAPE as WORKSPACES, all_shapes,
};
