//! WebSocket infrastructure for node-hive communication.
//!
//! This module provides the WebSocket endpoint for nodes to connect to the hive,
//! authenticate, and exchange messages for task coordination.

use axum::{
    Router,
    extract::{State, ws::WebSocketUpgrade},
    response::IntoResponse,
    routing::get,
};

use crate::AppState;

mod connection;
mod dispatcher;
pub mod message;
mod session;

pub use connection::{ConnectionManager, NodeConnectionInfo, SendError};
pub use dispatcher::{AssignResult, DispatchError, TaskDispatcher};

/// Create the WebSocket router for node connections.
pub fn router() -> Router<AppState> {
    Router::new().route("/nodes/ws", get(upgrade))
}

/// Handle WebSocket upgrade request from a node.
async fn upgrade(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
    let pool = state.pool().clone();
    let connections = state.node_connections().clone();

    ws.on_upgrade(move |socket| session::handle(socket, pool, connections))
}
