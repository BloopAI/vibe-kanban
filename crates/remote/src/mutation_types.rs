//! Mutation types and router macro.
//!
//! Request/response types are defined in `utils::api::entities`.
//! This module provides the router macro and response wrapper types.

use serde::Serialize;
use ts_rs::TS;

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
