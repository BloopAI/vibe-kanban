use anyhow::Context as _;
use axum::{
    extract::{
        FromRef, FromRequestParts,
        ws::{CloseFrame, Message, WebSocket, WebSocketUpgrade},
    },
    http::request::Parts,
    response::IntoResponse,
};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use deployment::Deployment;
use futures_util::{Sink, SinkExt, Stream, StreamExt};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::{DeploymentImpl, middleware::RelayRequestSignatureContext};

const WS_ENVELOPE_VERSION: u8 = 1;

#[derive(Debug, Clone)]
pub struct RelayWsSigningState {
    signing_session_id: Uuid,
    request_nonce: String,
    inbound_seq: u64,
    outbound_seq: u64,
}

#[derive(Debug, Serialize, Deserialize)]
struct RelaySignedWsEnvelope {
    version: u8,
    seq: u64,
    msg_type: RelayWsMessageType,
    payload_b64: String,
    signature_b64: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum RelayWsMessageType {
    Text,
    Binary,
    Ping,
    Pong,
    Close,
}

impl RelayWsMessageType {
    fn as_str(self) -> &'static str {
        match self {
            Self::Text => "text",
            Self::Binary => "binary",
            Self::Ping => "ping",
            Self::Pong => "pong",
            Self::Close => "close",
        }
    }
}

pub fn relay_ws_signing_state(
    relay_ctx: Option<RelayRequestSignatureContext>,
) -> Option<RelayWsSigningState> {
    relay_ctx.map(|ctx| RelayWsSigningState {
        signing_session_id: ctx.signing_session_id,
        request_nonce: ctx.request_nonce,
        inbound_seq: 0,
        outbound_seq: 0,
    })
}

pub struct SignedWsUpgrade {
    ws: WebSocketUpgrade,
    deployment: DeploymentImpl,
    relay_signing: Option<RelayWsSigningState>,
}

impl<S> FromRequestParts<S> for SignedWsUpgrade
where
    S: Send + Sync,
    DeploymentImpl: FromRef<S>,
{
    type Rejection = axum::extract::ws::rejection::WebSocketUpgradeRejection;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let ws = WebSocketUpgrade::from_request_parts(parts, state).await?;
        let deployment = DeploymentImpl::from_ref(state);
        let relay_ctx = parts
            .extensions
            .get::<RelayRequestSignatureContext>()
            .cloned();

        Ok(Self {
            ws,
            deployment,
            relay_signing: relay_ws_signing_state(relay_ctx),
        })
    }
}

impl SignedWsUpgrade {
    pub fn on_upgrade<F, Fut>(self, callback: F) -> impl IntoResponse
    where
        F: FnOnce(SignedWebSocket) -> Fut + Send + 'static,
        Fut: std::future::Future<Output = ()> + Send + 'static,
    {
        let deployment = self.deployment.clone();
        let relay_signing = self.relay_signing.clone();
        self.ws.on_upgrade(move |socket| async move {
            let signed_socket = SignedWebSocket {
                socket,
                deployment,
                relay_signing,
            };
            callback(signed_socket).await;
        })
    }
}

pub struct SignedWebSocket {
    socket: WebSocket,
    deployment: DeploymentImpl,
    relay_signing: Option<RelayWsSigningState>,
}

impl SignedWebSocket {
    pub async fn send(&mut self, message: Message) -> anyhow::Result<()> {
        send_ws_message(
            &mut self.socket,
            &self.deployment,
            &mut self.relay_signing,
            message,
        )
        .await
    }

    pub async fn recv(&mut self) -> anyhow::Result<Option<Message>> {
        recv_ws_message(&mut self.socket, &self.deployment, &mut self.relay_signing).await
    }

    pub async fn close(&mut self) -> anyhow::Result<()> {
        self.socket.close().await.map_err(anyhow::Error::from)
    }
}

pub async fn send_ws_message<S>(
    sender: &mut S,
    deployment: &DeploymentImpl,
    relay_signing: &mut Option<RelayWsSigningState>,
    message: Message,
) -> anyhow::Result<()>
where
    S: Sink<Message, Error = axum::Error> + Unpin,
{
    let outbound = if let Some(signing) = relay_signing.as_mut() {
        match message {
            Message::Text(text) => {
                let payload = text.as_str().as_bytes().to_vec();
                let seq = signing.outbound_seq.saturating_add(1);
                let envelope = build_signed_envelope(
                    deployment,
                    signing,
                    seq,
                    RelayWsMessageType::Text,
                    payload,
                )
                .await?;
                signing.outbound_seq = seq;
                Message::Binary(serde_json::to_vec(&envelope)?.into())
            }
            Message::Binary(payload) => {
                let seq = signing.outbound_seq.saturating_add(1);
                let envelope = build_signed_envelope(
                    deployment,
                    signing,
                    seq,
                    RelayWsMessageType::Binary,
                    payload.to_vec(),
                )
                .await?;
                signing.outbound_seq = seq;
                Message::Binary(serde_json::to_vec(&envelope)?.into())
            }
            Message::Ping(payload) => {
                let seq = signing.outbound_seq.saturating_add(1);
                let envelope = build_signed_envelope(
                    deployment,
                    signing,
                    seq,
                    RelayWsMessageType::Ping,
                    payload.to_vec(),
                )
                .await?;
                signing.outbound_seq = seq;
                Message::Binary(serde_json::to_vec(&envelope)?.into())
            }
            Message::Pong(payload) => {
                let seq = signing.outbound_seq.saturating_add(1);
                let envelope = build_signed_envelope(
                    deployment,
                    signing,
                    seq,
                    RelayWsMessageType::Pong,
                    payload.to_vec(),
                )
                .await?;
                signing.outbound_seq = seq;
                Message::Binary(serde_json::to_vec(&envelope)?.into())
            }
            Message::Close(close_frame) => {
                let seq = signing.outbound_seq.saturating_add(1);
                let envelope = build_signed_envelope(
                    deployment,
                    signing,
                    seq,
                    RelayWsMessageType::Close,
                    encode_close_payload(close_frame),
                )
                .await?;
                signing.outbound_seq = seq;
                Message::Binary(serde_json::to_vec(&envelope)?.into())
            }
        }
    } else {
        message
    };

    sender.send(outbound).await.map_err(anyhow::Error::from)
}

pub async fn recv_ws_message<S>(
    receiver: &mut S,
    deployment: &DeploymentImpl,
    relay_signing: &mut Option<RelayWsSigningState>,
) -> anyhow::Result<Option<Message>>
where
    S: Stream<Item = Result<Message, axum::Error>> + Unpin,
{
    let Some(message_result) = receiver.next().await else {
        return Ok(None);
    };

    let message = message_result.map_err(anyhow::Error::from)?;

    let decoded = if let Some(signing) = relay_signing.as_mut() {
        match message {
            Message::Text(text) => {
                decode_signed_envelope(deployment, signing, text.as_str().as_bytes()).await?
            }
            Message::Binary(data) => decode_signed_envelope(deployment, signing, &data).await?,
            Message::Ping(payload) => Message::Ping(payload),
            Message::Pong(payload) => Message::Pong(payload),
            Message::Close(close_frame) => Message::Close(close_frame),
        }
    } else {
        message
    };

    Ok(Some(decoded))
}

async fn build_signed_envelope(
    deployment: &DeploymentImpl,
    signing: &RelayWsSigningState,
    seq: u64,
    msg_type: RelayWsMessageType,
    payload: Vec<u8>,
) -> anyhow::Result<RelaySignedWsEnvelope> {
    let sign_message = ws_signing_input(
        signing.signing_session_id,
        &signing.request_nonce,
        seq,
        msg_type,
        &payload,
    );

    let signature_b64 = deployment
        .relay_signing()
        .sign_message(signing.signing_session_id, sign_message.as_bytes())
        .await
        .map_err(|error| anyhow::anyhow!("failed to sign relay WS frame: {}", error.as_str()))?;

    Ok(RelaySignedWsEnvelope {
        version: WS_ENVELOPE_VERSION,
        seq,
        msg_type,
        payload_b64: BASE64_STANDARD.encode(payload),
        signature_b64,
    })
}

async fn decode_signed_envelope(
    deployment: &DeploymentImpl,
    signing: &mut RelayWsSigningState,
    raw_message: &[u8],
) -> anyhow::Result<Message> {
    let envelope: RelaySignedWsEnvelope =
        serde_json::from_slice(raw_message).context("invalid relay WS envelope JSON")?;

    if envelope.version != WS_ENVELOPE_VERSION {
        return Err(anyhow::anyhow!("unsupported relay WS envelope version"));
    }

    let expected_seq = signing.inbound_seq.saturating_add(1);
    if envelope.seq != expected_seq {
        return Err(anyhow::anyhow!(
            "invalid relay WS sequence: expected {}, got {}",
            expected_seq,
            envelope.seq
        ));
    }

    let payload = BASE64_STANDARD
        .decode(&envelope.payload_b64)
        .context("invalid relay WS payload")?;

    let sign_message = ws_signing_input(
        signing.signing_session_id,
        &signing.request_nonce,
        envelope.seq,
        envelope.msg_type,
        &payload,
    );

    deployment
        .relay_signing()
        .verify_signature(
            signing.signing_session_id,
            sign_message.as_bytes(),
            &envelope.signature_b64,
        )
        .await
        .map_err(|error| anyhow::anyhow!("invalid relay WS frame signature: {}", error.as_str()))?;

    signing.inbound_seq = envelope.seq;

    match envelope.msg_type {
        RelayWsMessageType::Text => {
            let text = String::from_utf8(payload).context("invalid UTF-8 text frame")?;
            Ok(Message::Text(text.into()))
        }
        RelayWsMessageType::Binary => Ok(Message::Binary(payload.into())),
        RelayWsMessageType::Ping => Ok(Message::Ping(payload.into())),
        RelayWsMessageType::Pong => Ok(Message::Pong(payload.into())),
        RelayWsMessageType::Close => {
            let close_frame = decode_close_payload(payload)?;
            Ok(Message::Close(close_frame))
        }
    }
}

fn ws_signing_input(
    signing_session_id: Uuid,
    request_nonce: &str,
    seq: u64,
    msg_type: RelayWsMessageType,
    payload: &[u8],
) -> String {
    let payload_hash = BASE64_STANDARD.encode(Sha256::digest(payload));
    format!(
        "v1|{signing_session_id}|{request_nonce}|{seq}|{msg_type}|{payload_hash}",
        msg_type = msg_type.as_str()
    )
}

fn encode_close_payload(close_frame: Option<CloseFrame>) -> Vec<u8> {
    if let Some(close_frame) = close_frame {
        let code: u16 = close_frame.code;
        let reason = close_frame.reason.to_string();
        let mut payload = Vec::with_capacity(2 + reason.len());
        payload.extend_from_slice(&code.to_be_bytes());
        payload.extend_from_slice(reason.as_bytes());
        payload
    } else {
        Vec::new()
    }
}

fn decode_close_payload(payload: Vec<u8>) -> anyhow::Result<Option<CloseFrame>> {
    if payload.is_empty() {
        return Ok(None);
    }

    if payload.len() < 2 {
        return Err(anyhow::anyhow!("invalid close payload"));
    }

    let code = u16::from_be_bytes([payload[0], payload[1]]);
    let reason =
        String::from_utf8(payload[2..].to_vec()).context("invalid UTF-8 close frame reason")?;

    Ok(Some(CloseFrame {
        code,
        reason: reason.into(),
    }))
}
