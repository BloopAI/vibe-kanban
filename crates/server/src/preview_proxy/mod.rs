//! Preview Proxy Server Module
//!
//! Provides a separate HTTP server for serving preview iframe content.
//! This isolates preview content from the main application for security.
//!
//! The proxy listens on a separate port (configurable via PREVIEW_PROXY_PORT env var)
//! and serves workspace preview content through controlled routes.

use std::sync::OnceLock;

use axum::{
    Router,
    body::Body,
    extract::{FromRequestParts, Path, Query, Request, ws::WebSocketUpgrade},
    http::{HeaderMap, HeaderName, HeaderValue, StatusCode, header},
    response::{Html, IntoResponse, Response},
    routing::{any, get},
};
use futures_util::{SinkExt, StreamExt};
use reqwest::Client;
use serde::Deserialize;
use tokio_tungstenite::tungstenite;

/// Global storage for the preview proxy port once assigned.
/// Set once during server startup, read by the config API.
static PROXY_PORT: OnceLock<u16> = OnceLock::new();

/// Get the preview proxy port if set.
pub fn get_proxy_port() -> Option<u16> {
    PROXY_PORT.get().copied()
}

/// Set the preview proxy port. Can only be called once.
/// Returns the port if successfully set, or None if already set.
pub fn set_proxy_port(port: u16) -> Option<u16> {
    PROXY_PORT.set(port).ok().map(|()| port)
}

const PROXY_PAGE_HTML: &str = include_str!("proxy_page.html");

/// Query params (target, path) are parsed client-side in the HTML.
async fn proxy_page_handler() -> Html<&'static str> {
    Html(PROXY_PAGE_HTML)
}

/// Query parameters for dev server entry proxy
#[derive(Debug, Deserialize)]
pub struct DevServerProxyQuery {
    /// Target port where the dev server is running
    pub target: u16,
}

/// Headers that should not be forwarded from the client request.
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
];

/// Headers that should be stripped from the proxied response.
const STRIP_RESPONSE_HEADERS: &[&str] = &[
    "content-security-policy",
    "content-security-policy-report-only",
    "x-frame-options",
    "x-content-type-options",
    "transfer-encoding",
    "connection",
];

/// Placeholder script injected before </body> in HTML responses.
const DEVTOOLS_PLACEHOLDER_SCRIPT: &str =
    "<script>/* vibe-kanban-devtools-placeholder */</script>";

async fn dev_server_entry_root(
    Query(query): Query<DevServerProxyQuery>,
    request: Request,
) -> Response {
    dev_server_entry_impl(String::new(), query.target, request).await
}

async fn dev_server_entry_path(
    Path(path): Path<String>,
    Query(query): Query<DevServerProxyQuery>,
    request: Request,
) -> Response {
    dev_server_entry_impl(path, query.target, request).await
}

async fn dev_server_entry_impl(path_str: String, target_port: u16, request: Request) -> Response {
    let (mut parts, body) = request.into_parts();

    if let Ok(ws) = WebSocketUpgrade::from_request_parts(&mut parts, &()).await {
        tracing::debug!(
            "WebSocket upgrade request for path: {} -> localhost:{}",
            path_str,
            target_port
        );

        return ws
            .on_upgrade(move |client_socket| async move {
                if let Err(e) = handle_ws_proxy(client_socket, target_port, path_str).await {
                    tracing::warn!("WebSocket proxy closed: {}", e);
                }
            })
            .into_response();
    }

    let request = Request::from_parts(parts, body);
    http_proxy_handler(target_port, path_str, request).await
}

async fn http_proxy_handler(target_port: u16, path_str: String, request: Request) -> Response {
    let (parts, body) = request.into_parts();
    let method = parts.method;
    let headers = parts.headers;
    let original_uri = parts.uri;

    let query_string = original_uri
        .query()
        .map(|q| {
            q.split('&')
                .filter(|pair| !pair.starts_with("target="))
                .collect::<Vec<_>>()
                .join("&")
        })
        .unwrap_or_default();

    let target_url = if query_string.is_empty() {
        format!("http://localhost:{}/{}", target_port, path_str)
    } else {
        format!(
            "http://localhost:{}/{}?{}",
            target_port, path_str, query_string
        )
    };

    let client = match Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            tracing::error!("Failed to create HTTP client: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to create HTTP client",
            )
                .into_response();
        }
    };

    let mut req_builder = client.request(
        reqwest::Method::from_bytes(method.as_str().as_bytes()).unwrap_or(reqwest::Method::GET),
        &target_url,
    );

    for (name, value) in headers.iter() {
        let name_lower = name.as_str().to_lowercase();
        if !SKIP_REQUEST_HEADERS.contains(&name_lower.as_str()) {
            if let Ok(v) = value.to_str() {
                req_builder = req_builder.header(name.as_str(), v);
            }
        }
    }

    if let Some(host) = headers.get(header::HOST) {
        if let Ok(host_str) = host.to_str() {
            req_builder = req_builder.header("X-Forwarded-Host", host_str);
        }
    }
    req_builder = req_builder.header("X-Forwarded-Proto", "http");

    let forwarded_for = headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("127.0.0.1");
    req_builder = req_builder.header("X-Forwarded-For", forwarded_for);

    let body_bytes = match axum::body::to_bytes(body, 50 * 1024 * 1024).await {
        Ok(b) => b,
        Err(e) => {
            tracing::error!("Failed to read request body: {}", e);
            return (StatusCode::BAD_REQUEST, "Failed to read request body").into_response();
        }
    };

    if !body_bytes.is_empty() {
        req_builder = req_builder.body(body_bytes.to_vec());
    }

    // Send the request
    let response = match req_builder.send().await {
        Ok(r) => r,
        Err(e) => {
            tracing::error!("Failed to proxy request to {}: {}", target_url, e);
            return (
                StatusCode::BAD_GATEWAY,
                format!("Dev server unreachable: {}", e),
            )
                .into_response();
        }
    };

    // Build response headers (stripping security headers)
    let mut response_headers = HeaderMap::new();
    let is_html = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|ct| ct.contains("text/html"))
        .unwrap_or(false);

    for (name, value) in response.headers().iter() {
        let name_lower = name.as_str().to_lowercase();
        if !STRIP_RESPONSE_HEADERS.contains(&name_lower.as_str()) {
            // Skip content-length for HTML since we may modify the body
            if is_html && name_lower == "content-length" {
                continue;
            }
            if let Ok(header_name) = HeaderName::try_from(name.as_str()) {
                if let Ok(header_value) = HeaderValue::from_bytes(value.as_bytes()) {
                    response_headers.insert(header_name, header_value);
                }
            }
        }
    }

    let status = StatusCode::from_u16(response.status().as_u16()).unwrap_or(StatusCode::OK);

    // Handle response body
    if is_html {
        // Buffer HTML response for script injection
        match response.bytes().await {
            Ok(body_bytes) => {
                let mut html = String::from_utf8_lossy(&body_bytes).to_string();

                // Inject script before </body>
                if let Some(pos) = html.to_lowercase().rfind("</body>") {
                    html.insert_str(pos, DEVTOOLS_PLACEHOLDER_SCRIPT);
                }

                let mut builder = Response::builder().status(status);
                for (name, value) in response_headers.iter() {
                    builder = builder.header(name, value);
                }

                builder.body(Body::from(html)).unwrap_or_else(|_| {
                    (StatusCode::INTERNAL_SERVER_ERROR, "Failed to build response").into_response()
                })
            }
            Err(e) => {
                tracing::error!("Failed to read HTML response: {}", e);
                (
                    StatusCode::BAD_GATEWAY,
                    "Failed to read response from dev server",
                )
                    .into_response()
            }
        }
    } else {
        // Stream non-HTML responses directly
        let stream = response.bytes_stream();
        let body = Body::from_stream(stream);

        let mut builder = Response::builder().status(status);
        for (name, value) in response_headers.iter() {
            builder = builder.header(name, value);
        }

        builder.body(body).unwrap_or_else(|_| {
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to build response").into_response()
        })
    }
}

/// WebSocket proxy handler for dev server HMR connections.
/// Detects WebSocket upgrade requests and proxies them to the target dev server.
#[allow(dead_code)]
async fn ws_proxy_handler(
    ws: WebSocketUpgrade,
    Path(path): Path<String>,
    Query(query): Query<DevServerProxyQuery>,
) -> impl IntoResponse {
    let target_port = query.target;
    let target_path = path.clone();

    tracing::debug!(
        "WebSocket upgrade request for path: {} -> localhost:{}",
        target_path,
        target_port
    );

    ws.on_upgrade(move |client_socket| async move {
        if let Err(e) = handle_ws_proxy(client_socket, target_port, target_path).await {
            tracing::warn!("WebSocket proxy closed: {}", e);
        }
    })
}

async fn handle_ws_proxy(
    client_socket: axum::extract::ws::WebSocket,
    target_port: u16,
    path: String,
) -> anyhow::Result<()> {
    let ws_url = format!("ws://localhost:{}/{}", target_port, path);
    tracing::debug!("Connecting to dev server WebSocket: {}", ws_url);

    let (dev_server_ws, _response) = tokio_tungstenite::connect_async(&ws_url).await?;
    tracing::debug!("Connected to dev server WebSocket");

    let (mut client_sender, mut client_receiver) = client_socket.split();
    let (mut dev_sender, mut dev_receiver) = dev_server_ws.split();

    let client_to_dev = tokio::spawn(async move {
        while let Some(msg_result) = client_receiver.next().await {
            match msg_result {
                Ok(axum_msg) => {
                    let tungstenite_msg = match axum_msg {
                        axum::extract::ws::Message::Text(text) => {
                            tungstenite::Message::Text(text.to_string().into())
                        }
                        axum::extract::ws::Message::Binary(data) => {
                            tungstenite::Message::Binary(data.to_vec().into())
                        }
                        axum::extract::ws::Message::Ping(data) => {
                            tungstenite::Message::Ping(data.to_vec().into())
                        }
                        axum::extract::ws::Message::Pong(data) => {
                            tungstenite::Message::Pong(data.to_vec().into())
                        }
                        axum::extract::ws::Message::Close(close_frame) => {
                            let close = close_frame.map(|cf| tungstenite::protocol::CloseFrame {
                                code: tungstenite::protocol::frame::coding::CloseCode::from(
                                    cf.code,
                                ),
                                reason: cf.reason.to_string().into(),
                            });
                            tungstenite::Message::Close(close)
                        }
                    };

                    if dev_sender.send(tungstenite_msg).await.is_err() {
                        break;
                    }
                }
                Err(e) => {
                    tracing::debug!("Client WebSocket receive error: {}", e);
                    break;
                }
            }
        }
        let _ = dev_sender.close().await;
    });

    let dev_to_client = tokio::spawn(async move {
        while let Some(msg_result) = dev_receiver.next().await {
            match msg_result {
                Ok(tungstenite_msg) => {
                    let axum_msg = match tungstenite_msg {
                        tungstenite::Message::Text(text) => {
                            axum::extract::ws::Message::Text(text.to_string().into())
                        }
                        tungstenite::Message::Binary(data) => {
                            axum::extract::ws::Message::Binary(data.to_vec().into())
                        }
                        tungstenite::Message::Ping(data) => {
                            axum::extract::ws::Message::Ping(data.to_vec().into())
                        }
                        tungstenite::Message::Pong(data) => {
                            axum::extract::ws::Message::Pong(data.to_vec().into())
                        }
                        tungstenite::Message::Close(close_frame) => {
                            let close = close_frame.map(|cf| axum::extract::ws::CloseFrame {
                                code: cf.code.into(),
                                reason: cf.reason.to_string().into(),
                            });
                            axum::extract::ws::Message::Close(close)
                        }
                        tungstenite::Message::Frame(_) => continue,
                    };

                    if client_sender.send(axum_msg).await.is_err() {
                        break;
                    }
                }
                Err(e) => {
                    tracing::debug!("Dev server WebSocket receive error: {}", e);
                    break;
                }
            }
        }
        let _ = client_sender.close().await;
    });

    tokio::select! {
        _ = client_to_dev => {
            tracing::debug!("Client to dev server forwarding completed");
        }
        _ = dev_to_client => {
            tracing::debug!("Dev server to client forwarding completed");
        }
    }

    Ok(())
}

pub fn router<S>() -> Router<S>
where
    S: Clone + Send + Sync + 'static,
{
    Router::new()
        .route("/proxy", get(proxy_page_handler))
        .route("/dev-server-entry/", any(dev_server_entry_root))
        .route("/dev-server-entry/{*path}", any(dev_server_entry_path))
}
