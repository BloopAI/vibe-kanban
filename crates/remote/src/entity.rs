//! Entity shape definition macro for realtime streaming.
//!
//! This module provides the `define_entity!` macro that generates shape definitions
//! for Electric realtime streaming with compile-time SQL validation.
//!
//! # Example
//!
//! ```ignore
//! define_entity!(
//!     Tag,
//!     table: "tags",
//!     shape: {
//!         where_clause: r#""project_id" = $1"#,
//!         params: ["project_id"],
//!         url: "/shape/project/{project_id}/tags",
//!     },
//! );
//! ```

/// Macro to define an entity shape for realtime streaming.
///
/// This macro generates a shape definition (`{ENTITY}_SHAPE`) with compile-time
/// SQL validation via `define_shape!`.
#[macro_export]
macro_rules! define_entity {
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
    };
}
