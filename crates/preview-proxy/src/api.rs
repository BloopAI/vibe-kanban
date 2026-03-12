use axum::{
    body::{Body, to_bytes},
    extract::{
        Request,
        ws::{Message, WebSocketUpgrade, rejection::WebSocketUpgradeRejection},
    },
    http::StatusCode,
    response::{IntoResponse, Response},
};
use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::tungstenite::{self, client::IntoClientRequest};

use crate::{
    PreviewProxyService,
    proxy_common::{build_local_upstream_url, extract_ws_protocols, should_forward_request_header},
};

type MaybeWsUpgrade = Result<WebSocketUpgrade, WebSocketUpgradeRejection>;

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

    let mut ws_request = match ws_url.into_client_request() {
        Ok(req) => req,
        Err(error) => {
            tracing::warn!(?error, "Failed to build preview WS request");
            return (StatusCode::BAD_REQUEST, "Invalid WebSocket request").into_response();
        }
    };

    if let Some(ref protocols) = protocols
        && let Ok(value) = protocols.parse()
    {
        ws_request
            .headers_mut()
            .insert("sec-websocket-protocol", value);
    }

    let (upstream_ws, response) = match tokio_tungstenite::connect_async(ws_request).await {
        Ok(value) => value,
        Err(error) => {
            tracing::warn!(?error, "Failed to connect preview upstream WebSocket");
            return (StatusCode::BAD_GATEWAY, "Preview WebSocket unavailable").into_response();
        }
    };

    let selected_protocol = response
        .headers()
        .get("sec-websocket-protocol")
        .and_then(|value| value.to_str().ok())
        .map(ToOwned::to_owned);

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

async fn bridge_ws(
    upstream: tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
    client_socket: axum::extract::ws::WebSocket,
) -> anyhow::Result<()> {
    let (mut upstream_sender, mut upstream_receiver) = upstream.split();
    let (mut client_sender, mut client_receiver) = client_socket.split();

    let client_to_upstream = tokio::spawn(async move {
        while let Some(msg_result) = client_receiver.next().await {
            let msg = msg_result?;
            let close = matches!(msg, Message::Close(_));
            let tungstenite_msg = match msg {
                Message::Text(text) => tungstenite::Message::Text(text.to_string().into()),
                Message::Binary(bytes) => tungstenite::Message::Binary(bytes.to_vec().into()),
                Message::Ping(bytes) => tungstenite::Message::Ping(bytes.to_vec().into()),
                Message::Pong(bytes) => tungstenite::Message::Pong(bytes.to_vec().into()),
                Message::Close(frame) => {
                    let close_frame = frame.map(|cf| tungstenite::protocol::CloseFrame {
                        code: tungstenite::protocol::frame::coding::CloseCode::from(cf.code),
                        reason: cf.reason.to_string().into(),
                    });
                    tungstenite::Message::Close(close_frame)
                }
            };

            upstream_sender.send(tungstenite_msg).await?;
            if close {
                break;
            }
        }
        let _ = upstream_sender.close().await;
        Ok::<(), anyhow::Error>(())
    });

    let upstream_to_client = tokio::spawn(async move {
        while let Some(msg_result) = upstream_receiver.next().await {
            let msg = msg_result?;
            let close = matches!(msg, tungstenite::Message::Close(_));
            let client_msg = match msg {
                tungstenite::Message::Text(text) => Message::Text(text.to_string().into()),
                tungstenite::Message::Binary(bytes) => Message::Binary(bytes.to_vec().into()),
                tungstenite::Message::Ping(bytes) => Message::Ping(bytes.to_vec().into()),
                tungstenite::Message::Pong(bytes) => Message::Pong(bytes.to_vec().into()),
                tungstenite::Message::Close(frame) => {
                    let close_frame = frame.map(|cf| axum::extract::ws::CloseFrame {
                        code: cf.code.into(),
                        reason: cf.reason.to_string().into(),
                    });
                    Message::Close(close_frame)
                }
                tungstenite::Message::Frame(_) => continue,
            };

            client_sender.send(client_msg).await?;
            if close {
                break;
            }
        }
        let _ = client_sender.close().await;
        Ok::<(), anyhow::Error>(())
    });

    tokio::select! {
        result = client_to_upstream => result??,
        result = upstream_to_client => result??,
    }

    Ok(())
}
