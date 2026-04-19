use std::net::SocketAddr;

use axum::{
    middleware,
    routing::{any, get},
    Router,
};

use crate::{
    auth,
    registry::RelayRegistry,
    routes::{connect, health, proxy},
};

#[derive(Clone)]
pub struct AppState {
    pub registry: RelayRegistry,
    pub shared_token: String,
}

/// Build the axum Router for the local relay server.
///
/// - `/health` — public health check
/// - `/v1/relay/connect` — WebSocket upgrade (requires Bearer token)
/// - `/v1/relay/h/:machine_id/s/:session_id[/*tail]` — proxy (no auth; sessions protect at app layer)
pub fn build_app(token: String) -> Router {
    let state = AppState {
        registry: RelayRegistry::new(),
        shared_token: token,
    };

    // Protect the connect endpoint with Bearer token middleware.
    let protected = Router::new()
        .route("/connect", get(connect::ws_connect))
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            auth::require_bearer_token,
        ));

    Router::new()
        .route("/health", get(health::health))
        .route(
            "/v1/relay/h/{machine_id}/s/{session_id}",
            any(proxy::proxy_handler),
        )
        .route(
            "/v1/relay/h/{machine_id}/s/{session_id}/{*tail}",
            any(proxy::proxy_handler_with_tail),
        )
        .nest("/v1/relay", protected)
        .with_state(state)
}

pub async fn serve(addr: SocketAddr, token: String) -> anyhow::Result<()> {
    let app = build_app(token);
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
