//! WebSocket Routes for Swarm
//!
//! Provides real-time streaming of logs, chat messages, and pool status updates
//! using tokio broadcast channels.

use std::sync::Arc;
use std::time::Duration;

use axum::{
    Router,
    extract::{
        Path, State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    response::IntoResponse,
    routing::get,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use services::services::swarm::{BroadcastManager, LogMessage};
use tokio::sync::broadcast::error::RecvError;
use ts_rs::TS;
use uuid::Uuid;

use db::models::swarm::Swarm;
use db::models::swarm_task::SwarmTask;

use crate::AppState;

/// Heartbeat interval for WebSocket connections
const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(30);

/// Timeout for receiving pong response (reserved for future use)
#[allow(dead_code)]
const HEARTBEAT_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WsMessage {
    LogLine { line: String, timestamp: i64 },
    LogEnd { exit_code: i32 },
    ChatMessage {
        id: String,
        sender_type: String,
        sender_id: Option<String>,
        message: String,
        timestamp: i64,
    },
    PoolUpdate {
        sandbox_id: String,
        status: String,
        task_id: Option<String>,
    },
    Connected { message: String },
    Error { message: String },
    Ping { timestamp: i64 },
    Pong { timestamp: i64 },
}

/// WebSocket handler for task log streaming
pub async fn task_logs_ws(
    ws: WebSocketUpgrade,
    Path((swarm_id, task_id)): Path<(Uuid, Uuid)>,
    State(state): State<AppState>,
) -> Result<impl IntoResponse, axum::response::Response> {
    // IDOR protection: verify task belongs to the specified swarm before allowing WebSocket connection
    let task = SwarmTask::find_by_id(&state.db_pool, task_id)
        .await
        .map_err(|e| {
            tracing::warn!(swarm_id = %swarm_id, task_id = %task_id, error = %e, "Database error checking task ownership");
            (axum::http::StatusCode::INTERNAL_SERVER_ERROR, "Internal server error").into_response()
        })?
        .ok_or_else(|| {
            tracing::warn!(swarm_id = %swarm_id, task_id = %task_id, "Task not found for WebSocket logs");
            (axum::http::StatusCode::NOT_FOUND, "Task not found").into_response()
        })?;

    if task.swarm_id != swarm_id {
        tracing::warn!(
            swarm_id = %swarm_id,
            task_id = %task_id,
            actual_swarm_id = %task.swarm_id,
            "IDOR attempt: task does not belong to specified swarm"
        );
        return Err((axum::http::StatusCode::NOT_FOUND, "Task not found").into_response());
    }

    Ok(ws.on_upgrade(move |socket| handle_log_stream(socket, swarm_id, task_id, state.broadcast)))
}

/// Handle the log stream WebSocket connection
async fn handle_log_stream(
    socket: WebSocket,
    swarm_id: Uuid,
    task_id: Uuid,
    broadcast: Arc<BroadcastManager>,
) {
    let (mut ws_sender, mut ws_receiver) = socket.split();

    // Send connected message
    let connected = WsMessage::Connected {
        message: format!("Connected to log stream for task {}", task_id),
    };
    match serde_json::to_string(&connected) {
        Ok(json) => {
            if ws_sender.send(Message::Text(json.into())).await.is_err() {
                return;
            }
        }
        Err(e) => {
            tracing::warn!(task_id = %task_id, error = %e, "Failed to serialize connected message");
        }
    }

    // Subscribe to log broadcasts for this task
    let mut log_receiver = broadcast.logs.subscribe_logs(task_id).await;

    // Spawn heartbeat task
    let (heartbeat_tx, mut heartbeat_rx) = tokio::sync::mpsc::channel::<()>(1);
    let heartbeat_handle = tokio::spawn(async move {
        loop {
            tokio::time::sleep(HEARTBEAT_INTERVAL).await;
            if heartbeat_tx.send(()).await.is_err() {
                break;
            }
        }
    });

    // Main event loop
    loop {
        tokio::select! {
            // Handle incoming WebSocket messages
            msg = ws_receiver.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        // Handle client messages (e.g., pong responses)
                        if let Ok(ws_msg) = serde_json::from_str::<WsMessage>(&text) {
                            match ws_msg {
                                WsMessage::Pong { .. } => {
                                    // Client responded to ping, connection is alive
                                    tracing::trace!(task_id = %task_id, "Received pong");
                                }
                                _ => {}
                            }
                        }
                    }
                    Some(Ok(Message::Ping(data))) => {
                        // Respond to ping with pong
                        if ws_sender.send(Message::Pong(data)).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(Message::Pong(_))) => {
                        // Client responded to our ping
                    }
                    Some(Ok(Message::Close(_))) => {
                        tracing::debug!(swarm_id = %swarm_id, task_id = %task_id, "Client closed log stream");
                        break;
                    }
                    Some(Err(e)) => {
                        tracing::warn!(task_id = %task_id, error = %e, "WebSocket error");
                        break;
                    }
                    None => {
                        break;
                    }
                    _ => {}
                }
            }

            // Handle broadcast log messages
            log_result = log_receiver.recv() => {
                match log_result {
                    Ok(log_msg) => {
                        let ws_msg = match log_msg {
                            LogMessage::Entry(entry) => {
                                // Send the log entry as JSON directly
                                serde_json::to_string(&entry).ok()
                            }
                            LogMessage::End(end) => {
                                // Send the log end message
                                serde_json::to_string(&end).ok()
                            }
                        };

                        if let Some(json) = ws_msg {
                            if ws_sender.send(Message::Text(json.into())).await.is_err() {
                                break;
                            }
                        }
                    }
                    Err(RecvError::Lagged(n)) => {
                        // Receiver fell behind, notify client
                        tracing::warn!(task_id = %task_id, skipped = n, "Log receiver lagged");
                        let error = WsMessage::Error {
                            message: format!("Missed {} log messages due to lag", n),
                        };
                        match serde_json::to_string(&error) {
                            Ok(json) => {
                                let _ = ws_sender.send(Message::Text(json.into())).await;
                            }
                            Err(e) => {
                                tracing::warn!(task_id = %task_id, error = %e, "Failed to serialize error message");
                            }
                        }
                    }
                    Err(RecvError::Closed) => {
                        tracing::debug!(task_id = %task_id, "Log broadcast channel closed");
                        break;
                    }
                }
            }

            // Handle heartbeat
            _ = heartbeat_rx.recv() => {
                let ping = WsMessage::Ping {
                    timestamp: chrono::Utc::now().timestamp_millis(),
                };
                match serde_json::to_string(&ping) {
                    Ok(json) => {
                        if ws_sender.send(Message::Text(json.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(e) => {
                        tracing::warn!(task_id = %task_id, error = %e, "Failed to serialize ping message");
                    }
                }
            }
        }
    }

    // Cleanup
    heartbeat_handle.abort();
    broadcast.logs.cleanup_channel(task_id).await;
    tracing::debug!(swarm_id = %swarm_id, task_id = %task_id, "Log stream closed");
}

/// WebSocket handler for chat streaming
pub async fn chat_ws(
    ws: WebSocketUpgrade,
    Path(swarm_id): Path<Uuid>,
    State(state): State<AppState>,
) -> Result<impl IntoResponse, axum::response::Response> {
    // IDOR protection: verify swarm exists before allowing WebSocket connection
    let _swarm = Swarm::find_by_id(&state.db_pool, swarm_id)
        .await
        .map_err(|e| {
            tracing::warn!(swarm_id = %swarm_id, error = %e, "Database error checking swarm for chat WebSocket");
            (axum::http::StatusCode::INTERNAL_SERVER_ERROR, "Internal server error").into_response()
        })?
        .ok_or_else(|| {
            tracing::warn!(swarm_id = %swarm_id, "Swarm not found for chat WebSocket");
            (axum::http::StatusCode::NOT_FOUND, "Swarm not found").into_response()
        })?;

    Ok(ws.on_upgrade(move |socket| handle_chat_stream(socket, swarm_id, state.broadcast)))
}

/// Handle the chat stream WebSocket connection
async fn handle_chat_stream(
    socket: WebSocket,
    swarm_id: Uuid,
    broadcast: Arc<BroadcastManager>,
) {
    let (mut ws_sender, mut ws_receiver) = socket.split();

    // Send connected message
    let connected = WsMessage::Connected {
        message: format!("Connected to chat for swarm {}", swarm_id),
    };
    match serde_json::to_string(&connected) {
        Ok(json) => {
            if ws_sender.send(Message::Text(json.into())).await.is_err() {
                return;
            }
        }
        Err(e) => {
            tracing::warn!(swarm_id = %swarm_id, error = %e, "Failed to serialize connected message");
        }
    }

    // Subscribe to chat broadcasts for this swarm
    let mut chat_receiver = broadcast.chat.subscribe_chat(swarm_id).await;

    // Spawn heartbeat task
    let (heartbeat_tx, mut heartbeat_rx) = tokio::sync::mpsc::channel::<()>(1);
    let heartbeat_handle = tokio::spawn(async move {
        loop {
            tokio::time::sleep(HEARTBEAT_INTERVAL).await;
            if heartbeat_tx.send(()).await.is_err() {
                break;
            }
        }
    });

    // Main event loop
    loop {
        tokio::select! {
            // Handle incoming WebSocket messages
            msg = ws_receiver.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        // Handle client messages
                        if let Ok(ws_msg) = serde_json::from_str::<WsMessage>(&text) {
                            match ws_msg {
                                WsMessage::Pong { .. } => {
                                    tracing::trace!(swarm_id = %swarm_id, "Received pong");
                                }
                                _ => {}
                            }
                        }
                    }
                    Some(Ok(Message::Ping(data))) => {
                        if ws_sender.send(Message::Pong(data)).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(Message::Pong(_))) => {}
                    Some(Ok(Message::Close(_))) => {
                        tracing::debug!(swarm_id = %swarm_id, "Client closed chat stream");
                        break;
                    }
                    Some(Err(e)) => {
                        tracing::warn!(swarm_id = %swarm_id, error = %e, "WebSocket error");
                        break;
                    }
                    None => {
                        break;
                    }
                    _ => {}
                }
            }

            // Handle broadcast chat messages
            chat_result = chat_receiver.recv() => {
                match chat_result {
                    Ok(chat_msg) => {
                        // Send the chat message as JSON directly
                        match serde_json::to_string(&chat_msg) {
                            Ok(json) => {
                                if ws_sender.send(Message::Text(json.into())).await.is_err() {
                                    break;
                                }
                            }
                            Err(e) => {
                                tracing::warn!(swarm_id = %swarm_id, error = %e, "Failed to serialize chat message");
                            }
                        }
                    }
                    Err(RecvError::Lagged(n)) => {
                        tracing::warn!(swarm_id = %swarm_id, skipped = n, "Chat receiver lagged");
                        let error = WsMessage::Error {
                            message: format!("Missed {} chat messages due to lag", n),
                        };
                        match serde_json::to_string(&error) {
                            Ok(json) => {
                                let _ = ws_sender.send(Message::Text(json.into())).await;
                            }
                            Err(e) => {
                                tracing::warn!(swarm_id = %swarm_id, error = %e, "Failed to serialize error message");
                            }
                        }
                    }
                    Err(RecvError::Closed) => {
                        tracing::debug!(swarm_id = %swarm_id, "Chat broadcast channel closed");
                        break;
                    }
                }
            }

            // Handle heartbeat
            _ = heartbeat_rx.recv() => {
                let ping = WsMessage::Ping {
                    timestamp: chrono::Utc::now().timestamp_millis(),
                };
                match serde_json::to_string(&ping) {
                    Ok(json) => {
                        if ws_sender.send(Message::Text(json.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(e) => {
                        tracing::warn!(swarm_id = %swarm_id, error = %e, "Failed to serialize ping message");
                    }
                }
            }
        }
    }

    // Cleanup
    heartbeat_handle.abort();
    broadcast.chat.cleanup_channel(swarm_id).await;
    tracing::debug!(swarm_id = %swarm_id, "Chat stream closed");
}

/// WebSocket handler for pool status streaming
pub async fn pool_ws(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_pool_stream(socket, state.broadcast))
}

/// Handle the pool status stream WebSocket connection
async fn handle_pool_stream(
    socket: WebSocket,
    broadcast: Arc<BroadcastManager>,
) {
    let (mut ws_sender, mut ws_receiver) = socket.split();

    // Send connected message
    let connected = WsMessage::Connected {
        message: "Connected to pool status stream".to_string(),
    };
    match serde_json::to_string(&connected) {
        Ok(json) => {
            if ws_sender.send(Message::Text(json.into())).await.is_err() {
                return;
            }
        }
        Err(e) => {
            tracing::warn!(error = %e, "Failed to serialize connected message for pool stream");
        }
    }

    // Subscribe to pool broadcasts
    let mut pool_receiver = broadcast.pool.subscribe();

    // Spawn heartbeat task
    let (heartbeat_tx, mut heartbeat_rx) = tokio::sync::mpsc::channel::<()>(1);
    let heartbeat_handle = tokio::spawn(async move {
        loop {
            tokio::time::sleep(HEARTBEAT_INTERVAL).await;
            if heartbeat_tx.send(()).await.is_err() {
                break;
            }
        }
    });

    // Main event loop
    loop {
        tokio::select! {
            // Handle incoming WebSocket messages
            msg = ws_receiver.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        if let Ok(ws_msg) = serde_json::from_str::<WsMessage>(&text) {
                            match ws_msg {
                                WsMessage::Pong { .. } => {
                                    tracing::trace!("Received pong from pool client");
                                }
                                _ => {}
                            }
                        }
                    }
                    Some(Ok(Message::Ping(data))) => {
                        if ws_sender.send(Message::Pong(data)).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(Message::Pong(_))) => {}
                    Some(Ok(Message::Close(_))) => {
                        tracing::debug!("Client closed pool stream");
                        break;
                    }
                    Some(Err(e)) => {
                        tracing::warn!(error = %e, "Pool WebSocket error");
                        break;
                    }
                    None => {
                        break;
                    }
                    _ => {}
                }
            }

            // Handle broadcast pool updates
            pool_result = pool_receiver.recv() => {
                match pool_result {
                    Ok(pool_update) => {
                        // Send the pool update as JSON directly
                        match serde_json::to_string(&pool_update) {
                            Ok(json) => {
                                if ws_sender.send(Message::Text(json.into())).await.is_err() {
                                    break;
                                }
                            }
                            Err(e) => {
                                tracing::warn!(error = %e, "Failed to serialize pool update");
                            }
                        }
                    }
                    Err(RecvError::Lagged(n)) => {
                        tracing::warn!(skipped = n, "Pool receiver lagged");
                        let error = WsMessage::Error {
                            message: format!("Missed {} pool updates due to lag", n),
                        };
                        match serde_json::to_string(&error) {
                            Ok(json) => {
                                let _ = ws_sender.send(Message::Text(json.into())).await;
                            }
                            Err(e) => {
                                tracing::warn!(error = %e, "Failed to serialize pool error message");
                            }
                        }
                    }
                    Err(RecvError::Closed) => {
                        tracing::debug!("Pool broadcast channel closed");
                        break;
                    }
                }
            }

            // Handle heartbeat
            _ = heartbeat_rx.recv() => {
                let ping = WsMessage::Ping {
                    timestamp: chrono::Utc::now().timestamp_millis(),
                };
                match serde_json::to_string(&ping) {
                    Ok(json) => {
                        if ws_sender.send(Message::Text(json.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(e) => {
                        tracing::warn!(error = %e, "Failed to serialize pool ping message");
                    }
                }
            }
        }
    }

    // Cleanup
    heartbeat_handle.abort();
    tracing::debug!("Pool stream closed");
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/ws/swarms/{swarm_id}/tasks/{task_id}/logs", get(task_logs_ws))
        .route("/ws/swarms/{swarm_id}/chat", get(chat_ws))
        .route("/ws/pool", get(pool_ws))
}
