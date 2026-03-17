use axum::{
    Router,
    body::{Body, to_bytes},
    extract::{
        Path, Request, State,
        ws::{WebSocketUpgrade, rejection::WebSocketUpgradeRejection},
    },
    http::{StatusCode, Uri},
    response::{IntoResponse, Response},
    routing::any,
};
use deployment::Deployment;
use relay_hosts::{HostRelayProxyError, HostRelayWsConnection, RelayHostLookupError};
use uuid::Uuid;

use crate::DeploymentImpl;

type MaybeWsUpgrade = Result<WebSocketUpgrade, WebSocketUpgradeRejection>;

#[derive(Debug)]
pub enum RelayProxyError {
    BadRequest(&'static str),
    Unauthorized(&'static str),
    BadGateway(&'static str),
}

impl IntoResponse for RelayProxyError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            Self::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg),
            Self::Unauthorized(msg) => (StatusCode::UNAUTHORIZED, msg),
            Self::BadGateway(msg) => (StatusCode::BAD_GATEWAY, msg),
        };
        (status, message).into_response()
    }
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new().route("/host/{host_id}/{*tail}", any(proxy_host_request))
}

async fn proxy_host_request(
    State(deployment): State<DeploymentImpl>,
    Path((host_id, tail)): Path<(Uuid, String)>,
    ws_upgrade: MaybeWsUpgrade,
    mut request: Request,
) -> Response {
    let query = request.uri().query().map(str::to_owned);
    let upstream_uri = match upstream_api_uri(&tail, query.as_deref()) {
        Ok(uri) => uri,
        Err(error) => return error.into_response(),
    };
    *request.uri_mut() = upstream_uri;

    let response = match ws_upgrade {
        Ok(ws_upgrade) => forward_ws(&deployment, host_id, request, ws_upgrade).await,
        Err(_) => forward_http(&deployment, host_id, request).await,
    };

    response.unwrap_or_else(IntoResponse::into_response)
}

async fn forward_http(
    deployment: &DeploymentImpl,
    host_id: Uuid,
    request: Request,
) -> Result<Response, RelayProxyError> {
    let relay_hosts = deployment
        .relay_hosts()
        .map_err(|_| RelayProxyError::BadRequest("Remote relay API is not configured"))?;
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
        RelayProxyError::BadRequest("Invalid request body")
    })?;
    let relay_host = relay_hosts
        .host(host_id)
        .await
        .map_err(|error| map_host_lookup_error(host_id, error))?;

    let response = relay_host
        .proxy_http(&method, &target_path, &headers, &body_bytes)
        .await
        .map_err(|error| map_http_proxy_error(host_id, error))?;

    Ok(relay_http_response(response))
}

async fn forward_ws(
    deployment: &DeploymentImpl,
    host_id: Uuid,
    request: Request,
    ws_upgrade: WebSocketUpgrade,
) -> Result<Response, RelayProxyError> {
    let relay_hosts = deployment
        .relay_hosts()
        .map_err(|_| RelayProxyError::BadRequest("Remote relay API is not configured"))?;
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
    let relay_host = relay_hosts
        .host(host_id)
        .await
        .map_err(|error| map_host_lookup_error(host_id, error))?;

    let HostRelayWsConnection {
        upstream_socket,
        selected_protocol,
    } = relay_host
        .proxy_ws(&target_path, protocols.as_deref())
        .await
        .map_err(|error| map_ws_proxy_error(host_id, error))?;

    let mut ws = ws_upgrade;
    if let Some(protocol) = &selected_protocol {
        ws = ws.protocols([protocol.clone()]);
    }

    Ok(ws
        .on_upgrade(|socket| async move {
            if let Err(error) = upstream_socket.bridge_axum_client(socket).await {
                tracing::debug!(?error, "Relay WS bridge closed with error");
            }
        })
        .into_response())
}

fn map_http_proxy_error(host_id: Uuid, error: HostRelayProxyError) -> RelayProxyError {
    map_proxy_error(
        host_id,
        error,
        "Relay host HTTP request failed",
        "Relay host HTTP signing refresh failed",
        "Relay host HTTP session rotation failed",
        "Failed to call relay host",
    )
}

fn map_ws_proxy_error(host_id: Uuid, error: HostRelayProxyError) -> RelayProxyError {
    map_proxy_error(
        host_id,
        error,
        "Relay host WS connect failed",
        "Relay host WS signing refresh failed",
        "Relay host WS session rotation failed",
        "Failed to connect relay host WS",
    )
}

fn map_host_lookup_error(host_id: Uuid, error: RelayHostLookupError) -> RelayProxyError {
    match error {
        RelayHostLookupError::NotPaired => {
            RelayProxyError::BadRequest("No paired relay credentials for this host")
        }
        RelayHostLookupError::MissingClientMetadata => RelayProxyError::BadRequest(
            "This host pairing is missing required client metadata. Re-pair it.",
        ),
        RelayHostLookupError::MissingSigningMetadata => {
            tracing::warn!(
                host_id = %host_id,
                "Missing or invalid server_public_key_b64 for relay WS bridge"
            );
            RelayProxyError::BadRequest(
                "This host pairing is missing required signing metadata. Re-pair it.",
            )
        }
    }
}

fn map_proxy_error(
    host_id: Uuid,
    error: HostRelayProxyError,
    upstream_context: &'static str,
    signing_context: &'static str,
    remote_session_context: &'static str,
    upstream_message: &'static str,
) -> RelayProxyError {
    match error {
        HostRelayProxyError::RelayNotConfigured => {
            RelayProxyError::BadRequest("Remote relay API is not configured")
        }
        HostRelayProxyError::Authentication(error) => {
            tracing::warn!(?error, %host_id, "Failed to get access token for relay host proxy");
            RelayProxyError::Unauthorized("Authentication required for relay host proxy")
        }
        HostRelayProxyError::Upstream(error) => {
            tracing::warn!(?error, %host_id, "{upstream_context}");
            RelayProxyError::BadGateway(upstream_message)
        }
        HostRelayProxyError::SigningSession(error) => {
            tracing::warn!(?error, %host_id, "{signing_context}");
            RelayProxyError::BadGateway("Failed to initialize relay signing session")
        }
        HostRelayProxyError::RemoteSession(error) => {
            tracing::warn!(?error, %host_id, "{remote_session_context}");
            RelayProxyError::BadGateway("Failed to create relay remote session")
        }
    }
}

fn upstream_api_uri(tail: &str, query: Option<&str>) -> Result<Uri, RelayProxyError> {
    let mut uri = String::from("/api/");
    uri.push_str(tail);

    if let Some(query) = query {
        uri.push('?');
        uri.push_str(query);
    }

    uri.parse()
        .map_err(|_| RelayProxyError::BadRequest("Invalid rewritten relay path"))
}

fn is_hop_by_hop_header(name: &str) -> bool {
    name.eq_ignore_ascii_case("connection")
        || name.eq_ignore_ascii_case("keep-alive")
        || name.eq_ignore_ascii_case("proxy-authenticate")
        || name.eq_ignore_ascii_case("proxy-authorization")
        || name.eq_ignore_ascii_case("te")
        || name.eq_ignore_ascii_case("trailer")
        || name.eq_ignore_ascii_case("transfer-encoding")
        || name.eq_ignore_ascii_case("upgrade")
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
