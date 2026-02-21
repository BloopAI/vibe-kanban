//! Relay client for remote access to the local server.
//!
//! Opens a persistent WebSocket control channel to the remote server.
//! The remote server multiplexes HTTP and WebSocket requests from the
//! phone over this channel. The relay client forwards them to localhost.

use std::{collections::HashMap, sync::Arc};

use anyhow::Context;
use api_types::{Base64Bytes, LocalToRelay, RelayToLocal};
use futures_util::{SinkExt, StreamExt};
use reqwest::redirect;
use services::services::remote_client::RemoteClient;
use tokio::sync::{Mutex, mpsc};
use tokio_tungstenite::{
    Connector,
    tungstenite::{self, client::IntoClientRequest},
};
use tokio_util::sync::CancellationToken;

/// Start the relay client connecting to the remote server.
///
/// Returns `Ok(())` once connected. The relay runs in background tasks
/// until shutdown is triggered.
pub async fn start_relay(
    local_port: u16,
    remote_client: &RemoteClient,
    shutdown: CancellationToken,
) -> anyhow::Result<()> {
    let base_url = remote_client.base_url().trim_end_matches('/');

    // Convert http(s) to ws(s)
    let ws_url = if let Some(rest) = base_url.strip_prefix("https://") {
        format!("wss://{rest}/v1/relay/connect")
    } else if let Some(rest) = base_url.strip_prefix("http://") {
        format!("ws://{rest}/v1/relay/connect")
    } else {
        anyhow::bail!("Unexpected base URL scheme: {base_url}");
    };

    let access_token = remote_client
        .access_token()
        .await
        .context("Failed to get access token for relay")?;

    tracing::info!("Connecting relay to {ws_url}");

    let mut request = ws_url
        .into_client_request()
        .context("Failed to build WS request")?;

    request.headers_mut().insert(
        "Authorization",
        format!("Bearer {access_token}")
            .parse()
            .context("Invalid auth header")?,
    );

    // Accept invalid TLS certs (needed for local dev with Caddy's self-signed certs,
    // harmless in production since we're connecting to our own known server)
    let tls_connector = native_tls::TlsConnector::builder()
        .danger_accept_invalid_certs(true)
        .build()
        .context("Failed to build TLS connector")?;

    let (ws_stream, _response) = tokio_tungstenite::connect_async_tls_with_config(
        request,
        None,
        false,
        Some(Connector::NativeTls(tls_connector)),
    )
    .await
    .context("Failed to connect to relay control channel")?;

    tracing::info!("Relay control channel connected");

    let (ws_sink, ws_stream_rx) = ws_stream.split();
    let ws_sink = Arc::new(Mutex::new(ws_sink));

    // Active WS streams from WsOpen, keyed by stream_id
    let active_ws: Arc<Mutex<HashMap<u64, mpsc::Sender<RelayToLocal>>>> =
        Arc::new(Mutex::new(HashMap::new()));

    // Build a reqwest client for HTTP proxying (no redirects, like preview_proxy)
    let http_client = reqwest::Client::builder()
        .redirect(redirect::Policy::none())
        .build()
        .context("Failed to build HTTP client")?;

    // Spawn receiver task
    let sink_clone = ws_sink.clone();
    let active_ws_clone = active_ws.clone();
    let shutdown_clone = shutdown.clone();

    tokio::spawn(async move {
        tokio::select! {
            _ = receiver_loop(ws_stream_rx, sink_clone, active_ws_clone, http_client, local_port) => {
                tracing::info!("Relay control channel closed");
            }
            _ = shutdown_clone.cancelled() => {
                tracing::info!("Relay shutting down");
            }
        }
    });

    Ok(())
}

async fn receiver_loop(
    mut stream: futures_util::stream::SplitStream<
        tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
    >,
    sink: Arc<
        Mutex<
            futures_util::stream::SplitSink<
                tokio_tungstenite::WebSocketStream<
                    tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
                >,
                tungstenite::Message,
            >,
        >,
    >,
    active_ws: Arc<Mutex<HashMap<u64, mpsc::Sender<RelayToLocal>>>>,
    http_client: reqwest::Client,
    local_port: u16,
) {
    while let Some(msg_result) = stream.next().await {
        let msg = match msg_result {
            Ok(tungstenite::Message::Text(text)) => text,
            Ok(tungstenite::Message::Close(_)) => break,
            Ok(tungstenite::Message::Ping(data)) => {
                if let Ok(mut s) = sink.try_lock() {
                    let _ = s.send(tungstenite::Message::Pong(data)).await;
                }
                continue;
            }
            Ok(_) => continue,
            Err(e) => {
                tracing::error!("Relay WS error: {e}");
                break;
            }
        };

        let parsed: RelayToLocal = match serde_json::from_str(&msg) {
            Ok(p) => p,
            Err(e) => {
                tracing::warn!("Invalid RelayToLocal message: {e}");
                continue;
            }
        };

        match parsed {
            RelayToLocal::HttpRequest {
                stream_id,
                method,
                path,
                headers,
                body,
            } => {
                let client = http_client.clone();
                let sink = sink.clone();
                let port = local_port;
                tokio::spawn(async move {
                    let response =
                        handle_http_request(client, port, stream_id, method, path, headers, body)
                            .await;
                    send_message(&sink, &response).await;
                });
            }
            RelayToLocal::WsOpen {
                stream_id,
                path,
                headers,
            } => {
                let sink = sink.clone();
                let active_ws = active_ws.clone();
                let port = local_port;
                tokio::spawn(async move {
                    handle_ws_open(sink, active_ws, port, stream_id, path, headers).await;
                });
            }
            RelayToLocal::WsData {
                stream_id,
                data,
                is_text,
            } => {
                if let Some(tx) = active_ws.lock().await.get(&stream_id) {
                    let _ = tx
                        .send(RelayToLocal::WsData {
                            stream_id,
                            data,
                            is_text,
                        })
                        .await;
                }
            }
            RelayToLocal::WsClose { stream_id } => {
                if let Some(tx) = active_ws.lock().await.remove(&stream_id) {
                    let _ = tx.send(RelayToLocal::WsClose { stream_id }).await;
                }
            }
            RelayToLocal::Ping { ts } => {
                let response = LocalToRelay::Pong { ts };
                send_message(&sink, &response).await;
            }
        }
    }
}

async fn handle_http_request(
    client: reqwest::Client,
    port: u16,
    stream_id: u64,
    method: String,
    path: String,
    headers: Vec<(String, String)>,
    body: Base64Bytes,
) -> LocalToRelay {
    let url = format!("http://127.0.0.1:{port}{path}");

    let reqwest_method =
        reqwest::Method::from_bytes(method.as_bytes()).unwrap_or(reqwest::Method::GET);

    let mut req = client.request(reqwest_method, &url);

    for (name, value) in &headers {
        req = req.header(name.as_str(), value.as_str());
    }

    if !body.0.is_empty() {
        req = req.body(body.0);
    }

    match req.send().await {
        Ok(response) => {
            let status = response.status().as_u16();
            let resp_headers: Vec<(String, String)> = response
                .headers()
                .iter()
                .filter_map(|(name, value)| {
                    value
                        .to_str()
                        .ok()
                        .map(|v| (name.to_string(), v.to_string()))
                })
                .collect();

            let resp_body = response
                .bytes()
                .await
                .map(|b| b.to_vec())
                .unwrap_or_default();

            LocalToRelay::HttpResponse {
                stream_id,
                status,
                headers: resp_headers,
                body: Base64Bytes(resp_body),
            }
        }
        Err(e) => {
            tracing::error!("Relay HTTP proxy error: {e}");
            LocalToRelay::HttpResponse {
                stream_id,
                status: 502,
                headers: vec![],
                body: Base64Bytes(format!("Proxy error: {e}").into_bytes()),
            }
        }
    }
}

async fn handle_ws_open(
    sink: Arc<
        Mutex<
            futures_util::stream::SplitSink<
                tokio_tungstenite::WebSocketStream<
                    tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
                >,
                tungstenite::Message,
            >,
        >,
    >,
    active_ws: Arc<Mutex<HashMap<u64, mpsc::Sender<RelayToLocal>>>>,
    port: u16,
    stream_id: u64,
    path: String,
    _headers: Vec<(String, String)>,
) {
    let ws_url = format!("ws://127.0.0.1:{port}{path}");

    let connect_result = tokio_tungstenite::connect_async(&ws_url).await;

    let local_ws = match connect_result {
        Ok((ws, _)) => ws,
        Err(e) => {
            tracing::warn!("Failed to open local WS at {ws_url}: {e}");
            send_message(
                &sink,
                &LocalToRelay::WsRejected {
                    stream_id,
                    status: 502,
                },
            )
            .await;
            return;
        }
    };

    // Send WsOpened
    send_message(&sink, &LocalToRelay::WsOpened { stream_id }).await;

    // Create channel for messages from the control channel to this WS stream
    let (ws_tx, mut ws_rx) = mpsc::channel::<RelayToLocal>(64);
    active_ws.lock().await.insert(stream_id, ws_tx);

    let (mut local_sink, mut local_stream) = local_ws.split();

    // Remote → Local WS (messages from phone via control channel)
    let sink_for_close = sink.clone();
    let active_ws_for_close = active_ws.clone();
    let remote_to_local = tokio::spawn(async move {
        while let Some(msg) = ws_rx.recv().await {
            match msg {
                RelayToLocal::WsData { data, is_text, .. } => {
                    let ws_msg = if is_text {
                        tungstenite::Message::Text(String::from_utf8_lossy(&data.0).into_owned())
                    } else {
                        tungstenite::Message::Binary(data.0)
                    };
                    if local_sink.send(ws_msg).await.is_err() {
                        break;
                    }
                }
                RelayToLocal::WsClose { .. } => {
                    let _ = local_sink.close().await;
                    break;
                }
                _ => continue,
            }
        }
    });

    // Local WS → Remote (messages from local WS forwarded through control channel)
    let sink_for_forward = sink.clone();
    let local_to_remote = tokio::spawn(async move {
        while let Some(msg_result) = local_stream.next().await {
            match msg_result {
                Ok(tungstenite::Message::Text(text)) => {
                    send_message(
                        &sink_for_forward,
                        &LocalToRelay::WsData {
                            stream_id,
                            data: Base64Bytes(text.into_bytes()),
                            is_text: true,
                        },
                    )
                    .await;
                }
                Ok(tungstenite::Message::Binary(data)) => {
                    send_message(
                        &sink_for_forward,
                        &LocalToRelay::WsData {
                            stream_id,
                            data: Base64Bytes(data),
                            is_text: false,
                        },
                    )
                    .await;
                }
                Ok(tungstenite::Message::Close(_)) => {
                    send_message(&sink_for_forward, &LocalToRelay::WsClose { stream_id }).await;
                    break;
                }
                Ok(_) => continue,
                Err(_) => break,
            }
        }
    });

    tokio::select! {
        _ = remote_to_local => {}
        _ = local_to_remote => {}
    }

    // Cleanup
    active_ws_for_close.lock().await.remove(&stream_id);
    send_message(&sink_for_close, &LocalToRelay::WsClose { stream_id }).await;
}

type WsSink = Arc<
    Mutex<
        futures_util::stream::SplitSink<
            tokio_tungstenite::WebSocketStream<
                tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
            >,
            tungstenite::Message,
        >,
    >,
>;

async fn send_message(sink: &WsSink, msg: &LocalToRelay) {
    let json = match serde_json::to_string(msg) {
        Ok(j) => j,
        Err(e) => {
            tracing::error!("Failed to serialize LocalToRelay: {e}");
            return;
        }
    };
    if let Ok(mut s) = sink.try_lock() {
        let _ = s.send(tungstenite::Message::Text(json)).await;
    }
}
