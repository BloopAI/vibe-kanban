//! Relay client for remote access to the local server.
//!
//! Opens a persistent WebSocket control channel to the remote server, then
//! runs yamux over it. Each inbound yamux stream carries one proxied request
//! (including HTTP upgrades like WebSocket).

use std::convert::Infallible;

use anyhow::Context as _;
use axum::body::Body;
use futures_util::StreamExt;
use http::{HeaderValue, StatusCode, header::HOST};
use hyper::{
    Request, Response, body::Incoming, client::conn::http1 as client_http1,
    server::conn::http1 as server_http1, service::service_fn, upgrade,
};
use hyper_util::rt::TokioIo;
use services::services::remote_client::RemoteClient;
use tokio::net::TcpStream;
use tokio_tungstenite::{
    Connector,
    tungstenite::{self, client::IntoClientRequest},
};
use tokio_util::sync::CancellationToken;
use tokio_yamux::{Config as YamuxConfig, Session};
use utils::ws_io::{WsIoReadMessage, WsMessageStreamIo};
use uuid::Uuid;

/// Start the relay client connecting to the remote server.
///
/// Returns `Ok(())` once connected. The relay runs in background tasks
/// until shutdown is triggered.
pub async fn start_relay(
    local_port: u16,
    remote_client: &RemoteClient,
    host_id: Uuid,
    shutdown: CancellationToken,
) -> anyhow::Result<()> {
    let base_url = remote_client.base_url().trim_end_matches('/');

    let ws_url = if let Some(rest) = base_url.strip_prefix("https://") {
        format!("wss://{rest}/v1/relay/connect/{host_id}")
    } else if let Some(rest) = base_url.strip_prefix("http://") {
        format!("ws://{rest}/v1/relay/connect/{host_id}")
    } else {
        anyhow::bail!("Unexpected base URL scheme: {base_url}");
    };

    let access_token = remote_client
        .access_token()
        .await
        .context("Failed to get access token for relay")?;

    tracing::info!(%ws_url, "connecting relay control channel");

    let mut request = ws_url
        .into_client_request()
        .context("Failed to build WS request")?;

    request.headers_mut().insert(
        "Authorization",
        format!("Bearer {access_token}")
            .parse()
            .context("Invalid auth header")?,
    );

    let mut tls_builder = native_tls::TlsConnector::builder();
    #[cfg(debug_assertions)]
    {
        // Keep local/self-signed cert support in debug only.
        tls_builder.danger_accept_invalid_certs(true);
    }
    let tls_connector = tls_builder
        .build()
        .context("Failed to build TLS connector")?;

    let (ws_stream, _response) = tokio_tungstenite::connect_async_tls_with_config(
        request,
        None,
        false,
        Some(Connector::NativeTls(tls_connector)),
    )
    .await
    .context("Failed to connect relay control channel")?;

    let ws_io = WsMessageStreamIo::new(ws_stream, read_client_message, write_client_message);
    let mut session = Session::new_client(ws_io, YamuxConfig::default());
    let mut control = session.control();

    tracing::info!(%host_id, "relay control channel connected");

    tokio::spawn(async move {
        loop {
            tokio::select! {
                _ = shutdown.cancelled() => {
                    tracing::info!(%host_id, "relay shutdown requested");
                    control.close().await;
                    break;
                }
                inbound = session.next() => {
                    match inbound {
                        Some(Ok(stream)) => {
                            tokio::spawn(async move {
                                if let Err(error) = handle_inbound_stream(stream, local_port).await {
                                    tracing::warn!(?error, "relay stream handling failed");
                                }
                            });
                        }
                        Some(Err(error)) => {
                            tracing::warn!(?error, "relay yamux session error");
                            break;
                        }
                        None => {
                            tracing::info!(%host_id, "relay session ended");
                            break;
                        }
                    }
                }
            }
        }
    });

    Ok(())
}

async fn handle_inbound_stream(
    stream: tokio_yamux::StreamHandle,
    local_port: u16,
) -> anyhow::Result<()> {
    let io = TokioIo::new(stream);

    server_http1::Builder::new()
        .serve_connection(
            io,
            service_fn(move |request: Request<Incoming>| proxy_to_local(request, local_port)),
        )
        .with_upgrades()
        .await
        .context("yamux stream server connection failed")
}

async fn proxy_to_local(
    mut request: Request<Incoming>,
    local_port: u16,
) -> Result<Response<Body>, Infallible> {
    request.headers_mut().insert(
        HOST,
        HeaderValue::from_str(&format!("127.0.0.1:{local_port}")).unwrap_or_else(|_| {
            // Fallback is only used if formatting/parsing unexpectedly fails.
            HeaderValue::from_static("127.0.0.1")
        }),
    );

    let local_stream = match TcpStream::connect(("127.0.0.1", local_port)).await {
        Ok(stream) => stream,
        Err(error) => {
            tracing::warn!(
                ?error,
                "failed to connect to local server for relay request"
            );
            return Ok(simple_response(
                StatusCode::BAD_GATEWAY,
                "Failed to connect to local server",
            ));
        }
    };

    let (mut sender, connection) = match client_http1::Builder::new()
        .handshake(TokioIo::new(local_stream))
        .await
    {
        Ok(value) => value,
        Err(error) => {
            tracing::warn!(?error, "failed to create local proxy HTTP connection");
            return Ok(simple_response(
                StatusCode::BAD_GATEWAY,
                "Failed to initialize local proxy connection",
            ));
        }
    };

    tokio::spawn(async move {
        if let Err(error) = connection.with_upgrades().await {
            tracing::debug!(?error, "local proxy connection closed");
        }
    });

    let request_upgrade = upgrade::on(&mut request);

    let mut response = match sender.send_request(request).await {
        Ok(response) => response,
        Err(error) => {
            tracing::warn!(?error, "local proxy request failed");
            return Ok(simple_response(
                StatusCode::BAD_GATEWAY,
                "Local proxy request failed",
            ));
        }
    };

    if response.status() == StatusCode::SWITCHING_PROTOCOLS {
        let response_upgrade = upgrade::on(&mut response);
        tokio::spawn(async move {
            let Ok(from_remote) = request_upgrade.await else {
                return;
            };
            let Ok(to_local) = response_upgrade.await else {
                return;
            };
            let mut from_remote = TokioIo::new(from_remote);
            let mut to_local = TokioIo::new(to_local);
            let _ = tokio::io::copy_bidirectional(&mut from_remote, &mut to_local).await;
        });
    }

    let (parts, body) = response.into_parts();
    Ok(Response::from_parts(parts, Body::new(body)))
}

fn simple_response(status: StatusCode, body: &'static str) -> Response<Body> {
    Response::builder()
        .status(status)
        .body(Body::from(body))
        .unwrap_or_else(|_| Response::new(Body::from(body)))
}

fn read_client_message(message: tungstenite::Message) -> WsIoReadMessage {
    match message {
        tungstenite::Message::Binary(data) => WsIoReadMessage::Data(data.to_vec()),
        tungstenite::Message::Text(text) => WsIoReadMessage::Data(text.as_bytes().to_vec()),
        tungstenite::Message::Close(_) => WsIoReadMessage::Eof,
        _ => WsIoReadMessage::Skip,
    }
}

fn write_client_message(bytes: Vec<u8>) -> tungstenite::Message {
    tungstenite::Message::Binary(bytes.into())
}
