use axum::{
    extract::{Path, Request, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use relay_tunnel_core::server::proxy_request_over_control;

use crate::server::AppState;

/// Proxy handler for `/v1/relay/h/:machine_id/s/:session_id` (no trailing path).
pub async fn proxy_handler(
    State(state): State<AppState>,
    Path((machine_id, session_id)): Path<(String, String)>,
    request: Request,
) -> Response {
    do_proxy(&state, &machine_id, &session_id, request).await
}

/// Proxy handler for `/v1/relay/h/:machine_id/s/:session_id/*tail`.
pub async fn proxy_handler_with_tail(
    State(state): State<AppState>,
    Path((machine_id, session_id, _tail)): Path<(String, String, String)>,
    request: Request,
) -> Response {
    do_proxy(&state, &machine_id, &session_id, request).await
}

async fn do_proxy(
    state: &AppState,
    machine_id: &str,
    session_id: &str,
    request: Request,
) -> Response {
    let control = match state.registry.get(machine_id) {
        Some(c) => c,
        None => return (StatusCode::NOT_FOUND, "No active relay").into_response(),
    };

    // Mirror the strip_prefix pattern from relay-tunnel/path_routes.rs:
    // format!("{RELAY_PROXY_PREFIX}/{host_id}/s/{browser_session_id}")
    let strip_prefix = format!("/v1/relay/h/{machine_id}/s/{session_id}");
    proxy_request_over_control(control.as_ref(), request, &strip_prefix).await
}
