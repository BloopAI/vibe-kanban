use std::convert::Infallible;

use anyhow::Context as _;
use axum::body::Body;
use futures_util::StreamExt;
use http::StatusCode;
use hyper::{
    Request, Response, body::Incoming, client::conn::http1 as client_http1,
    server::conn::http1 as server_http1, service::service_fn, upgrade,
};
use hyper_util::rt::TokioIo;
use tokio::net::TcpStream;
use tokio_tungstenite::{
    Connector,
    tungstenite::{self, client::IntoClientRequest},
};
use tokio_util::sync::CancellationToken;
use tokio_yamux::{Config as YamuxConfig, Session};

use crate::ws_io::{WsIoReadMessage, WsMessageStreamIo};

pub struct RelayClientConfig {
    pub ws_url: String,
    pub bearer_token: String,
    pub local_addr: String,
    pub shutdown: CancellationToken,
}

/// Connects the relay client control channel and starts handling inbound streams.
///
/// Returns when shutdown is requested or when the control channel disconnects/errors.
pub async fn start_relay_client(config: RelayClientConfig) -> anyhow::Result<()> {
    let mut request = config
        .ws_url
        .clone()
        .into_client_request()
        .context("Failed to build WS request")?;

    request.headers_mut().insert(
        "Authorization",
        format!("Bearer {}", config.bearer_token)
            .parse()
            .context("Invalid auth header")?,
    );

    let mut tls_builder = native_tls::TlsConnector::builder();
    if cfg!(debug_assertions) {
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

    tracing::debug!("Relay control channel connected");

    let shutdown = config.shutdown;
    let local_addr = config.local_addr;

    loop {
        tokio::select! {
            _ = shutdown.cancelled() => {
                control.close().await;
                return Ok(());
            }
            inbound = session.next() => {
                let stream = inbound
                    .ok_or_else(|| anyhow::anyhow!("Relay control channel closed"))?
                    .map_err(|e| anyhow::anyhow!("Relay yamux session error: {e}"))?;

                let local_addr = local_addr.clone();
                tokio::spawn(async move {
                    if let Err(error) = handle_inbound_stream(stream, local_addr).await {
                        tracing::warn!(?error, "Relay stream handling failed");
                    }
                });
            }
        }
    }
}

async fn handle_inbound_stream(
    stream: tokio_yamux::StreamHandle,
    local_addr: String,
) -> anyhow::Result<()> {
    let io = TokioIo::new(stream);

    server_http1::Builder::new()
        .serve_connection(
            io,
            service_fn(move |request: Request<Incoming>| {
                proxy_to_local(request, local_addr.clone())
            }),
        )
        .with_upgrades()
        .await
        .context("Yamux stream server connection failed")
}

async fn proxy_to_local(
    mut request: Request<Incoming>,
    local_addr: String,
) -> Result<Response<Body>, Infallible> {
    request
        .headers_mut()
        .insert("x-vk-relayed", http::HeaderValue::from_static("1"));

    // TODO: fix dev servers
    let local_stream = match TcpStream::connect(local_addr.as_str()).await {
        Ok(stream) => stream,
        Err(error) => {
            tracing::warn!(
                ?error,
                "Failed to connect to local server for relay request"
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
            tracing::warn!(?error, "Failed to create local proxy HTTP connection");
            return Ok(simple_response(
                StatusCode::BAD_GATEWAY,
                "Failed to initialize local proxy connection",
            ));
        }
    };

    tokio::spawn(async move {
        if let Err(error) = connection.with_upgrades().await {
            tracing::debug!(?error, "Local proxy connection closed");
        }
    });

    let request_upgrade = upgrade::on(&mut request);

    let mut response = match sender.send_request(request).await {
        Ok(response) => response,
        Err(error) => {
            tracing::warn!(?error, "Local proxy request failed");
            return Ok(simple_response(
                StatusCode::BAD_GATEWAY,
                "Local proxy request failed",
            ));
        }
    };

    if response.status() == StatusCode::SWITCHING_PROTOCOLS {
        let response_upgrade = upgrade::on(&mut response);
        tokio::spawn(async move {
            let mut from_remote = TokioIo::new(request_upgrade.await?);
            let mut to_local = TokioIo::new(response_upgrade.await?);
            tokio::io::copy_bidirectional(&mut from_remote, &mut to_local).await?;
            Ok::<_, anyhow::Error>(())
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
    tungstenite::Message::Binary(bytes)
}
