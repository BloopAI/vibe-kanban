//! Unified entity definition system for realtime streaming and mutations.
//!
//! This module provides a single `define_entity!` macro that combines shape (streaming)
//! and mutation (CRUD) definitions into one declaration, enabling auto-generation
//! of a TypeScript SDK with both capabilities.
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

/// Field definition for mutation types
#[derive(Debug, Clone)]
pub struct FieldDef {
    pub name: &'static str,
    pub type_name: &'static str,
    pub is_optional: bool,
}

/// Unified entity definition containing both shape and mutation metadata
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

/// Macro to define a unified entity with both shape and mutation support.
///
/// This macro generates:
/// - Shape definition (`{ENTITY}_SHAPE`) for realtime streaming
/// - Mutation types (`Create{Entity}Request`, `Update{Entity}Request`, etc.)
/// - Unified metadata (`{ENTITY}_ENTITY`) for SDK generation
///
/// # Variants
///
/// ## Simple case - same scope for mutations and streaming
/// ```ignore
/// define_entity!(
///     Tag,
///     table: "tags",
///     scope: Project,
///     fields: [name: String, color: String],
/// );
/// ```
///
/// ## Complex case - different mutation and shape scopes
/// ```ignore
/// define_entity!(
///     IssueAssignee,
///     table: "issue_assignees",
///     mutation_scope: Issue,
///     shape_scope: Project,
///     shape_where: r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
///     fields: [user_id: uuid::Uuid],
/// );
/// ```
///
/// ## Shape-only (no mutations)
/// ```ignore
/// define_entity!(
///     Workspace,
///     table: "workspaces",
///     scope: Project,
/// );
/// ```
#[macro_export]
macro_rules! define_entity {
    // Simple case: same scope for mutations and shape, with fields
    (
        $entity:ident,
        table: $table:literal,
        scope: $scope:ident,
        fields: [$($field:ident : $ty:ty),* $(,)?] $(,)?
    ) => {
        // Generate mutation types using existing macro
        $crate::define_mutation_types!(
            $entity,
            table: $table,
            scope: $scope,
            fields: [$($field : $ty),*]
        );

        // Generate shape using existing macro with auto-derived where clause
        $crate::define_entity!(@shape
            $entity,
            table: $table,
            scope: $scope,
        );

        // Generate unified EntityDefinition
        $crate::define_entity!(@entity_def
            $entity,
            table: $table,
            mutation_scope: $scope,
            shape_scope: $scope,
            fields: [$($field : $ty),*]
        );
    };

    // Shape-only case: no mutations (no fields)
    (
        $entity:ident,
        table: $table:literal,
        scope: $scope:ident $(,)?
    ) => {
        // Generate shape only
        $crate::define_entity!(@shape
            $entity,
            table: $table,
            scope: $scope,
        );

        // Generate unified EntityDefinition without mutations
        $crate::define_entity!(@entity_def_shape_only
            $entity,
            table: $table,
            shape_scope: $scope,
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
        // Generate mutation types
        $crate::define_mutation_types!(
            $entity,
            table: $table,
            scope: $mut_scope,
            fields: [$($field : $ty),*]
        );

        // Generate shape with custom where clause
        $crate::define_entity!(@shape_custom
            $entity,
            table: $table,
            scope: $shape_scope,
            where_clause: $where_clause,
        );

        // Generate unified EntityDefinition with both scopes
        $crate::define_entity!(@entity_def_dual_scope
            $entity,
            table: $table,
            mutation_scope: $mut_scope,
            shape_scope: $shape_scope,
            where_clause: $where_clause,
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
        // Generate mutation types
        $crate::define_mutation_types!(
            $entity,
            table: $table,
            scope: $mut_scope,
            fields: [$($field : $ty),*]
        );

        // Generate shape with fully custom config
        paste::paste! {
            $crate::define_shape!(
                [<$entity:snake:upper _SHAPE>], $entity,
                table: $table,
                where_clause: $where_clause,
                url: $url,
                params: [$($param),*]
            );
        }

        // Generate unified EntityDefinition
        paste::paste! {
            pub const [<$entity:snake:upper _ENTITY>]: $crate::entity::EntityDefinition<$entity> =
                $crate::entity::EntityDefinition {
                    name: stringify!($entity),
                    table: $table,
                    mutation_scope: Some($crate::entity::Scope::$mut_scope),
                    shape_scope: Some($crate::entity::Scope::$mut_scope),
                    shape: Some($crate::entity::ShapeConfig {
                        where_clause: $where_clause,
                        params: &[$($param),*],
                        url: $url,
                    }),
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
        // Generate shape with fully custom config
        paste::paste! {
            $crate::define_shape!(
                [<$entity:snake:upper _SHAPE>], $entity,
                table: $table,
                where_clause: $where_clause,
                url: $url,
                params: [$($param),*]
            );
        }

        // Generate unified EntityDefinition without mutations
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

    // Internal: Generate shape with auto-derived where clause
    (@shape
        $entity:ident,
        table: $table:literal,
        scope: Organization,
    ) => {
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
    (@shape
        $entity:ident,
        table: $table:literal,
        scope: Project,
    ) => {
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
    (@shape
        $entity:ident,
        table: $table:literal,
        scope: Issue,
    ) => {
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
    (@shape
        $entity:ident,
        table: $table:literal,
        scope: Comment,
    ) => {
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

    // Internal: Generate shape with custom where clause
    (@shape_custom
        $entity:ident,
        table: $table:literal,
        scope: Organization,
        where_clause: $where:literal,
    ) => {
        paste::paste! {
            $crate::define_shape!(
                [<$entity:snake:upper _SHAPE>], $entity,
                table: $table,
                where_clause: $where,
                url: concat!("/shape/", $table),
                params: ["organization_id"]
            );
        }
    };
    (@shape_custom
        $entity:ident,
        table: $table:literal,
        scope: Project,
        where_clause: $where:literal,
    ) => {
        paste::paste! {
            $crate::define_shape!(
                [<$entity:snake:upper _SHAPE>], $entity,
                table: $table,
                where_clause: $where,
                url: concat!("/shape/project/{project_id}/", $table),
                params: ["project_id"]
            );
        }
    };
    (@shape_custom
        $entity:ident,
        table: $table:literal,
        scope: Issue,
        where_clause: $where:literal,
    ) => {
        paste::paste! {
            $crate::define_shape!(
                [<$entity:snake:upper _SHAPE>], $entity,
                table: $table,
                where_clause: $where,
                url: concat!("/shape/issue/{issue_id}/", $table),
                params: ["issue_id"]
            );
        }
    };
    (@shape_custom
        $entity:ident,
        table: $table:literal,
        scope: Comment,
        where_clause: $where:literal,
    ) => {
        paste::paste! {
            $crate::define_shape!(
                [<$entity:snake:upper _SHAPE>], $entity,
                table: $table,
                where_clause: $where,
                url: concat!("/shape/comment/{comment_id}/", $table),
                params: ["comment_id"]
            );
        }
    };

    // Internal: Generate EntityDefinition with same mutation and shape scope
    (@entity_def
        $entity:ident,
        table: $table:literal,
        mutation_scope: $scope:ident,
        shape_scope: $scope2:ident,
        fields: [$($field:ident : $ty:ty),*]
    ) => {
        paste::paste! {
            pub const [<$entity:snake:upper _ENTITY>]: $crate::entity::EntityDefinition<$entity> =
                $crate::entity::EntityDefinition {
                    name: stringify!($entity),
                    table: $table,
                    mutation_scope: Some($crate::entity::Scope::$scope),
                    shape_scope: Some($crate::entity::Scope::$scope2),
                    shape: Some($crate::entity::ShapeConfig {
                        where_clause: $crate::define_entity!(@default_where $scope),
                        params: &[$crate::define_entity!(@default_param $scope)],
                        url: $crate::define_entity!(@default_url $scope, $table),
                    }),
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

    // Internal: Generate EntityDefinition for shape-only entities
    (@entity_def_shape_only
        $entity:ident,
        table: $table:literal,
        shape_scope: $scope:ident,
    ) => {
        paste::paste! {
            pub const [<$entity:snake:upper _ENTITY>]: $crate::entity::EntityDefinition<$entity> =
                $crate::entity::EntityDefinition {
                    name: stringify!($entity),
                    table: $table,
                    mutation_scope: None,
                    shape_scope: Some($crate::entity::Scope::$scope),
                    shape: Some($crate::entity::ShapeConfig {
                        where_clause: $crate::define_entity!(@default_where $scope),
                        params: &[$crate::define_entity!(@default_param $scope)],
                        url: $crate::define_entity!(@default_url $scope, $table),
                    }),
                    fields: &[],
                    _phantom: std::marker::PhantomData,
                };
        }
    };

    // Internal: Generate EntityDefinition with dual scopes and custom where
    (@entity_def_dual_scope
        $entity:ident,
        table: $table:literal,
        mutation_scope: $mut_scope:ident,
        shape_scope: $shape_scope:ident,
        where_clause: $where:literal,
        fields: [$($field:ident : $ty:ty),*]
    ) => {
        paste::paste! {
            pub const [<$entity:snake:upper _ENTITY>]: $crate::entity::EntityDefinition<$entity> =
                $crate::entity::EntityDefinition {
                    name: stringify!($entity),
                    table: $table,
                    mutation_scope: Some($crate::entity::Scope::$mut_scope),
                    shape_scope: Some($crate::entity::Scope::$shape_scope),
                    shape: Some($crate::entity::ShapeConfig {
                        where_clause: $where,
                        params: &[$crate::define_entity!(@default_param $shape_scope)],
                        url: $crate::define_entity!(@default_url $shape_scope, $table),
                    }),
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

    // Internal: Default where clause for scope
    (@default_where Organization) => { r#""organization_id" = $1"# };
    (@default_where Project) => { r#""project_id" = $1"# };
    (@default_where Issue) => { r#""issue_id" = $1"# };
    (@default_where Comment) => { r#""comment_id" = $1"# };

    // Internal: Default param for scope
    (@default_param Organization) => { "organization_id" };
    (@default_param Project) => { "project_id" };
    (@default_param Issue) => { "issue_id" };
    (@default_param Comment) => { "comment_id" };

    // Internal: Default URL for scope
    (@default_url Organization, $table:literal) => { concat!("/shape/", $table) };
    (@default_url Project, $table:literal) => { concat!("/shape/project/{project_id}/", $table) };
    (@default_url Issue, $table:literal) => { concat!("/shape/issue/{issue_id}/", $table) };
    (@default_url Comment, $table:literal) => { concat!("/shape/comment/{comment_id}/", $table) };
}
