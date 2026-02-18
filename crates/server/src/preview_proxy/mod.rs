//! Preview Proxy Server Module
//!
//! Provides a separate HTTP server for serving preview iframe content.
//! This isolates preview content from the main application for security.
//!
//! The proxy listens on a separate port and routes requests based on the
//! Host header subdomain. A request to `{port}.localhost:{proxy_port}/path`
//! is forwarded to `localhost:{port}/path`.

use std::sync::OnceLock;

use axum::{
    Router,
    body::Body,
    extract::{FromRequestParts, Request, ws::WebSocketUpgrade},
    http::{HeaderMap, HeaderName, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use futures_util::{SinkExt, StreamExt};
use reqwest::Client;
use tokio_tungstenite::tungstenite::{self, client::IntoClientRequest};
use tower_http::validate_request::ValidateRequestHeaderLayer;

/// Global storage for the preview proxy port once assigned.
/// Set once during server startup, read by the config API.
static PROXY_PORT: OnceLock<u16> = OnceLock::new();

/// Shared HTTP client for proxying requests.
/// Reused across all requests to leverage connection pooling per upstream host:port.
static HTTP_CLIENT: OnceLock<Client> = OnceLock::new();

/// Get or initialize the shared HTTP client.
fn http_client() -> &'static Client {
    HTTP_CLIENT.get_or_init(|| {
        Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .expect("failed to build proxy HTTP client")
    })
}

/// Get the preview proxy port if set.
pub fn get_proxy_port() -> Option<u16> {
    PROXY_PORT.get().copied()
}

/// Set the preview proxy port. Can only be called once.
/// Returns the port if successfully set, or None if already set.
pub fn set_proxy_port(port: u16) -> Option<u16> {
    PROXY_PORT.set(port).ok().map(|()| port)
}

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
    "accept-encoding",
    "origin",
];

/// Headers that should be stripped from the proxied response.
const STRIP_RESPONSE_HEADERS: &[&str] = &[
    "content-security-policy",
    "content-security-policy-report-only",
    "x-frame-options",
    "x-content-type-options",
    "transfer-encoding",
    "connection",
    "content-encoding",
];

/// DevTools script injected before </body> in HTML responses.
/// Captures console, network, errors and sends via postMessage.
const DEVTOOLS_SCRIPT: &str = include_str!("devtools_script.js");

/// Bippy bundle script injected after <head> to install React DevTools hook
/// before React initializes. Provides fiber inspection utilities.
const BIPPY_BUNDLE: &str = include_str!("bippy_bundle.js");

/// Click-to-component detection script injected before </body>.
/// Enables inspect mode for detecting React component hierarchy.
const CLICK_TO_COMPONENT_SCRIPT: &str = include_str!("click_to_component_script.js");

/// Eruda DevTools initialization script. Initializes Eruda with dark theme
/// and listens for toggle commands from parent window.
const ERUDA_INIT: &str = include_str!("eruda_init.js");

fn extract_target_from_host(headers: &HeaderMap) -> Option<u16> {
    let host = headers.get(header::HOST)?.to_str().ok()?;
    let subdomain = host.split('.').next()?;
    subdomain.parse::<u16>().ok()
}

async fn subdomain_proxy(request: Request) -> Response {
    let target_port = match extract_target_from_host(request.headers()) {
        Some(port) => port,
        None => {
            return (StatusCode::BAD_REQUEST, "No valid port in Host subdomain").into_response();
        }
    };

    let path = request.uri().path().trim_start_matches('/').to_string();

    proxy_impl(target_port, path, request).await
}

async fn proxy_impl(target_port: u16, path_str: String, request: Request) -> Response {
    let (mut parts, body) = request.into_parts();

    // Extract query string and subprotocols before WebSocket upgrade.
    // Both are required: Vite 6+ needs ?token= for auth, and checks
    // Sec-WebSocket-Protocol: vite-hmr before accepting the upgrade.
    let query_string = parts.uri.query().map(|q| q.to_string());
    let ws_protocols: Option<String> = parts
        .headers
        .get("sec-websocket-protocol")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    if let Ok(ws) = WebSocketUpgrade::from_request_parts(&mut parts, &()).await {
        tracing::debug!(
            "WebSocket upgrade request for path: {} -> localhost:{}",
            path_str,
            target_port
        );

        let ws = if let Some(ref protocols) = ws_protocols {
            let protocol_list: Vec<String> =
                protocols.split(',').map(|p| p.trim().to_string()).collect();
            ws.protocols(protocol_list)
        } else {
            ws
        };

        return ws
            .on_upgrade(move |client_socket| async move {
                if let Err(e) = handle_ws_proxy(
                    client_socket,
                    target_port,
                    path_str,
                    query_string,
                    ws_protocols,
                )
                .await
                {
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

    let query_string = original_uri.query().unwrap_or_default();

    let target_url = if query_string.is_empty() {
        format!("http://localhost:{}/{}", target_port, path_str)
    } else {
        format!(
            "http://localhost:{}/{}?{}",
            target_port, path_str, query_string
        )
    };

    let client = http_client();

    let mut req_builder = client.request(
        reqwest::Method::from_bytes(method.as_str().as_bytes()).unwrap_or(reqwest::Method::GET),
        &target_url,
    );

    for (name, value) in headers.iter() {
        let name_lower = name.as_str().to_lowercase();
        if !SKIP_REQUEST_HEADERS.contains(&name_lower.as_str())
            && let Ok(v) = value.to_str()
        {
            req_builder = req_builder.header(name.as_str(), v);
        }
    }

    if let Some(host) = headers.get(header::HOST)
        && let Ok(host_str) = host.to_str()
    {
        req_builder = req_builder.header("X-Forwarded-Host", host_str);
    }
    req_builder = req_builder.header("X-Forwarded-Proto", "http");
    req_builder = req_builder.header("Accept-Encoding", "identity");

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

    let mut response_headers = HeaderMap::new();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default();
    let is_html = content_type.contains("text/html");

    for (name, value) in response.headers().iter() {
        let name_lower = name.as_str().to_lowercase();
        if !STRIP_RESPONSE_HEADERS.contains(&name_lower.as_str()) {
            if is_html && name_lower == "content-length" {
                continue;
            }
            if let (Ok(header_name), Ok(header_value)) = (
                HeaderName::try_from(name.as_str()),
                HeaderValue::from_bytes(value.as_bytes()),
            ) {
                response_headers.insert(header_name, header_value);
            }
        }
    }

    let status = StatusCode::from_u16(response.status().as_u16()).unwrap_or(StatusCode::OK);

    if is_html {
        match response.bytes().await {
            Ok(body_bytes) => {
                let mut html = String::from_utf8_lossy(&body_bytes).to_string();

                // Inject bippy bundle after <head> (must load before React)
                if let Some(pos) = html.to_lowercase().find("<head>") {
                    let head_end = pos + "<head>".len();
                    let bippy_tag = format!("<script>{}</script>", BIPPY_BUNDLE);
                    html.insert_str(head_end, &bippy_tag);
                }

                // Inject Eruda CDN, init, devtools and click-to-component scripts before </body>
                if let Some(pos) = html.to_lowercase().rfind("</body>") {
                    let scripts = format!(
                        "<script src=\"https://cdn.jsdelivr.net/npm/eruda@3.4.3/eruda.js\"></script><script>{}</script><script>{}</script><script>{}</script>",
                        ERUDA_INIT, DEVTOOLS_SCRIPT, CLICK_TO_COMPONENT_SCRIPT
                    );
                    html.insert_str(pos, &scripts);
                }

                let mut builder = Response::builder().status(status);
                for (name, value) in response_headers.iter() {
                    builder = builder.header(name, value);
                }

                builder.body(Body::from(html)).unwrap_or_else(|_| {
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "Failed to build response",
                    )
                        .into_response()
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
        let stream = response.bytes_stream();
        let body = Body::from_stream(stream);

        let mut builder = Response::builder().status(status);
        for (name, value) in response_headers.iter() {
            builder = builder.header(name, value);
        }

        builder.body(body).unwrap_or_else(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to build response",
            )
                .into_response()
        })
    }
}

async fn handle_ws_proxy(
    client_socket: axum::extract::ws::WebSocket,
    target_port: u16,
    path: String,
    query_string: Option<String>,
    ws_protocols: Option<String>,
) -> anyhow::Result<()> {
    let ws_url = match &query_string {
        Some(q) if !q.is_empty() => {
            format!("ws://localhost:{}/{}?{}", target_port, path, q)
        }
        _ => format!("ws://localhost:{}/{}", target_port, path),
    };
    tracing::debug!("Connecting to dev server WebSocket: {}", ws_url);

    let mut ws_request = ws_url.into_client_request()?;
    if let Some(ref protocols) = ws_protocols {
        ws_request
            .headers_mut()
            .insert("sec-websocket-protocol", protocols.parse()?);
    }
    let (dev_server_ws, _response) = tokio_tungstenite::connect_async(ws_request).await?;
    tracing::debug!("Connected to dev server WebSocket");

    let (mut client_sender, mut client_receiver) = client_socket.split();
    let (mut dev_sender, mut dev_receiver) = dev_server_ws.split();

    let client_to_dev = tokio::spawn(async move {
        while let Some(msg_result) = client_receiver.next().await {
            match msg_result {
                Ok(axum_msg) => {
                    let tungstenite_msg = match axum_msg {
                        axum::extract::ws::Message::Text(text) => {
                            tungstenite::Message::Text(text.to_string())
                        }
                        axum::extract::ws::Message::Binary(data) => {
                            tungstenite::Message::Binary(data.to_vec())
                        }
                        axum::extract::ws::Message::Ping(data) => {
                            tungstenite::Message::Ping(data.to_vec())
                        }
                        axum::extract::ws::Message::Pong(data) => {
                            tungstenite::Message::Pong(data.to_vec())
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
        .fallback(subdomain_proxy)
        .layer(ValidateRequestHeaderLayer::custom(
            crate::middleware::validate_origin,
        ))
}
