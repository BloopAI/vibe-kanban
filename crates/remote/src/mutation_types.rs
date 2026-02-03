//! Mutation response types.
//!
//! Request/response types are defined in `api_types`.
//! This module provides the response wrapper types for mutations.

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
