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

fn env_flag_enabled(name: &str) -> bool {
    std::env::var(name).is_ok_and(|value| {
        value == "1"
            || value.eq_ignore_ascii_case("true")
            || value.eq_ignore_ascii_case("yes")
            || value.eq_ignore_ascii_case("on")
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

/// Collect response headers to forward to the iframe response.
/// Keeps duplicate headers (e.g. `Set-Cookie`) by preserving each entry.
fn collect_response_headers(
    upstream_headers: &HeaderMap,
    is_html: bool,
) -> Vec<(HeaderName, HeaderValue)> {
    let mut headers = Vec::new();

    for (name, value) in upstream_headers {
        let name_lower = name.as_str().to_ascii_lowercase();
        if STRIP_RESPONSE_HEADERS.contains(&name_lower.as_str()) {
            continue;
        }
        if is_html && name_lower == "content-length" {
            continue;
        }

        if let Ok(header_value) = HeaderValue::from_bytes(value.as_bytes()) {
            headers.push((name.clone(), header_value));
        }
    }

    headers
}

fn is_loopback_redirect_host(host: &str) -> bool {
    matches!(host, "localhost" | "127.0.0.1" | "0.0.0.0" | "::1")
}

fn trim_wrapping_quotes(value: &str) -> &str {
    if value.len() < 2 {
        return value;
    }

    let bytes = value.as_bytes();
    let first = bytes[0];
    let last = bytes[value.len() - 1];
    let has_matching_double = first == b'"' && last == b'"';
    let has_matching_single = first == b'\'' && last == b'\'';

    if has_matching_double || has_matching_single {
        &value[1..value.len() - 1]
    } else {
        value
    }
}

fn trim_trailing_redirect_punctuation(mut value: &str) -> &str {
    loop {
        let trimmed = value.trim_end();
        if trimmed.ends_with(',') || trimmed.ends_with(';') {
            value = trimmed[..trimmed.len() - 1].trim_end();
            continue;
        }
        return trimmed;
    }
}

fn normalize_redirect_like_url_token(value: &str) -> Option<String> {
    let mut candidate = value.trim();
    if candidate.is_empty() {
        return None;
    }

    candidate = trim_trailing_redirect_punctuation(candidate);

    loop {
        let unquoted = trim_wrapping_quotes(candidate).trim();
        if unquoted == candidate {
            break;
        }
        candidate = trim_trailing_redirect_punctuation(unquoted);
    }

    // We only rewrite plain URL tokens. Values containing spaces/quotes usually belong
    // to structured headers and must be left untouched.
    if candidate.is_empty()
        || candidate.chars().any(char::is_whitespace)
        || candidate.contains('"')
        || candidate.contains('\'')
    {
        return None;
    }

    Some(candidate.to_string())
}

fn normalize_refresh_url_token(raw_value: &str) -> &str {
    let without_trailing_punctuation = trim_trailing_redirect_punctuation(raw_value.trim());
    trim_wrapping_quotes(without_trailing_punctuation).trim()
}

fn rewrite_redirect_like_header_value(
    value: &str,
    target_port: u16,
    proxy_port: u16,
) -> Option<String> {
    let original_value = value.trim();
    if original_value.is_empty() {
        return None;
    }

    let normalized_value = normalize_redirect_like_url_token(original_value)?;

    // Relative redirects should stay relative so browser keeps current proxy origin.
    if (normalized_value.starts_with('/') && !normalized_value.starts_with("//"))
        || normalized_value.starts_with('?')
        || normalized_value.starts_with('#')
    {
        if normalized_value == original_value {
            return None;
        }
        return Some(normalized_value);
    }

    let mut parsed = if normalized_value.starts_with("//") {
        reqwest::Url::parse(&format!("http:{normalized_value}")).ok()?
    } else {
        reqwest::Url::parse(&normalized_value).ok()?
    };
    let host = parsed.host_str()?.to_ascii_lowercase();
    if !is_loopback_redirect_host(&host) {
        if normalized_value == original_value {
            return None;
        }
        return Some(normalized_value);
    }

    let parsed_port = parsed.port_or_known_default()?;
    if parsed_port != target_port {
        if normalized_value == original_value {
            return None;
        }
        return Some(normalized_value);
    }

    parsed.set_scheme("http").ok()?;
    parsed
        .set_host(Some(&format!("{target_port}.localhost")))
        .ok()?;
    parsed.set_port(Some(proxy_port)).ok()?;
    Some(parsed.to_string())
}

fn rewrite_refresh_header_value(value: &str, target_port: u16, proxy_port: u16) -> Option<String> {
    let mut segments: Vec<String> = value.split(';').map(|s| s.trim().to_string()).collect();
    if segments.len() < 2 {
        return None;
    }

    for segment in segments.iter_mut().skip(1) {
        let segment_lower = segment.to_ascii_lowercase();
        if !segment_lower.starts_with("url=") {
            continue;
        }

        let raw_value = segment[4..].trim();
        let raw_unquoted = normalize_refresh_url_token(raw_value);
        if raw_unquoted.is_empty() {
            continue;
        }

        if let Some(rewritten) =
            rewrite_redirect_like_header_value(raw_unquoted, target_port, proxy_port)
        {
            *segment = format!("url={rewritten}");
            return Some(segments.join("; "));
        }
    }

    None
}

fn is_redirect_like_header_name(name_lower: &str) -> bool {
    name_lower == "location"
        || name_lower == "content-location"
        || name_lower == "refresh"
        || name_lower.contains("redirect")
        || name_lower.contains("rewrite")
}

fn rewrite_redirect_like_headers(
    headers: &mut [(HeaderName, HeaderValue)],
    target_port: u16,
    proxy_port: Option<u16>,
) {
    let Some(proxy_port) = proxy_port else {
        return;
    };

    for (name, value) in headers.iter_mut() {
        let name_lower = name.as_str().to_ascii_lowercase();
        if !is_redirect_like_header_name(&name_lower) {
            continue;
        }

        let Ok(value_str) = value.to_str() else {
            continue;
        };

        let rewritten = if name_lower == "refresh" {
            rewrite_refresh_header_value(value_str, target_port, proxy_port)
        } else {
            rewrite_redirect_like_header_value(value_str, target_port, proxy_port)
        };

        if let Some(rewritten) = rewritten
            && let Ok(rewritten_header) = HeaderValue::from_str(&rewritten)
        {
            *value = rewritten_header;
        }
    }
}

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

    let is_rsc_request = headers.contains_key(header::HeaderName::from_static("rsc"));
    let is_get_request = method == axum::http::Method::GET;

    let client = http_client();

    let mut req_builder = client.request(
        reqwest::Method::from_bytes(method.as_str().as_bytes()).unwrap_or(reqwest::Method::GET),
        &target_url,
    );

    for (name, value) in headers.iter() {
        let name_lower = name.as_str().to_ascii_lowercase();
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

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default();
    let is_html = content_type.contains("text/html");

    let mut response_headers = collect_response_headers(response.headers(), is_html);
    rewrite_redirect_like_headers(&mut response_headers, target_port, get_proxy_port());

    let status = StatusCode::from_u16(response.status().as_u16()).unwrap_or(StatusCode::OK);

    // RSC redirect interception — BEFORE is_html branch to catch all response types.
    // Response is 200 with x-nextjs-redirect header → convert to 307 so
    //   the browser follows it natively (V1 approach, now in correct location).
    if is_get_request && is_rsc_request {
        // Scenario 2: 200 with x-nextjs-redirect — convert to 307 (V1 approach, now before is_html)
        if !status.is_redirection() {
            let rsc_redirect_target = response_headers
                .iter()
                .find(|(name, _)| name.as_str().eq_ignore_ascii_case("x-nextjs-redirect"))
                .and_then(|(_, value)| value.to_str().ok())
                .map(|v| v.to_owned());

            if let Some(ref redirect_target) = rsc_redirect_target {
                // Consume body before building new response
                let _ = response.bytes().await;

                let mut builder = Response::builder().status(StatusCode::TEMPORARY_REDIRECT);
                for (name, value) in &response_headers {
                    builder = builder.header(name.clone(), value.clone());
                }
                if let Ok(location_value) = HeaderValue::from_str(redirect_target) {
                    builder = builder.header(header::LOCATION, location_value);
                }

                return builder.body(Body::empty()).unwrap_or_else(|_| {
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "Failed to build RSC redirect response",
                    )
                        .into_response()
                });
            }
        }
    }

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
                    let nav_script_disabled = env_flag_enabled("VK_PREVIEW_DISABLE_NAV_SCRIPT");
                    let scripts = if nav_script_disabled {
                        format!(
                            "<script src=\"https://cdn.jsdelivr.net/npm/eruda@3.4.3/eruda.js\"></script><script>{}</script><script>{}</script>",
                            ERUDA_INIT, CLICK_TO_COMPONENT_SCRIPT
                        )
                    } else {
                        format!(
                            "<script src=\"https://cdn.jsdelivr.net/npm/eruda@3.4.3/eruda.js\"></script><script>{}</script><script>{}</script><script>{}</script>",
                            ERUDA_INIT, DEVTOOLS_SCRIPT, CLICK_TO_COMPONENT_SCRIPT
                        )
                    };
                    html.insert_str(pos, &scripts);
                }

                let mut builder = Response::builder().status(status);
                for (name, value) in &response_headers {
                    builder = builder.header(name.clone(), value.clone());
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
        // x-nextjs-redirect header already handled above (Path A)

        // For RSC GET requests, read body to detect redirect encoded in flight data
        if is_get_request && is_rsc_request {
            let body_bytes = response.bytes().await.unwrap_or_default();

            // V5: Detect redirect encoded in RSC flight data body
            if let Some(redirect_info) = detect_rsc_redirect_in_body(&body_bytes) {
                // Determine the final redirect URL
                let final_url = if redirect_info.url.starts_with("http://")
                    || redirect_info.url.starts_with("https://")
                {
                    // Absolute URL — rewrite to maintain proxy isolation
                    if let Some(proxy_port) = get_proxy_port() {
                        rewrite_redirect_like_header_value(
                            &redirect_info.url,
                            target_port,
                            proxy_port,
                        )
                        .unwrap_or_else(|| redirect_info.url.clone())
                    } else {
                        redirect_info.url.clone()
                    }
                } else {
                    // Relative URL — use as-is (browser resolves against proxy origin)
                    redirect_info.url.clone()
                };

                // Build redirect response with the status from the digest
                let redirect_status = StatusCode::from_u16(redirect_info.status_code)
                    .unwrap_or(StatusCode::TEMPORARY_REDIRECT);

                let mut builder = Response::builder().status(redirect_status);
                // Preserve all response headers (cookies, cache-control, etc.)
                for (name, value) in &response_headers {
                    builder = builder.header(name.clone(), value.clone());
                }
                // Set Location header
                if let Ok(location_value) = HeaderValue::from_str(&final_url) {
                    builder = builder.header(header::LOCATION, location_value);
                }

                return builder.body(Body::empty()).unwrap_or_else(|_| {
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "Failed to build RSC flight redirect response",
                    )
                        .into_response()
                });
            }

            let mut builder = Response::builder().status(status);
            for (name, value) in &response_headers {
                builder = builder.header(name.clone(), value.clone());
            }

            builder.body(Body::from(body_bytes)).unwrap_or_else(|_| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Failed to build response",
                )
                    .into_response()
            })
        } else {
            let stream = response.bytes_stream();
            let body = Body::from_stream(stream);

            let mut builder = Response::builder().status(status);
            for (name, value) in &response_headers {
                builder = builder.header(name.clone(), value.clone());
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

#[derive(Debug, Clone, PartialEq)]
struct RscRedirectInfo {
    url: String,
    redirect_type: String,
    status_code: u16,
}

/// Detects Next.js RSC redirect instructions encoded in flight data response bodies.
///
/// Next.js `redirect()` in Server Components serializes the redirect as an error
/// with digest `NEXT_REDIRECT;{type};{url};{statusCode};` inside the flight data.
/// This function scans the body for this pattern and extracts the redirect info.
///
/// Returns `None` if no redirect is found, if the body is too large (>1MB),
/// or if the digest format is invalid.
fn detect_rsc_redirect_in_body(body: &[u8]) -> Option<RscRedirectInfo> {
    // Skip bodies larger than 1MB
    if body.len() > 1_048_576 {
        return None;
    }

    let body_str = String::from_utf8_lossy(body);

    // Find the reliable marker: "digest":"NEXT_REDIRECT;
    let marker = "\"digest\":\"NEXT_REDIRECT;";
    let marker_pos = body_str.find(marker)?;

    // Extract the full digest value starting after '"digest":"'
    let digest_prefix = "\"digest\":\"";
    let digest_start = marker_pos + digest_prefix.len();
    let remaining = &body_str[digest_start..];

    // Find the closing unescaped quote
    let digest_end = remaining.find('"')?;
    let digest = &remaining[..digest_end];

    // Parse the digest: NEXT_REDIRECT;{type};{url};{statusCode};
    let parts: Vec<&str> = digest.split(';').collect();

    // Minimum: ["NEXT_REDIRECT", type, url, statusCode, ""]
    if parts.len() < 5 {
        return None;
    }

    if parts[0] != "NEXT_REDIRECT" {
        return None;
    }

    let redirect_type = parts[1];
    if redirect_type != "push" && redirect_type != "replace" {
        return None;
    }

    // Last element must be empty (trailing semicolon)
    if !parts[parts.len() - 1].is_empty() {
        return None;
    }

    // Second-to-last is the status code
    let status_str = parts[parts.len() - 2];
    let status_code: u16 = status_str.parse().ok()?;

    // Validate status code
    if !matches!(status_code, 301 | 302 | 303 | 307 | 308) {
        return None;
    }

    // URL is everything between type and status code (handles URLs with semicolons)
    let url = parts[2..parts.len() - 2].join(";");

    Some(RscRedirectInfo {
        url,
        redirect_type: redirect_type.to_string(),
        status_code,
    })
}

#[cfg(test)]
mod tests {
    use axum::http::header::{
        CACHE_CONTROL, CONTENT_LENGTH, CONTENT_SECURITY_POLICY, LOCATION, SET_COOKIE,
    };

    use super::*;

    #[test]
    fn collect_response_headers_preserves_multiple_set_cookie_values() {
        let mut upstream_headers = HeaderMap::new();
        upstream_headers.append(SET_COOKIE, HeaderValue::from_static("first=1; Path=/"));
        upstream_headers.append(SET_COOKIE, HeaderValue::from_static("second=2; Path=/"));

        let proxied = collect_response_headers(&upstream_headers, false);
        let set_cookie_values: Vec<Vec<u8>> = proxied
            .iter()
            .filter(|(name, _)| *name == SET_COOKIE)
            .map(|(_, value)| value.as_bytes().to_vec())
            .collect();

        assert_eq!(
            set_cookie_values,
            vec![b"first=1; Path=/".to_vec(), b"second=2; Path=/".to_vec()]
        );
    }

    #[test]
    fn response_builder_preserves_multiple_set_cookie_values() {
        let mut upstream_headers = HeaderMap::new();
        upstream_headers.append(SET_COOKIE, HeaderValue::from_static("first=1; Path=/"));
        upstream_headers.append(SET_COOKIE, HeaderValue::from_static("second=2; Path=/"));

        let response_headers = collect_response_headers(&upstream_headers, false);

        let mut builder = Response::builder().status(StatusCode::OK);
        for (name, value) in &response_headers {
            builder = builder.header(name.clone(), value.clone());
        }
        let response = builder.body(Body::empty()).expect("response builds");

        assert_eq!(response.headers().get_all(SET_COOKIE).iter().count(), 2);
    }

    #[test]
    fn collect_response_headers_preserves_mixed_headers_and_three_cookies() {
        let mut upstream_headers = HeaderMap::new();
        upstream_headers.append(SET_COOKIE, HeaderValue::from_static("first=1; Path=/"));
        upstream_headers.append(CACHE_CONTROL, HeaderValue::from_static("no-store"));
        upstream_headers.append(SET_COOKIE, HeaderValue::from_static("second=2; Path=/"));
        upstream_headers.append(SET_COOKIE, HeaderValue::from_static("third=3; Path=/"));
        upstream_headers.insert("x-custom-header", HeaderValue::from_static("present"));

        let proxied = collect_response_headers(&upstream_headers, false);

        assert_eq!(
            proxied
                .iter()
                .filter(|(name, _)| *name == SET_COOKIE)
                .count(),
            3
        );
        assert!(
            proxied.iter().any(|(name, value)| *name == CACHE_CONTROL
                && value == HeaderValue::from_static("no-store"))
        );
        assert!(proxied.iter().any(|(name, value)| name == "x-custom-header"
            && value == HeaderValue::from_static("present")));
    }

    #[test]
    fn collect_response_headers_drops_content_length_for_html_only() {
        let mut upstream_headers = HeaderMap::new();
        upstream_headers.insert(CONTENT_LENGTH, HeaderValue::from_static("123"));

        let html_headers = collect_response_headers(&upstream_headers, true);
        assert!(html_headers.iter().all(|(name, _)| *name != CONTENT_LENGTH));

        let non_html_headers = collect_response_headers(&upstream_headers, false);
        assert_eq!(non_html_headers.len(), 1);
        assert_eq!(non_html_headers[0].0, CONTENT_LENGTH);
    }

    #[test]
    fn collect_response_headers_strips_blocked_headers() {
        let mut upstream_headers = HeaderMap::new();
        upstream_headers.insert(
            CONTENT_SECURITY_POLICY,
            HeaderValue::from_static("frame-ancestors 'none'"),
        );

        let proxied = collect_response_headers(&upstream_headers, false);
        assert!(
            proxied
                .iter()
                .all(|(name, _)| *name != CONTENT_SECURITY_POLICY)
        );
    }

    #[test]
    fn rewrite_redirect_like_header_value_rewrites_loopback_absolute_url() {
        let rewritten = rewrite_redirect_like_header_value(
            "http://localhost:4000/generate?from=auth#done",
            4000,
            3009,
        );

        assert_eq!(
            rewritten.as_deref(),
            Some("http://4000.localhost:3009/generate?from=auth#done")
        );
    }

    #[test]
    fn rewrite_redirect_like_header_value_keeps_relative_and_non_loopback_urls() {
        assert_eq!(
            rewrite_redirect_like_header_value("/generate", 4000, 3009),
            None
        );
        assert_eq!(
            rewrite_redirect_like_header_value("?from=auth", 4000, 3009),
            None
        );
        assert_eq!(
            rewrite_redirect_like_header_value("https://example.com/generate", 4000, 3009),
            None
        );
    }

    #[test]
    fn rewrite_redirect_like_header_value_rewrites_scheme_relative_loopback_url() {
        let rewritten = rewrite_redirect_like_header_value("//localhost:4000/generate", 4000, 3009);

        assert_eq!(
            rewritten.as_deref(),
            Some("http://4000.localhost:3009/generate")
        );
    }

    #[test]
    fn rewrite_refresh_header_value_rewrites_embedded_url() {
        let rewritten = rewrite_refresh_header_value(
            "0; URL='http://localhost:4000/generate?from=auth'",
            4000,
            3009,
        );

        assert_eq!(
            rewritten.as_deref(),
            Some("0; url=http://4000.localhost:3009/generate?from=auth")
        );
    }

    #[test]
    fn rewrite_refresh_header_value_handles_trailing_comma_in_quoted_url() {
        let rewritten = rewrite_refresh_header_value(
            "0; URL=\"http://localhost:4000/?_refresh=7\",",
            4000,
            3009,
        );

        assert_eq!(
            rewritten.as_deref(),
            Some("0; url=http://4000.localhost:3009/?_refresh=7")
        );
    }

    #[test]
    fn rewrite_redirect_like_header_value_cleans_quoted_relative_url() {
        let rewritten = rewrite_redirect_like_header_value("\"/generate\",", 4000, 3009);

        assert_eq!(rewritten.as_deref(), Some("/generate"));
    }

    #[test]
    fn rewrite_redirect_like_header_value_cleans_and_rewrites_quoted_absolute_url() {
        let rewritten =
            rewrite_redirect_like_header_value("\"http://localhost:4000/generate\",", 4000, 3009);

        assert_eq!(
            rewritten.as_deref(),
            Some("http://4000.localhost:3009/generate")
        );
    }

    #[test]
    fn rewrite_redirect_like_header_value_skips_structured_values() {
        let rewritten = rewrite_redirect_like_header_value(
            "url=\"http://localhost:4000/generate\", mode=replace",
            4000,
            3009,
        );

        assert_eq!(rewritten, None);
    }

    #[test]
    fn rewrite_redirect_like_headers_rewrites_generic_redirect_headers_only() {
        let mut headers = vec![
            (
                LOCATION,
                HeaderValue::from_static("http://localhost:4000/generate"),
            ),
            (
                HeaderName::from_static("x-auth-redirect-url"),
                HeaderValue::from_static("http://localhost:4000/generate"),
            ),
            (
                HeaderName::from_static("refresh"),
                HeaderValue::from_static("0; url=http://localhost:4000/generate"),
            ),
            (
                HeaderName::from_static("x-custom-header"),
                HeaderValue::from_static("http://localhost:4000/keep"),
            ),
        ];

        rewrite_redirect_like_headers(&mut headers, 4000, Some(3009));

        assert_eq!(
            headers[0].1,
            HeaderValue::from_static("http://4000.localhost:3009/generate")
        );
        assert_eq!(
            headers[1].1,
            HeaderValue::from_static("http://4000.localhost:3009/generate")
        );
        assert_eq!(
            headers[2].1,
            HeaderValue::from_static("0; url=http://4000.localhost:3009/generate")
        );
        assert_eq!(
            headers[3].1,
            HeaderValue::from_static("http://localhost:4000/keep")
        );
    }

    #[test]
    fn rewrite_redirect_like_headers_rewrites_rewrite_headers_and_keeps_plain_url_headers() {
        let mut headers = vec![
            (
                HeaderName::from_static("x-router-rewrite"),
                HeaderValue::from_static("http://localhost:4000/generate"),
            ),
            (
                HeaderName::from_static("x-target-url"),
                HeaderValue::from_static("http://localhost:4000/generate"),
            ),
        ];

        rewrite_redirect_like_headers(&mut headers, 4000, Some(3009));

        assert_eq!(
            headers[0].1,
            HeaderValue::from_static("http://4000.localhost:3009/generate")
        );
        assert_eq!(
            headers[1].1,
            HeaderValue::from_static("http://localhost:4000/generate")
        );
    }

    #[test]
    fn is_redirect_like_header_name_matches_nextjs_redirect() {
        assert!(is_redirect_like_header_name("x-nextjs-redirect"));
        assert!(!is_redirect_like_header_name("x-nextjs-data"));
        assert!(!is_redirect_like_header_name("rsc"));
    }

    #[test]
    fn is_redirect_like_header_name_matches_action_redirect() {
        // x-action-redirect contains "redirect" so it matches,
        // but our interception logic specifically looks for x-nextjs-redirect
        assert!(is_redirect_like_header_name("x-action-redirect"));
    }

    #[test]
    fn rewrite_redirect_like_headers_rewrites_nextjs_redirect() {
        let mut headers = vec![(
            HeaderName::from_static("x-nextjs-redirect"),
            HeaderValue::from_static("http://localhost:4000/generate"),
        )];

        rewrite_redirect_like_headers(&mut headers, 4000, Some(3009));

        assert_eq!(
            headers[0].1,
            HeaderValue::from_static("http://4000.localhost:3009/generate")
        );
    }

    #[test]
    fn collect_response_headers_preserves_nextjs_redirect() {
        let mut upstream_headers = HeaderMap::new();
        upstream_headers.insert(
            HeaderName::from_static("x-nextjs-redirect"),
            HeaderValue::from_static("/generate"),
        );

        let proxied = collect_response_headers(&upstream_headers, false);
        assert_eq!(proxied.len(), 1);
        assert_eq!(proxied[0].0, "x-nextjs-redirect");
        assert_eq!(proxied[0].1, "/generate");
    }

    #[test]
    fn rewrite_redirect_like_headers_preserves_relative_nextjs_redirect() {
        let mut headers = vec![(
            HeaderName::from_static("x-nextjs-redirect"),
            HeaderValue::from_static("/generate"),
        )];

        rewrite_redirect_like_headers(&mut headers, 4000, Some(3009));

        // Relative URLs are NOT rewritten — only absolute loopback URLs are
        assert_eq!(headers[0].1, HeaderValue::from_static("/generate"));
    }

    #[test]
    fn test_detect_rsc_redirect_basic() {
        let body = b"0:\"$Sreact.suspense\"\n1:I[\"123\",[]]\"]\n3:E{\"digest\":\"NEXT_REDIRECT;replace;/generate;307;\",\"message\":\"NEXT_REDIRECT\"}";
        let result = detect_rsc_redirect_in_body(body);
        assert_eq!(
            result,
            Some(RscRedirectInfo {
                url: "/generate".to_string(),
                redirect_type: "replace".to_string(),
                status_code: 307,
            })
        );
    }

    #[test]
    fn test_detect_rsc_redirect_url_with_semicolons() {
        let body = b"{\"digest\":\"NEXT_REDIRECT;push;/path;with;semicolons;308;\"}";
        let result = detect_rsc_redirect_in_body(body);
        assert_eq!(
            result,
            Some(RscRedirectInfo {
                url: "/path;with;semicolons".to_string(),
                redirect_type: "push".to_string(),
                status_code: 308,
            })
        );
    }

    #[test]
    fn test_detect_rsc_redirect_false_positive_no_json_prefix() {
        let body = b"The error NEXT_REDIRECT; was logged";
        let result = detect_rsc_redirect_in_body(body);
        assert_eq!(result, None);
    }

    #[test]
    fn test_detect_rsc_redirect_body_size_cap() {
        let mut body = vec![0u8; 1_048_577];
        let payload = b"{\"digest\":\"NEXT_REDIRECT;replace;/generate;307;\"}";
        body[..payload.len()].copy_from_slice(payload);
        let result = detect_rsc_redirect_in_body(&body);
        assert_eq!(result, None);
    }

    #[test]
    fn test_detect_rsc_redirect_invalid_type() {
        let body = b"{\"digest\":\"NEXT_REDIRECT;invalid;/url;307;\"}";
        let result = detect_rsc_redirect_in_body(body);
        assert_eq!(result, None);
    }

    #[test]
    fn test_detect_rsc_redirect_invalid_status_code() {
        let body = b"{\"digest\":\"NEXT_REDIRECT;replace;/url;999;\"}";
        let result = detect_rsc_redirect_in_body(body);
        assert_eq!(result, None);
    }

    #[test]
    fn test_detect_rsc_redirect_permanent_redirect() {
        let body = b"{\"digest\":\"NEXT_REDIRECT;replace;/permanent;301;\"}";
        let result = detect_rsc_redirect_in_body(body);
        assert_eq!(
            result,
            Some(RscRedirectInfo {
                url: "/permanent".to_string(),
                redirect_type: "replace".to_string(),
                status_code: 301,
            })
        );
    }

    #[test]
    fn test_detect_rsc_redirect_absolute_url() {
        let body = b"{\"digest\":\"NEXT_REDIRECT;push;https://example.com/callback;307;\"}";
        let result = detect_rsc_redirect_in_body(body);
        assert_eq!(
            result,
            Some(RscRedirectInfo {
                url: "https://example.com/callback".to_string(),
                redirect_type: "push".to_string(),
                status_code: 307,
            })
        );
    }

    #[test]
    fn test_detect_rsc_redirect_empty_body() {
        let result = detect_rsc_redirect_in_body(b"");
        assert_eq!(result, None);
    }

    #[test]
    fn test_detect_rsc_redirect_no_redirect_in_body() {
        let body = b"0:\"$Sreact.suspense\"\n1:I[\"456\",[]]\"]\n2:{\"name\":\"MyComponent\"}";
        let result = detect_rsc_redirect_in_body(body);
        assert_eq!(result, None);
    }
}
