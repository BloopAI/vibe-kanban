use std::convert::Infallible;

use anyhow::Context as _;
use axum::body::Body;
use http::StatusCode;
use hyper::{
    Method, Request, Response, body::Incoming, client::conn::http1 as client_http1,
    server::conn::http1 as server_http1, service::service_fn, upgrade,
};
use hyper_util::rt::TokioIo;
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite;

use super::TcpForwardConfig;
use crate::ws_io::WsIoReadMessage;

pub async fn handle_inbound_stream(
    stream: tokio_yamux::StreamHandle,
    local_addr: String,
    tcp_forward: Option<TcpForwardConfig>,
) -> anyhow::Result<()> {
    let io = TokioIo::new(stream);

    server_http1::Builder::new()
        .serve_connection(
            io,
            service_fn(move |request: Request<Incoming>| {
                let local_addr = local_addr.clone();
                let tcp_forward = tcp_forward.clone();
                async move {
                    if request.method() == Method::CONNECT {
                        return match &tcp_forward {
                            Some(config) => {
                                super::tcp::handle_connect_tunnel(request, config).await
                            }
                            None => Ok(super::tcp::simple_forbidden()),
                        };
                    }
                    proxy_to_local(request, local_addr).await
                }
            }),
        )
        .with_upgrades()
        .await
        .context("yamux stream server connection failed")
}

async fn proxy_to_local(
    mut request: Request<Incoming>,
    local_addr: String,
) -> Result<Response<Body>, Infallible> {
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

pub fn read_client_message(message: tungstenite::Message) -> WsIoReadMessage {
    match message {
        tungstenite::Message::Binary(data) => WsIoReadMessage::Data(data.to_vec()),
        tungstenite::Message::Text(text) => WsIoReadMessage::Data(text.as_bytes().to_vec()),
        tungstenite::Message::Close(_) => WsIoReadMessage::Eof,
        _ => WsIoReadMessage::Skip,
    }
}

pub fn write_client_message(bytes: Vec<u8>) -> tungstenite::Message {
    tungstenite::Message::Binary(bytes.into())
}
