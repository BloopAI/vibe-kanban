use std::{
    collections::HashMap,
    pin::Pin,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    task::{Context, Poll, ready},
};

use bytes::Bytes;
use futures_util::{Sink, Stream};
use relay_ws::{RelayTransportMessage, RelayWsMessageType};
use tokio::{
    sync::{Mutex, mpsc, oneshot},
    time::Duration,
};
use tokio_tungstenite::tungstenite;
use tokio_util::sync::{CancellationToken, PollSender};
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
        DataChannelMessage, DataChannelRequest, DataChannelResponse, WsClose, WsFrame, WsOpen,
    },
    signaling::SdpOffer,
};

type PendingHttpMap = HashMap<String, oneshot::Sender<DataChannelResponse>>;
type PendingWsOpenMap = HashMap<String, oneshot::Sender<Result<WsConnection, String>>>;

// ---------------------------------------------------------------------------
// Internal command types
// ---------------------------------------------------------------------------

struct PendingHttpRequest {
    data: Vec<u8>,
    response_tx: oneshot::Sender<DataChannelResponse>,
}

struct PendingWsOpen {
    data: Vec<u8>,
    result_tx: oneshot::Sender<Result<WsConnection, String>>,
    conn_id: String,
}

pub(crate) enum ClientCommand {
    Http(PendingHttpRequest),
    WsOpen(PendingWsOpen),
    WsFrame(Vec<u8>),
    WsClose(Vec<u8>),
}

// ---------------------------------------------------------------------------
// WsConnection — returned to the caller of open_ws
// ---------------------------------------------------------------------------

/// A WebSocket connection multiplexed over the WebRTC data channel.
pub struct WsConnection {
    pub conn_id: String,
    pub selected_protocol: Option<String>,
    pub frame_rx: mpsc::Receiver<WsFrame>,
    sender: WsSender,
}

impl WsConnection {
    pub fn sender(&self) -> WsSender {
        self.sender.clone()
    }

    /// Convert into a `Stream + Sink<tungstenite::Message>` adapter for use
    /// with `ws_copy_bidirectional`.
    pub fn into_ws_stream(self) -> WebRtcWsStream {
        WebRtcWsStream {
            conn_id: self.conn_id,
            frame_rx: self.frame_rx,
            poll_sender: PollSender::new(self.sender.cmd_tx),
        }
    }
}

/// Cloneable handle for sending frames and closing a WebRTC WS connection.
#[derive(Clone)]
pub struct WsSender {
    conn_id: String,
    pub(crate) cmd_tx: mpsc::Sender<ClientCommand>,
}

impl WsSender {
    pub async fn send(&self, frame: WsFrame) -> anyhow::Result<()> {
        let msg = DataChannelMessage::WsFrame(frame);
        let data = serde_json::to_vec(&msg)?;
        self.cmd_tx
            .send(ClientCommand::WsFrame(data))
            .await
            .map_err(|_| anyhow::anyhow!("Peer task has exited"))?;
        Ok(())
    }

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

// ---------------------------------------------------------------------------
// WebRtcWsStream — Stream + Sink<tungstenite::Message> over the data channel
// ---------------------------------------------------------------------------

/// Adapts a WebRTC WS connection into `Stream + Sink<tungstenite::Message>` for
/// use with `ws_copy_bidirectional`.
///
/// Preserves WebSocket message types (text, binary, ping/pong, close) through
/// the data channel's JSON-based [`WsFrame`] protocol.
pub struct WebRtcWsStream {
    conn_id: String,
    frame_rx: mpsc::Receiver<WsFrame>,
    poll_sender: PollSender<ClientCommand>,
}

impl Stream for WebRtcWsStream {
    type Item = Result<tungstenite::Message, anyhow::Error>;

    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let this = self.get_mut();
        match this.frame_rx.poll_recv(cx) {
            Poll::Ready(Some(ws_frame)) => {
                let relay_frame = ws_frame.into_relay_frame();
                Poll::Ready(Some(tungstenite::Message::reconstruct(relay_frame)))
            }
            Poll::Ready(None) => Poll::Ready(None),
            Poll::Pending => Poll::Pending,
        }
    }
}

impl Sink<tungstenite::Message> for WebRtcWsStream {
    type Error = anyhow::Error;

    fn poll_ready(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        let this = self.get_mut();
        ready!(this.poll_sender.poll_reserve(cx))
            .map_err(|_| anyhow::anyhow!("channel closed"))?;
        Poll::Ready(Ok(()))
    }

    fn start_send(self: Pin<&mut Self>, item: tungstenite::Message) -> Result<(), Self::Error> {
        let this = self.get_mut();
        let relay_frame = item.decompose();

        if matches!(relay_frame.msg_type, RelayWsMessageType::Close) {
            let msg = DataChannelMessage::WsClose(WsClose {
                conn_id: this.conn_id.clone(),
                code: None,
                reason: None,
            });
            let data = serde_json::to_vec(&msg)?;
            this.poll_sender
                .send_item(ClientCommand::WsClose(data))
                .map_err(|_| anyhow::anyhow!("channel closed"))?;
            return Ok(());
        }

        let ws_frame = WsFrame::from_relay_frame(this.conn_id.clone(), relay_frame);
        let msg = DataChannelMessage::WsFrame(ws_frame);
        let data = serde_json::to_vec(&msg)?;
        this.poll_sender
            .send_item(ClientCommand::WsFrame(data))
            .map_err(|_| anyhow::anyhow!("channel closed"))?;
        Ok(())
    }

    fn poll_flush(self: Pin<&mut Self>, _cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        Poll::Ready(Ok(()))
    }

    fn poll_close(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        let this = self.get_mut();
        ready!(this.poll_sender.poll_reserve(cx))
            .map_err(|_| anyhow::anyhow!("channel closed"))?;

        let msg = DataChannelMessage::WsClose(WsClose {
            conn_id: this.conn_id.clone(),
            code: None,
            reason: None,
        });
        let data = serde_json::to_vec(&msg)?;
        this.poll_sender
            .send_item(ClientCommand::WsClose(data))
            .map_err(|_| anyhow::anyhow!("channel closed"))?;
        Poll::Ready(Ok(()))
    }
}

// ---------------------------------------------------------------------------
// WebRtcOffer / WebRtcClient
// ---------------------------------------------------------------------------

/// Result of creating a WebRTC offer (before the answer is received).
///
/// Contains the SDP offer to send via signaling, plus internal state needed
/// by [`WebRtcClient::connect`]. Pass the whole struct to `connect()` after
/// exchanging the offer/answer with the remote peer.
pub struct WebRtcOffer {
    /// The SDP offer to send to the remote peer via signaling.
    pub offer: SdpOffer,
    /// Internal: the peer connection.
    peer_connection: Arc<RTCPeerConnection>,
    /// Internal: the data channel created during the offer.
    data_channel: Arc<RTCDataChannel>,
}

/// Active WebRTC client connection to a remote peer.
///
/// Created by [`WebRtcClient::connect`] after exchanging SDP offer/answer.
/// Sends HTTP requests over the data channel and correlates responses by request ID.
pub struct WebRtcClient {
    cmd_tx: mpsc::Sender<ClientCommand>,
    connected: Arc<AtomicBool>,
    shutdown: CancellationToken,
}

impl WebRtcClient {
    /// Create a new SDP offer for initiating a WebRTC connection.
    ///
    /// Returns a [`WebRtcOffer`] containing the SDP to send via signaling.
    /// After receiving the answer, pass the offer to [`connect`](Self::connect).
    pub async fn create_offer(session_id: String) -> anyhow::Result<WebRtcOffer> {
        let api = crate::build_api();

        let config = RTCConfiguration {
            ice_servers: vec![RTCIceServer {
                urls: vec!["stun:stun.l.google.com:19302".to_string()],
                ..Default::default()
            }],
            ..Default::default()
        };

        let peer_connection = Arc::new(api.new_peer_connection(config).await?);

        // Create the "relay" data channel (offerer creates it).
        let data_channel = peer_connection.create_data_channel("relay", None).await?;

        let offer = peer_connection.create_offer(None).await?;

        // Wait for ICE gathering to complete so candidates are in the SDP.
        let (gather_done_tx, gather_done_rx) = oneshot::channel::<()>();
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

        peer_connection.set_local_description(offer).await?;

        tokio::time::timeout(Duration::from_secs(5), gather_done_rx)
            .await
            .map_err(|_| anyhow::anyhow!("ICE gathering timed out"))?
            .map_err(|_| anyhow::anyhow!("ICE gathering channel dropped"))?;

        let offer_sdp = peer_connection
            .local_description()
            .await
            .ok_or_else(|| anyhow::anyhow!("No local description after ICE gathering"))?
            .sdp;

        Ok(WebRtcOffer {
            offer: SdpOffer {
                sdp: offer_sdp,
                session_id,
            },
            peer_connection,
            data_channel,
        })
    }

    /// Accept an SDP answer and start the WebRTC client connection.
    ///
    /// Consumes the [`WebRtcOffer`] from [`create_offer`](Self::create_offer),
    /// sets the remote description, and spawns the writer and dispatch tasks.
    /// Returns immediately — use [`is_connected`](Self::is_connected) to check
    /// when the data channel opens.
    pub async fn connect(
        webrtc_offer: WebRtcOffer,
        answer_sdp: &str,
        shutdown: CancellationToken,
    ) -> anyhow::Result<Self> {
        let peer_connection = webrtc_offer.peer_connection;
        let data_channel = webrtc_offer.data_channel;

        let answer = RTCSessionDescription::answer(answer_sdp.to_string())?;
        peer_connection.set_remote_description(answer).await?;

        let (cmd_tx, mut cmd_rx) = mpsc::channel(64);
        let connected = Arc::new(AtomicBool::new(false));

        // Shared state for routing incoming messages.
        let pending_http: Arc<Mutex<PendingHttpMap>> = Arc::new(Mutex::new(HashMap::new()));
        let pending_ws_open: Arc<Mutex<PendingWsOpenMap>> = Arc::new(Mutex::new(HashMap::new()));
        let ws_frame_senders: Arc<Mutex<HashMap<String, mpsc::Sender<WsFrame>>>> =
            Arc::new(Mutex::new(HashMap::new()));

        let ws_cmd_tx = cmd_tx.clone();

        // Detect ICE disconnection.
        let disconnect_token = shutdown.child_token();
        let disconnect_cancel = disconnect_token.clone();
        let connected_ice = connected.clone();
        peer_connection.on_ice_connection_state_change(Box::new(move |state| {
            let cancel = disconnect_cancel.clone();
            let connected = connected_ice.clone();
            Box::pin(async move {
                tracing::debug!(?state, "[client-peer] ICE connection state changed");
                if state == RTCIceConnectionState::Disconnected
                    || state == RTCIceConnectionState::Failed
                    || state == RTCIceConnectionState::Closed
                {
                    connected.store(false, Ordering::Relaxed);
                    cancel.cancel();
                }
            })
        }));

        // The client created the data channel in create_offer, so we register
        // callbacks directly on it (no on_data_channel needed).
        let connected_dc = connected.clone();
        data_channel.on_open(Box::new(move || {
            tracing::debug!("[client-peer] data channel opened");
            connected_dc.store(true, Ordering::Relaxed);
            Box::pin(async {})
        }));

        // Incoming message handler: defragment → dispatch.
        let (incoming_tx, mut incoming_rx) = mpsc::channel::<Vec<u8>>(64);
        let defrag = Arc::new(std::sync::Mutex::new(fragment::Defragmenter::new()));

        data_channel.on_message(Box::new(move |msg: RtcDcMessage| {
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

        // Message dispatch task: routes incoming messages to pending requests.
        let pending_http_dispatch = pending_http.clone();
        let pending_ws_open_dispatch = pending_ws_open.clone();
        let ws_frame_senders_dispatch = ws_frame_senders.clone();
        tokio::spawn(async move {
            while let Some(raw) = incoming_rx.recv().await {
                let msg: DataChannelMessage = match serde_json::from_slice(&raw) {
                    Ok(m) => m,
                    Err(e) => {
                        tracing::warn!(?e, "Invalid data channel message from server");
                        continue;
                    }
                };

                match msg {
                    DataChannelMessage::HttpResponse(response) => {
                        tracing::trace!(
                            id = %response.id,
                            status = response.status,
                            body_len = response
                                .body_b64
                                .as_ref()
                                .map(|b| b.len())
                                .unwrap_or(0),
                            "[client-peer] received HTTP response"
                        );
                        let mut pending = pending_http_dispatch.lock().await;
                        if let Some(tx) = pending.remove(&response.id) {
                            let _ = tx.send(response);
                        } else {
                            tracing::warn!(
                                id = %response.id,
                                "[client-peer] response for unknown request"
                            );
                        }
                    }

                    DataChannelMessage::WsOpened(opened) => {
                        let mut pending = pending_ws_open_dispatch.lock().await;
                        if let Some(result_tx) = pending.remove(&opened.conn_id) {
                            let (frame_tx, frame_rx) = mpsc::channel(64);
                            ws_frame_senders_dispatch
                                .lock()
                                .await
                                .insert(opened.conn_id.clone(), frame_tx);
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
                        let senders = ws_frame_senders_dispatch.lock().await;
                        if let Some(tx) = senders.get(&conn_id)
                            && tx.send(frame).await.is_err()
                        {
                            drop(senders);
                            ws_frame_senders_dispatch.lock().await.remove(&conn_id);
                        }
                    }

                    DataChannelMessage::WsClose(close) => {
                        ws_frame_senders_dispatch
                            .lock()
                            .await
                            .remove(&close.conn_id);
                    }

                    DataChannelMessage::WsError(err) => {
                        let mut pending = pending_ws_open_dispatch.lock().await;
                        if let Some(result_tx) = pending.remove(&err.conn_id) {
                            let _ = result_tx.send(Err(err.error));
                        }
                        ws_frame_senders_dispatch.lock().await.remove(&err.conn_id);
                    }

                    DataChannelMessage::HttpRequest(_) | DataChannelMessage::WsOpen(_) => {}
                }
            }
        });

        // Writer task: processes commands and writes to the data channel.
        let dc_writer = data_channel.clone();
        let pending_http_writer = pending_http.clone();
        let pending_ws_open_writer = pending_ws_open.clone();
        let writer_shutdown = disconnect_token.clone();
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    Some(cmd) = cmd_rx.recv() => {
                        handle_command(
                            cmd,
                            &dc_writer,
                            &pending_http_writer,
                            &pending_ws_open_writer,
                        ).await;
                    }
                    _ = writer_shutdown.cancelled() => break,
                }
            }
        });

        Ok(Self {
            cmd_tx,
            connected,
            shutdown: disconnect_token,
        })
    }

    /// Timeout for HTTP requests over the data channel.
    const HTTP_REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

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

        tokio::time::timeout(Self::HTTP_REQUEST_TIMEOUT, response_rx)
            .await
            .map_err(|_| anyhow::anyhow!("WebRTC request timed out"))?
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
// Command handler
// ---------------------------------------------------------------------------

async fn handle_command(
    cmd: ClientCommand,
    dc: &Arc<RTCDataChannel>,
    pending_http: &Arc<Mutex<PendingHttpMap>>,
    pending_ws_open: &Arc<Mutex<PendingWsOpenMap>>,
) {
    match cmd {
        ClientCommand::Http(req) => {
            let parsed = serde_json::from_slice::<DataChannelMessage>(&req.data).ok();
            tracing::trace!(
                bytes = req.data.len(),
                "[client-peer] writing HTTP request to data channel"
            );
            if write_to_dc(dc, req.data).await {
                if let Some(DataChannelMessage::HttpRequest(r)) = parsed {
                    let mut pending = pending_http.lock().await;
                    tracing::trace!(
                        id = %r.id,
                        pending = pending.len() + 1,
                        "[client-peer] request queued"
                    );
                    pending.insert(r.id, req.response_tx);
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
            if write_to_dc(dc, ws.data).await {
                pending_ws_open
                    .lock()
                    .await
                    .insert(ws.conn_id, ws.result_tx);
            } else {
                let _ = ws
                    .result_tx
                    .send(Err("Failed to write to data channel".into()));
            }
        }
        ClientCommand::WsFrame(data) | ClientCommand::WsClose(data) => {
            write_to_dc(dc, data).await;
        }
    }
}

/// Fragment and send data to the data channel. Returns true on success.
async fn write_to_dc(dc: &Arc<RTCDataChannel>, data: Vec<u8>) -> bool {
    let chunks = fragment::fragment(data);
    for chunk in chunks {
        if let Err(e) = dc.send(&Bytes::from(chunk)).await {
            tracing::warn!(?e, "[client-peer] failed to write to data channel");
            return false;
        }
    }
    true
}
