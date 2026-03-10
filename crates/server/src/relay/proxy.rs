use axum::{
    body::{Body, to_bytes},
    extract::{
        Request,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    http::StatusCode,
    response::{IntoResponse, Response},
};
use ed25519_dalek::VerifyingKey;
use futures_util::{SinkExt, StreamExt};
use relay_client::{
    RelayWsConnectError, SignedUpstreamSocket, connect_signed_upstream_ws, send_signed_http,
};
use relay_control::signed_ws::{RelayTransportMessage, RelayWsMessageType};
use uuid::Uuid;

use crate::{
    DeploymentImpl,
    relay::session::{
        PairedRelayHostMetadataError, RelayClientBuildError, RelayHostContext,
        RelayHostContextInitError, RelayHostSession, RelayHostSessionInitError,
        RelayOperationAttempt, RelayRecoveryError,
    },
};

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
    session: RelayHostSession,
    server_verify_key: VerifyingKey,
}

impl RelayConnection {
    pub async fn for_host(
        deployment: &DeploymentImpl,
        host_id: Uuid,
    ) -> Result<Self, RelayProxyError> {
        let (host_metadata, session) = RelayHostContext::for_host(deployment, host_id)
            .await
            .map(RelayHostContext::into_parts)
            .map_err(|error| match error {
                RelayHostContextInitError::Metadata(error) => match error {
                    PairedRelayHostMetadataError::NotPaired => {
                        RelayProxyError::BadRequest("No paired relay credentials for this host")
                    }
                    PairedRelayHostMetadataError::MissingClientMetadata => {
                        RelayProxyError::BadRequest(
                            "This host pairing is missing required client metadata. Re-pair it.",
                        )
                    }
                    PairedRelayHostMetadataError::MissingSigningMetadata => {
                        tracing::warn!(host_id = %host_id, "Missing or invalid server_public_key_b64 for relay WS bridge");
                        RelayProxyError::BadRequest(
                            "This host pairing is missing required signing metadata. Re-pair it.",
                        )
                    }
                },
                RelayHostContextInitError::ClientBuild(error) => match error {
                    RelayClientBuildError::NotConfigured => {
                        RelayProxyError::BadRequest("Remote relay API is not configured")
                    }
                    RelayClientBuildError::Authentication(error) => {
                        tracing::warn!(?error, "Failed to get access token for relay host proxy");
                        RelayProxyError::Unauthorized(
                            "Authentication required for relay host proxy",
                        )
                    }
                },
                RelayHostContextInitError::Session(error) => match error {
                    RelayHostSessionInitError::RemoteSession(error) => {
                        tracing::warn!(?error, %host_id, "Failed to create relay remote session");
                        RelayProxyError::BadGateway("Failed to create relay remote session")
                    }
                    RelayHostSessionInitError::SigningSession(error) => {
                        tracing::warn!(?error, %host_id, "Failed to initialize relay signing session");
                        RelayProxyError::BadGateway("Failed to initialize relay signing session")
                    }
                },
            })?;

        Ok(Self {
            session,
            server_verify_key: host_metadata.server_verify_key,
        })
    }

    /// Sign and forward an HTTP request to the relay host. Retries on auth failure.
    ///
    /// The request URI should already be rewritten to the target path (e.g. `/api/...`).
    pub async fn forward_http(&mut self, request: Request) -> Result<Response, RelayProxyError> {
        let (parts, body) = request.into_parts();
        let method = parts.method.clone();
        let headers = parts.headers.clone();
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

        let response = self
            .session
            .retry_response_recovery(
                |session| {
                    let method = method.clone();
                    let headers = headers.clone();
                    let target_path = target_path.clone();
                    let body_bytes = body_bytes.clone();
                    Box::pin(async move {
                        send_signed_http(
                            session.relay_base_url(),
                            session.remote_session(),
                            session.signing_key(),
                            session.signing_session_id(),
                            &method,
                            &target_path,
                            &headers,
                            &body_bytes,
                        )
                        .await
                    })
                },
                |response| is_auth_failure_status(response.status()),
                "Failed to refresh relay signing session for host proxy request",
                "Failed to rotate relay remote session",
            )
            .await
            .map_err(|error| {
                tracing::warn!(?error, host_id = %self.session.host_id(), "Relay host HTTP request failed");
                RelayProxyError::BadGateway("Failed to call relay host")
            })?;

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

        let server_verify_key = self.server_verify_key;
        let (upstream_socket, selected_protocol) = self
            .session
            .retry_error_recovery(
                |session| {
                    let target_path = target_path.clone();
                    let protocols = protocols.clone();
                    Box::pin(async move {
                        connect_signed_upstream_ws(
                            session.relay_base_url(),
                            session.remote_session(),
                            session.signing_key(),
                            session.signing_session_id(),
                            &target_path,
                            protocols.as_deref(),
                            server_verify_key,
                        )
                        .await
                    })
                },
                |error| matches!(error, RelayWsConnectError::AuthFailure),
                "Failed to refresh relay signing session for host proxy request",
                "Failed to rotate relay remote session",
            )
            .await
            .map_err(|error| match error {
                RelayRecoveryError::Operation { error, attempt } => {
                    match attempt {
                        RelayOperationAttempt::Initial => {
                            tracing::warn!(?error, host_id = %self.session.host_id(), "Relay host WS connect failed");
                        }
                        RelayOperationAttempt::AfterSigningRefresh => {
                            tracing::warn!(?error, host_id = %self.session.host_id(), "Relay host WS retry failed after signing refresh");
                        }
                        RelayOperationAttempt::AfterSessionRotation => {
                            tracing::warn!(?error, host_id = %self.session.host_id(), "Relay host WS retry failed after session rotation");
                        }
                    }
                    RelayProxyError::BadGateway("Failed to connect relay host WS")
                }
                RelayRecoveryError::Refresh(_) | RelayRecoveryError::Rotate(_) => {
                    RelayProxyError::BadGateway("Failed to connect relay host WS")
                }
            })?;

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

fn is_auth_failure_status(status: StatusCode) -> bool {
    status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN
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
