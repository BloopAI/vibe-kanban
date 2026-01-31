//! Swarm Chat Routes

use axum::{
    Extension, Json, Router,
    extract::{Query, State},
    response::Json as ResponseJson,
    routing::get,
};
use db::models::{
    swarm::Swarm,
    swarm_chat::{CreateSwarmChat, SenderType, SwarmChat},
};
use serde::Deserialize;
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{AppState, error::ApiError};

#[derive(Debug, Deserialize)]
pub struct ChatQuery {
    pub limit: Option<i32>,
}

#[derive(Debug, Deserialize, TS)]
pub struct PostMessageRequest {
    pub sender_type: SenderType,
    pub sender_id: Option<String>,
    pub message: String,
    pub metadata: Option<String>,
}

pub async fn get_messages(
    Extension(swarm): Extension<Swarm>,
    State(state): State<AppState>,
    Query(query): Query<ChatQuery>,
) -> Result<ResponseJson<ApiResponse<Vec<SwarmChat>>>, ApiError> {
    let messages = SwarmChat::find_by_swarm_id(
        &state.db_pool,
        swarm.id,
        query.limit,
    )
    .await?;

    Ok(ResponseJson(ApiResponse::success(messages)))
}

pub async fn post_message(
    Extension(swarm): Extension<Swarm>,
    State(state): State<AppState>,
    Json(payload): Json<PostMessageRequest>,
) -> Result<ResponseJson<ApiResponse<SwarmChat>>, ApiError> {
    // Validate message size
    if payload.message.len() > 10000 {
        return Err(ApiError::BadRequest("Message too long (max 10000 chars)".to_string()));
    }
    if let Some(ref metadata) = payload.metadata {
        if metadata.len() > 5000 {
            return Err(ApiError::BadRequest("Metadata too long (max 5000 chars)".to_string()));
        }
    }

    let message_id = Uuid::new_v4();

    let create_data = CreateSwarmChat {
        swarm_id: swarm.id,
        sender_type: payload.sender_type,
        sender_id: payload.sender_id,
        message: payload.message,
        metadata: payload.metadata,
    };

    let message = SwarmChat::create(&state.db_pool, &create_data, message_id).await?;

    tracing::debug!("Posted message {} to swarm {}", message.id, swarm.id);

    Ok(ResponseJson(ApiResponse::success(message)))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/chat", get(get_messages).post(post_message))
}
