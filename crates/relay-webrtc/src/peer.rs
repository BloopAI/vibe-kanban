use std::{collections::HashMap, sync::Arc, time::Duration};

use bytes::Bytes;
use futures_util::{SinkExt, StreamExt};
use relay_ws::{RelayTransportMessage, RelayWsMessageType};
use tokio::sync::{Mutex, mpsc};
use tokio_util::sync::CancellationToken;
use webrtc::{
    data_channel::{RTCDataChannel, data_channel_message::DataChannelMessage as RtcDcMessage},
    ice_transport::{
        ice_connection_state::RTCIceConnectionState, ice_gatherer_state::RTCIceGathererState,
        ice_server::RTCIceServer,
    },
    peer_connection::{
        RTCPeerConnection, configuration::RTCConfiguration,
        sdp::session_description::RTCSessionDescription,
    },
};

use crate::{
    fragment,
    proxy::{
        DataChannelMessage, DataChannelRequest, DataChannelResponse, WsClose, WsError, WsFrame,
        WsOpen, WsOpened,
    },
};

/// Handle for communicating with a running peer task.
pub struct PeerHandle {
    /// The peer connection, used for trickle ICE.
    pub peer_connection: Arc<RTCPeerConnection>,
    /// Cancellation token to shut down the peer.
    pub shutdown: CancellationToken,
}

/// Configuration for creating a new peer connection.
pub struct PeerConfig {
    /// Address of the local backend to proxy requests to (e.g. "127.0.0.1:8080").
    pub local_backend_addr: String,
    /// Cancellation token for graceful shutdown.
    pub shutdown: CancellationToken,
}

/// Accept an SDP offer and return the answer SDP along with the peer connection.
///
/// Creates a new RTCPeerConnection with a STUN server, accepts the offer,
/// waits for ICE gathering to complete, and returns the answer with
/// candidates embedded in the SDP.
pub async fn accept_offer(offer_sdp: &str) -> anyhow::Result<(String, Arc<RTCPeerConnection>)> {
    let api = crate::build_api();

    let config = RTCConfiguration {
        ice_servers: vec![RTCIceServer {
            urls: vec!["stun:stun.l.google.com:19302".to_string()],
            ..Default::default()
        }],
        ..Default::default()
    };

    let peer_connection = Arc::new(api.new_peer_connection(config).await?);

    // Wait for ICE gathering to complete before returning the answer so
    // that candidates are embedded in the SDP.
    let (gather_done_tx, gather_done_rx) = tokio::sync::oneshot::channel::<()>();
    let gather_done_tx = Arc::new(std::sync::Mutex::new(Some(gather_done_tx)));
    peer_connection.on_ice_gathering_state_change(Box::new(move |state| {
        let tx = gather_done_tx.clone();
        Box::pin(async move {
            if state == RTCIceGathererState::Complete {
                if let Some(sender) = tx.lock().unwrap().take() {
                    let _ = sender.send(());
                }
            }
        })
    }));

    let offer = RTCSessionDescription::offer(offer_sdp.to_string())?;
    peer_connection.set_remote_description(offer).await?;

    let answer = peer_connection.create_answer(None).await?;
    peer_connection.set_local_description(answer).await?;

    // Wait for ICE gathering with a timeout.
    tokio::time::timeout(Duration::from_secs(5), gather_done_rx)
        .await
        .map_err(|_| anyhow::anyhow!("ICE gathering timed out"))?
        .map_err(|_| anyhow::anyhow!("ICE gathering channel dropped"))?;

    let answer_sdp = peer_connection
        .local_description()
        .await
        .ok_or_else(|| anyhow::anyhow!("No local description after ICE gathering"))?
        .sdp;

    Ok((answer_sdp, peer_connection))
}

/// Run the server-side peer.
///
/// Registers callbacks on the peer connection to handle incoming data channel
/// messages. HTTP requests are proxied to the local backend; WebSocket
/// connections are bridged. Runs until the shutdown token is cancelled or
/// the ICE connection disconnects.
pub async fn run_peer(
    peer_connection: Arc<RTCPeerConnection>,
    config: PeerConfig,
) -> anyhow::Result<()> {
    let http_client = reqwest::Client::new();

    // Channel for the data channel writer task.
    let (dc_send_tx, dc_send_rx) = mpsc::channel::<Vec<u8>>(64);

    // Signal when the data channel opens so the writer task can start.
    let (dc_ready_tx, dc_ready_rx) = tokio::sync::oneshot::channel::<Arc<RTCDataChannel>>();
    let dc_ready_tx = Arc::new(std::sync::Mutex::new(Some(dc_ready_tx)));

    // Active WebSocket connections: conn_id → sender for frames from the client.
    let ws_connections: Arc<Mutex<HashMap<String, mpsc::Sender<WsFrame>>>> =
        Arc::new(Mutex::new(HashMap::new()));

    // Detect ICE disconnection.
    let disconnect_token = config.shutdown.child_token();
    let disconnect_cancel = disconnect_token.clone();
    peer_connection.on_ice_connection_state_change(Box::new(move |state| {
        let cancel = disconnect_cancel.clone();
        Box::pin(async move {
            tracing::debug!(?state, "[server-peer] ICE connection state changed");
            if state == RTCIceConnectionState::Disconnected
                || state == RTCIceConnectionState::Failed
                || state == RTCIceConnectionState::Closed
            {
                cancel.cancel();
            }
        })
    }));

    // Handle incoming data channel from the client.
    let dc_send_tx_clone = dc_send_tx.clone();
    let ws_conns = ws_connections.clone();
    let local_backend_addr = config.local_backend_addr.clone();
    let http_client_clone = http_client.clone();

    peer_connection.on_data_channel(Box::new(move |dc: Arc<RTCDataChannel>| {
        let dc_send_tx = dc_send_tx_clone.clone();
        let ws_conns = ws_conns.clone();
        let local_backend_addr = local_backend_addr.clone();
        let http_client = http_client_clone.clone();
        let dc_ready_tx = dc_ready_tx.clone();

        Box::pin(async move {
            tracing::debug!(label = dc.label(), "[server-peer] data channel opened");

            // Signal the writer task that the DC is ready.
            if let Some(tx) = dc_ready_tx.lock().unwrap().take() {
                let _ = tx.send(dc.clone());
            }

            // Incoming message handler.
            let (incoming_tx, mut incoming_rx) = mpsc::channel::<Vec<u8>>(64);
            let defrag = Arc::new(std::sync::Mutex::new(fragment::Defragmenter::new()));

            dc.on_message(Box::new(move |msg: RtcDcMessage| {
                let tx = incoming_tx.clone();
                let defrag = defrag.clone();
                Box::pin(async move {
                    let complete = {
                        let mut d = defrag.lock().unwrap();
                        d.process(&msg.data)
                    };
                    if let Some(bytes) = complete {
                        let _ = tx.send(bytes).await;
                    }
                })
            }));

            // Message dispatch task.
            tokio::spawn(async move {
                while let Some(raw) = incoming_rx.recv().await {
                    let message: DataChannelMessage = match serde_json::from_slice(&raw) {
                        Ok(msg) => msg,
                        Err(e) => {
                            tracing::warn!(?e, "Invalid data channel message");
                            continue;
                        }
                    };

                    match message {
                        DataChannelMessage::HttpRequest(request) => {
                            tracing::trace!(
                                id = %request.id,
                                method = %request.method,
                                path = %request.path,
                                "[server-peer] received HTTP request"
                            );
                            let client = http_client.clone();
                            let addr = local_backend_addr.clone();
                            let tx = dc_send_tx.clone();
                            tokio::spawn(async move {
                                let response = proxy_request(&client, &addr, request).await;
                                tracing::trace!(
                                    id = %response.id,
                                    status = response.status,
                                    body_len = response
                                        .body_b64
                                        .as_ref()
                                        .map(|b| b.len())
                                        .unwrap_or(0),
                                    "[server-peer] sending HTTP response"
                                );
                                let msg = DataChannelMessage::HttpResponse(response);
                                if let Ok(json) = serde_json::to_vec(&msg) {
                                    let _ = tx.send(json).await;
                                }
                            });
                        }

                        DataChannelMessage::WsOpen(ws_open) => {
                            handle_ws_open(ws_open, &local_backend_addr, &dc_send_tx, &ws_conns)
                                .await;
                        }

                        DataChannelMessage::WsFrame(frame) => {
                            let conn_id = frame.conn_id.clone();
                            let conns = ws_conns.lock().await;
                            if let Some(tx) = conns.get(&conn_id) {
                                if tx.send(frame).await.is_err() {
                                    drop(conns);
                                    ws_conns.lock().await.remove(&conn_id);
                                }
                            }
                        }

                        DataChannelMessage::WsClose(close) => {
                            ws_conns.lock().await.remove(&close.conn_id);
                        }

                        // Client shouldn't send these; ignore.
                        DataChannelMessage::HttpResponse(_)
                        | DataChannelMessage::WsOpened(_)
                        | DataChannelMessage::WsError(_) => {}
                    }
                }
            });
        })
    }));

    // Writer task: drains dc_send_rx, fragments, and writes to the data channel.
    let writer_shutdown = disconnect_token.clone();
    tokio::spawn(async move {
        let dc = match dc_ready_rx.await {
            Ok(dc) => dc,
            Err(_) => return,
        };
        let mut dc_send_rx = dc_send_rx;
        loop {
            tokio::select! {
                Some(msg_json) = dc_send_rx.recv() => {
                    tracing::trace!(
                        bytes = msg_json.len(),
                        "[server-peer] writing to data channel"
                    );
                    let chunks = fragment::fragment(msg_json);
                    for chunk in chunks {
                        if let Err(e) = dc.send(&Bytes::from(chunk)).await {
                            tracing::warn!(?e, "Failed to send on data channel");
                            break;
                        }
                    }
                }
                _ = writer_shutdown.cancelled() => break,
            }
        }
    });

    // Wait for shutdown or disconnection.
    disconnect_token.cancelled().await;
    let _ = peer_connection.close().await;
    tracing::debug!("[server-peer] peer connection closed");
    Ok(())
}

// ---------------------------------------------------------------------------
// HTTP proxy
// ---------------------------------------------------------------------------

async fn proxy_request(
    http_client: &reqwest::Client,
    local_backend_addr: &str,
    request: DataChannelRequest,
) -> DataChannelResponse {
    let url = format!("http://{}{}", local_backend_addr, request.path);

    let method = match request.method.to_uppercase().as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        "PUT" => reqwest::Method::PUT,
        "DELETE" => reqwest::Method::DELETE,
        "PATCH" => reqwest::Method::PATCH,
        "HEAD" => reqwest::Method::HEAD,
        "OPTIONS" => reqwest::Method::OPTIONS,
        other => {
            tracing::warn!(%other, "Unsupported HTTP method");
            return DataChannelResponse {
                id: request.id,
                status: 405,
                headers: Default::default(),
                body_b64: None,
            };
        }
    };

    let mut req_builder = http_client.request(method, &url);

    for (key, value) in &request.headers {
        let k = key.to_ascii_lowercase();
        if k == "origin" || k == "host" || k == "x-vk-relayed" {
            continue;
        }
        req_builder = req_builder.header(key.as_str(), value.as_str());
    }

    if let Some(body_b64) = &request.body_b64 {
        use base64::Engine as _;
        match base64::engine::general_purpose::STANDARD.decode(body_b64) {
            Ok(body) => {
                req_builder = req_builder.body(body);
            }
            Err(e) => {
                tracing::warn!(?e, "Invalid base64 body in data channel request");
                return DataChannelResponse {
                    id: request.id,
                    status: 400,
                    headers: Default::default(),
                    body_b64: None,
                };
            }
        }
    }

    match req_builder.send().await {
        Ok(response) => {
            let status = response.status().as_u16();
            let mut headers = std::collections::HashMap::new();
            for (key, value) in response.headers() {
                if let Ok(v) = value.to_str() {
                    headers.insert(key.to_string(), v.to_string());
                }
            }

            let body_b64 = match response.bytes().await {
                Ok(bytes) if !bytes.is_empty() => {
                    use base64::Engine as _;
                    Some(base64::engine::general_purpose::STANDARD.encode(&bytes))
                }
                _ => None,
            };

            DataChannelResponse {
                id: request.id,
                status,
                headers,
                body_b64,
            }
        }
        Err(e) => {
            tracing::warn!(?e, %url, "Failed to proxy request to local backend");
            DataChannelResponse {
                id: request.id,
                status: 502,
                headers: Default::default(),
                body_b64: None,
            }
        }
    }
}

// ---------------------------------------------------------------------------
// WebSocket proxy
// ---------------------------------------------------------------------------

async fn handle_ws_open(
    ws_open: WsOpen,
    local_backend_addr: &str,
    dc_send_tx: &mpsc::Sender<Vec<u8>>,
    ws_connections: &Arc<Mutex<HashMap<String, mpsc::Sender<WsFrame>>>>,
) {
    let conn_id = ws_open.conn_id.clone();
    let (frame_tx, frame_rx) = mpsc::channel::<WsFrame>(32);
    ws_connections
        .lock()
        .await
        .insert(conn_id.clone(), frame_tx);

    let addr = local_backend_addr.to_string();
    let dc_tx = dc_send_tx.clone();

    tokio::spawn(async move {
        if let Err(e) = run_ws_bridge(ws_open, &addr, frame_rx, &dc_tx).await {
            let msg = DataChannelMessage::WsError(WsError {
                conn_id,
                error: e.to_string(),
            });
            if let Ok(json) = serde_json::to_vec(&msg) {
                let _ = dc_tx.send(json).await;
            }
        }
    });
}

async fn run_ws_bridge(
    ws_open: WsOpen,
    local_backend_addr: &str,
    mut frame_rx: mpsc::Receiver<WsFrame>,
    dc_tx: &mpsc::Sender<Vec<u8>>,
) -> anyhow::Result<()> {
    let conn_id = ws_open.conn_id.clone();
    let url = format!("ws://{}{}", local_backend_addr, ws_open.path);

    use tokio_tungstenite::tungstenite::client::IntoClientRequest;
    let mut request = url
        .into_client_request()
        .map_err(|e| anyhow::anyhow!("Bad WS request: {e}"))?;

    if let Some(protocols) = &ws_open.protocols {
        request.headers_mut().insert(
            "sec-websocket-protocol",
            protocols
                .parse()
                .map_err(|e| anyhow::anyhow!("Bad protocol header: {e}"))?,
        );
    }

    let (ws_stream, response) = tokio_tungstenite::connect_async(request)
        .await
        .map_err(|e| anyhow::anyhow!("WS connect failed: {e}"))?;

    let selected_protocol = response
        .headers()
        .get("sec-websocket-protocol")
        .and_then(|v| v.to_str().ok())
        .map(String::from);

    let opened_msg = DataChannelMessage::WsOpened(WsOpened {
        conn_id: conn_id.clone(),
        selected_protocol,
    });
    if let Ok(json) = serde_json::to_vec(&opened_msg) {
        dc_tx.send(json).await.ok();
    }

    let (mut ws_sender, mut ws_receiver) = ws_stream.split();

    // Local WS → data channel
    let conn_id_up = conn_id.clone();
    let dc_tx_up = dc_tx.clone();
    let upstream_to_dc = tokio::spawn(async move {
        while let Some(msg_result) = ws_receiver.next().await {
            let msg = match msg_result {
                Ok(m) => m,
                Err(_) => break,
            };

            let relay_frame = msg.decompose();
            let is_close = matches!(relay_frame.msg_type, RelayWsMessageType::Close);
            let ws_frame = WsFrame::from_relay_frame(conn_id_up.clone(), relay_frame);
            let frame_msg = DataChannelMessage::WsFrame(ws_frame);
            if let Ok(json) = serde_json::to_vec(&frame_msg) {
                if dc_tx_up.send(json).await.is_err() {
                    break;
                }
            }

            if is_close {
                break;
            }
        }

        let close_msg = DataChannelMessage::WsClose(WsClose {
            conn_id: conn_id_up.clone(),
            code: None,
            reason: None,
        });
        if let Ok(json) = serde_json::to_vec(&close_msg) {
            let _ = dc_tx_up.send(json).await;
        }
    });

    // Data channel → local WS
    let dc_to_upstream = tokio::spawn(async move {
        while let Some(frame) = frame_rx.recv().await {
            let is_close = matches!(frame.msg_type, RelayWsMessageType::Close);
            let relay_frame = frame.into_relay_frame();
            let msg = match tokio_tungstenite::tungstenite::Message::reconstruct(relay_frame) {
                Ok(m) => m,
                Err(_) => break,
            };
            if ws_sender.send(msg).await.is_err() {
                break;
            }
            if is_close {
                break;
            }
        }
        let _ = ws_sender.close().await;
    });

    tokio::select! {
        _ = upstream_to_dc => {}
        _ = dc_to_upstream => {}
    }

    Ok(())
}
