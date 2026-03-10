use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::Context as _;
use axum::{
    body::{Body, to_bytes},
    extract::{
        Request,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    http::{HeaderMap, HeaderName, Method, StatusCode},
    response::{IntoResponse, Response},
};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use deployment::Deployment;
use ed25519_dalek::{Signer, SigningKey, VerifyingKey};
use futures_util::{SinkExt, StreamExt};
use local_deployment::RelayHostCredentials;
use relay_control::{
    signed_ws::{RelayTransportMessage, RelayWsMessageType, SignedWebSocket, signed_websocket},
    signing::{
        self, NONCE_HEADER, REQUEST_SIGNATURE_HEADER, RequestSignature, SIGNING_SESSION_HEADER,
        TIMESTAMP_HEADER,
    },
};
use tokio::net::TcpStream;
use tokio_tungstenite::{
    MaybeTlsStream, WebSocketStream,
    tungstenite::{self, client::IntoClientRequest},
};
use trusted_key_auth::{refresh::build_refresh_message, trusted_keys::parse_public_key_base64};
use uuid::Uuid;

use crate::{
    DeploymentImpl,
    relay::{
        RELAY_HEADER,
        api::{RelayApiClient, RemoteSession},
        relay_session_url,
    },
    routes::relay_auth::{RefreshRelaySigningSessionRequest, RefreshRelaySigningSessionResponse},
};

type SignedUpstreamSocket =
    SignedWebSocket<WebSocketStream<MaybeTlsStream<TcpStream>>, tungstenite::Message>;

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

pub struct RelayConnection {
    deployment: DeploymentImpl,
    host_id: Uuid,
    relay_client: RelayApiClient,
    remote_session: RemoteSession,
    signing_key: SigningKey,
    credentials: RelayHostCredentials,
    signing_session_id: String,
}

impl RelayConnection {
    pub async fn for_host(
        deployment: &DeploymentImpl,
        host_id: Uuid,
    ) -> Result<Self, RelayProxyError> {
        let credentials = deployment.get_relay_host_credentials(host_id).await.ok_or(
            RelayProxyError::BadRequest("No paired relay credentials for this host"),
        )?;

        let remote_client = deployment
            .remote_client()
            .map_err(|_| RelayProxyError::BadRequest("Remote relay API is not configured"))?;
        let access_token = remote_client.access_token().await.map_err(|error| {
            tracing::warn!(?error, "Failed to get access token for relay host proxy");
            RelayProxyError::Unauthorized("Authentication required for relay host proxy")
        })?;
        let relay_client = RelayApiClient::new(access_token);

        let remote_session =
            get_or_create_cached_remote_session(deployment, &relay_client, host_id).await?;

        let signing_key = deployment.relay_signing().signing_key().clone();
        let signing_session_id = get_or_create_cached_signing_session(
            deployment,
            &relay_client,
            &remote_session,
            host_id,
            &credentials,
            &signing_key,
        )
        .await?;

        Ok(Self {
            deployment: deployment.clone(),
            host_id,
            relay_client,
            remote_session,
            signing_key,
            credentials,
            signing_session_id,
        })
    }

    /// Sign and forward an HTTP request to the relay host. Retries on auth failure.
    ///
    /// The request URI should already be rewritten to the target path (e.g. `/api/...`).
    pub async fn forward_http(&mut self, request: Request) -> Result<Response, RelayProxyError> {
        let (parts, body) = request.into_parts();
        let target_path = parts
            .uri
            .path_and_query()
            .map(|pq| pq.as_str())
            .unwrap_or("/");
        let body_bytes = to_bytes(body, usize::MAX).await.map_err(|error| {
            tracing::warn!(?error, "Failed to read relay proxy request body");
            RelayProxyError::BadRequest("Invalid request body")
        })?;

        let mut response = self
            .send_signed_http(&parts.method, target_path, &parts.headers, &body_bytes)
            .await
            .map_err(|error| {
                tracing::warn!(?error, host_id = %self.host_id, "Relay host HTTP request failed");
                RelayProxyError::BadGateway("Failed to call relay host")
            })?;

        if is_auth_failure_status(response.status()) && self.try_refresh().await {
            response = self
                .send_signed_http(&parts.method, target_path, &parts.headers, &body_bytes)
                .await
                .map_err(|error| {
                    tracing::warn!(?error, host_id = %self.host_id, "Relay host HTTP retry failed");
                    RelayProxyError::BadGateway("Failed to call relay host")
                })?;
        }

        if is_auth_failure_status(response.status()) && self.rotate_remote_session().await {
            response = self
                .send_signed_http(&parts.method, target_path, &parts.headers, &body_bytes)
                .await
                .map_err(|error| {
                    tracing::warn!(?error, host_id = %self.host_id, "Relay host HTTP retry after session rotation failed");
                    RelayProxyError::BadGateway("Failed to call relay host")
                })?;
        }

        Ok(relay_http_response(response))
    }

    /// Connect a signed WebSocket through the relay and bridge it with the
    /// client upgrade, returning the final HTTP response.
    ///
    /// The request URI should already be rewritten to the target path.
    pub async fn forward_ws(
        &mut self,
        request: Request,
        ws_upgrade: WebSocketUpgrade,
    ) -> Result<Response, RelayProxyError> {
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

        let (upstream_socket, selected_protocol) = self
            .connect_ws_with_retry(&target_path, protocols.as_deref())
            .await?;

        let mut ws = ws_upgrade;
        if let Some(p) = &selected_protocol {
            ws = ws.protocols([p.clone()]);
        }

        Ok(ws
            .on_upgrade(|socket| async move {
                if let Err(error) = bridge_ws(upstream_socket, socket).await {
                    tracing::debug!(?error, "Relay WS bridge closed with error");
                }
            })
            .into_response())
    }

    // -----------------------------------------------------------------------
    // Private
    // -----------------------------------------------------------------------

    fn server_verify_key(&self) -> Result<VerifyingKey, RelayProxyError> {
        self.credentials
            .server_public_key_b64
            .as_deref()
            .and_then(|key| parse_public_key_base64(key).ok())
            .ok_or_else(|| {
                tracing::warn!(host_id = %self.host_id, "Missing or invalid server_public_key_b64 for relay WS bridge");
                RelayProxyError::BadRequest(
                    "This host pairing is missing required signing metadata. Re-pair it.",
                )
            })
    }

    async fn connect_ws_with_retry(
        &mut self,
        target_path: &str,
        protocols: Option<&str>,
    ) -> Result<(SignedUpstreamSocket, Option<String>), RelayProxyError> {
        let server_verify_key = self.server_verify_key()?;

        match self
            .connect_upstream_ws(target_path, protocols, server_verify_key)
            .await
        {
            Ok(result) => return Ok(result),
            Err(WsConnectError::AuthFailure) if self.try_refresh().await => {
                match self
                    .connect_upstream_ws(target_path, protocols, server_verify_key)
                    .await
                {
                    Ok(result) => return Ok(result),
                    Err(WsConnectError::AuthFailure) => {}
                    Err(error) => {
                        tracing::warn!(?error, host_id = %self.host_id, "Relay host WS retry failed after signing refresh");
                        return Err(RelayProxyError::BadGateway(
                            "Failed to connect relay host WS",
                        ));
                    }
                }
            }
            Err(WsConnectError::AuthFailure) => {}
            Err(error) => {
                tracing::warn!(?error, host_id = %self.host_id, "Relay host WS connect failed");
                return Err(RelayProxyError::BadGateway(
                    "Failed to connect relay host WS",
                ));
            }
        }

        if !self.rotate_remote_session().await {
            return Err(RelayProxyError::BadGateway(
                "Failed to connect relay host WS",
            ));
        }

        self.connect_upstream_ws(target_path, protocols, server_verify_key)
            .await
            .map_err(|error| {
                tracing::warn!(?error, host_id = %self.host_id, "Relay host WS retry failed after session rotation");
                RelayProxyError::BadGateway("Failed to connect relay host WS")
            })
    }

    /// Connect to the upstream relay host WebSocket and wrap it in a signed
    /// channel, returning the signed socket and negotiated protocol.
    async fn connect_upstream_ws(
        &self,
        target_path: &str,
        protocols: Option<&str>,
        server_verify_key: VerifyingKey,
    ) -> Result<(SignedUpstreamSocket, Option<String>), WsConnectError> {
        let request_signature = signing::build_request_signature(
            &self.signing_key,
            &self.signing_session_id,
            "GET",
            target_path,
            &[],
        );

        let relay_base = relay_session_url(self.remote_session.host_id, self.remote_session.id)
            .ok_or_else(|| anyhow::anyhow!("VK_SHARED_RELAY_API_BASE is not configured"))
            .map_err(WsConnectError::Other)?;
        let ws_url = relay_tunnel::http_to_ws_url(&format!("{relay_base}{target_path}"))
            .map_err(WsConnectError::Other)?;
        let mut ws_request = ws_url
            .into_client_request()
            .context("Failed to build relay upstream WS request")
            .map_err(WsConnectError::Other)?;

        if let Some(value) = protocols {
            ws_request.headers_mut().insert(
                "sec-websocket-protocol",
                value
                    .parse()
                    .map_err(anyhow::Error::from)
                    .map_err(WsConnectError::Other)?,
            );
        }

        set_ws_signing_headers(ws_request.headers_mut(), &request_signature);

        let (stream, response) = match tokio_tungstenite::connect_async(ws_request).await {
            Ok(result) => result,
            Err(tungstenite::Error::Http(response)) => {
                let status = response.status();
                if is_auth_failure_status(status) {
                    return Err(WsConnectError::AuthFailure);
                }
                return Err(WsConnectError::Other(anyhow::anyhow!(
                    "Relay WS handshake failed with status {status}"
                )));
            }
            Err(error) => return Err(WsConnectError::Other(anyhow::Error::from(error))),
        };

        let selected_protocol = response
            .headers()
            .get("sec-websocket-protocol")
            .and_then(|value| value.to_str().ok())
            .map(ToOwned::to_owned);

        let upstream_socket = signed_websocket(
            self.signing_session_id.clone(),
            request_signature.nonce,
            self.signing_key.clone(),
            server_verify_key,
            stream,
        );

        Ok((upstream_socket, selected_protocol))
    }

    async fn send_signed_http(
        &self,
        method: &Method,
        target_path: &str,
        headers: &HeaderMap,
        body: &[u8],
    ) -> anyhow::Result<reqwest::Response> {
        let signature = signing::build_request_signature(
            &self.signing_key,
            &self.signing_session_id,
            method.as_str(),
            target_path,
            body,
        );
        let relay_base = relay_session_url(self.remote_session.host_id, self.remote_session.id)
            .ok_or_else(|| anyhow::anyhow!("VK_SHARED_RELAY_API_BASE is not configured"))?;
        let url = format!("{relay_base}{target_path}");
        let reqwest_method = reqwest::Method::from_bytes(method.as_str().as_bytes())
            .context("Unsupported HTTP method for relay request")?;
        let mut builder = reqwest::Client::new().request(reqwest_method, url);

        for (name, value) in headers {
            if should_forward_request_header(name) {
                builder = builder.header(name, value);
            }
        }

        builder = builder
            .header(RELAY_HEADER, "1")
            .header(SIGNING_SESSION_HEADER, &signature.signing_session_id)
            .header(TIMESTAMP_HEADER, signature.timestamp.to_string())
            .header(NONCE_HEADER, &signature.nonce)
            .header(REQUEST_SIGNATURE_HEADER, &signature.signature_b64);

        if !body.is_empty() {
            builder = builder.body(body.to_vec());
        }

        builder.send().await.context("Relay request to host failed")
    }

    async fn try_refresh(&mut self) -> bool {
        let client_id = match self
            .credentials
            .client_id
            .as_ref()
            .and_then(|value| value.parse::<Uuid>().ok())
        {
            Some(id) => id,
            None => return false,
        };
        let refreshed = match refresh_signing_session(
            &self.relay_client,
            &self.remote_session,
            &self.signing_key,
            client_id,
        )
        .await
        {
            Ok(value) => value,
            Err(error) => {
                tracing::warn!(
                    ?error,
                    host_id = %self.host_id,
                    "Failed to refresh relay signing session for host proxy request"
                );
                return false;
            }
        };

        let updated_signing_session_id = refreshed.signing_session_id.to_string();
        self.deployment
            .cache_relay_signing_session_id(self.host_id, updated_signing_session_id.clone())
            .await;
        self.signing_session_id = updated_signing_session_id;
        true
    }

    async fn rotate_remote_session(&mut self) -> bool {
        self.deployment
            .invalidate_cached_relay_remote_session_id(self.host_id)
            .await;

        let remote_session = match self.relay_client.create_session(self.host_id).await {
            Ok(value) => value,
            Err(error) => {
                tracing::warn!(?error, host_id = %self.host_id, "Failed to rotate relay remote session");
                return false;
            }
        };

        self.deployment
            .cache_relay_remote_session_id(self.host_id, remote_session.id)
            .await;
        self.remote_session = remote_session;
        true
    }
}

async fn get_or_create_cached_remote_session(
    deployment: &DeploymentImpl,
    relay_client: &RelayApiClient,
    host_id: Uuid,
) -> Result<RemoteSession, RelayProxyError> {
    if let Some(session_id) = deployment.get_cached_relay_remote_session_id(host_id).await {
        return Ok(RemoteSession {
            host_id,
            id: session_id,
        });
    }

    let remote_session = relay_client
        .create_session(host_id)
        .await
        .map_err(|error| {
            tracing::warn!(?error, %host_id, "Failed to create relay remote session");
            RelayProxyError::BadGateway("Failed to create relay remote session")
        })?;
    deployment
        .cache_relay_remote_session_id(host_id, remote_session.id)
        .await;
    Ok(remote_session)
}

async fn get_or_create_cached_signing_session(
    deployment: &DeploymentImpl,
    relay_client: &RelayApiClient,
    remote_session: &RemoteSession,
    host_id: Uuid,
    credentials: &RelayHostCredentials,
    signing_key: &SigningKey,
) -> Result<String, RelayProxyError> {
    if let Some(signing_session_id) = deployment
        .get_cached_relay_signing_session_id(host_id)
        .await
    {
        return Ok(signing_session_id);
    }

    let client_id = credentials
        .client_id
        .as_ref()
        .and_then(|value| value.parse::<Uuid>().ok())
        .ok_or(RelayProxyError::BadRequest(
            "This host pairing is missing required client metadata. Re-pair it.",
        ))?;

    let refreshed = refresh_signing_session(relay_client, remote_session, signing_key, client_id)
        .await
        .map_err(|error| {
            tracing::warn!(
                ?error,
                host_id = %host_id,
                "Failed to bootstrap relay signing session"
            );
            RelayProxyError::BadGateway("Failed to initialize relay signing session")
        })?;
    let signing_session_id = refreshed.signing_session_id.to_string();
    deployment
        .cache_relay_signing_session_id(host_id, signing_session_id.clone())
        .await;
    Ok(signing_session_id)
}

async fn refresh_signing_session(
    relay_client: &RelayApiClient,
    remote_session: &RemoteSession,
    signing_key: &SigningKey,
    client_id: Uuid,
) -> anyhow::Result<RefreshRelaySigningSessionResponse> {
    let timestamp = unix_timestamp_now()?;
    let nonce = Uuid::new_v4().simple().to_string();
    let refresh_message = build_refresh_message(timestamp, &nonce, client_id);
    let signature_b64 =
        BASE64_STANDARD.encode(signing_key.sign(refresh_message.as_bytes()).to_bytes());

    let payload = RefreshRelaySigningSessionRequest {
        client_id,
        timestamp,
        nonce,
        signature_b64,
    };

    relay_client
        .post_session_api(
            remote_session,
            "/api/relay-auth/server/signing-session/refresh",
            &payload,
        )
        .await
}

// ---------------------------------------------------------------------------
// Private types and helpers
// ---------------------------------------------------------------------------

#[derive(Debug)]
enum WsConnectError {
    AuthFailure,
    Other(#[allow(dead_code)] anyhow::Error),
}

fn set_ws_signing_headers(
    headers: &mut tungstenite::http::HeaderMap,
    signature: &RequestSignature,
) {
    headers.insert(RELAY_HEADER, "1".parse().expect("static header value"));
    headers.insert(
        SIGNING_SESSION_HEADER,
        signature
            .signing_session_id
            .parse()
            .expect("valid header value"),
    );
    headers.insert(
        TIMESTAMP_HEADER,
        signature
            .timestamp
            .to_string()
            .parse()
            .expect("valid header value"),
    );
    headers.insert(
        NONCE_HEADER,
        signature.nonce.parse().expect("valid header value"),
    );
    headers.insert(
        REQUEST_SIGNATURE_HEADER,
        signature.signature_b64.parse().expect("valid header value"),
    );
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

fn should_forward_request_header(name: &HeaderName) -> bool {
    let name = name.as_str();
    !name.eq_ignore_ascii_case("host")
        && !name.eq_ignore_ascii_case(RELAY_HEADER)
        && !name.eq_ignore_ascii_case(SIGNING_SESSION_HEADER)
        && !name.eq_ignore_ascii_case(TIMESTAMP_HEADER)
        && !name.eq_ignore_ascii_case(NONCE_HEADER)
        && !name.eq_ignore_ascii_case(REQUEST_SIGNATURE_HEADER)
        && !is_hop_by_hop_header(name)
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

fn is_auth_failure_status(status: StatusCode) -> bool {
    status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN
}

fn unix_timestamp_now() -> anyhow::Result<i64> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| anyhow::anyhow!("system time before unix epoch"))?;
    i64::try_from(duration.as_secs()).map_err(anyhow::Error::from)
}

async fn bridge_ws(upstream: SignedUpstreamSocket, client_socket: WebSocket) -> anyhow::Result<()> {
    let (mut upstream_sender, mut upstream_receiver) = upstream.split();
    let (mut client_sender, mut client_receiver) = client_socket.split();

    let client_to_upstream = tokio::spawn(async move {
        while let Some(msg_result) = client_receiver.next().await {
            let msg = msg_result?;
            let close = matches!(msg, Message::Close(_));
            let frame = msg.decompose();
            upstream_sender.send(frame).await?;
            if close {
                break;
            }
        }
        let _ = upstream_sender.close().await;
        Ok::<(), anyhow::Error>(())
    });

    let upstream_to_client = tokio::spawn(async move {
        while let Some(frame) = upstream_receiver.recv().await? {
            let close = matches!(frame.msg_type, RelayWsMessageType::Close);
            let msg = Message::reconstruct(frame)?;
            client_sender.send(msg).await?;
            if close {
                break;
            }
        }
        let _ = client_sender.close().await;
        Ok::<(), anyhow::Error>(())
    });

    tokio::select! {
        result = client_to_upstream => {
            result??;
        }
        result = upstream_to_client => {
            result??;
        }
    }

    Ok(())
}
