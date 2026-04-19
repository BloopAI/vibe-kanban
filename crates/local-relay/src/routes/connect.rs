use axum::{
    extract::{ws::WebSocketUpgrade, Query, State},
    response::Response,
};
use relay_tunnel_core::server::run_control_channel;
use serde::Deserialize;

use crate::server::AppState;

#[derive(Debug, Deserialize)]
pub struct ConnectQuery {
    pub machine_id: String,
    pub name: Option<String>,
}

/// WebSocket endpoint for local relay agents to establish a control channel.
///
/// On upgrade, the machine is registered in the relay registry. On disconnect,
/// it is removed.
///
/// Each machine_id should have at most one active connection at a time. If a
/// duplicate arrives, the old entry is replaced; when the first connection later
/// closes its `remove` call is a harmless no-op on a key that now belongs to
/// the second connection.
pub async fn ws_connect(
    State(state): State<AppState>,
    Query(query): Query<ConnectQuery>,
    ws: WebSocketUpgrade,
) -> Response {
    ws.on_upgrade(move |socket| async move {
        let machine_id = query.machine_id;
        let registry_for_connect = state.registry.clone();
        let registry_for_cleanup = state.registry.clone();
        let mid = machine_id.clone();

        let result = run_control_channel(socket, move |control| {
            let reg = registry_for_connect;
            let id = mid;
            async move {
                if reg.get(&id).is_some() {
                    tracing::warn!(%id, "Replacing existing relay connection for machine_id (duplicate connection)");
                }
                reg.insert(id.clone(), control);
                tracing::info!(%id, "Relay agent connected and registered");
            }
        })
        .await;

        registry_for_cleanup.remove(&machine_id);
        tracing::info!(%machine_id, "Relay agent disconnected and removed from registry");

        if let Err(error) = result {
            tracing::warn!(?error, %machine_id, "relay control channel error");
        }
    })
}
