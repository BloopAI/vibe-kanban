use axum::http::HeaderMap;

pub const SKIP_REQUEST_HEADERS: &[&str] = &[
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

pub fn normalized_proxy_path(path: &str) -> &str {
    path.trim_start_matches('/')
}

pub fn should_forward_request_header(name: &str) -> bool {
    let name_lower = name.to_ascii_lowercase();
    !SKIP_REQUEST_HEADERS.contains(&name_lower.as_str())
}

pub fn build_local_upstream_url(scheme: &str, target_port: u16, path: &str, query: &str) -> String {
    let normalized_path = normalized_proxy_path(path);
    if normalized_path.is_empty() {
        if query.is_empty() {
            format!("{scheme}://localhost:{target_port}/")
        } else {
            format!("{scheme}://localhost:{target_port}/?{query}")
        }
    } else if query.is_empty() {
        format!("{scheme}://localhost:{target_port}/{normalized_path}")
    } else {
        format!("{scheme}://localhost:{target_port}/{normalized_path}?{query}")
    }
}

pub fn extract_ws_protocols(headers: &HeaderMap) -> Option<String> {
    headers
        .get("sec-websocket-protocol")
        .and_then(|value| value.to_str().ok())
        .map(ToOwned::to_owned)
}
