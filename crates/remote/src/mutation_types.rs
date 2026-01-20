/// Macro to define mutation types with compile-time SQL validation.
///
/// This macro generates:
/// - URL constant derived from table name (e.g., `TAG_URL = "/tags"`)
/// - `Create{Entity}Request` struct with parent_id (based on scope) and all fields required
/// - `Update{Entity}Request` struct with all fields optional (for partial updates)
/// - `List{Entity}sQuery` struct with parent_id for filtering
/// - `List{Entity}sResponse` struct wrapping `Vec<Entity>`
/// - `router()` function that wires up all 5 CRUD routes
///
/// The route handlers must be defined manually, but the generated router
/// references them, ensuring they exist at compile time.
///
/// # Example
///
/// ```ignore
/// use crate::db::tags::{Tag, TagRepository};
/// use crate::define_mutation_types;
///
/// define_mutation_types!(
///     Tag,
///     table: "tags",
///     scope: Project,
///     fields: [name: String, color: String],
/// );
///
/// // Handlers must be defined manually:
/// async fn list_tags(...) -> Result<Json<ListTagsResponse>, ErrorResponse> { ... }
/// async fn get_tag(...) -> Result<Json<Tag>, ErrorResponse> { ... }
/// async fn create_tag(...) -> Result<Json<Tag>, ErrorResponse> { ... }
/// async fn update_tag(...) -> Result<Json<Tag>, ErrorResponse> { ... }
/// async fn delete_tag(...) -> Result<StatusCode, ErrorResponse> { ... }
/// ```
///
/// # Scopes
///
/// The `scope` parameter determines the parent field and authorization:
/// - `Project` → `project_id: Uuid` (use `ensure_project_access`)
/// - `Issue` → `issue_id: Uuid` (use `ensure_issue_access`)
/// - `Organization` → `organization_id: Uuid` (use `ensure_member_access`)
/// - `Comment` → `comment_id: Uuid` (lookup comment then use issue access)
#[macro_export]
macro_rules! define_mutation_types {
    // Project scope
    (
        $entity:ident,
        table: $table:literal,
        scope: Project,
        fields: [$($field:ident : $ty:ty),* $(,)?]
        $(,)?
    ) => {
        $crate::define_mutation_types!(@impl
            $entity,
            table: $table,
            parent_field: project_id,
            fields: [$($field : $ty),*]
        );
    };

    // Issue scope
    (
        $entity:ident,
        table: $table:literal,
        scope: Issue,
        fields: [$($field:ident : $ty:ty),* $(,)?]
        $(,)?
    ) => {
        $crate::define_mutation_types!(@impl
            $entity,
            table: $table,
            parent_field: issue_id,
            fields: [$($field : $ty),*]
        );
    };

    // Organization scope
    (
        $entity:ident,
        table: $table:literal,
        scope: Organization,
        fields: [$($field:ident : $ty:ty),* $(,)?]
        $(,)?
    ) => {
        $crate::define_mutation_types!(@impl
            $entity,
            table: $table,
            parent_field: organization_id,
            fields: [$($field : $ty),*]
        );
    };

    // Comment scope
    (
        $entity:ident,
        table: $table:literal,
        scope: Comment,
        fields: [$($field:ident : $ty:ty),* $(,)?]
        $(,)?
    ) => {
        $crate::define_mutation_types!(@impl
            $entity,
            table: $table,
            parent_field: comment_id,
            fields: [$($field : $ty),*]
        );
    };

    // Implementation with resolved parent_field
    (@impl
        $entity:ident,
        table: $table:literal,
        parent_field: $parent_field:ident,
        fields: [$($field:ident : $ty:ty),*]
    ) => {
        paste::paste! {
            // Compile-time SQL validation - ensures table exists
            #[allow(dead_code)]
            const _: () = {
                fn _validate_table() {
                    let _ = sqlx::query!(
                        "SELECT 1 AS v FROM " + $table + " WHERE id = $1",
                        uuid::Uuid::nil()
                    );
                }
            };

            // URL constant derived from table name (e.g., "tags" -> "/tags")
            pub const [<$entity:snake:upper _URL>]: &str = concat!("/", $table);

            // Create request - includes parent_id based on scope, all fields required
            #[derive(Debug, serde::Deserialize, ts_rs::TS)]
            #[ts(export)]
            pub struct [<Create $entity Request>] {
                pub $parent_field: uuid::Uuid,
                $(pub $field: $ty,)*
            }

            // Update request - all fields optional for partial updates
            #[derive(Debug, serde::Deserialize, ts_rs::TS)]
            #[ts(export)]
            pub struct [<Update $entity Request>] {
                $(pub $field: Option<$ty>,)*
            }

            // List query params - for filtering by parent
            #[derive(Debug, serde::Deserialize)]
            pub struct [<List $entity s Query>] {
                pub $parent_field: uuid::Uuid,
            }

            // List response
            #[derive(Debug, serde::Serialize)]
            pub struct [<List $entity s Response>] {
                pub [<$entity:snake s>]: Vec<$entity>,
            }

            // Router - ensures all handlers exist at compile time
            pub fn router() -> axum::Router<$crate::AppState> {
                use axum::routing::get;

                axum::Router::new()
                    .route(
                        concat!("/", $table),
                        get([<list_ $entity:snake s>]).post([<create_ $entity:snake>])
                    )
                    .route(
                        concat!("/", $table, "/{", stringify!([<$entity:snake _id>]), "}"),
                        get([<get_ $entity:snake>])
                            .patch([<update_ $entity:snake>])
                            .delete([<delete_ $entity:snake>])
                    )
            }
        }
    };
}
