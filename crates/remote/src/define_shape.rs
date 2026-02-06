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

        $crate::shapes::ShapeDefinition {
            table: $table,
            where_clause: $where,
            params: &[$($param),*],
            url: $url,
            _phantom: std::marker::PhantomData,
        }
    }};
}
