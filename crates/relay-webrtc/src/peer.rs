use std::{collections::HashMap, net::SocketAddr, sync::Arc, time::Duration};

use bytes::Bytes;
use tokio::sync::{Mutex, mpsc};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;
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
use ws_bridge::{bridge_tungstenite_ws, connect_upstream_ws};

use crate::{
    WebRtcError, fragment,
    proxy::{
        DataChannelMessage, DataChannelRequest, DataChannelResponse, DataChannelWsStream, WsError,
        WsFrame, WsOpen, WsOpened,
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
    /// Address of the local backend to proxy requests to.
    pub local_backend_addr: SocketAddr,
    /// Cancellation token for graceful shutdown.
    pub shutdown: CancellationToken,
}

/// Accept an SDP offer and return the answer SDP along with the peer connection.
///
/// Creates a new RTCPeerConnection with a STUN server, accepts the offer,
/// waits for ICE gathering to complete, and returns the answer with
/// candidates embedded in the SDP.
pub async fn accept_offer(
    offer_sdp: &str,
) -> Result<(String, Arc<RTCPeerConnection>), WebRtcError> {
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
            if state == RTCIceGathererState::Complete
                && let Some(sender) = tx.lock().unwrap().take()
            {
                let _ = sender.send(());
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
        .map_err(|_| WebRtcError::IceGatheringTimedOut)?
        .map_err(|_| WebRtcError::IceGatheringChannelDropped)?;

    let answer_sdp = peer_connection
        .local_description()
        .await
        .ok_or(WebRtcError::NoLocalDescription)?
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
) -> Result<(), WebRtcError> {
    let http_client = reqwest::Client::new();

    // Channel for the data channel writer task.
    let (dc_send_tx, dc_send_rx) = mpsc::channel::<Vec<u8>>(64);

    // Signal when the data channel opens so the writer task can start.
    let (dc_ready_tx, dc_ready_rx) = tokio::sync::oneshot::channel::<Arc<RTCDataChannel>>();
    let dc_ready_tx = Arc::new(std::sync::Mutex::new(Some(dc_ready_tx)));

    // Active WebSocket connections: conn_id → sender for frames from the client.
    let ws_connections: Arc<Mutex<HashMap<Uuid, mpsc::Sender<WsFrame>>>> =
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
    let local_backend_addr = config.local_backend_addr;
    let http_client_clone = http_client.clone();

    peer_connection.on_data_channel(Box::new(move |dc: Arc<RTCDataChannel>| {
        let dc_send_tx = dc_send_tx_clone.clone();
        let ws_conns = ws_conns.clone();
        let local_backend_addr = local_backend_addr;
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
                            let addr = local_backend_addr;
                            let tx = dc_send_tx.clone();
                            tokio::spawn(async move {
                                let response = proxy_request(&client, addr, request).await;
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
                            handle_ws_open(ws_open, local_backend_addr, &dc_send_tx, &ws_conns)
                                .await;
                        }

                        DataChannelMessage::WsFrame(frame) => {
                            let conn_id = frame.conn_id;
                            let tx = {
                                let conns = ws_conns.lock().await;
                                conns.get(&conn_id).cloned()
                            };

                            if let Some(tx) = tx
                                && tx.send(frame).await.is_err()
                            {
                                ws_conns.lock().await.remove(&conn_id);
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
        let dc = tokio::select! {
            result = dc_ready_rx => match result {
                Ok(dc) => dc,
                Err(_) => return,
            },
            _ = writer_shutdown.cancelled() => return,
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
    local_backend_addr: SocketAddr,
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

    for (key, values) in &request.headers {
        let k = key.to_ascii_lowercase();
        if k == "origin" || k == "host" || k == "x-vk-relayed" {
            continue;
        }
        for value in values {
            req_builder = req_builder.header(key.as_str(), value.as_str());
        }
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
            let mut headers: std::collections::HashMap<String, Vec<String>> =
                std::collections::HashMap::new();
            for (key, value) in response.headers() {
                if let Ok(v) = value.to_str() {
                    headers
                        .entry(key.to_string())
                        .or_default()
                        .push(v.to_string());
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
    local_backend_addr: SocketAddr,
    dc_send_tx: &mpsc::Sender<Vec<u8>>,
    ws_connections: &Arc<Mutex<HashMap<Uuid, mpsc::Sender<WsFrame>>>>,
) {
    let conn_id = ws_open.conn_id;
    let (frame_tx, frame_rx) = mpsc::channel::<WsFrame>(32);
    ws_connections.lock().await.insert(conn_id, frame_tx);

    let addr = local_backend_addr;
    let dc_tx = dc_send_tx.clone();
    let ws_connections = ws_connections.clone();

    tokio::spawn(async move {
        let bridge_result = run_ws_bridge(ws_open, addr, frame_rx, &dc_tx).await;

        // Always clear the per-connection sender when the bridge task exits.
        ws_connections.lock().await.remove(&conn_id);

        if let Err(e) = bridge_result {
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

// ---------------------------------------------------------------------------
// WS bridge using ws_copy_bidirectional
// ---------------------------------------------------------------------------

async fn run_ws_bridge(
    ws_open: WsOpen,
    local_backend_addr: SocketAddr,
    frame_rx: mpsc::Receiver<WsFrame>,
    dc_tx: &mpsc::Sender<Vec<u8>>,
) -> Result<(), WebRtcError> {
    let conn_id = ws_open.conn_id;
    let url = format!("ws://{}{}", local_backend_addr, ws_open.path);
    let (ws_stream, selected_protocol) =
        connect_upstream_ws(url, ws_open.protocols.as_deref()).await?;

    let opened_msg = DataChannelMessage::WsOpened(WsOpened {
        conn_id,
        selected_protocol,
    });
    let json = serde_json::to_vec(&opened_msg)?;
    dc_tx
        .send(json)
        .await
        .map_err(|_| WebRtcError::DataChannelSendQueueClosed)?;

    let bridge = DataChannelWsStream {
        conn_id,
        frame_rx,
        poll_sender: tokio_util::sync::PollSender::new(dc_tx.clone()),
    };

    bridge_tungstenite_ws(ws_stream, bridge)
        .await
        .map_err(WebRtcError::from)
}
