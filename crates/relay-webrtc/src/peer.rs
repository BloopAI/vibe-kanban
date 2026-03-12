use std::{collections::HashMap, net::SocketAddr, time::Instant};

use futures_util::{SinkExt, StreamExt};
use relay_control::signed_ws::{RelayTransportMessage, RelayWsMessageType};
use str0m::{
    Candidate, Event, IceConnectionState, Input, Output, Rtc,
    channel::ChannelId,
    net::{Protocol, Receive},
};
use tokio::{net::UdpSocket, sync::mpsc};
use tokio_util::sync::CancellationToken;

use crate::proxy::{
    DataChannelMessage, DataChannelRequest, DataChannelResponse, WsClose, WsError, WsFrame, WsOpen,
    WsOpened,
};

/// Handle for communicating with a running peer task.
#[derive(Debug)]
pub struct PeerHandle {
    /// Send ICE candidates to the running peer.
    pub candidate_tx: mpsc::Sender<Candidate>,
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

/// Create a new str0m Rtc instance configured for receiving data channels.
pub fn create_rtc() -> Rtc {
    Rtc::builder().build(Instant::now())
}

/// Bind a UDP socket and accept an SDP offer, returning the answer with the
/// server's host candidate already included in the SDP.
pub async fn accept_offer(offer_sdp: &str) -> anyhow::Result<(String, Rtc, UdpSocket)> {
    let socket = UdpSocket::bind("0.0.0.0:0").await?;
    let public_addr = crate::stun::stun_binding(&socket).await?;
    let local_ip = crate::stun::resolve_local_ip()?;
    let local_addr = SocketAddr::new(local_ip, socket.local_addr()?.port());

    let mut rtc = create_rtc();

    // Add both candidates so str0m can form pairs and send checks.
    let host_candidate = Candidate::host(local_addr, "udp")
        .map_err(|e| anyhow::anyhow!("Failed to create host candidate: {e}"))?;
    rtc.add_local_candidate(host_candidate);

    let srflx_candidate = Candidate::server_reflexive(public_addr, local_addr, "udp")
        .map_err(|e| anyhow::anyhow!("Failed to create srflx candidate: {e}"))?;
    rtc.add_local_candidate(srflx_candidate);

    let offer = str0m::change::SdpOffer::from_sdp_string(offer_sdp)
        .map_err(|e| anyhow::anyhow!("Invalid SDP offer: {e}"))?;

    let answer = rtc
        .sdp_api()
        .accept_offer(offer)
        .map_err(|e| anyhow::anyhow!("Failed to accept offer: {e}"))?;

    let answer_sdp = answer.to_sdp_string();

    Ok((answer_sdp, rtc, socket))
}

/// Run the server-side peer event loop.
///
/// Takes a pre-bound UDP socket (from [`accept_offer`]) and runs the str0m event
/// loop. Data channel messages are proxied to/from the local backend concurrently.
pub async fn run_peer(
    mut rtc: Rtc,
    socket: UdpSocket,
    config: PeerConfig,
    mut candidate_rx: mpsc::Receiver<Candidate>,
) -> anyhow::Result<()> {
    let local_ip = crate::stun::resolve_local_ip()?;
    let local_addr = SocketAddr::new(local_ip, socket.local_addr()?.port());

    let mut buf = vec![0u8; 2000];
    let mut active_channel: Option<ChannelId> = None;
    let http_client = reqwest::Client::new();

    // Channel for spawned tasks (HTTP proxy + WS bridge) to send messages back
    // to the data channel.
    let (dc_send_tx, mut dc_send_rx) = mpsc::channel::<(ChannelId, Vec<u8>)>(64);

    // Active WebSocket connections: conn_id → sender for frames from the client.
    let mut ws_connections: HashMap<String, mpsc::Sender<WsFrame>> = HashMap::new();

    loop {
        let timeout = match rtc.poll_output() {
            Ok(output) => match output {
                Output::Timeout(t) => t,

                Output::Transmit(transmit) => {
                    if let Err(e) = socket
                        .send_to(&transmit.contents, transmit.destination)
                        .await
                    {
                        tracing::warn!(?e, "Failed to send UDP packet");
                    }
                    continue;
                }

                Output::Event(event) => {
                    if let Event::ChannelData(data) = &event {
                        let message: DataChannelMessage = match serde_json::from_slice(&data.data) {
                            Ok(msg) => msg,
                            Err(e) => {
                                tracing::warn!(?e, "Invalid data channel message");
                                continue;
                            }
                        };
                        let channel_id = data.id;

                        match message {
                            DataChannelMessage::HttpRequest(request) => {
                                let client = http_client.clone();
                                let addr = config.local_backend_addr.clone();
                                let tx = dc_send_tx.clone();
                                tokio::spawn(async move {
                                    let response = proxy_request(&client, &addr, request).await;
                                    let msg = DataChannelMessage::HttpResponse(response);
                                    if let Ok(json) = serde_json::to_vec(&msg) {
                                        let _ = tx.send((channel_id, json)).await;
                                    }
                                });
                            }

                            DataChannelMessage::WsOpen(ws_open) => {
                                handle_ws_open(
                                    ws_open,
                                    channel_id,
                                    &config.local_backend_addr,
                                    &dc_send_tx,
                                    &mut ws_connections,
                                );
                            }

                            DataChannelMessage::WsFrame(frame) => {
                                let conn_id = frame.conn_id.clone();
                                if let Some(tx) = ws_connections.get(&conn_id)
                                    && tx.send(frame).await.is_err()
                                {
                                    ws_connections.remove(&conn_id);
                                }
                            }

                            DataChannelMessage::WsClose(close) => {
                                // Drop the sender — the bridge task will see the
                                // channel close and shut down the local WS.
                                ws_connections.remove(&close.conn_id);
                            }

                            // Client shouldn't send these; ignore.
                            DataChannelMessage::HttpResponse(_)
                            | DataChannelMessage::WsOpened(_)
                            | DataChannelMessage::WsError(_) => {}
                        }
                    } else {
                        handle_event(&event, &mut active_channel);
                    }

                    if matches!(
                        event,
                        Event::IceConnectionStateChange(IceConnectionState::Disconnected)
                    ) {
                        return Ok(());
                    }
                    continue;
                }
            },
            Err(e) => {
                tracing::warn!(?e, "str0m poll_output error");
                return Err(e.into());
            }
        };

        let now = Instant::now();
        let duration = timeout.saturating_duration_since(now);

        tokio::select! {
            _ = config.shutdown.cancelled() => {
                rtc.disconnect();
                return Ok(());
            }

            result = socket.recv_from(&mut buf) => {
                match result {
                    Ok((n, source)) => {
                        let contents: str0m::net::DatagramRecv<'_> = match buf[..n].try_into() {
                            Ok(c) => c,
                            Err(_) => continue,
                        };
                        let input = Input::Receive(
                            Instant::now(),
                            Receive {
                                proto: Protocol::Udp,
                                source,
                                destination: local_addr,
                                contents,
                            },
                        );
                        if let Err(e) = rtc.handle_input(input) {
                            tracing::warn!(?e, "str0m handle_input error");
                        }
                    }
                    Err(e) => {
                        tracing::warn!(?e, "UDP recv error");
                    }
                }
            }

            Some(candidate) = candidate_rx.recv() => {
                rtc.add_remote_candidate(candidate);
            }

            // Receive messages from concurrent tasks to write to the data channel.
            Some((channel_id, msg_json)) = dc_send_rx.recv() => {
                if let Some(mut channel) = rtc.channel(channel_id)
                    && let Err(e) = channel.write(false, &msg_json)
                {
                    tracing::warn!(?e, "Failed to write message to data channel");
                }
            }

            _ = tokio::time::sleep(duration) => {
                if let Err(e) = rtc.handle_input(Input::Timeout(Instant::now())) {
                    tracing::warn!(?e, "str0m timeout handling error");
                }
            }
        }
    }
}

fn handle_event(event: &Event, active_channel: &mut Option<ChannelId>) {
    match event {
        Event::ChannelOpen(channel_id, _) => {
            *active_channel = Some(*channel_id);
        }

        Event::ChannelClose(channel_id) => {
            if active_channel.as_ref() == Some(channel_id) {
                *active_channel = None;
            }
        }

        _ => {}
    }
}

// ---------------------------------------------------------------------------
// HTTP proxy (unchanged logic)
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

    // Forward headers but skip ones that shouldn't cross the WebRTC boundary:
    // - origin: the local browser's origin won't match the remote host
    // - host: reqwest sets this from the URL automatically
    // - x-vk-relayed: would trigger relay signature verification which WebRTC bypasses
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

/// Spawn a background task that connects a local WebSocket and bridges it
/// to the data channel.
fn handle_ws_open(
    ws_open: WsOpen,
    channel_id: ChannelId,
    local_backend_addr: &str,
    dc_send_tx: &mpsc::Sender<(ChannelId, Vec<u8>)>,
    ws_connections: &mut HashMap<String, mpsc::Sender<WsFrame>>,
) {
    let conn_id = ws_open.conn_id.clone();

    // Channel for forwarding WsFrame messages from the client to the local WS.
    let (frame_tx, frame_rx) = mpsc::channel::<WsFrame>(32);
    ws_connections.insert(conn_id.clone(), frame_tx);

    let addr = local_backend_addr.to_string();
    let dc_tx = dc_send_tx.clone();

    tokio::spawn(async move {
        if let Err(e) = run_ws_bridge(ws_open, channel_id, &addr, frame_rx, &dc_tx).await {
            let msg = DataChannelMessage::WsError(WsError {
                conn_id,
                error: e.to_string(),
            });
            if let Ok(json) = serde_json::to_vec(&msg) {
                let _ = dc_tx.send((channel_id, json)).await;
            }
        }
    });
}

async fn run_ws_bridge(
    ws_open: WsOpen,
    channel_id: ChannelId,
    local_backend_addr: &str,
    mut frame_rx: mpsc::Receiver<WsFrame>,
    dc_tx: &mpsc::Sender<(ChannelId, Vec<u8>)>,
) -> anyhow::Result<()> {
    let conn_id = ws_open.conn_id.clone();
    let url = format!("ws://{}{}", local_backend_addr, ws_open.path);

    // Let tungstenite build the WS handshake request from the URL (generates
    // sec-websocket-key, upgrade headers, etc.), then add our protocol header.
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

    // Tell the client the connection is open.
    let opened_msg = DataChannelMessage::WsOpened(WsOpened {
        conn_id: conn_id.clone(),
        selected_protocol,
    });
    if let Ok(json) = serde_json::to_vec(&opened_msg) {
        dc_tx.send((channel_id, json)).await.ok();
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
                if dc_tx_up.send((channel_id, json)).await.is_err() {
                    break;
                }
            }

            if is_close {
                break;
            }
        }

        // Send WsClose so the client knows the upstream closed.
        let close_msg = DataChannelMessage::WsClose(WsClose {
            conn_id: conn_id_up.clone(),
            code: None,
            reason: None,
        });
        if let Ok(json) = serde_json::to_vec(&close_msg) {
            let _ = dc_tx_up.send((channel_id, json)).await;
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
        // frame_rx closed means the peer dropped our sender (client disconnect or
        // WsClose received in the event loop). Close the local WS gracefully.
        let _ = ws_sender.close().await;
    });

    tokio::select! {
        _ = upstream_to_dc => {}
        _ = dc_to_upstream => {}
    }

    Ok(())
}
