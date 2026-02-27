//! WebSocket control channel handler for local server connections.

use std::sync::Arc;

use axum::{
    Extension,
    extract::{Query, State, ws::WebSocketUpgrade},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Deserialize;
use uuid::Uuid;

use super::super::{
    auth::RequestContext,
    db::hosts::HostRepository,
    relay_registry::{ActiveRelay, RelayRegistry},
    state::RelayAppState,
};
use crate::server::run_control_channel;

#[derive(Debug, Deserialize)]
pub struct ConnectQuery {
    pub machine_id: String,
    pub name: String,
    #[serde(default)]
    pub agent_version: Option<String>,
}

/// Local server connects here to establish a relay control channel.
/// The host record is upserted from the authenticated user + machine_id query param.
pub async fn relay_connect(
    State(state): State<RelayAppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(query): Query<ConnectQuery>,
    ws: WebSocketUpgrade,
) -> Response {
    let repo = HostRepository::new(&state.pool);

    let host_id = match repo
        .upsert_host(
            ctx.user.id,
            &query.machine_id,
            &query.name,
            query.agent_version.as_deref(),
        )
        .await
    {
        Ok(id) => id,
        Err(error) => {
            tracing::error!(?error, "failed to upsert host for relay connect");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    if let Err(error) = repo
        .mark_host_online(host_id, query.agent_version.as_deref())
        .await
    {
        tracing::warn!(?error, "failed to mark host online");
    }

    let registry = state.relay_registry.clone();
    let pool = state.pool.clone();

    ws.on_upgrade(move |socket| async move {
        handle_control_channel(socket, pool, registry, host_id).await;
    })
}

async fn handle_control_channel(
    socket: axum::extract::ws::WebSocket,
    pool: sqlx::PgPool,
    registry: RelayRegistry,
    host_id: Uuid,
) {
    let registry_for_connect = registry.clone();
    let connected_relay = Arc::new(tokio::sync::Mutex::new(None::<Arc<ActiveRelay>>));
    let connected_relay_for_connect = connected_relay.clone();
    let run_result = run_control_channel(socket, move |control| {
        let registry_for_connect = registry_for_connect.clone();
        let connected_relay_for_connect = connected_relay_for_connect.clone();
        async move {
            let relay = Arc::new(ActiveRelay::new(control));
            registry_for_connect.insert(host_id, relay.clone()).await;
            *connected_relay_for_connect.lock().await = Some(relay);
            tracing::debug!(%host_id, "Relay control channel connected");
        }
    })
    .await;

    if let Err(error) = run_result {
        tracing::warn!(?error, %host_id, "relay session error");
    }

    let should_mark_offline = if let Some(relay) = connected_relay.lock().await.clone() {
        registry.remove_if_same(&host_id, &relay).await
    } else {
        registry.get(&host_id).await.is_none()
    };

    let repo = HostRepository::new(&pool);
    if should_mark_offline {
        if let Err(error) = repo.mark_host_offline(host_id).await {
            tracing::warn!(?error, "failed to mark host offline");
        }
    } else {
        tracing::debug!(
            %host_id,
            "Relay control channel disconnected; keeping host online because a newer channel is active"
        );
    }
    tracing::debug!(%host_id, "Relay control channel disconnected");
}
