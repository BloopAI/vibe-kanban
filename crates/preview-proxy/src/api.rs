use axum::{
    body::{Body, to_bytes},
    extract::{
        Request,
        ws::{WebSocketUpgrade, rejection::WebSocketUpgradeRejection},
    },
    http::StatusCode,
    response::{IntoResponse, Response},
};
use utils::http_headers::is_hop_by_hop_header;

use crate::{
    PreviewProxyService,
    proxy_common::{build_local_upstream_url, extract_ws_protocols, should_forward_request_header},
    ws_bridge::{bridge_ws, connect_upstream_ws},
};

type MaybeWsUpgrade = Result<WebSocketUpgrade, WebSocketUpgradeRejection>;

pub async fn proxy_api_request(
    service: &PreviewProxyService,
    target_port: u16,
    tail: String,
    ws_upgrade: MaybeWsUpgrade,
    request: Request,
) -> Response {
    match ws_upgrade {
        Ok(ws_upgrade) => forward_ws(target_port, tail, request, ws_upgrade).await,
        Err(_) => forward_http(service, target_port, tail, request).await,
    }
}

async fn forward_http(
    service: &PreviewProxyService,
    target_port: u16,
    tail: String,
    request: Request,
) -> Response {
    let (parts, body) = request.into_parts();
    let method = parts.method;
    let headers = parts.headers;
    let query = parts.uri.query().unwrap_or_default();
    let target_url = build_local_upstream_url("http", target_port, &tail, query);

    let client = service.http_client();
    let mut req_builder = client.request(
        reqwest::Method::from_bytes(method.as_str().as_bytes()).unwrap_or(reqwest::Method::GET),
        &target_url,
    );

    for (name, value) in &headers {
        if should_forward_request_header(name.as_str())
            && let Ok(v) = value.to_str()
        {
            req_builder = req_builder.header(name.as_str(), v);
        }
    }

    req_builder = req_builder.header("Accept-Encoding", "identity");

    let body_bytes = match to_bytes(body, 50 * 1024 * 1024).await {
        Ok(bytes) => bytes,
        Err(error) => {
            tracing::warn!(?error, "Failed to read preview route request body");
            return (StatusCode::BAD_REQUEST, "Invalid request body").into_response();
        }
    };

    if !body_bytes.is_empty() {
        req_builder = req_builder.body(body_bytes.to_vec());
    }

    let response = match req_builder.send().await {
        Ok(response) => response,
        Err(error) => {
            tracing::warn!(?error, %target_url, "Failed to call preview upstream");
            return (StatusCode::BAD_GATEWAY, "Preview upstream unavailable").into_response();
        }
    };

    relay_http_response(response)
}

async fn forward_ws(
    target_port: u16,
    tail: String,
    request: Request,
    ws_upgrade: WebSocketUpgrade,
) -> Response {
    let query = request.uri().query().unwrap_or_default();
    let ws_url = build_local_upstream_url("ws", target_port, &tail, query);
    let protocols = extract_ws_protocols(request.headers());

    let (upstream_ws, selected_protocol) =
        match connect_upstream_ws(ws_url, protocols.as_deref()).await {
            Ok(value) => value,
            Err(error) => {
                tracing::warn!(?error, "Failed to connect preview upstream WebSocket");
                return (StatusCode::BAD_GATEWAY, "Preview WebSocket unavailable").into_response();
            }
        };

    let mut ws = ws_upgrade;
    if let Some(protocol) = &selected_protocol {
        ws = ws.protocols([protocol.clone()]);
    }

    ws.on_upgrade(move |client_socket| async move {
        if let Err(error) = bridge_ws(upstream_ws, client_socket).await {
            tracing::debug!(?error, "Preview upstream WS bridge closed with error");
        }
    })
    .into_response()
}

fn relay_http_response(response: reqwest::Response) -> Response {
    let status = response.status();
    let response_headers = response.headers().clone();
    let body = Body::from_stream(response.bytes_stream());

    let mut builder = Response::builder().status(status);
    for (name, value) in &response_headers {
        if !is_hop_by_hop_header(name.as_str()) {
            builder = builder.header(name, value);
        }
    }

    builder.body(body).unwrap_or_else(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to build preview route response",
        )
            .into_response()
    })
}
