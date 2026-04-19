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
                reg.insert(id, control);
            }
        })
        .await;

        registry_for_cleanup.remove(&machine_id);

        if let Err(error) = result {
            tracing::warn!(?error, %machine_id, "relay control channel error");
        }
    })
}
