//! Entity metadata for mutation type generation.
//!
//! This module provides `define_entity!`, a macro that generates shape definitions
//! (for realtime streaming via Electric), mutation types (Create/Update request structs),
//! and entity metadata used by `generate_types.rs` to produce TypeScript mutation constants.
//!
//! Shape definitions are handled by the `shapes` module via `define_shape!`.
//! This module's `EntityDefinition` only carries mutation metadata (name, table, scope, fields).
//!
//! # Example
//!
//! ```ignore
//! // Simple case - same scope for mutations and streaming
//! define_entity!(
//!     Tag,
//!     table: "tags",
//!     scope: Project,
//!     fields: [name: String, color: String],
//! );
//!
//! // Complex case - different scopes (join tables)
//! define_entity!(
//!     IssueAssignee,
//!     table: "issue_assignees",
//!     mutation_scope: Issue,
//!     shape_scope: Project,
//!     shape_where: r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
//!     fields: [user_id: uuid::Uuid],
//! );
//!
//! // Shape-only (no mutations)
//! define_entity!(
//!     Workspace,
//!     table: "workspaces",
//!     scope: Project,
//! );
//!
//! // Multiple shapes (no mutations, one entity with multiple query paths)
//! define_entity!(
//!     Workspace,
//!     table: "workspaces",
//!     shapes: [
//!         {
//!             name: Workspace,
//!             where_clause: r#""owner_user_id" = $1"#,
//!             params: ["owner_user_id"],
//!             url: "/shape/user/workspaces",
//!         },
//!         {
//!             name: ProjectWorkspace,
//!             where_clause: r#""project_id" = $1"#,
//!             params: ["project_id"],
//!             url: "/shape/project/{project_id}/workspaces",
//!         }
//!     ],
//! );
//! ```

use std::marker::PhantomData;

use ts_rs::TS;

/// Scope for mutations — determines which parent ID field is used for API routing
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Scope {
    Organization,
    Project,
    Issue,
    Comment,
}

/// Field definition for mutation types
#[derive(Debug, Clone)]
pub struct FieldDef {
    pub name: &'static str,
    pub type_name: &'static str,
    pub is_optional: bool,
}

/// Entity metadata for mutation type generation and API routing
#[derive(Debug)]
pub struct EntityDefinition<T: TS> {
    pub name: &'static str,
    pub table: &'static str,
    pub mutation_scope: Option<Scope>,
    pub fields: &'static [FieldDef],
    pub _phantom: PhantomData<T>,
}

/// Trait to allow heterogeneous collection of entity definitions for export
pub trait EntityExport: Sync {
    fn name(&self) -> &'static str;
    fn table(&self) -> &'static str;
    fn mutation_scope(&self) -> Option<Scope>;
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
    fn fields(&self) -> &'static [FieldDef] {
        self.fields
    }
    fn ts_type_name(&self) -> String {
        T::name()
    }
}

/// Macro to define an entity with shape and optional mutation support.
///
/// This macro generates:
/// - Shape definition (`{ENTITY}_SHAPE`) for realtime streaming
/// - Mutation types (`Create{Entity}Request`, `Update{Entity}Request`) when fields are provided
/// - Entity metadata (`{ENTITY}_ENTITY`) for TypeScript codegen
#[macro_export]
macro_rules! define_entity {
    // Simple case: same scope for mutations and shape, with fields
    (
        $entity:ident,
        table: $table:literal,
        scope: $scope:ident,
        fields: [$($field:ident : $ty:ty),* $(,)?] $(,)?
    ) => {
        $crate::define_mutation_types!(
            $entity,
            table: $table,
            scope: $scope,
            fields: [$($field : $ty),*]
        );

        $crate::define_entity!(@shape
            $entity,
            table: $table,
            scope: $scope,
        );

        $crate::define_entity!(@entity_def
            $entity,
            table: $table,
            mutation_scope: $scope,
            fields: [$($field : $ty),*]
        );
    };

    // Shape-only case: no mutations (no fields)
    (
        $entity:ident,
        table: $table:literal,
        scope: $scope:ident $(,)?
    ) => {
        $crate::define_entity!(@shape
            $entity,
            table: $table,
            scope: $scope,
        );

        $crate::define_entity!(@entity_def_no_mutations
            $entity,
            table: $table,
        );
    };

    // Complex case: different mutation and shape scopes with custom where clause
    (
        $entity:ident,
        table: $table:literal,
        mutation_scope: $mut_scope:ident,
        shape_scope: $shape_scope:ident,
        shape_where: $where_clause:literal,
        fields: [$($field:ident : $ty:ty),* $(,)?] $(,)?
    ) => {
        $crate::define_mutation_types!(
            $entity,
            table: $table,
            scope: $mut_scope,
            fields: [$($field : $ty),*]
        );

        $crate::define_entity!(@shape_custom
            $entity,
            table: $table,
            scope: $shape_scope,
            where_clause: $where_clause,
        );

        $crate::define_entity!(@entity_def
            $entity,
            table: $table,
            mutation_scope: $mut_scope,
            fields: [$($field : $ty),*]
        );
    };

    // Fully custom case: specify everything explicitly (for special cases like Notifications)
    (
        $entity:ident,
        table: $table:literal,
        mutation_scope: $mut_scope:ident,
        shape: {
            where_clause: $where_clause:literal,
            params: [$($param:literal),* $(,)?],
            url: $url:literal $(,)?
        },
        fields: [$($field:ident : $ty:ty),* $(,)?] $(,)?
    ) => {
        $crate::define_mutation_types!(
            $entity,
            table: $table,
            scope: $mut_scope,
            fields: [$($field : $ty),*]
        );

        paste::paste! {
            $crate::define_shape!(
                [<$entity:snake:upper _SHAPE>], $entity,
                table: $table,
                where_clause: $where_clause,
                url: $url,
                params: [$($param),*]
            );
        }

        $crate::define_entity!(@entity_def
            $entity,
            table: $table,
            mutation_scope: $mut_scope,
            fields: [$($field : $ty),*]
        );
    };

    // Multiple shapes: shape-only entity with multiple query paths
    (
        $entity:ident,
        table: $table:literal,
        shapes: [
            $({
                name: $shape_name:ident,
                where_clause: $where_clause:literal,
                params: [$($param:literal),* $(,)?],
                url: $url:literal $(,)?
            }),+ $(,)?
        ] $(,)?
    ) => {
        $(
            paste::paste! {
                $crate::define_shape!(
                    [<$shape_name:snake:upper _SHAPE>], $entity,
                    table: $table,
                    where_clause: $where_clause,
                    url: $url,
                    params: [$($param),*]
                );
            }
        )+

        $crate::define_entity!(@entity_def_no_mutations
            $entity,
            table: $table,
        );
    };

    // Shape-only with fully custom shape config
    (
        $entity:ident,
        table: $table:literal,
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

        $crate::define_entity!(@entity_def_no_mutations
            $entity,
            table: $table,
        );
    };

    // =========================================================================
    // Internal: Shape generation (delegates to define_shape!)
    // =========================================================================

    (@shape $entity:ident, table: $table:literal, scope: Organization,) => {
        paste::paste! {
            $crate::define_shape!(
                [<$entity:snake:upper _SHAPE>], $entity,
                table: $table,
                where_clause: r#""organization_id" = $1"#,
                url: concat!("/shape/", $table),
                params: ["organization_id"]
            );
        }
    };
    (@shape $entity:ident, table: $table:literal, scope: Project,) => {
        paste::paste! {
            $crate::define_shape!(
                [<$entity:snake:upper _SHAPE>], $entity,
                table: $table,
                where_clause: r#""project_id" = $1"#,
                url: concat!("/shape/project/{project_id}/", $table),
                params: ["project_id"]
            );
        }
    };
    (@shape $entity:ident, table: $table:literal, scope: Issue,) => {
        paste::paste! {
            $crate::define_shape!(
                [<$entity:snake:upper _SHAPE>], $entity,
                table: $table,
                where_clause: r#""issue_id" = $1"#,
                url: concat!("/shape/issue/{issue_id}/", $table),
                params: ["issue_id"]
            );
        }
    };
    (@shape $entity:ident, table: $table:literal, scope: Comment,) => {
        paste::paste! {
            $crate::define_shape!(
                [<$entity:snake:upper _SHAPE>], $entity,
                table: $table,
                where_clause: r#""comment_id" = $1"#,
                url: concat!("/shape/comment/{comment_id}/", $table),
                params: ["comment_id"]
            );
        }
    };

    (@shape_custom $entity:ident, table: $table:literal, scope: Organization, where_clause: $where:literal,) => {
        paste::paste! {
            $crate::define_shape!(
                [<$entity:snake:upper _SHAPE>], $entity, table: $table,
                where_clause: $where, url: concat!("/shape/", $table), params: ["organization_id"]
            );
        }
    };
    (@shape_custom $entity:ident, table: $table:literal, scope: Project, where_clause: $where:literal,) => {
        paste::paste! {
            $crate::define_shape!(
                [<$entity:snake:upper _SHAPE>], $entity, table: $table,
                where_clause: $where, url: concat!("/shape/project/{project_id}/", $table), params: ["project_id"]
            );
        }
    };
    (@shape_custom $entity:ident, table: $table:literal, scope: Issue, where_clause: $where:literal,) => {
        paste::paste! {
            $crate::define_shape!(
                [<$entity:snake:upper _SHAPE>], $entity, table: $table,
                where_clause: $where, url: concat!("/shape/issue/{issue_id}/", $table), params: ["issue_id"]
            );
        }
    };
    (@shape_custom $entity:ident, table: $table:literal, scope: Comment, where_clause: $where:literal,) => {
        paste::paste! {
            $crate::define_shape!(
                [<$entity:snake:upper _SHAPE>], $entity, table: $table,
                where_clause: $where, url: concat!("/shape/comment/{comment_id}/", $table), params: ["comment_id"]
            );
        }
    };

    // =========================================================================
    // Internal: EntityDefinition generation (mutation metadata only)
    // =========================================================================

    // Entity with mutations
    (@entity_def
        $entity:ident,
        table: $table:literal,
        mutation_scope: $scope:ident,
        fields: [$($field:ident : $ty:ty),*]
    ) => {
        paste::paste! {
            pub const [<$entity:snake:upper _ENTITY>]: $crate::entity::EntityDefinition<$entity> =
                $crate::entity::EntityDefinition {
                    name: stringify!($entity),
                    table: $table,
                    mutation_scope: Some($crate::entity::Scope::$scope),
                    fields: &[
                        $(
                            $crate::entity::FieldDef {
                                name: stringify!($field),
                                type_name: stringify!($ty),
                                is_optional: false,
                            }
                        ),*
                    ],
                    _phantom: std::marker::PhantomData,
                };
        }
    };

    // Entity without mutations (shape-only)
    (@entity_def_no_mutations
        $entity:ident,
        table: $table:literal,
    ) => {
        paste::paste! {
            pub const [<$entity:snake:upper _ENTITY>]: $crate::entity::EntityDefinition<$entity> =
                $crate::entity::EntityDefinition {
                    name: stringify!($entity),
                    table: $table,
                    mutation_scope: None,
                    fields: &[],
                    _phantom: std::marker::PhantomData,
                };
        }
    };
}
