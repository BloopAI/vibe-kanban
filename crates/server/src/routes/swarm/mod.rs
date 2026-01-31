//! Swarm API Routes
//!
//! This module contains all routes for the Swarm subsystem including:
//! - Swarm CRUD operations
//! - Swarm task management
//! - Chat messaging
//! - Pool (sandbox) management
//! - Skills discovery
//! - Configuration
//! - WebSocket streaming for logs and chat

pub mod chat;
pub mod config;
pub mod pool;
pub mod skills;
pub mod tasks;
#[cfg(test)]
mod tests;
pub mod ws;

use axum::{
    Extension, Json, Router,
    extract::{Path, State},
    middleware::from_fn_with_state,
    response::Json as ResponseJson,
    routing::{get, post},
};
use db::models::swarm::{CreateSwarm, Swarm, SwarmStatus, UpdateSwarm};
use serde::{Deserialize, Serialize};
use sqlx;
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{AppState, error::ApiError};

/// Path params struct for routes with only swarm_id
#[derive(Debug, serde::Deserialize)]
struct SwarmIdPath {
    swarm_id: Uuid,
}

/// Path params struct for routes with swarm_id and task_id
#[derive(Debug, serde::Deserialize)]
struct SwarmTaskPath {
    swarm_id: Uuid,
    #[allow(dead_code)]
    task_id: Uuid,
}

/// Middleware to load swarm by ID from path parameter (single swarm_id)
async fn load_swarm_middleware(
    State(state): State<AppState>,
    Path(params): Path<SwarmIdPath>,
    mut request: axum::http::Request<axum::body::Body>,
    next: axum::middleware::Next,
) -> Result<axum::response::Response, ApiError> {
    let swarm = Swarm::find_by_id(&state.db_pool, params.swarm_id)
        .await?
        .ok_or_else(|| ApiError::BadRequest("Swarm not found".to_string()))?;

    request.extensions_mut().insert(swarm);
    Ok(next.run(request).await)
}

/// Middleware to load swarm by ID from path parameter (with task_id)
async fn load_swarm_middleware_with_task(
    State(state): State<AppState>,
    Path(params): Path<SwarmTaskPath>,
    mut request: axum::http::Request<axum::body::Body>,
    next: axum::middleware::Next,
) -> Result<axum::response::Response, ApiError> {
    let swarm = Swarm::find_by_id(&state.db_pool, params.swarm_id)
        .await?
        .ok_or_else(|| ApiError::BadRequest("Swarm not found".to_string()))?;

    request.extensions_mut().insert(swarm);
    Ok(next.run(request).await)
}

// ============================================================================
// Swarm CRUD Handlers
// ============================================================================

/// GET /api/swarms - List all swarms
pub async fn list_swarms(
    State(state): State<AppState>,
) -> Result<ResponseJson<ApiResponse<Vec<Swarm>>>, ApiError> {
    let swarms = Swarm::find_all(&state.db_pool).await?;
    Ok(ResponseJson(ApiResponse::success(swarms)))
}

/// POST /api/swarms - Create a new swarm
pub async fn create_swarm(
    State(state): State<AppState>,
    Json(payload): Json<CreateSwarm>,
) -> Result<ResponseJson<ApiResponse<Swarm>>, ApiError> {
    // Validate input sizes
    if payload.name.len() > 255 {
        return Err(ApiError::BadRequest("Name too long (max 255 chars)".to_string()));
    }
    if let Some(ref desc) = payload.description {
        if desc.len() > 5000 {
            return Err(ApiError::BadRequest("Description too long (max 5000 chars)".to_string()));
        }
    }

    let swarm_id = Uuid::new_v4();
    let swarm = Swarm::create(&state.db_pool, &payload, swarm_id).await?;

    tracing::info!("Created swarm '{}' with id {}", swarm.name, swarm.id);

    Ok(ResponseJson(ApiResponse::success(swarm)))
}

/// GET /api/swarms/:id - Get a specific swarm
pub async fn get_swarm(
    Extension(swarm): Extension<Swarm>,
) -> Result<ResponseJson<ApiResponse<Swarm>>, ApiError> {
    Ok(ResponseJson(ApiResponse::success(swarm)))
}

/// PUT /api/swarms/:id - Update a swarm
pub async fn update_swarm(
    Extension(existing): Extension<Swarm>,
    State(state): State<AppState>,
    Json(payload): Json<UpdateSwarm>,
) -> Result<ResponseJson<ApiResponse<Swarm>>, ApiError> {
    // Validate input sizes
    if let Some(ref name) = payload.name {
        if name.len() > 255 {
            return Err(ApiError::BadRequest("Name too long (max 255 chars)".to_string()));
        }
    }
    if let Some(ref desc) = payload.description {
        if desc.len() > 5000 {
            return Err(ApiError::BadRequest("Description too long (max 5000 chars)".to_string()));
        }
    }

    let swarm = Swarm::update(&state.db_pool, existing.id, &payload).await?;
    Ok(ResponseJson(ApiResponse::success(swarm)))
}

/// DELETE /api/swarms/:id - Delete a swarm
pub async fn delete_swarm(
    Extension(swarm): Extension<Swarm>,
    State(state): State<AppState>,
) -> Result<ResponseJson<ApiResponse<DeleteResponse>>, ApiError> {
    // Use transaction to ensure atomicity - both deletes succeed or neither does
    let mut tx = state.db_pool.begin().await?;

    // Delete associated chat messages within transaction
    sqlx::query("DELETE FROM swarm_chat WHERE swarm_id = $1")
        .bind(swarm.id)
        .execute(&mut *tx)
        .await?;

    // Delete the swarm within transaction
    let result = sqlx::query("DELETE FROM swarms WHERE id = $1")
        .bind(swarm.id)
        .execute(&mut *tx)
        .await?;

    if result.rows_affected() == 0 {
        return Err(ApiError::BadRequest("Swarm not found".to_string()));
    }

    // Commit transaction - both operations succeed atomically
    tx.commit().await?;

    tracing::info!("Deleted swarm {} ({})", swarm.name, swarm.id);

    Ok(ResponseJson(ApiResponse::success(DeleteResponse {
        deleted: true,
    })))
}

#[derive(Debug, Serialize, Deserialize, TS)]
pub struct DeleteResponse {
    pub deleted: bool,
}

// ============================================================================
// Swarm Lifecycle Handlers
// ============================================================================

/// POST /api/swarms/:id/pause - Pause a swarm
pub async fn pause_swarm(
    Extension(swarm): Extension<Swarm>,
    State(state): State<AppState>,
) -> Result<ResponseJson<ApiResponse<Swarm>>, ApiError> {
    if swarm.status == SwarmStatus::Paused {
        return Err(ApiError::BadRequest("Swarm is already paused".to_string()));
    }

    Swarm::update_status(&state.db_pool, swarm.id, SwarmStatus::Paused).await?;

    let updated = Swarm::find_by_id(&state.db_pool, swarm.id)
        .await?
        .ok_or_else(|| ApiError::BadRequest("Swarm not found".to_string()))?;

    tracing::info!("Paused swarm {} ({})", swarm.name, swarm.id);

    Ok(ResponseJson(ApiResponse::success(updated)))
}

/// POST /api/swarms/:id/resume - Resume a paused swarm
pub async fn resume_swarm(
    Extension(swarm): Extension<Swarm>,
    State(state): State<AppState>,
) -> Result<ResponseJson<ApiResponse<Swarm>>, ApiError> {
    if swarm.status == SwarmStatus::Active {
        return Err(ApiError::BadRequest("Swarm is already active".to_string()));
    }

    Swarm::update_status(&state.db_pool, swarm.id, SwarmStatus::Active).await?;

    let updated = Swarm::find_by_id(&state.db_pool, swarm.id)
        .await?
        .ok_or_else(|| ApiError::BadRequest("Swarm not found".to_string()))?;

    tracing::info!("Resumed swarm {} ({})", swarm.name, swarm.id);

    Ok(ResponseJson(ApiResponse::success(updated)))
}

// ============================================================================
// Router
// ============================================================================

pub fn router(state: &AppState) -> Router<AppState> {
    // Routes that require only swarm_id (no nested task_id)
    let swarm_id_only_router = Router::new()
        .route("/", get(get_swarm).put(update_swarm).delete(delete_swarm))
        .route("/pause", post(pause_swarm))
        .route("/resume", post(resume_swarm))
        .route("/tasks", get(tasks::list_tasks).post(tasks::create_task))
        .merge(chat::router())
        .layer(from_fn_with_state(state.clone(), load_swarm_middleware));

    // Routes with both swarm_id and task_id
    let task_routes = tasks::task_id_router()
        .layer(from_fn_with_state(state.clone(), load_swarm_middleware_with_task));

    // Main swarms router
    let swarms_router = Router::new()
        .route("/", get(list_swarms).post(create_swarm))
        .nest("/{swarm_id}", swarm_id_only_router)
        .nest("/{swarm_id}/tasks/{task_id}", task_routes);

    // Build the complete router with all sub-modules
    Router::new()
        .nest("/swarms", swarms_router)
        .merge(pool::router())
        .merge(skills::router())
        .merge(config::router())
        .merge(ws::router())
}
