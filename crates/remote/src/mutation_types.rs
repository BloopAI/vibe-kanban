/// Macro to define mutation types with compile-time SQL validation.
///
/// This macro generates:
/// - `Create{Entity}Request` struct with parent_id (based on scope) and all fields required
/// - `Update{Entity}Request` struct with all fields optional (for partial updates)
/// - `List{Entity}sQuery` struct with parent_id for filtering
/// - `List{Entity}sResponse` struct wrapping `Vec<Entity>`
///
/// Use `define_mutation_router!` in route files to generate the router.
///
/// # Example
///
/// ```ignore
/// use crate::db::tags::Tag;
/// use crate::define_mutation_types;
///
/// define_mutation_types!(
///     Tag,
///     table: "tags",
///     scope: Project,
///     fields: [name: String, color: String],
/// );
/// ```
///
/// # Scopes
///
/// The `scope` parameter determines the parent field:
/// - `Project` → `project_id: Uuid`
/// - `Issue` → `issue_id: Uuid`
/// - `Organization` → `organization_id: Uuid`
/// - `Comment` → `comment_id: Uuid`
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

            // Create request - includes optional id for client-generated UUIDs,
            // parent_id based on scope, and all fields required
            #[derive(Debug, serde::Deserialize, ts_rs::TS)]
            #[ts(export)]
            pub struct [<Create $entity Request>] {
                /// Optional client-generated ID. If not provided, server generates one.
                /// Using client-generated IDs enables stable optimistic updates.
                #[ts(optional)]
                pub id: Option<uuid::Uuid>,
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
        }
    };
}

/// Macro to define mutation router that wires up CRUD routes.
///
/// This macro generates a `router()` function that references handler functions.
/// The handlers must be defined in the same module.
///
/// # Example
///
/// ```ignore
/// use crate::define_mutation_router;
///
/// define_mutation_router!(Tag, table: "tags");
///
/// // Handlers must be defined:
/// async fn list_tags(...) -> Result<Json<ListTagsResponse>, ErrorResponse> { ... }
/// async fn get_tag(...) -> Result<Json<Tag>, ErrorResponse> { ... }
/// async fn create_tag(...) -> Result<Json<Tag>, ErrorResponse> { ... }
/// async fn update_tag(...) -> Result<Json<Tag>, ErrorResponse> { ... }
/// async fn delete_tag(...) -> Result<StatusCode, ErrorResponse> { ... }
/// ```
#[macro_export]
macro_rules! define_mutation_router {
    ($entity:ident, table: $table:literal) => {
        paste::paste! {
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

use serde::Serialize;
use ts_rs::TS;

/// Response wrapper that includes the Postgres transaction ID for Electric sync.
/// Used by both db layer and API routes.
///
/// Note: We don't derive TS here because generic types with bounds are complex.
/// The frontend will just expect `{ data: T, txid: number }` pattern.
#[derive(Debug, Serialize)]
pub struct MutationResponse<T> {
    pub data: T,
    pub txid: i64,
}

/// Delete response with just the txid (no entity data)
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct DeleteResponse {
    pub txid: i64,
}
