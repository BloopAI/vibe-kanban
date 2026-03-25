use axum::{
    Router,
    body::{Body, to_bytes},
    extract::{
        Path, Request, State,
        ws::{WebSocket, WebSocketUpgrade, rejection::WebSocketUpgradeRejection},
    },
    http::{StatusCode, Uri},
    response::{IntoResponse, Response},
    routing::any,
};
use deployment::Deployment;
use relay_hosts::HostRelayWsConnection;
use relay_tunnel_core::ws_io::ws_copy_bidirectional;
use relay_ws::SignedTungsteniteSocket;
use utils::http_headers::is_hop_by_hop_header;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

type MaybeWsUpgrade = Result<WebSocketUpgrade, WebSocketUpgradeRejection>;

pub(super) fn router() -> Router<DeploymentImpl> {
    Router::new().route("/host/{host_id}/{*tail}", any(proxy_host_request))
}

async fn proxy_host_request(
    State(deployment): State<DeploymentImpl>,
    Path((host_id, tail)): Path<(Uuid, String)>,
    ws_upgrade: MaybeWsUpgrade,
    mut request: Request,
) -> Result<Response, ApiError> {
    let query = request.uri().query().map(str::to_owned);
    let upstream_uri = upstream_api_uri(&tail, query.as_deref())?;
    *request.uri_mut() = upstream_uri;

    match ws_upgrade {
        Ok(ws_upgrade) => forward_ws(&deployment, host_id, request, ws_upgrade).await,
        Err(_) => forward_http(&deployment, host_id, request).await,
    }
}

async fn forward_http(
    deployment: &DeploymentImpl,
    host_id: Uuid,
    request: Request,
) -> Result<Response, ApiError> {
    let relay_hosts = deployment.relay_hosts()?;
    let (parts, body) = request.into_parts();
    let method = parts.method;
    let headers = parts.headers;
    let target_path = parts
        .uri
        .path_and_query()
        .map(|pq| pq.as_str())
        .unwrap_or("/")
        .to_string();
    let body_bytes = to_bytes(body, usize::MAX).await.map_err(|error| {
        tracing::warn!(?error, "Failed to read relay proxy request body");
        ApiError::BadRequest("Invalid request body".to_string())
    })?;
    let relay_host = relay_hosts.host(host_id).await?;
    let response = relay_host
        .proxy_http(&method, &target_path, &headers, &body_bytes)
        .await?;

    Ok(relay_http_response(response))
}

async fn forward_ws(
    deployment: &DeploymentImpl,
    host_id: Uuid,
    request: Request,
    ws_upgrade: WebSocketUpgrade,
) -> Result<Response, ApiError> {
    let relay_hosts = deployment.relay_hosts()?;
    let target_path = request
        .uri()
        .path_and_query()
        .map(|pq| pq.as_str())
        .unwrap_or("/")
        .to_string();
    let protocols = request
        .headers()
        .get("sec-websocket-protocol")
        .and_then(|v| v.to_str().ok())
        .map(ToOwned::to_owned);
    let relay_host = relay_hosts.host(host_id).await?;

    let HostRelayWsConnection {
        upstream_socket,
        selected_protocol,
    } = relay_host
        .proxy_ws(&target_path, protocols.as_deref())
        .await?;

    let mut ws = ws_upgrade;
    if let Some(protocol) = &selected_protocol {
        ws = ws.protocols([protocol.clone()]);
    }

    Ok(ws
        .on_upgrade(|socket| async move {
            if let Err(error) = bridge_ws(upstream_socket, socket).await {
                tracing::debug!(?error, "Relay WS bridge closed with error");
            }
        })
        .into_response())
}

fn upstream_api_uri(tail: &str, query: Option<&str>) -> Result<Uri, ApiError> {
    let mut uri = String::from("/api/");
    uri.push_str(tail);

    if let Some(query) = query {
        uri.push('?');
        uri.push_str(query);
    }

    uri.parse()
        .map_err(|_| ApiError::BadRequest("Invalid rewritten relay path".to_string()))
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
            "Failed to build relay proxy response",
        )
            .into_response()
    })
}

async fn bridge_ws(
    upstream: SignedTungsteniteSocket,
    client_socket: WebSocket,
) -> anyhow::Result<()> {
    ws_copy_bidirectional(
        client_socket,
        upstream,
        relay_tunnel_core::ws_io::axum_to_tungstenite,
        relay_tunnel_core::ws_io::tungstenite_to_axum,
    )
    .await
}
