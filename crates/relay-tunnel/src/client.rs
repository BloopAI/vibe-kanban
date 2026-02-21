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
    pub accept_invalid_certs: bool,
    pub local_addr: String,
    pub local_host_header: String,
    pub shutdown: CancellationToken,
}

/// Connects the relay client control channel and starts handling inbound streams.
///
/// Returns once the control channel is established and background tasks are spawned.
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
    if config.accept_invalid_certs {
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

    let shutdown = config.shutdown;
    let local_addr = config.local_addr;
    let local_host_header = config.local_host_header;

    tokio::spawn(async move {
        loop {
            tokio::select! {
                _ = shutdown.cancelled() => {
                    control.close().await;
                    break;
                }
                inbound = session.next() => {
                    match inbound {
                        Some(Ok(stream)) => {
                            let local_addr = local_addr.clone();
                            let local_host_header = local_host_header.clone();
                            tokio::spawn(async move {
                                if let Err(error) = handle_inbound_stream(stream, local_addr, local_host_header).await {
                                    tracing::warn!(?error, "relay stream handling failed");
                                }
                            });
                        }
                        Some(Err(error)) => {
                            tracing::warn!(?error, "relay yamux session error");
                            break;
                        }
                        None => {
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
    local_addr: String,
    local_host_header: String,
) -> anyhow::Result<()> {
    let io = TokioIo::new(stream);

    server_http1::Builder::new()
        .serve_connection(
            io,
            service_fn(move |request: Request<Incoming>| {
                proxy_to_local(request, local_addr.clone(), local_host_header.clone())
            }),
        )
        .with_upgrades()
        .await
        .context("yamux stream server connection failed")
}

async fn proxy_to_local(
    mut request: Request<Incoming>,
    local_addr: String,
    local_host_header: String,
) -> Result<Response<Body>, Infallible> {
    request.headers_mut().insert(
        HOST,
        HeaderValue::from_str(&local_host_header)
            .unwrap_or_else(|_| HeaderValue::from_static("127.0.0.1")),
    );

    let local_stream = match TcpStream::connect(local_addr.as_str()).await {
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
