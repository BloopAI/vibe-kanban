//! Shape infrastructure: struct, trait, and macro.

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

/// Trait to allow heterogeneous collection of shapes for export.
///
/// This enables collecting `ShapeDefinition<T>` values with different `T`
/// into a single `Vec<&dyn ShapeExport>`.
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
/// Usage:
/// ```ignore
/// pub const PROJECTS_SHAPE: ShapeDefinition<Project> = define_shape!(
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

        $crate::shape_definition::ShapeDefinition {
            table: $table,
            where_clause: $where,
            params: &[$($param),*],
            url: $url,
            _phantom: std::marker::PhantomData,
        }
    }};
}
