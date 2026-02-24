use std::{future::Future, sync::Arc};

use axum::{
    body::Body,
    extract::{
        Request,
        ws::{Message as AxumWsMessage, WebSocket},
    },
    http::{StatusCode, Uri},
    response::{IntoResponse, Response},
};
use futures_util::StreamExt;
use hyper::{client::conn::http1 as client_http1, upgrade};
use hyper_util::rt::TokioIo;
use tokio::sync::Mutex;
use tokio_yamux::{Config as YamuxConfig, Control, Session};

use crate::ws_io::{WsIoReadMessage, WsMessageStreamIo};

pub type SharedControl = Arc<Mutex<Control>>;

/// Runs the server-side control channel over an upgraded WebSocket.
///
/// The provided callback is invoked once, after yamux is initialized, with a
/// shared control handle that can be used to proxy requests over new streams.
pub async fn run_control_channel<F, Fut>(socket: WebSocket, on_connected: F) -> anyhow::Result<()>
where
    F: FnOnce(SharedControl) -> Fut,
    Fut: Future<Output = ()>,
{
    let ws_io = WsMessageStreamIo::new(socket, read_server_message, write_server_message);
    let mut session = Session::new_server(ws_io, YamuxConfig::default());
    let control = Arc::new(Mutex::new(session.control()));

    on_connected(control).await;

    while let Some(stream_result) = session.next().await {
        match stream_result {
            Ok(_stream) => {
                // The client side does not currently open server-initiated streams.
            }
            Err(error) => {
                return Err(anyhow::anyhow!("relay session error: {error}"));
            }
        }
    }

    Ok(())
}

/// Proxies one HTTP request over a new yamux stream using the shared control.
pub async fn proxy_request_over_control(
    control: &Mutex<Control>,
    request: Request,
    strip_prefix: &str,
) -> Response {
    let stream = {
        let mut control = control.lock().await;
        match control.open_stream().await {
            Ok(stream) => stream,
            Err(error) => {
                tracing::warn!(?error, "failed to open relay stream");
                return (StatusCode::BAD_GATEWAY, "Relay connection lost").into_response();
            }
        }
    };

    let (mut parts, body) = request.into_parts();
    let path = normalized_relay_path(&parts.uri, strip_prefix);
    parts.uri = match Uri::builder().path_and_query(path).build() {
        Ok(uri) => uri,
        Err(error) => {
            tracing::warn!(?error, "failed to build relay proxy URI");
            return (StatusCode::BAD_REQUEST, "Invalid request URI").into_response();
        }
    };

    let mut outbound = axum::http::Request::from_parts(parts, body);
    let request_upgrade = upgrade::on(&mut outbound);

    let (mut sender, connection) = match client_http1::Builder::new()
        .handshake(TokioIo::new(stream))
        .await
    {
        Ok(value) => value,
        Err(error) => {
            tracing::warn!(?error, "failed to initialize relay stream proxy connection");
            return (StatusCode::BAD_GATEWAY, "Relay connection failed").into_response();
        }
    };

    tokio::spawn(async move {
        if let Err(error) = connection.with_upgrades().await {
            tracing::debug!(?error, "relay stream connection closed");
        }
    });

    let mut response = match sender.send_request(outbound).await {
        Ok(response) => response,
        Err(error) => {
            tracing::warn!(?error, "relay proxy request failed");
            return (StatusCode::BAD_GATEWAY, "Relay request failed").into_response();
        }
    };

    if response.status() == StatusCode::SWITCHING_PROTOCOLS {
        let response_upgrade = upgrade::on(&mut response);
        tokio::spawn(async move {
            let Ok(from_client) = request_upgrade.await else {
                return;
            };
            let Ok(to_local) = response_upgrade.await else {
                return;
            };
            let mut from_client = TokioIo::new(from_client);
            let mut to_local = TokioIo::new(to_local);
            let _ = tokio::io::copy_bidirectional(&mut from_client, &mut to_local).await;
        });
    }

    let (parts, body) = response.into_parts();
    Response::from_parts(parts, Body::new(body))
}

fn normalized_relay_path(uri: &axum::http::Uri, strip_prefix: &str) -> String {
    let raw_path = uri.path();
    let path = raw_path.strip_prefix(strip_prefix).unwrap_or(raw_path);
    let path = if path.is_empty() { "/" } else { path };
    let query = uri.query().map(|q| format!("?{q}")).unwrap_or_default();
    format!("{path}{query}")
}

fn read_server_message(message: AxumWsMessage) -> WsIoReadMessage {
    match message {
        AxumWsMessage::Binary(data) => WsIoReadMessage::Data(data.to_vec()),
        AxumWsMessage::Text(text) => WsIoReadMessage::Data(text.as_bytes().to_vec()),
        AxumWsMessage::Close(_) => WsIoReadMessage::Eof,
        _ => WsIoReadMessage::Skip,
    }
}

fn write_server_message(bytes: Vec<u8>) -> AxumWsMessage {
    AxumWsMessage::Binary(bytes.into())
}
