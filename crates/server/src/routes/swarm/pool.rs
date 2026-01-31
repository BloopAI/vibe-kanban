//! Pool (Sandbox) Management Routes

use axum::{
    Router,
    extract::{Path, State},
    response::Json as ResponseJson,
    routing::{get, post},
};
use db::models::sandbox::{Sandbox, SandboxStatus};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{AppState, error::ApiError};

#[derive(Debug, Serialize, Deserialize, TS)]
pub struct PoolStatus {
    pub total: i64,
    pub idle: usize,
    pub busy: usize,
    pub sandboxes: Vec<Sandbox>,
}

#[derive(Debug, Serialize, Deserialize, TS)]
pub struct CleanupResponse {
    pub success: bool,
    pub cleaned: u64,
    pub remaining: i64,
}

#[derive(Debug, Serialize, Deserialize, TS)]
pub struct DestroyResponse {
    pub success: bool,
    pub sandbox_id: Uuid,
}

pub async fn get_pool_status(
    State(state): State<AppState>,
) -> Result<ResponseJson<ApiResponse<PoolStatus>>, ApiError> {
    let pool = &state.db_pool;

    let sandboxes = Sandbox::find_all(pool).await?;
    let total = Sandbox::count_active(pool).await?;

    let idle_count = sandboxes
        .iter()
        .filter(|s| s.status == SandboxStatus::Idle)
        .count();

    let busy_count = sandboxes
        .iter()
        .filter(|s| s.status == SandboxStatus::Busy)
        .count();

    Ok(ResponseJson(ApiResponse::success(PoolStatus {
        total,
        idle: idle_count,
        busy: busy_count,
        sandboxes,
    })))
}

pub async fn get_sandbox(
    State(state): State<AppState>,
    Path(sandbox_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<Sandbox>>, ApiError> {
    let sandbox = Sandbox::find_by_id(&state.db_pool, sandbox_id)
        .await?
        .ok_or_else(|| ApiError::BadRequest("Sandbox not found".to_string()))?;

    Ok(ResponseJson(ApiResponse::success(sandbox)))
}

pub async fn destroy_sandbox(
    State(state): State<AppState>,
    Path(sandbox_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<DestroyResponse>>, ApiError> {
    let pool = &state.db_pool;

    let sandbox = Sandbox::find_by_id(pool, sandbox_id)
        .await?
        .ok_or_else(|| ApiError::BadRequest("Sandbox not found".to_string()))?;

    Sandbox::mark_destroyed(pool, sandbox.id).await?;

    tracing::info!("Destroyed sandbox {} (daytona_id: {})", sandbox.id, sandbox.daytona_id);

    Ok(ResponseJson(ApiResponse::success(DestroyResponse {
        success: true,
        sandbox_id,
    })))
}

pub async fn cleanup_pool(
    State(state): State<AppState>,
) -> Result<ResponseJson<ApiResponse<CleanupResponse>>, ApiError> {
    let pool = &state.db_pool;

    let idle_sandboxes = Sandbox::find_idle(pool).await?;

    for sandbox in &idle_sandboxes {
        Sandbox::mark_destroyed(pool, sandbox.id).await?;
    }

    let deleted = Sandbox::delete_destroyed(pool).await?;
    let after = Sandbox::count_active(pool).await?;

    tracing::info!("Pool cleanup: {} sandboxes cleaned, {} remaining", deleted, after);

    Ok(ResponseJson(ApiResponse::success(CleanupResponse {
        success: true,
        cleaned: deleted,
        remaining: after,
    })))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/pool", get(get_pool_status))
        .route("/pool/cleanup", post(cleanup_pool))
        .route("/pool/{sandbox_id}", get(get_sandbox).delete(destroy_sandbox))
}
