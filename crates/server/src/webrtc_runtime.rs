use std::{
    collections::HashMap,
    sync::{Arc, LazyLock},
};

use anyhow::Context as _;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use deployment::Deployment;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use tokio::sync::{Mutex, RwLock, mpsc};
use tokio_tungstenite::tungstenite::Message as TungsteniteMessage;
use uuid::Uuid;
use webrtc::{
    api::{
        APIBuilder, interceptor_registry::register_default_interceptors, media_engine::MediaEngine,
    },
    data_channel::{RTCDataChannel, data_channel_message::DataChannelMessage},
    ice_transport::ice_server::RTCIceServer,
    interceptor::registry::Registry,
    peer_connection::{
        RTCPeerConnection, configuration::RTCConfiguration,
        peer_connection_state::RTCPeerConnectionState,
        sdp::session_description::RTCSessionDescription,
    },
};

use crate::{DeploymentImpl, routes::relay_webrtc::WebRtcTransportStatus};

const FRAME_VERSION: u8 = 1;

static WEBRTC_RUNTIME: LazyLock<WebRtcRuntime> = LazyLock::new(WebRtcRuntime::new);

pub fn runtime() -> &'static WebRtcRuntime {
    &WEBRTC_RUNTIME
}

pub struct WebRtcRuntime {
    sessions: Arc<RwLock<HashMap<Uuid, Arc<WebRtcSession>>>>,
}

impl WebRtcRuntime {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn create_session(
        &self,
        deployment: DeploymentImpl,
        params: StartSessionParams,
    ) -> anyhow::Result<(Uuid, Option<String>, WebRtcTransportStatus, Option<String>)> {
        let mut media_engine = MediaEngine::default();
        media_engine.register_default_codecs()?;

        let mut registry = Registry::new();
        registry = register_default_interceptors(registry, &mut media_engine)?;

        let api = APIBuilder::new()
            .with_media_engine(media_engine)
            .with_interceptor_registry(registry)
            .build();

        let config = RTCConfiguration {
            ice_servers: parse_ice_servers_from_env(),
            ..Default::default()
        };

        let peer_connection = Arc::new(api.new_peer_connection(config).await?);

        // Verify the supplied signing session exists before we allocate runtime state.
        deployment
            .relay_signing()
            .sign_message(params.signing_session_id, b"webrtc-session-probe")
            .await
            .map_err(|error| anyhow::anyhow!("invalid signing session: {}", error.as_str()))?;

        let session_id = Uuid::new_v4();
        let session = Arc::new(WebRtcSession::new(
            session_id,
            deployment.clone(),
            params.signing_session_id,
            params.request_nonce,
            peer_connection.clone(),
        ));

        install_peer_handlers(session.clone()).await;

        peer_connection
            .set_remote_description(RTCSessionDescription::offer(params.offer_sdp)?)
            .await?;

        let answer = peer_connection.create_answer(None).await?;
        let mut gather_complete = peer_connection.gathering_complete_promise().await;
        peer_connection.set_local_description(answer).await?;
        let _ = gather_complete.recv().await;

        let answer_sdp = peer_connection.local_description().await.map(|sdp| sdp.sdp);

        self.sessions.write().await.insert(session_id, session);

        Ok((
            session_id,
            answer_sdp,
            WebRtcTransportStatus::Upgrading,
            None,
        ))
    }

    pub async fn finalize_session(
        &self,
        session_id: Uuid,
    ) -> (WebRtcTransportStatus, Option<String>) {
        let sessions = self.sessions.read().await;
        let Some(session) = sessions.get(&session_id) else {
            return (
                WebRtcTransportStatus::Fallback,
                Some("Unknown WebRTC session; using relay fallback.".to_string()),
            );
        };

        let status = *session.status.read().await;
        let reason = session.reason.read().await.clone();

        (status, reason)
    }

    pub async fn status(&self, session_id: Uuid) -> (WebRtcTransportStatus, Option<String>) {
        let sessions = self.sessions.read().await;
        let Some(session) = sessions.get(&session_id) else {
            return (
                WebRtcTransportStatus::Fallback,
                Some("Unknown WebRTC session; using relay fallback.".to_string()),
            );
        };

        (
            *session.status.read().await,
            session.reason.read().await.clone(),
        )
    }
}

#[derive(Debug, Clone)]
pub struct StartSessionParams {
    pub offer_sdp: String,
    pub signing_session_id: Uuid,
    pub request_nonce: String,
}

struct WebRtcSession {
    id: Uuid,
    deployment: DeploymentImpl,
    signing_session_id: Uuid,
    request_nonce: String,
    peer_connection: Arc<RTCPeerConnection>,
    data_channel: Arc<RwLock<Option<Arc<RTCDataChannel>>>>,
    frame_sender: Arc<WebRtcFrameSender>,
    status: RwLock<WebRtcTransportStatus>,
    reason: RwLock<Option<String>>,
    inbound_seq: Mutex<u64>,
    ws_streams: Arc<RwLock<HashMap<String, mpsc::UnboundedSender<WebRtcWsCommand>>>>,
}

impl WebRtcSession {
    fn new(
        id: Uuid,
        deployment: DeploymentImpl,
        signing_session_id: Uuid,
        request_nonce: String,
        peer_connection: Arc<RTCPeerConnection>,
    ) -> Self {
        let data_channel = Arc::new(RwLock::new(None));
        let frame_sender = Arc::new(WebRtcFrameSender::new(
            id,
            deployment.clone(),
            signing_session_id,
            request_nonce.clone(),
            data_channel.clone(),
        ));

        Self {
            id,
            deployment,
            signing_session_id,
            request_nonce,
            peer_connection,
            data_channel,
            frame_sender,
            status: RwLock::new(WebRtcTransportStatus::Upgrading),
            reason: RwLock::new(None),
            inbound_seq: Mutex::new(0),
            ws_streams: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    async fn set_fallback(&self, reason: impl Into<String>) {
        *self.status.write().await = WebRtcTransportStatus::Fallback;
        *self.reason.write().await = Some(reason.into());
    }

    async fn set_webrtc(&self) {
        *self.status.write().await = WebRtcTransportStatus::Webrtc;
        *self.reason.write().await = None;
    }

    async fn send_signed_frame(&self, kind: &str, payload: Value) -> anyhow::Result<()> {
        self.frame_sender.send(kind, payload).await
    }

    async fn handle_incoming_message(&self, raw_data: &[u8]) {
        let result = self.handle_incoming_message_inner(raw_data).await;
        if let Err(error) = result {
            tracing::warn!(session_id=%self.id, ?error, "failed handling webrtc frame");
            let _ = self
                .send_signed_frame("error", serde_json::json!({ "message": error.to_string() }))
                .await;
            self.set_fallback(format!("WebRTC transport error: {error}"))
                .await;
        }
    }

    async fn handle_incoming_message_inner(&self, raw_data: &[u8]) -> anyhow::Result<()> {
        let envelope: WebRtcEnvelope =
            serde_json::from_slice(raw_data).context("Invalid WebRTC envelope JSON")?;

        if envelope.version != FRAME_VERSION {
            anyhow::bail!("Unsupported WebRTC envelope version");
        }
        if envelope.session_id != self.id {
            anyhow::bail!("WebRTC session mismatch");
        }
        if envelope.request_nonce != self.request_nonce {
            anyhow::bail!("WebRTC request nonce mismatch");
        }

        {
            let mut inbound_seq = self.inbound_seq.lock().await;
            let expected = inbound_seq.saturating_add(1);
            if envelope.seq != expected {
                anyhow::bail!(
                    "Invalid WebRTC sequence: expected {expected}, got {}",
                    envelope.seq
                );
            }
            *inbound_seq = envelope.seq;
        }

        let payload_bytes = BASE64_STANDARD
            .decode(&envelope.payload_b64)
            .context("Invalid WebRTC payload encoding")?;
        let payload_hash = BASE64_STANDARD.encode(Sha256::digest(&payload_bytes));
        let sign_message = format!(
            "v1|webrtc|{}|{}|{}|{}|{}",
            envelope.session_id, envelope.request_nonce, envelope.seq, envelope.kind, payload_hash
        );

        self.deployment
            .relay_signing()
            .verify_signature(
                self.signing_session_id,
                sign_message.as_bytes(),
                &envelope.signature_b64,
            )
            .await
            .map_err(|error| {
                anyhow::anyhow!("Invalid WebRTC frame signature: {}", error.as_str())
            })?;

        let payload: Value =
            serde_json::from_slice(&payload_bytes).context("Invalid WebRTC payload JSON")?;

        self.route_frame(&envelope.kind, payload).await
    }

    async fn route_frame(&self, kind: &str, payload: Value) -> anyhow::Result<()> {
        match kind {
            "ping" => {
                let ping_id = payload
                    .get("ping_id")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                self.send_signed_frame("pong", serde_json::json!({ "ping_id": ping_id }))
                    .await?;
                if *self.status.read().await != WebRtcTransportStatus::Webrtc {
                    self.set_webrtc().await;
                }
                Ok(())
            }
            "api_request" => self.handle_api_request(payload).await,
            "ws_open" => self.handle_ws_open(payload).await,
            "ws_send" => self.handle_ws_send(payload).await,
            "ws_close" => self.handle_ws_close(payload).await,
            _ => anyhow::bail!("Unsupported WebRTC frame kind: {kind}"),
        }
    }

    async fn handle_api_request(&self, payload: Value) -> anyhow::Result<()> {
        let request_id = payload
            .get("request_id")
            .and_then(Value::as_str)
            .ok_or_else(|| anyhow::anyhow!("Missing request_id"))?
            .to_string();
        let method = payload
            .get("method")
            .and_then(Value::as_str)
            .unwrap_or("GET")
            .to_uppercase();
        let path = payload
            .get("path")
            .and_then(Value::as_str)
            .ok_or_else(|| anyhow::anyhow!("Missing path"))?;
        let headers = payload
            .get("headers")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let body_b64 = payload.get("body_b64").and_then(Value::as_str);

        let Some(port) = self.deployment.server_info().get_port().await else {
            anyhow::bail!("Local server port unavailable");
        };

        let url = format!("http://127.0.0.1:{port}{path}");
        let client = reqwest::Client::new();
        let mut request = client.request(reqwest::Method::from_bytes(method.as_bytes())?, &url);

        for header in headers {
            let Some(pair) = header.as_array() else {
                continue;
            };
            if pair.len() != 2 {
                continue;
            }
            let Some(name) = pair[0].as_str() else {
                continue;
            };
            let Some(value) = pair[1].as_str() else {
                continue;
            };
            request = request.header(name, value);
        }

        if let Some(body_b64) = body_b64 {
            let body = BASE64_STANDARD
                .decode(body_b64)
                .context("Invalid API request body")?;
            request = request.body(body);
        }

        let response = request
            .send()
            .await
            .context("Local API proxy request failed")?;
        let status = response.status().as_u16();
        let mut response_headers = Vec::<[String; 2]>::new();
        for (key, value) in response.headers() {
            if let Ok(value_str) = value.to_str() {
                response_headers.push([key.as_str().to_string(), value_str.to_string()]);
            }
        }
        let body = response
            .bytes()
            .await
            .context("Failed reading API response body")?;

        self.send_signed_frame(
            "api_response",
            serde_json::json!({
                "request_id": request_id,
                "status": status,
                "headers": response_headers,
                "body_b64": BASE64_STANDARD.encode(body),
            }),
        )
        .await
    }

    async fn handle_ws_open(&self, payload: Value) -> anyhow::Result<()> {
        let ws_id = payload
            .get("ws_id")
            .and_then(Value::as_str)
            .ok_or_else(|| anyhow::anyhow!("Missing ws_id"))?
            .to_string();
        let path = payload
            .get("path")
            .and_then(Value::as_str)
            .ok_or_else(|| anyhow::anyhow!("Missing path"))?
            .to_string();

        let Some(port) = self.deployment.server_info().get_port().await else {
            anyhow::bail!("Local server port unavailable");
        };

        let ws_url = format!("ws://127.0.0.1:{port}{path}");
        let (stream, _response) = tokio_tungstenite::connect_async(ws_url)
            .await
            .context("Failed to connect local WebSocket")?;
        let (mut sink, mut source) = stream.split();

        let (tx, mut rx) = mpsc::unbounded_channel::<WebRtcWsCommand>();
        self.ws_streams
            .write()
            .await
            .insert(ws_id.clone(), tx.clone());

        self.send_signed_frame("ws_opened", serde_json::json!({ "ws_id": ws_id }))
            .await?;

        let frame_sender_for_reader = self.frame_sender.clone();
        let ws_streams_for_reader = self.ws_streams.clone();
        let ws_id_reader = ws_id.clone();
        tokio::spawn(async move {
            while let Some(message_result) = source.next().await {
                match message_result {
                    Ok(TungsteniteMessage::Text(text)) => {
                        let _ = frame_sender_for_reader
                            .send(
                                "ws_message",
                                serde_json::json!({
                                    "ws_id": ws_id_reader,
                                    "msg_type": "text",
                                    "payload_b64": BASE64_STANDARD.encode(text.as_bytes()),
                                }),
                            )
                            .await;
                    }
                    Ok(TungsteniteMessage::Binary(binary)) => {
                        let _ = frame_sender_for_reader
                            .send(
                                "ws_message",
                                serde_json::json!({
                                    "ws_id": ws_id_reader,
                                    "msg_type": "binary",
                                    "payload_b64": BASE64_STANDARD.encode(binary),
                                }),
                            )
                            .await;
                    }
                    Ok(TungsteniteMessage::Close(frame)) => {
                        let code = frame.as_ref().map(|f| u16::from(f.code));
                        let reason = frame
                            .as_ref()
                            .map(|f| f.reason.to_string())
                            .unwrap_or_default();
                        let _ = frame_sender_for_reader
                            .send(
                                "ws_closed",
                                serde_json::json!({ "ws_id": ws_id_reader, "code": code, "reason": reason }),
                            )
                            .await;
                        break;
                    }
                    Ok(TungsteniteMessage::Ping(_))
                    | Ok(TungsteniteMessage::Pong(_))
                    | Ok(TungsteniteMessage::Frame(_)) => {}
                    Err(error) => {
                        let _ = frame_sender_for_reader
                            .send(
                                "error",
                                serde_json::json!({
                                    "ws_id": ws_id_reader,
                                    "message": format!("WebSocket bridge receive failed: {error}"),
                                }),
                            )
                            .await;
                        break;
                    }
                }
            }

            ws_streams_for_reader.write().await.remove(&ws_id_reader);
        });

        let ws_streams_for_writer = self.ws_streams.clone();
        let ws_id_writer = ws_id.clone();
        tokio::spawn(async move {
            while let Some(command) = rx.recv().await {
                match command {
                    WebRtcWsCommand::SendText(text) => {
                        if sink
                            .send(TungsteniteMessage::Text(text.into()))
                            .await
                            .is_err()
                        {
                            break;
                        }
                    }
                    WebRtcWsCommand::SendBinary(binary) => {
                        if sink
                            .send(TungsteniteMessage::Binary(binary.into()))
                            .await
                            .is_err()
                        {
                            break;
                        }
                    }
                    WebRtcWsCommand::Close { code, reason } => {
                        let close_frame = code.map(|value| tokio_tungstenite::tungstenite::protocol::CloseFrame {
                            code: tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode::from(value),
                            reason: reason.into(),
                        });
                        let _ = sink.send(TungsteniteMessage::Close(close_frame)).await;
                        break;
                    }
                }
            }

            ws_streams_for_writer.write().await.remove(&ws_id_writer);
        });

        Ok(())
    }

    async fn handle_ws_send(&self, payload: Value) -> anyhow::Result<()> {
        let ws_id = payload
            .get("ws_id")
            .and_then(Value::as_str)
            .ok_or_else(|| anyhow::anyhow!("Missing ws_id"))?
            .to_string();
        let msg_type = payload
            .get("msg_type")
            .and_then(Value::as_str)
            .unwrap_or("text");
        let payload_b64 = payload
            .get("payload_b64")
            .and_then(Value::as_str)
            .unwrap_or_default();

        let ws_map = self.ws_streams.read().await;
        let Some(sender) = ws_map.get(&ws_id) else {
            anyhow::bail!("Unknown ws_id");
        };

        let data = BASE64_STANDARD
            .decode(payload_b64)
            .context("Invalid ws payload")?;
        let command = if msg_type == "binary" {
            WebRtcWsCommand::SendBinary(data)
        } else {
            WebRtcWsCommand::SendText(String::from_utf8(data).context("Invalid UTF-8 ws text")?)
        };

        sender
            .send(command)
            .map_err(|_| anyhow::anyhow!("WebSocket stream command channel closed"))
    }

    async fn handle_ws_close(&self, payload: Value) -> anyhow::Result<()> {
        let ws_id = payload
            .get("ws_id")
            .and_then(Value::as_str)
            .ok_or_else(|| anyhow::anyhow!("Missing ws_id"))?
            .to_string();
        let code = payload
            .get("code")
            .and_then(Value::as_u64)
            .and_then(|value| u16::try_from(value).ok());
        let reason = payload
            .get("reason")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();

        let ws_map = self.ws_streams.read().await;
        let Some(sender) = ws_map.get(&ws_id) else {
            return Ok(());
        };

        sender
            .send(WebRtcWsCommand::Close { code, reason })
            .map_err(|_| anyhow::anyhow!("WebSocket stream command channel closed"))
    }
}

struct WebRtcFrameSender {
    session_id: Uuid,
    deployment: DeploymentImpl,
    signing_session_id: Uuid,
    request_nonce: String,
    outbound_seq: Mutex<u64>,
    data_channel: Arc<RwLock<Option<Arc<RTCDataChannel>>>>,
}

impl WebRtcFrameSender {
    fn new(
        session_id: Uuid,
        deployment: DeploymentImpl,
        signing_session_id: Uuid,
        request_nonce: String,
        data_channel: Arc<RwLock<Option<Arc<RTCDataChannel>>>>,
    ) -> Self {
        Self {
            session_id,
            deployment,
            signing_session_id,
            request_nonce,
            outbound_seq: Mutex::new(0),
            data_channel,
        }
    }

    async fn send(&self, kind: &str, payload: Value) -> anyhow::Result<()> {
        let channel = {
            let guard = self.data_channel.read().await;
            guard
                .as_ref()
                .cloned()
                .ok_or_else(|| anyhow::anyhow!("webrtc data channel unavailable"))?
        };

        let seq = {
            let mut outbound_seq = self.outbound_seq.lock().await;
            *outbound_seq = outbound_seq.saturating_add(1);
            *outbound_seq
        };

        let payload_bytes = serde_json::to_vec(&payload)?;
        let payload_hash = BASE64_STANDARD.encode(Sha256::digest(&payload_bytes));
        let sign_message = format!(
            "v1|webrtc|{}|{}|{}|{}|{}",
            self.session_id, self.request_nonce, seq, kind, payload_hash
        );
        let signature_b64 = self
            .deployment
            .relay_signing()
            .sign_message(self.signing_session_id, sign_message.as_bytes())
            .await
            .map_err(|error| anyhow::anyhow!("failed to sign webrtc frame: {}", error.as_str()))?;

        let envelope = WebRtcEnvelope {
            version: FRAME_VERSION,
            session_id: self.session_id,
            request_nonce: self.request_nonce.clone(),
            seq,
            kind: kind.to_string(),
            payload_b64: BASE64_STANDARD.encode(payload_bytes),
            signature_b64,
        };

        channel
            .send_text(serde_json::to_string(&envelope)?)
            .await
            .map(|_| ())
            .map_err(|error| anyhow::anyhow!("failed to send webrtc frame: {error}"))
    }
}

#[derive(Debug)]
enum WebRtcWsCommand {
    SendText(String),
    SendBinary(Vec<u8>),
    Close { code: Option<u16>, reason: String },
}

#[derive(Debug, Deserialize, Serialize)]
struct WebRtcEnvelope {
    version: u8,
    session_id: Uuid,
    request_nonce: String,
    seq: u64,
    kind: String,
    payload_b64: String,
    signature_b64: String,
}

async fn install_peer_handlers(session: Arc<WebRtcSession>) {
    let peer_connection = session.peer_connection.clone();

    {
        let session_for_state = session.clone();
        peer_connection.on_peer_connection_state_change(Box::new(move |state| {
            let session = session_for_state.clone();
            Box::pin(async move {
                if matches!(
                    state,
                    RTCPeerConnectionState::Failed
                        | RTCPeerConnectionState::Closed
                        | RTCPeerConnectionState::Disconnected
                ) {
                    session
                        .set_fallback(format!("Peer connection state transitioned to {state}"))
                        .await;
                }
            })
        }));
    }

    {
        let session_for_channel = session.clone();
        peer_connection.on_data_channel(Box::new(move |channel: Arc<RTCDataChannel>| {
            let session = session_for_channel.clone();
            Box::pin(async move {
                if channel.label() != "vk-transport" {
                    return;
                }

                *session.data_channel.write().await = Some(channel.clone());

                let session_for_open = session.clone();
                channel.on_open(Box::new(move || {
                    let session = session_for_open.clone();
                    Box::pin(async move {
                        session.set_webrtc().await;
                    })
                }));

                let session_for_message = session.clone();
                channel.on_message(Box::new(move |message: DataChannelMessage| {
                    let session = session_for_message.clone();
                    Box::pin(async move {
                        let bytes = message.data.to_vec();
                        session.handle_incoming_message(&bytes).await;
                    })
                }));

                let session_for_close = session.clone();
                channel.on_close(Box::new(move || {
                    let session = session_for_close.clone();
                    Box::pin(async move {
                        session
                            .set_fallback("WebRTC data channel closed; using relay fallback")
                            .await;
                    })
                }));

                let session_for_error = session.clone();
                channel.on_error(Box::new(move |error| {
                    let session = session_for_error.clone();
                    Box::pin(async move {
                        session
                            .set_fallback(format!(
                                "WebRTC data channel error; using relay fallback: {error}"
                            ))
                            .await;
                    })
                }));
            })
        }));
    }
}

fn parse_ice_servers_from_env() -> Vec<RTCIceServer> {
    let value = std::env::var("VK_WEBRTC_STUN_URLS").unwrap_or_default();
    let urls: Vec<String> = value
        .split(',')
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
        .map(str::to_string)
        .collect();

    if urls.is_empty() {
        Vec::new()
    } else {
        vec![RTCIceServer {
            urls,
            ..Default::default()
        }]
    }
}
