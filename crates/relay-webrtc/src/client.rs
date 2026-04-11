use std::{
    collections::HashMap,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};

use bytes::Bytes;
use tokio::{
    sync::{Mutex, Notify, mpsc, oneshot},
    time::Duration,
};
use tokio_util::sync::{CancellationToken, PollSender};
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

use crate::{
    fragment,
    proxy::{
        DataChannelMessage, DataChannelRequest, DataChannelResponse, DataChannelWsStream, WsClose,
        WsFrame, WsOpen,
    },
    signaling::SdpOffer,
};

#[derive(Debug, thiserror::Error)]
pub enum WebRtcClientError {
    #[error("WebRTC data channel not connected")]
    NotConnected,
    #[error("Failed to serialize data-channel message: {0}")]
    SerializeMessage(#[from] serde_json::Error),
    #[error("WebRTC operation failed: {0}")]
    WebRtc(#[from] webrtc::Error),
    #[error("WebRTC data-channel writer queue is closed (dropped {dropped_bytes} bytes)")]
    WriteQueueClosed { dropped_bytes: usize },
    #[error("WebRTC command queue is closed while enqueuing {command}")]
    CommandQueueClosed { command: &'static str },
    #[error("Timed out waiting for response")]
    TimedOut,
    #[error("Peer task dropped response channel")]
    ResponseChannelDropped,
    #[error("ICE gathering timed out")]
    IceGatheringTimedOut,
    #[error("ICE gathering channel dropped")]
    IceGatheringChannelDropped,
    #[error("No local description after ICE gathering")]
    NoLocalDescription,
    #[error("Data-channel write failed: {0}")]
    DataChannelWriteFailed(String),
}

type PendingHttpMap =
    HashMap<Uuid, oneshot::Sender<Result<DataChannelResponse, WebRtcClientError>>>;
/// Result of a WebSocket open attempt over the data channel.
///
/// `Ok` means the remote host successfully connected to its local backend.
/// `Err` carries the error string the peer reported via `WsError` — this is
/// **not** a data-channel transport failure (the message arrived over a
/// working channel), just an application-level rejection.
pub type WsOpenResult = Result<WsConnection, String>;

type PendingWsOpenMap = HashMap<Uuid, oneshot::Sender<Result<WsOpenResult, WebRtcClientError>>>;

// ---------------------------------------------------------------------------
// Internal command types
// ---------------------------------------------------------------------------

struct PendingHttpRequest {
    data: Vec<u8>,
    response_tx: oneshot::Sender<Result<DataChannelResponse, WebRtcClientError>>,
    request_id: Uuid,
}

struct PendingWsOpen {
    data: Vec<u8>,
    result_tx: oneshot::Sender<Result<WsOpenResult, WebRtcClientError>>,
    conn_id: Uuid,
}

enum ClientCommand {
    Http(PendingHttpRequest),
    WsOpen(PendingWsOpen),
}

// ---------------------------------------------------------------------------
// WsConnection — returned to the caller of open_ws
// ---------------------------------------------------------------------------

/// A WebSocket connection multiplexed over the WebRTC data channel.
pub struct WsConnection {
    pub conn_id: Uuid,
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
    pub fn into_ws_stream(self) -> DataChannelWsStream {
        DataChannelWsStream {
            conn_id: self.conn_id,
            frame_rx: self.frame_rx,
            poll_sender: PollSender::new(self.sender.dc_write_tx),
        }
    }
}

/// Cloneable handle for sending frames and closing a WebRTC WS connection.
#[derive(Clone)]
pub struct WsSender {
    conn_id: Uuid,
    pub(crate) dc_write_tx: mpsc::Sender<Vec<u8>>,
}

impl WsSender {
    pub async fn send(&self, frame: WsFrame) -> Result<(), WebRtcClientError> {
        let msg = DataChannelMessage::WsFrame(frame);
        let data = serde_json::to_vec(&msg)?;
        self.dc_write_tx
            .send(data)
            .await
            .map_err(|err| WebRtcClientError::WriteQueueClosed {
                dropped_bytes: err.0.len(),
            })?;
        Ok(())
    }

    pub async fn close(
        &self,
        code: Option<u16>,
        reason: Option<String>,
    ) -> Result<(), WebRtcClientError> {
        let msg = DataChannelMessage::WsClose(WsClose {
            conn_id: self.conn_id,
            code,
            reason,
        });
        let data = serde_json::to_vec(&msg)?;
        self.dc_write_tx
            .send(data)
            .await
            .map_err(|err| WebRtcClientError::WriteQueueClosed {
                dropped_bytes: err.0.len(),
            })?;
        Ok(())
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
    connected_notify: Arc<Notify>,
    shutdown: CancellationToken,
    peer_connection: Arc<RTCPeerConnection>,
}

impl WebRtcClient {
    /// Create a new SDP offer for initiating a WebRTC connection.
    ///
    /// Returns a [`WebRtcOffer`] containing the SDP to send via signaling.
    /// After receiving the answer, pass the offer to [`connect`](Self::connect).
    pub async fn create_offer(session_id: String) -> Result<WebRtcOffer, WebRtcClientError> {
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
                if state == RTCIceGathererState::Complete {
                    let maybe_sender = tx.lock().ok().and_then(|mut guard| guard.take());
                    if let Some(sender) = maybe_sender {
                        let _ = sender.send(());
                    }
                }
            })
        }));

        peer_connection.set_local_description(offer).await?;

        tokio::time::timeout(Duration::from_secs(5), gather_done_rx)
            .await
            .map_err(|_| WebRtcClientError::IceGatheringTimedOut)?
            .map_err(|_| WebRtcClientError::IceGatheringChannelDropped)?;

        let offer_sdp = peer_connection
            .local_description()
            .await
            .ok_or(WebRtcClientError::NoLocalDescription)?
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
    ) -> Result<Self, WebRtcClientError> {
        let peer_connection = webrtc_offer.peer_connection;
        let data_channel = webrtc_offer.data_channel;

        let answer = RTCSessionDescription::answer(answer_sdp.to_string())?;
        peer_connection.set_remote_description(answer).await?;

        let (cmd_tx, mut cmd_rx) = mpsc::channel(64);
        let (dc_write_tx, mut dc_write_rx) = mpsc::channel::<Vec<u8>>(64);
        let connected = Arc::new(AtomicBool::new(false));
        let connected_notify = Arc::new(Notify::new());

        // Shared state for routing incoming messages.
        let pending_http: Arc<Mutex<PendingHttpMap>> = Arc::new(Mutex::new(HashMap::new()));
        let pending_ws_open: Arc<Mutex<PendingWsOpenMap>> = Arc::new(Mutex::new(HashMap::new()));
        let ws_frame_senders: Arc<Mutex<HashMap<Uuid, mpsc::Sender<WsFrame>>>> =
            Arc::new(Mutex::new(HashMap::new()));

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
        let connected_notify_dc = connected_notify.clone();
        data_channel.on_open(Box::new(move || {
            tracing::debug!("[client-peer] data channel opened");
            connected_dc.store(true, Ordering::Relaxed);
            connected_notify_dc.notify_waiters();
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
                            let _ = tx.send(Ok(response));
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
                                .insert(opened.conn_id, frame_tx);
                            let conn = WsConnection {
                                sender: WsSender {
                                    conn_id: opened.conn_id,
                                    dc_write_tx: dc_write_tx.clone(),
                                },
                                conn_id: opened.conn_id,
                                selected_protocol: opened.selected_protocol,
                                frame_rx,
                            };
                            let _ = result_tx.send(Ok(Ok(conn)));
                        }
                    }

                    DataChannelMessage::WsFrame(frame) => {
                        let conn_id = frame.conn_id;
                        let tx = {
                            let senders = ws_frame_senders_dispatch.lock().await;
                            senders.get(&conn_id).cloned()
                        };

                        if let Some(tx) = tx
                            && tx.send(frame).await.is_err()
                        {
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
                            let _ = result_tx.send(Ok(Err(err.error)));
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
                    Some(data) = dc_write_rx.recv() => {
                        if let Err(e) = write_to_dc(&dc_writer, data).await {
                            tracing::warn!(?e, "[client-peer] failed to write queued data");
                        }
                    }
                    _ = writer_shutdown.cancelled() => break,
                }
            }
        });

        Ok(Self {
            cmd_tx,
            connected,
            connected_notify,
            shutdown: disconnect_token,
            peer_connection,
        })
    }

    /// Timeout for HTTP requests over the data channel.
    const HTTP_REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

    /// Send an HTTP request over the data channel and wait for the response.
    ///
    /// On connection-level errors (timeout, channel closed) the client
    /// automatically marks itself as disconnected so the cache skips it.
    pub async fn send_request(
        &self,
        method: &str,
        path: &str,
        headers: HashMap<String, Vec<String>>,
        body: Option<Vec<u8>>,
    ) -> Result<DataChannelResponse, WebRtcClientError> {
        if !self.is_connected() {
            return Err(WebRtcClientError::NotConnected);
        }
        let result = self.do_send_request(method, path, headers, body).await;
        if result.is_err() {
            self.disconnect();
        }
        result
    }

    /// Open a WebSocket connection to the remote host over the data channel.
    ///
    /// Returns `Ok(Ok(conn))` on success, `Ok(Err(reason))` if the remote
    /// host reported an error (e.g. its local backend rejected the WS — the
    /// data channel itself is fine), or `Err(...)` on transport failure
    /// (timeout, channel closed), which also marks the client as disconnected.
    pub async fn open_ws(
        &self,
        path: &str,
        protocols: Option<&str>,
    ) -> Result<WsOpenResult, WebRtcClientError> {
        if !self.is_connected() {
            return Err(WebRtcClientError::NotConnected);
        }
        let result = self.do_open_ws(path, protocols).await;
        if result.is_err() {
            self.disconnect();
        }
        result
    }

    async fn do_send_request(
        &self,
        method: &str,
        path: &str,
        headers: HashMap<String, Vec<String>>,
        body: Option<Vec<u8>>,
    ) -> Result<DataChannelResponse, WebRtcClientError> {
        let request_id = Uuid::new_v4();

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
                request_id,
            }))
            .await
            .map_err(|err| {
                let command = match err.0 {
                    ClientCommand::Http(_) => "http_request",
                    ClientCommand::WsOpen(_) => "ws_open",
                };
                WebRtcClientError::CommandQueueClosed { command }
            })?;

        tokio::time::timeout(Self::HTTP_REQUEST_TIMEOUT, response_rx)
            .await
            .map_err(|_| WebRtcClientError::TimedOut)?
            .map_err(|_| WebRtcClientError::ResponseChannelDropped)?
    }

    async fn do_open_ws(
        &self,
        path: &str,
        protocols: Option<&str>,
    ) -> Result<WsOpenResult, WebRtcClientError> {
        let conn_id = Uuid::new_v4();

        let ws_open = WsOpen {
            conn_id,
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
            .map_err(|err| {
                let command = match err.0 {
                    ClientCommand::Http(_) => "http_request",
                    ClientCommand::WsOpen(_) => "ws_open",
                };
                WebRtcClientError::CommandQueueClosed { command }
            })?;

        tokio::time::timeout(Self::HTTP_REQUEST_TIMEOUT, result_rx)
            .await
            .map_err(|_| WebRtcClientError::TimedOut)?
            .map_err(|_| WebRtcClientError::ResponseChannelDropped)?
    }

    /// Whether the data channel is currently open and connected.
    pub fn is_connected(&self) -> bool {
        self.connected.load(Ordering::Relaxed)
    }

    /// Wait until the data channel is open or timeout elapses.
    pub async fn wait_until_connected(&self, timeout: Duration) -> bool {
        if self.is_connected() {
            return true;
        }

        // Create the Notified future before re-checking, so we don't miss a
        // notification that fires between the check and the await.
        let notified = self.connected_notify.notified();
        if self.is_connected() {
            return true;
        }

        let _ = tokio::time::timeout(timeout, notified).await;
        self.is_connected()
    }

    /// Mark this connection as disconnected. Subsequent calls to
    /// `is_connected()` will return false. Does not block.
    fn disconnect(&self) {
        self.connected.store(false, Ordering::Relaxed);
        self.shutdown.cancel();
    }

    /// Shut down the WebRTC connection, closing the peer connection.
    pub async fn shutdown(&self) {
        self.disconnect();
        let _ = self.peer_connection.close().await;
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
            tracing::trace!(
                bytes = req.data.len(),
                "[client-peer] writing HTTP request to data channel"
            );
            let request_id = req.request_id;
            {
                let mut pending = pending_http.lock().await;
                tracing::trace!(
                    id = %request_id,
                    pending = pending.len() + 1,
                    "[client-peer] request queued"
                );
                pending.insert(request_id, req.response_tx);
            }

            if let Err(e) = write_to_dc(dc, req.data).await
                && let Some(response_tx) = pending_http.lock().await.remove(&request_id)
            {
                let _ = response_tx.send(Err(e));
            }
        }
        ClientCommand::WsOpen(ws) => {
            let conn_id = ws.conn_id;
            {
                pending_ws_open.lock().await.insert(conn_id, ws.result_tx);
            }

            if let Err(e) = write_to_dc(dc, ws.data).await
                && let Some(result_tx) = pending_ws_open.lock().await.remove(&conn_id)
            {
                let _ = result_tx.send(Err(e)); // transport error
            }
        }
    }
}

/// Fragment and send data to the data channel.
async fn write_to_dc(dc: &Arc<RTCDataChannel>, data: Vec<u8>) -> Result<(), WebRtcClientError> {
    let chunks = fragment::fragment(data);
    for chunk in chunks {
        if let Err(e) = dc.send(&Bytes::from(chunk)).await {
            tracing::warn!(?e, "[client-peer] failed to write to data channel");
            return Err(WebRtcClientError::DataChannelWriteFailed(e.to_string()));
        }
    }
    Ok(())
}
