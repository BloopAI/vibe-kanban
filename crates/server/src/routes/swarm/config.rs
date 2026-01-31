//! Swarm Configuration Routes

use axum::{
    Json, Router,
    extract::State,
    response::Json as ResponseJson,
    routing::{get, post},
};
use db::models::swarm_config::{SwarmConfig, SwarmConfigWithMaskedSecrets, UpdateSwarmConfig};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use utils::response::ApiResponse;

use crate::{AppState, error::ApiError};

#[derive(Debug, Serialize, Deserialize, TS)]
pub struct TestConnectionResponse {
    pub success: bool,
    pub message: String,
    pub daytona_version: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, TS)]
pub struct SwarmStatusInfo {
    pub daytona_connected: bool,
    pub pool_active_count: i64,
    pub trigger_enabled: bool,
    pub skills_count: usize,
}

pub async fn get_config(
    State(state): State<AppState>,
) -> Result<ResponseJson<ApiResponse<SwarmConfigWithMaskedSecrets>>, ApiError> {
    let config = SwarmConfig::get_with_masked_secrets(&state.db_pool).await?;
    Ok(ResponseJson(ApiResponse::success(config)))
}

pub async fn update_config(
    State(state): State<AppState>,
    Json(payload): Json<UpdateSwarmConfig>,
) -> Result<ResponseJson<ApiResponse<SwarmConfigWithMaskedSecrets>>, ApiError> {
    // Validate input sizes
    if let Some(ref url) = payload.daytona_api_url {
        if url.len() > 500 {
            return Err(ApiError::BadRequest("Daytona API URL too long (max 500 chars)".to_string()));
        }
    }
    if let Some(ref path) = payload.skills_path {
        if path.len() > 500 {
            return Err(ApiError::BadRequest("Skills path too long (max 500 chars)".to_string()));
        }
    }
    if let Some(ref snapshot) = payload.pool_default_snapshot {
        if snapshot.len() > 255 {
            return Err(ApiError::BadRequest("Snapshot name too long (max 255 chars)".to_string()));
        }
    }

    SwarmConfig::update(&state.db_pool, &payload).await?;

    let config = SwarmConfig::get_with_masked_secrets(&state.db_pool).await?;

    tracing::info!("Updated swarm configuration");

    Ok(ResponseJson(ApiResponse::success(config)))
}

pub async fn test_connection(
    State(state): State<AppState>,
) -> Result<ResponseJson<ApiResponse<TestConnectionResponse>>, ApiError> {
    let config = SwarmConfig::get(&state.db_pool).await?;

    let Some(api_url) = config.daytona_api_url else {
        return Ok(ResponseJson(ApiResponse::success(TestConnectionResponse {
            success: false,
            message: "Daytona API URL not configured".to_string(),
            daytona_version: None,
        })));
    };

    let has_key = config.daytona_api_key.is_some();

    if !has_key {
        return Ok(ResponseJson(ApiResponse::success(TestConnectionResponse {
            success: false,
            message: "Daytona API key not configured".to_string(),
            daytona_version: None,
        })));
    }

    Ok(ResponseJson(ApiResponse::success(TestConnectionResponse {
        success: true,
        message: format!("Connection configured: {}", api_url),
        daytona_version: Some("pending".to_string()),
    })))
}

pub async fn get_status(
    State(state): State<AppState>,
) -> Result<ResponseJson<ApiResponse<SwarmStatusInfo>>, ApiError> {
    let pool = &state.db_pool;

    let config = SwarmConfig::get(pool).await?;
    let sandbox_count = db::models::sandbox::Sandbox::count_active(pool).await?;

    let skills_count = if let Some(skills_path) = super::skills::find_skills_dir(&config.skills_path) {
        std::fs::read_dir(&skills_path)
            .map(|entries| entries.flatten().filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false)).count())
            .unwrap_or(0)
    } else {
        0
    };

    let daytona_connected = config.daytona_api_url.is_some() && config.daytona_api_key.is_some();

    Ok(ResponseJson(ApiResponse::success(SwarmStatusInfo {
        daytona_connected,
        pool_active_count: sandbox_count,
        trigger_enabled: config.trigger_enabled,
        skills_count,
    })))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/config/swarm", get(get_config).put(update_config))
        .route("/config/swarm/test", post(test_connection))
        .route("/config/swarm/status", get(get_status))
}
