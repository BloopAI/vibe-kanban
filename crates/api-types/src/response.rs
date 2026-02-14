use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Response wrapper for mutation endpoints (create/update).
/// Includes the Postgres transaction ID for Electric sync.
#[derive(Debug, Serialize, Deserialize, utoipa::ToSchema)]
pub struct MutationResponse<T> {
    pub data: T,
    pub txid: i64,
}

/// Response wrapper for delete endpoints.
#[derive(Debug, Serialize, Deserialize, TS, utoipa::ToSchema)]
pub struct DeleteResponse {
    pub txid: i64,
}
