//! Unified entity definition system for realtime streaming.
//!
//! This module provides the `define_entity!` macro that generates shape (streaming)
//! definitions and entity metadata. Request/response types are defined externally
//! in `utils::api::entities`.
//!
//! # Example
//!
//! ```ignore
//! // With mutations - explicit scopes and request types
//! define_entity!(
//!     Tag,
//!     table: "tags",
//!     mutation_scope: Project,
//!     shape_scope: Project,
//!     requests: [CreateTagRequest, UpdateTagRequest, ListTagsQuery],
//!     shape: {
//!         where_clause: r#""project_id" = $1"#,
//!         params: ["project_id"],
//!         url: "/shape/project/{project_id}/tags",
//!     },
//! );
//!
//! // Shape-only (no mutations)
//! define_entity!(
//!     Workspace,
//!     table: "workspaces",
//!     shape_scope: None,
//!     shape: {
//!         where_clause: r#""owner_user_id" = $1"#,
//!         params: ["owner_user_id"],
//!         url: "/shape/user/workspaces",
//!     },
//! );
//! ```

use std::marker::PhantomData;

use ts_rs::TS;

/// Scope for entity relationships - determines parent ID field
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Scope {
    Organization,
    Project,
    Issue,
    Comment,
}

impl Scope {
    /// Returns the parent ID field name for this scope
    pub const fn parent_field(&self) -> &'static str {
        match self {
            Scope::Organization => "organization_id",
            Scope::Project => "project_id",
            Scope::Issue => "issue_id",
            Scope::Comment => "comment_id",
        }
    }

    /// Returns the URL path segment for this scope
    pub const fn url_segment(&self) -> &'static str {
        match self {
            Scope::Organization => "organization",
            Scope::Project => "project",
            Scope::Issue => "issue",
            Scope::Comment => "comment",
        }
    }
}

/// Shape configuration for realtime streaming
#[derive(Debug, Clone)]
pub struct ShapeConfig {
    pub where_clause: &'static str,
    pub params: &'static [&'static str],
    pub url: &'static str,
}

/// Field definition for mutation types (kept for SDK generation compatibility)
#[derive(Debug, Clone)]
pub struct FieldDef {
    pub name: &'static str,
    pub type_name: &'static str,
    pub is_optional: bool,
}

/// Unified entity definition containing shape and mutation metadata
#[derive(Debug)]
pub struct EntityDefinition<T: TS> {
    pub name: &'static str,
    pub table: &'static str,
    pub mutation_scope: Option<Scope>,
    pub shape_scope: Option<Scope>,
    pub shape: Option<ShapeConfig>,
    pub fields: &'static [FieldDef],
    pub _phantom: PhantomData<T>,
}

/// Trait to allow heterogeneous collection of entity definitions for export
pub trait EntityExport: Sync {
    fn name(&self) -> &'static str;
    fn table(&self) -> &'static str;
    fn mutation_scope(&self) -> Option<Scope>;
    fn shape_scope(&self) -> Option<Scope>;
    fn shape(&self) -> Option<&ShapeConfig>;
    fn fields(&self) -> &'static [FieldDef];
    fn ts_type_name(&self) -> String;
}

impl<T: TS + Sync> EntityExport for EntityDefinition<T> {
    fn name(&self) -> &'static str {
        self.name
    }
    fn table(&self) -> &'static str {
        self.table
    }
    fn mutation_scope(&self) -> Option<Scope> {
        self.mutation_scope
    }
    fn shape_scope(&self) -> Option<Scope> {
        self.shape_scope
    }
    fn shape(&self) -> Option<&ShapeConfig> {
        self.shape.as_ref()
    }
    fn fields(&self) -> &'static [FieldDef] {
        self.fields
    }
    fn ts_type_name(&self) -> String {
        T::name()
    }
}

/// Macro to define an entity with shape and mutation support.
///
/// This macro generates:
/// - Shape definition (`{ENTITY}_SHAPE`) for realtime streaming
/// - Entity metadata (`{ENTITY}_ENTITY`) for SDK generation
/// - Compile-time SQL validation
///
/// Request/response types are defined externally in `utils::api::entities`.
///
/// # Variants
///
/// ## With mutations - explicit scopes and request types
/// ```ignore
/// define_entity!(
///     Tag,
///     table: "tags",
///     mutation_scope: Project,
///     shape_scope: Project,
///     requests: [CreateTagRequest, UpdateTagRequest, ListTagsQuery],
///     shape: {
///         where_clause: r#""project_id" = $1"#,
///         params: ["project_id"],
///         url: "/shape/project/{project_id}/tags",
///     },
/// );
/// ```
///
/// ## Shape-only (no mutations)
/// ```ignore
/// define_entity!(
///     Workspace,
///     table: "workspaces",
///     shape_scope: None,
///     shape: {
///         where_clause: r#""owner_user_id" = $1"#,
///         params: ["owner_user_id"],
///         url: "/shape/user/workspaces",
///     },
/// );
/// ```
#[macro_export]
macro_rules! define_entity {
    // With mutations - explicit scopes and request types
    (
        $entity:ident,
        table: $table:literal,
        mutation_scope: $mutation_scope:ident,
        shape_scope: $shape_scope:ident,
        requests: [$create:ty, $update:ty, $list_query:ty],
        shape: {
            where_clause: $where_clause:literal,
            params: [$($param:literal),* $(,)?],
            url: $url:literal $(,)?
        } $(,)?
    ) => {
        paste::paste! {
            $crate::define_shape!(
                [<$entity:snake:upper _SHAPE>], $entity,
                table: $table,
                where_clause: $where_clause,
                url: $url,
                params: [$($param),*]
            );
        }

        paste::paste! {
            pub const [<$entity:snake:upper _ENTITY>]: $crate::entity::EntityDefinition<$entity> =
                $crate::entity::EntityDefinition {
                    name: stringify!($entity),
                    table: $table,
                    mutation_scope: Some($crate::entity::Scope::$mutation_scope),
                    shape_scope: Some($crate::entity::Scope::$shape_scope),
                    shape: Some($crate::entity::ShapeConfig {
                        where_clause: $where_clause,
                        params: &[$($param),*],
                        url: $url,
                    }),
                    fields: &[],
                    _phantom: std::marker::PhantomData,
                };
        }
    };

    // Shape-only with no scope (e.g., user-scoped entities)
    // NOTE: This must come BEFORE the explicit scope variant because `None` matches `:ident`
    (
        $entity:ident,
        table: $table:literal,
        shape_scope: None,
        shape: {
            where_clause: $where_clause:literal,
            params: [$($param:literal),* $(,)?],
            url: $url:literal $(,)?
        } $(,)?
    ) => {
        paste::paste! {
            $crate::define_shape!(
                [<$entity:snake:upper _SHAPE>], $entity,
                table: $table,
                where_clause: $where_clause,
                url: $url,
                params: [$($param),*]
            );
        }

        paste::paste! {
            pub const [<$entity:snake:upper _ENTITY>]: $crate::entity::EntityDefinition<$entity> =
                $crate::entity::EntityDefinition {
                    name: stringify!($entity),
                    table: $table,
                    mutation_scope: None,
                    shape_scope: None,
                    shape: Some($crate::entity::ShapeConfig {
                        where_clause: $where_clause,
                        params: &[$($param),*],
                        url: $url,
                    }),
                    fields: &[],
                    _phantom: std::marker::PhantomData,
                };
        }
    };

    // Shape-only with explicit scope
    (
        $entity:ident,
        table: $table:literal,
        shape_scope: $shape_scope:ident,
        shape: {
            where_clause: $where_clause:literal,
            params: [$($param:literal),* $(,)?],
            url: $url:literal $(,)?
        } $(,)?
    ) => {
        paste::paste! {
            $crate::define_shape!(
                [<$entity:snake:upper _SHAPE>], $entity,
                table: $table,
                where_clause: $where_clause,
                url: $url,
                params: [$($param),*]
            );
        }

        paste::paste! {
            pub const [<$entity:snake:upper _ENTITY>]: $crate::entity::EntityDefinition<$entity> =
                $crate::entity::EntityDefinition {
                    name: stringify!($entity),
                    table: $table,
                    mutation_scope: None,
                    shape_scope: Some($crate::entity::Scope::$shape_scope),
                    shape: Some($crate::entity::ShapeConfig {
                        where_clause: $where_clause,
                        params: &[$($param),*],
                        url: $url,
                    }),
                    fields: &[],
                    _phantom: std::marker::PhantomData,
                };
        }
    };
}
