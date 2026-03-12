use std::{
    collections::HashMap,
    future::Future,
    net::SocketAddr,
    pin::Pin,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Instant,
};

use relay_control::signed_ws::{RelayWsFrame, UpstreamWsReceiver, UpstreamWsSender};
use str0m::{
    Candidate, Event, IceConnectionState, Input, Output, Rtc,
    change::SdpPendingOffer,
    channel::ChannelId,
    net::{Protocol, Receive},
};
use tokio::{
    net::UdpSocket,
    sync::{mpsc, oneshot},
};
use tokio_util::sync::CancellationToken;

use crate::{
    proxy::{
        DataChannelMessage, DataChannelRequest, DataChannelResponse, WsClose, WsFrame, WsOpen,
    },
    signaling::SdpOffer,
};

// ---------------------------------------------------------------------------
// Public request types sent into the event loop
// ---------------------------------------------------------------------------

/// A pending HTTP request waiting to be written to the data channel.
struct PendingHttpRequest {
    data: Vec<u8>,
    response_tx: oneshot::Sender<DataChannelResponse>,
}

/// A pending WS open request.
struct PendingWsOpen {
    data: Vec<u8>,
    result_tx: oneshot::Sender<Result<WsConnection, String>>,
    conn_id: String,
}

/// Commands sent from the public API to the event loop.
enum ClientCommand {
    Http(PendingHttpRequest),
    WsOpen(PendingWsOpen),
    /// Forward a WS frame to the data channel.
    WsFrame(Vec<u8>),
    /// Forward a WS close to the data channel.
    WsClose(Vec<u8>),
}

// ---------------------------------------------------------------------------
// WsConnection — returned to the caller of open_ws
// ---------------------------------------------------------------------------

/// A WebSocket connection multiplexed over the WebRTC data channel.
///
/// Frames received from the remote are delivered on `frame_rx`.
/// Outgoing frames and close are sent via a [`WsSender`].
pub struct WsConnection {
    pub conn_id: String,
    pub selected_protocol: Option<String>,
    pub frame_rx: mpsc::Receiver<WsFrame>,
    sender: WsSender,
}

impl WsConnection {
    /// Get a cloneable sender handle for writing frames / closing.
    pub fn sender(&self) -> WsSender {
        self.sender.clone()
    }

    /// Split into trait-object sender and receiver for use with a generic WS bridge.
    pub fn into_upstream(self) -> (WsSender, WebRtcWsReceiver) {
        (
            self.sender,
            WebRtcWsReceiver {
                frame_rx: self.frame_rx,
            },
        )
    }
}

/// Cloneable handle for sending frames and closing a WebRTC WS connection.
#[derive(Clone)]
pub struct WsSender {
    conn_id: String,
    cmd_tx: mpsc::Sender<ClientCommand>,
}

impl WsSender {
    /// Send a WebSocket frame to the remote.
    pub async fn send_frame(&self, frame: WsFrame) -> anyhow::Result<()> {
        let msg = DataChannelMessage::WsFrame(frame);
        let data = serde_json::to_vec(&msg)?;
        self.cmd_tx
            .send(ClientCommand::WsFrame(data))
            .await
            .map_err(|_| anyhow::anyhow!("Peer task has exited"))?;
        Ok(())
    }

    /// Close this WebSocket connection.
    pub async fn close(&self, code: Option<u16>, reason: Option<String>) -> anyhow::Result<()> {
        let msg = DataChannelMessage::WsClose(WsClose {
            conn_id: self.conn_id.clone(),
            code,
            reason,
        });
        let data = serde_json::to_vec(&msg)?;
        self.cmd_tx
            .send(ClientCommand::WsClose(data))
            .await
            .map_err(|_| anyhow::anyhow!("Peer task has exited"))?;
        Ok(())
    }
}

impl UpstreamWsSender for WsSender {
    fn send_frame(
        &mut self,
        frame: RelayWsFrame,
    ) -> Pin<Box<dyn Future<Output = anyhow::Result<()>> + Send + '_>> {
        Box::pin(async move {
            let ws_frame = WsFrame::from_relay_frame(self.conn_id.clone(), frame);
            WsSender::send_frame(self, ws_frame).await
        })
    }

    fn close(&mut self) -> Pin<Box<dyn Future<Output = anyhow::Result<()>> + Send + '_>> {
        Box::pin(WsSender::close(self, None, None))
    }
}

/// Receiver for WebRTC WS frames, implementing [`UpstreamWsReceiver`].
pub struct WebRtcWsReceiver {
    pub(crate) frame_rx: mpsc::Receiver<WsFrame>,
}

impl UpstreamWsReceiver for WebRtcWsReceiver {
    fn recv_frame(
        &mut self,
    ) -> Pin<Box<dyn Future<Output = anyhow::Result<Option<RelayWsFrame>>> + Send + '_>> {
        Box::pin(async move {
            match self.frame_rx.recv().await {
                Some(frame) => Ok(Some(frame.into_relay_frame())),
                None => Ok(None),
            }
        })
    }
}

// ---------------------------------------------------------------------------
// WebRtcOffer / WebRtcClient
// ---------------------------------------------------------------------------

/// Result of creating a WebRTC offer (before the answer is received).
pub struct WebRtcOffer {
    /// The SDP offer to send to the remote peer via signaling.
    pub offer: SdpOffer,
    /// The str0m Rtc instance — must be passed to [`WebRtcClient::connect`].
    pub rtc: Rtc,
    /// The pending offer state — must be passed to [`WebRtcClient::connect`].
    pub pending: SdpPendingOffer,
}

/// Active WebRTC client connection to a remote peer.
///
/// Created by [`WebRtcClient::connect`] after exchanging SDP offer/answer.
/// Sends HTTP requests over the data channel and correlates responses by request ID.
pub struct WebRtcClient {
    cmd_tx: mpsc::Sender<ClientCommand>,
    candidate_tx: mpsc::Sender<Candidate>,
    connected: Arc<AtomicBool>,
    shutdown: CancellationToken,
}

impl WebRtcClient {
    /// Create a new SDP offer for initiating a WebRTC connection.
    ///
    /// Uses full ICE (not ICE-lite) so the client drives connectivity checks.
    /// The returned [`WebRtcOffer`] contains the SDP to send via signaling,
    /// plus the `Rtc` and `SdpPendingOffer` needed by [`connect`](Self::connect).
    pub fn create_offer(session_id: String) -> anyhow::Result<WebRtcOffer> {
        let mut rtc = Rtc::builder().build(Instant::now());

        let mut changes = rtc.sdp_api();
        changes.add_channel("relay".to_string());
        let (offer, pending) = changes
            .apply()
            .ok_or_else(|| anyhow::anyhow!("No SDP changes to apply"))?;

        let offer_sdp = offer.to_sdp_string();

        Ok(WebRtcOffer {
            offer: SdpOffer {
                sdp: offer_sdp,
                session_id,
            },
            rtc,
            pending,
        })
    }

    /// Accept an SDP answer and start the WebRTC client connection.
    ///
    /// Binds a UDP socket, adds the local host candidate, accepts the remote
    /// answer, and spawns the client event loop. Returns immediately — use
    /// [`is_connected`](Self::is_connected) to check when the data channel opens.
    pub async fn connect(
        mut rtc: Rtc,
        pending: SdpPendingOffer,
        answer_sdp: &str,
        shutdown: CancellationToken,
    ) -> anyhow::Result<Self> {
        // Bind UDP socket and discover our public address via STUN.
        let socket = UdpSocket::bind("0.0.0.0:0").await?;
        let public_addr = crate::stun::stun_binding(&socket).await?;
        let local_ip = crate::stun::resolve_local_ip()?;
        let local_addr = SocketAddr::new(local_ip, socket.local_addr()?.port());

        // Add both candidates so str0m can form pairs and send checks.
        // The client's SDP offer was already sent (with no candidates), so
        // these won't appear in any SDP sent to the peer.
        let host_candidate = Candidate::host(local_addr, "udp")
            .map_err(|e| anyhow::anyhow!("Failed to create host candidate: {e}"))?;
        rtc.add_local_candidate(host_candidate);

        let srflx_candidate = Candidate::server_reflexive(public_addr, local_addr, "udp")
            .map_err(|e| anyhow::anyhow!("Failed to create srflx candidate: {e}"))?;
        rtc.add_local_candidate(srflx_candidate);

        // Accept the SDP answer.
        let answer = str0m::change::SdpAnswer::from_sdp_string(answer_sdp)
            .map_err(|e| anyhow::anyhow!("Invalid SDP answer: {e}"))?;
        rtc.sdp_api()
            .accept_answer(pending, answer)
            .map_err(|e| anyhow::anyhow!("Failed to accept SDP answer: {e}"))?;

        let (cmd_tx, cmd_rx) = mpsc::channel(64);
        let (candidate_tx, candidate_rx) = mpsc::channel(32);
        let connected = Arc::new(AtomicBool::new(false));

        let connected_clone = connected.clone();
        let shutdown_clone = shutdown.clone();

        tokio::spawn(async move {
            if let Err(e) = run_client_peer(
                rtc,
                socket,
                cmd_rx,
                candidate_rx,
                connected_clone,
                shutdown_clone,
            )
            .await
            {
                tracing::warn!(?e, "WebRTC client peer task failed");
            }
        });

        Ok(Self {
            cmd_tx,
            candidate_tx,
            connected,
            shutdown,
        })
    }

    /// Send an ICE candidate received from signaling.
    pub async fn add_ice_candidate(&self, candidate: Candidate) -> anyhow::Result<()> {
        self.candidate_tx
            .send(candidate)
            .await
            .map_err(|_| anyhow::anyhow!("Peer task has exited"))?;
        Ok(())
    }

    /// Send an HTTP request over the data channel and wait for the response.
    pub async fn send_request(
        &self,
        method: &str,
        path: &str,
        headers: HashMap<String, String>,
        body: Option<Vec<u8>>,
    ) -> anyhow::Result<DataChannelResponse> {
        if !self.is_connected() {
            anyhow::bail!("WebRTC data channel not connected");
        }

        let request_id = uuid::Uuid::new_v4().to_string();

        let body_b64 = body.map(|b| {
            use base64::Engine as _;
            base64::engine::general_purpose::STANDARD.encode(&b)
        });

        let request = DataChannelRequest {
            id: request_id,
            method: method.to_string(),
            path: path.to_string(),
            headers,
            body_b64,
        };

        let msg = DataChannelMessage::HttpRequest(request);
        let data = serde_json::to_vec(&msg)?;
        let (response_tx, response_rx) = oneshot::channel();

        self.cmd_tx
            .send(ClientCommand::Http(PendingHttpRequest {
                data,
                response_tx,
            }))
            .await
            .map_err(|_| anyhow::anyhow!("Peer task has exited"))?;

        response_rx
            .await
            .map_err(|_| anyhow::anyhow!("Peer task dropped response channel"))
    }

    /// Open a WebSocket connection to the remote host over the data channel.
    pub async fn open_ws(
        &self,
        path: &str,
        protocols: Option<&str>,
    ) -> anyhow::Result<WsConnection> {
        if !self.is_connected() {
            anyhow::bail!("WebRTC data channel not connected");
        }

        let conn_id = uuid::Uuid::new_v4().to_string();

        let ws_open = WsOpen {
            conn_id: conn_id.clone(),
            path: path.to_string(),
            protocols: protocols.map(String::from),
        };

        let msg = DataChannelMessage::WsOpen(ws_open);
        let data = serde_json::to_vec(&msg)?;
        let (result_tx, result_rx) = oneshot::channel();

        self.cmd_tx
            .send(ClientCommand::WsOpen(PendingWsOpen {
                data,
                result_tx,
                conn_id,
            }))
            .await
            .map_err(|_| anyhow::anyhow!("Peer task has exited"))?;

        result_rx
            .await
            .map_err(|_| anyhow::anyhow!("Peer task dropped WS open channel"))?
            .map_err(|e| anyhow::anyhow!("WS open failed: {e}"))
    }

    /// Whether the data channel is currently open and connected.
    pub fn is_connected(&self) -> bool {
        self.connected.load(Ordering::Relaxed)
    }

    /// Shut down the WebRTC connection.
    pub fn shutdown(&self) {
        self.shutdown.cancel();
    }
}

// ---------------------------------------------------------------------------
// Client event loop
// ---------------------------------------------------------------------------

async fn run_client_peer(
    mut rtc: Rtc,
    socket: UdpSocket,
    mut cmd_rx: mpsc::Receiver<ClientCommand>,
    mut candidate_rx: mpsc::Receiver<Candidate>,
    connected: Arc<AtomicBool>,
    shutdown: CancellationToken,
) -> anyhow::Result<()> {
    let local_ip = crate::stun::resolve_local_ip()?;
    let local_addr = SocketAddr::new(local_ip, socket.local_addr()?.port());

    let mut buf = vec![0u8; 2000];
    let mut active_channel: Option<ChannelId> = None;

    // Pending HTTP responses keyed by request id.
    let mut pending_http: HashMap<String, oneshot::Sender<DataChannelResponse>> = HashMap::new();

    // Pending WS open results keyed by conn_id.
    let mut pending_ws_open: HashMap<String, oneshot::Sender<Result<WsConnection, String>>> =
        HashMap::new();

    // Active WS connections: conn_id → sender for frames from the remote.
    let mut ws_frame_senders: HashMap<String, mpsc::Sender<WsFrame>> = HashMap::new();

    // Separate channel for WsConnection handles to send frames/close commands
    // back into the event loop (they can't use cmd_tx which is owned by the caller).
    let (ws_cmd_tx, mut ws_cmd_rx) = mpsc::channel::<ClientCommand>(64);

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
                    match &event {
                        Event::Connected => {}

                        Event::IceConnectionStateChange(state) => {
                            if matches!(state, IceConnectionState::Disconnected) {
                                connected.store(false, Ordering::Relaxed);
                                return Ok(());
                            }
                        }

                        Event::ChannelOpen(channel_id, _) => {
                            active_channel = Some(*channel_id);
                            connected.store(true, Ordering::Relaxed);
                        }

                        Event::ChannelData(data) => {
                            let msg: DataChannelMessage = match serde_json::from_slice(&data.data) {
                                Ok(m) => m,
                                Err(e) => {
                                    tracing::warn!(?e, "Invalid data channel message from server");
                                    continue;
                                }
                            };

                            match msg {
                                DataChannelMessage::HttpResponse(response) => {
                                    if let Some(tx) = pending_http.remove(&response.id) {
                                        let _ = tx.send(response);
                                    }
                                }

                                DataChannelMessage::WsOpened(opened) => {
                                    if let Some(result_tx) = pending_ws_open.remove(&opened.conn_id)
                                    {
                                        let (frame_tx, frame_rx) = mpsc::channel(64);
                                        ws_frame_senders.insert(opened.conn_id.clone(), frame_tx);
                                        let conn = WsConnection {
                                            sender: WsSender {
                                                conn_id: opened.conn_id.clone(),
                                                cmd_tx: ws_cmd_tx.clone(),
                                            },
                                            conn_id: opened.conn_id,
                                            selected_protocol: opened.selected_protocol,
                                            frame_rx,
                                        };
                                        let _ = result_tx.send(Ok(conn));
                                    }
                                }

                                DataChannelMessage::WsFrame(frame) => {
                                    let conn_id = frame.conn_id.clone();
                                    if let Some(tx) = ws_frame_senders.get(&conn_id)
                                        && tx.send(frame).await.is_err()
                                    {
                                        ws_frame_senders.remove(&conn_id);
                                    }
                                }

                                DataChannelMessage::WsClose(close) => {
                                    ws_frame_senders.remove(&close.conn_id);
                                }

                                DataChannelMessage::WsError(err) => {
                                    // If we're still waiting for WsOpened, fail it.
                                    if let Some(result_tx) = pending_ws_open.remove(&err.conn_id) {
                                        let _ = result_tx.send(Err(err.error));
                                    }
                                    ws_frame_senders.remove(&err.conn_id);
                                }

                                // Client shouldn't receive these from the server.
                                DataChannelMessage::HttpRequest(_)
                                | DataChannelMessage::WsOpen(_) => {}
                            }
                        }

                        Event::ChannelClose(_) => {
                            active_channel = None;
                            connected.store(false, Ordering::Relaxed);
                        }

                        _ => {}
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
            _ = shutdown.cancelled() => {
                connected.store(false, Ordering::Relaxed);
                rtc.disconnect();
                return Ok(());
            }

            result = socket.recv_from(&mut buf) => {
                match result {
                    Ok((n, source)) => {
                        let contents = match buf[..n].try_into() {
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

            Some(cmd) = cmd_rx.recv() => {
                handle_client_command(
                    cmd,
                    &mut rtc,
                    active_channel,
                    &mut pending_http,
                    &mut pending_ws_open,
                );
            }

            // Commands from WsConnection handles (send_frame / close).
            Some(cmd) = ws_cmd_rx.recv() => {
                handle_client_command(
                    cmd,
                    &mut rtc,
                    active_channel,
                    &mut pending_http,
                    &mut pending_ws_open,
                );
            }

            _ = tokio::time::sleep(duration) => {
                if let Err(e) = rtc.handle_input(Input::Timeout(Instant::now())) {
                    tracing::warn!(?e, "str0m timeout handling error");
                }
            }
        }
    }
}

fn handle_client_command(
    cmd: ClientCommand,
    rtc: &mut Rtc,
    active_channel: Option<ChannelId>,
    pending_http: &mut HashMap<String, oneshot::Sender<DataChannelResponse>>,
    pending_ws_open: &mut HashMap<String, oneshot::Sender<Result<WsConnection, String>>>,
) {
    let Some(channel_id) = active_channel else {
        // Data channel not open — fail requests immediately.
        match cmd {
            ClientCommand::Http(req) => {
                let _ = req.response_tx.send(DataChannelResponse {
                    id: String::new(),
                    status: 503,
                    headers: Default::default(),
                    body_b64: None,
                });
            }
            ClientCommand::WsOpen(ws) => {
                let _ = ws.result_tx.send(Err("Data channel not open".into()));
            }
            _ => {}
        }
        return;
    };

    let write = |rtc: &mut Rtc, data: &[u8]| -> bool {
        if let Some(mut channel) = rtc.channel(channel_id) {
            if let Err(e) = channel.write(false, data) {
                tracing::warn!(?e, "Failed to write to data channel");
                return false;
            }
            true
        } else {
            false
        }
    };

    match cmd {
        ClientCommand::Http(req) => {
            if write(rtc, &req.data) {
                if let Ok(parsed) = serde_json::from_slice::<DataChannelMessage>(&req.data) {
                    if let DataChannelMessage::HttpRequest(r) = parsed {
                        pending_http.insert(r.id, req.response_tx);
                    }
                }
            } else {
                let _ = req.response_tx.send(DataChannelResponse {
                    id: String::new(),
                    status: 503,
                    headers: Default::default(),
                    body_b64: None,
                });
            }
        }
        ClientCommand::WsOpen(ws) => {
            if write(rtc, &ws.data) {
                pending_ws_open.insert(ws.conn_id, ws.result_tx);
            } else {
                let _ = ws
                    .result_tx
                    .send(Err("Failed to write to data channel".into()));
            }
        }
        ClientCommand::WsFrame(data) | ClientCommand::WsClose(data) => {
            write(rtc, &data);
        }
    }
}
