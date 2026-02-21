//! Relay routes: WebSocket control channel and HTTP/WS proxy.
//!
//! - `GET /relay/connect` — Protected. Local server connects here via WebSocket.
//! - `GET /relay/mine` — Protected. Phone frontend checks if relay is active.
//! - `ANY /relay/proxy/{*path}` — Protected. Proxies API calls to local.
//! - Subdomain routing: `{user_id}.{RELAY_BASE_DOMAIN}` — Serves the full local
//!   frontend+API through the relay. Auth via `relay_token` cookie.

use std::sync::Arc;

use axum::{
    Extension, Json, Router,
    body::Body,
    extract::{FromRequestParts, Request, State, ws::WebSocketUpgrade},
    http::{HeaderMap, HeaderName, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::{any, get, post},
};
use futures::{SinkExt, stream::{SplitSink, SplitStream, StreamExt}};
use tokio::sync::{mpsc, oneshot};

use api_types::{Base64Bytes, LocalToRelay, RelayStatus, RelayToLocal};

use crate::{
    AppState,
    auth::RequestContext,
    relay::{ActiveRelay, RelayRegistry},
};

/// Headers to skip when proxying requests (hop-by-hop headers).
const SKIP_REQUEST_HEADERS: &[&str] = &[
    "host",
    "connection",
    "transfer-encoding",
    "upgrade",
    "proxy-connection",
    "keep-alive",
    "te",
    "trailer",
    "sec-websocket-key",
    "sec-websocket-version",
    "sec-websocket-extensions",
    "origin",
];

/// Headers to strip from proxied responses.
const STRIP_RESPONSE_HEADERS: &[&str] = &[
    "transfer-encoding",
    "connection",
    "content-encoding",
];

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/relay/connect", get(relay_connect))
        .route("/relay/mine", get(relay_mine))
        .route("/relay/auth-code", post(relay_auth_code))
        .route("/relay/proxy/{*path}", any(relay_proxy))
}

/// Extract the relay subdomain from a `Host` header value.
///
/// Given `relay_base_domain = "relay.example.com"` and
/// `host = "abcd-1234.relay.example.com"`, returns `Some("abcd-1234")`.
pub fn extract_relay_subdomain<'a>(host: &'a str, relay_base_domain: &str) -> Option<&'a str> {
    // Strip port from host if present (e.g. "x.relay.localhost:3001" → "x.relay.localhost")
    let host_no_port = host.split(':').next().unwrap_or(host);
    let base_no_port = relay_base_domain.split(':').next().unwrap_or(relay_base_domain);

    let prefix = host_no_port.strip_suffix(base_no_port)?.strip_suffix('.')?;
    if prefix.is_empty() {
        return None;
    }
    Some(prefix)
}

/// Handle requests arriving on a relay subdomain.
///
/// Two modes:
/// 1. `?code=<one-time-code>` — exchange the code for a `relay_token` cookie, redirect to `/`.
/// 2. Normal request with `relay_token` cookie — proxy to local server.
pub async fn relay_subdomain_proxy(State(state): State<AppState>, request: Request) -> Response {
    let relay_base_domain = match &state.config.relay_base_domain {
        Some(d) => d,
        None => return (StatusCode::NOT_FOUND, "Relay subdomains not configured").into_response(),
    };

    // Extract subdomain from Host header
    let host = request
        .headers()
        .get("host")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let subdomain = match extract_relay_subdomain(host, relay_base_domain) {
        Some(s) => s.to_owned(),
        None => return (StatusCode::NOT_FOUND, "Invalid relay subdomain").into_response(),
    };

    // Parse user_id from subdomain
    let user_id = match uuid::Uuid::parse_str(&subdomain) {
        Ok(id) => id,
        Err(_) => return (StatusCode::NOT_FOUND, "Invalid relay subdomain").into_response(),
    };

    // Check for one-time auth code in query string
    if let Some(query) = request.uri().query() {
        let code = query
            .split('&')
            .find_map(|pair| pair.strip_prefix("code="));

        if let Some(code) = code {
            let registry = state.relay_registry();
            match registry.redeem_auth_code(code).await {
                Some((code_user_id, access_token)) if code_user_id == user_id => {
                    // Set cookie and redirect to /
                    return Response::builder()
                        .status(StatusCode::FOUND)
                        .header("location", "/")
                        .header(
                            "set-cookie",
                            format!(
                                "relay_token={access_token}; Path=/; HttpOnly; Secure; SameSite=Lax"
                            ),
                        )
                        .body(Body::empty())
                        .unwrap_or_else(|_| {
                            StatusCode::INTERNAL_SERVER_ERROR.into_response()
                        });
                }
                _ => {
                    return (StatusCode::UNAUTHORIZED, "Invalid or expired code")
                        .into_response();
                }
            }
        }
    }

    // Normal flow: authenticate via cookie
    let token = request
        .headers()
        .get_all("cookie")
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|s| s.split(';'))
        .map(|s| s.trim())
        .find_map(|cookie| cookie.strip_prefix("relay_token="))
        .map(|s| s.to_owned());

    let token = match token {
        Some(t) => t,
        None => return (StatusCode::UNAUTHORIZED, "Missing relay_token cookie").into_response(),
    };

    // Decode JWT and verify user matches subdomain
    let identity = match state.jwt().decode_access_token(&token) {
        Ok(id) => id,
        Err(_) => return (StatusCode::UNAUTHORIZED, "Invalid token").into_response(),
    };

    if identity.user_id != user_id {
        return (StatusCode::FORBIDDEN, "Token does not match relay").into_response();
    }

    let registry = state.relay_registry();
    let relay = match registry.get(&user_id).await {
        Some(r) => r,
        None => return (StatusCode::NOT_FOUND, "No active relay").into_response(),
    };

    // Check for WebSocket upgrade
    let is_ws_upgrade = request
        .headers()
        .get("upgrade")
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.eq_ignore_ascii_case("websocket"));

    if is_ws_upgrade {
        return handle_ws_relay(relay, request, "").await;
    }

    handle_http_relay(relay, request, "").await
}

// ── Control Channel ────────────────────────────────────────────────────

/// Local server connects here to establish a relay control channel.
async fn relay_connect(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    ws: WebSocketUpgrade,
) -> Response {
    let registry = state.relay_registry().clone();
    let user_id = ctx.user.id;

    ws.on_upgrade(move |socket| async move {
        handle_control_channel(socket, registry, user_id).await;
    })
}

async fn handle_control_channel(
    socket: axum::extract::ws::WebSocket,
    registry: RelayRegistry,
    user_id: uuid::Uuid,
) {
    let (ws_sink, ws_stream) = socket.split();

    // Channel for sending messages to the local server
    let (tx, rx) = mpsc::channel::<RelayToLocal>(256);

    let relay = Arc::new(ActiveRelay::new(tx, user_id));
    registry.insert(user_id, relay.clone()).await;

    tracing::info!(%user_id, "Relay control channel connected");

    // Spawn sender task: reads from rx channel, sends as WS text frames
    let sender_handle = tokio::spawn(sender_task(rx, ws_sink));

    // Run receiver in current task: reads WS frames from local, dispatches responses
    receiver_task(ws_stream, relay.clone()).await;

    // Cleanup
    sender_handle.abort();
    registry.remove(&user_id).await;
    tracing::info!(%user_id, "Relay control channel disconnected");
}

async fn sender_task(
    mut rx: mpsc::Receiver<RelayToLocal>,
    mut sink: SplitSink<axum::extract::ws::WebSocket, axum::extract::ws::Message>,
) {
    while let Some(msg) = rx.recv().await {
        let json = match serde_json::to_string(&msg) {
            Ok(j) => j,
            Err(e) => {
                tracing::error!("Failed to serialize RelayToLocal: {e}");
                continue;
            }
        };
        if sink
            .send(axum::extract::ws::Message::Text(json.into()))
            .await
            .is_err()
        {
            break;
        }
    }
}

async fn receiver_task(
    mut stream: SplitStream<axum::extract::ws::WebSocket>,
    relay: Arc<ActiveRelay>,
) {
    while let Some(msg_result) = stream.next().await {
        let msg = match msg_result {
            Ok(axum::extract::ws::Message::Text(text)) => text,
            Ok(axum::extract::ws::Message::Close(_)) => break,
            Ok(_) => continue,
            Err(_) => break,
        };

        let parsed: LocalToRelay = match serde_json::from_str(&msg) {
            Ok(p) => p,
            Err(e) => {
                tracing::warn!("Invalid LocalToRelay message: {e}");
                continue;
            }
        };

        match parsed {
            LocalToRelay::HttpResponse { stream_id, .. } => {
                if let Some(sender) = relay.pending_http.lock().await.remove(&stream_id) {
                    let _ = sender.send(parsed);
                }
            }
            LocalToRelay::WsOpened { stream_id }
            | LocalToRelay::WsRejected { stream_id, .. }
            | LocalToRelay::WsData { stream_id, .. }
            | LocalToRelay::WsClose { stream_id } => {
                if let Some(sender) = relay.active_ws.lock().await.get(&stream_id) {
                    let _ = sender.send(parsed).await;
                }
            }
            LocalToRelay::Pong { .. } => {
                // Could update liveness tracker here
            }
        }
    }
}

// ── Mine ───────────────────────────────────────────────────────────────

/// Check if the authenticated user has an active relay.
async fn relay_mine(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
) -> Response {
    let registry = state.relay_registry();
    let connected = registry.get(&ctx.user.id).await.is_some();

    let relay_url = if connected {
        state
            .config
            .relay_base_domain
            .as_ref()
            .map(|base| format!("https://{}.{base}/", ctx.user.id))
    } else {
        None
    };

    Json(RelayStatus {
        connected,
        relay_url,
    })
    .into_response()
}

// ── Auth Code ─────────────────────────────────────────────────────────

/// Generate a one-time auth code for relay subdomain cookie exchange.
async fn relay_auth_code(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
) -> Response {
    let registry = state.relay_registry();

    // Only issue codes when the user has an active relay
    if registry.get(&ctx.user.id).await.is_none() {
        return (StatusCode::NOT_FOUND, "No active relay").into_response();
    }

    let access_token = ctx.raw_token.clone();
    let code = registry.store_auth_code(ctx.user.id, access_token).await;

    Json(serde_json::json!({ "code": code })).into_response()
}

// ── Proxy ──────────────────────────────────────────────────────────────

const RELAY_PROXY_PREFIX: &str = "/v1/relay/proxy";

/// Proxy HTTP and WebSocket requests through the relay to the local server.
async fn relay_proxy(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    request: Request,
) -> Response {
    do_relay_proxy(state, ctx, request, RELAY_PROXY_PREFIX).await
}

async fn do_relay_proxy(
    state: AppState,
    ctx: RequestContext,
    request: Request,
    strip_prefix: &str,
) -> Response {
    let registry = state.relay_registry();

    let relay = match registry.get(&ctx.user.id).await {
        Some(r) => r,
        None => {
            return (StatusCode::NOT_FOUND, "No active relay").into_response();
        }
    };

    // Check for WebSocket upgrade
    let is_ws_upgrade = request
        .headers()
        .get("upgrade")
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.eq_ignore_ascii_case("websocket"));

    if is_ws_upgrade {
        return handle_ws_relay(relay, request, strip_prefix).await;
    }

    handle_http_relay(relay, request, strip_prefix).await
}

async fn handle_http_relay(
    relay: Arc<ActiveRelay>,
    request: Request,
    strip_prefix: &str,
) -> Response {
    let stream_id = relay.next_stream_id();

    let (parts, body) = request.into_parts();

    // Strip the route prefix so local server sees the original path
    let raw_path = parts.uri.path();
    let path = raw_path
        .strip_prefix(strip_prefix)
        .unwrap_or(raw_path);
    let path = if path.is_empty() { "/" } else { path };
    let query = parts.uri.query().map(|q| format!("?{q}")).unwrap_or_default();
    let full_path = format!("{path}{query}");

    // Collect headers
    let headers: Vec<(String, String)> = parts
        .headers
        .iter()
        .filter(|(name, _)| {
            !SKIP_REQUEST_HEADERS.contains(&name.as_str().to_lowercase().as_str())
        })
        .filter_map(|(name, value)| {
            value
                .to_str()
                .ok()
                .map(|v| (name.to_string(), v.to_string()))
        })
        .collect();

    // Read body
    let body_bytes = match axum::body::to_bytes(body, 50 * 1024 * 1024).await {
        Ok(b) => b.to_vec(),
        Err(e) => {
            tracing::error!("Failed to read request body: {e}");
            return (StatusCode::BAD_REQUEST, "Failed to read request body").into_response();
        }
    };

    // Create oneshot channel for the response
    let (resp_tx, resp_rx) = oneshot::channel();
    relay.pending_http.lock().await.insert(stream_id, resp_tx);

    // Send request to local server
    let msg = RelayToLocal::HttpRequest {
        stream_id,
        method: parts.method.to_string(),
        path: full_path,
        headers,
        body: Base64Bytes(body_bytes),
    };

    if relay.tx.send(msg).await.is_err() {
        relay.pending_http.lock().await.remove(&stream_id);
        return (StatusCode::BAD_GATEWAY, "Relay connection lost").into_response();
    }

    // Wait for response with timeout
    match tokio::time::timeout(
        std::time::Duration::from_secs(120),
        resp_rx,
    )
    .await
    {
        Ok(Ok(LocalToRelay::HttpResponse {
            status,
            headers,
            body,
            ..
        })) => {
            let status_code =
                StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);

            let mut response_headers = HeaderMap::new();
            for (name, value) in &headers {
                let name_lower = name.to_lowercase();
                if !STRIP_RESPONSE_HEADERS.contains(&name_lower.as_str())
                    && let (Ok(header_name), Ok(header_value)) = (
                        HeaderName::try_from(name.as_str()),
                        HeaderValue::from_str(value),
                    )
                {
                    response_headers.insert(header_name, header_value);
                }
            }

            let mut builder = Response::builder().status(status_code);
            for (name, value) in response_headers.iter() {
                builder = builder.header(name, value);
            }

            builder
                .body(Body::from(body.0))
                .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
        }
        Ok(Ok(_)) => {
            // Unexpected message type
            (StatusCode::BAD_GATEWAY, "Unexpected relay response").into_response()
        }
        Ok(Err(_)) => {
            // Sender dropped (relay disconnected)
            (StatusCode::BAD_GATEWAY, "Relay connection lost").into_response()
        }
        Err(_) => {
            // Timeout
            relay.pending_http.lock().await.remove(&stream_id);
            (StatusCode::GATEWAY_TIMEOUT, "Relay request timed out").into_response()
        }
    }
}

async fn handle_ws_relay(
    relay: Arc<ActiveRelay>,
    request: Request,
    strip_prefix: &str,
) -> Response {
    let (mut parts, _body) = request.into_parts();

    let raw_path = parts.uri.path();
    let path = raw_path
        .strip_prefix(strip_prefix)
        .unwrap_or(raw_path);
    let path = if path.is_empty() { "/" } else { path };
    let query = parts.uri.query().map(|q| format!("?{q}")).unwrap_or_default();
    let full_path = format!("{path}{query}");

    // Collect headers for WsOpen
    let headers: Vec<(String, String)> = parts
        .headers
        .iter()
        .filter(|(name, _)| {
            !SKIP_REQUEST_HEADERS.contains(&name.as_str().to_lowercase().as_str())
        })
        .filter_map(|(name, value)| {
            value
                .to_str()
                .ok()
                .map(|v| (name.to_string(), v.to_string()))
        })
        .collect();

    let ws = match WebSocketUpgrade::from_request_parts(&mut parts, &()).await {
        Ok(ws) => ws,
        Err(e) => {
            return (StatusCode::BAD_REQUEST, format!("WS upgrade failed: {e}")).into_response();
        }
    };

    ws.on_upgrade(move |phone_socket| async move {
        if let Err(e) = handle_ws_relay_connection(relay, phone_socket, full_path, headers).await {
            tracing::warn!("WebSocket relay closed: {e}");
        }
    })
    .into_response()
}

async fn handle_ws_relay_connection(
    relay: Arc<ActiveRelay>,
    phone_socket: axum::extract::ws::WebSocket,
    path: String,
    headers: Vec<(String, String)>,
) -> anyhow::Result<()> {
    let stream_id = relay.next_stream_id();

    // Create channel for messages coming back from local for this WS stream
    let (ws_tx, mut ws_rx) = mpsc::channel::<LocalToRelay>(64);
    relay.active_ws.lock().await.insert(stream_id, ws_tx);

    // Tell local to open a WS connection
    relay
        .tx
        .send(RelayToLocal::WsOpen {
            stream_id,
            path,
            headers,
        })
        .await
        .map_err(|_| anyhow::anyhow!("Relay disconnected"))?;

    // Wait for WsOpened or WsRejected
    let opened = match tokio::time::timeout(std::time::Duration::from_secs(30), ws_rx.recv()).await
    {
        Ok(Some(LocalToRelay::WsOpened { .. })) => true,
        Ok(Some(LocalToRelay::WsRejected { .. })) => false,
        _ => false,
    };

    if !opened {
        relay.active_ws.lock().await.remove(&stream_id);
        return Ok(());
    }

    let (mut phone_sink, mut phone_stream) = phone_socket.split();

    // Phone → Local: forward WS frames
    let relay_tx = relay.tx.clone();
    let phone_to_local = tokio::spawn(async move {
        while let Some(msg_result) = phone_stream.next().await {
            match msg_result {
                Ok(axum::extract::ws::Message::Text(text)) => {
                    let _ = relay_tx
                        .send(RelayToLocal::WsData {
                            stream_id,
                            data: Base64Bytes(text.as_bytes().to_vec()),
                            is_text: true,
                        })
                        .await;
                }
                Ok(axum::extract::ws::Message::Binary(data)) => {
                    let _ = relay_tx
                        .send(RelayToLocal::WsData {
                            stream_id,
                            data: Base64Bytes(data.to_vec()),
                            is_text: false,
                        })
                        .await;
                }
                Ok(axum::extract::ws::Message::Close(_)) => {
                    let _ = relay_tx.send(RelayToLocal::WsClose { stream_id }).await;
                    break;
                }
                Ok(_) => continue,
                Err(_) => break,
            }
        }
    });

    // Local → Phone: forward WS frames
    let local_to_phone = tokio::spawn(async move {
        while let Some(msg) = ws_rx.recv().await {
            match msg {
                LocalToRelay::WsData {
                    data, is_text, ..
                } => {
                    let ws_msg = if is_text {
                        axum::extract::ws::Message::Text(
                            String::from_utf8_lossy(&data.0).into_owned().into(),
                        )
                    } else {
                        axum::extract::ws::Message::Binary(data.0.into())
                    };
                    if phone_sink.send(ws_msg).await.is_err() {
                        break;
                    }
                }
                LocalToRelay::WsClose { .. } => {
                    let _ = phone_sink.close().await;
                    break;
                }
                _ => continue,
            }
        }
    });

    tokio::select! {
        _ = phone_to_local => {}
        _ = local_to_phone => {}
    }

    // Cleanup
    relay.active_ws.lock().await.remove(&stream_id);

    Ok(())
}
