use anyhow::Context as _;
use axum::extract::ws::Message;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use futures_util::{Sink, SinkExt, Stream, StreamExt};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::{DeploymentImpl, middleware::RelayRequestSignatureContext};

const WS_ENVELOPE_VERSION: u8 = 1;
const WS_CLIENT_TO_SERVER_MAC_PURPOSE: &str = "relay-ws-c2s-v1";
const WS_SERVER_TO_CLIENT_MAC_PURPOSE: &str = "relay-ws-s2c-v1";

#[derive(Debug, Clone)]
pub struct RelayWsSigningState {
    signing_session_id: Uuid,
    request_nonce: String,
    inbound_seq: u64,
    outbound_seq: u64,
}

#[derive(Debug, Clone, Copy)]
enum RelayWsDirection {
    ClientToServer,
    ServerToClient,
}

#[derive(Debug, Serialize, Deserialize)]
struct RelaySignedWsEnvelope {
    version: u8,
    seq: u64,
    msg_type: String,
    payload_b64: String,
    mac_b64: String,
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
                    RelayWsDirection::ServerToClient,
                    seq,
                    "text",
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
                    RelayWsDirection::ServerToClient,
                    seq,
                    "binary",
                    payload.to_vec(),
                )
                .await?;
                signing.outbound_seq = seq;
                Message::Binary(serde_json::to_vec(&envelope)?.into())
            }
            other => other,
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
                decode_signed_envelope(
                    deployment,
                    signing,
                    RelayWsDirection::ClientToServer,
                    text.as_str().as_bytes(),
                )
                .await?
            }
            Message::Binary(data) => {
                decode_signed_envelope(deployment, signing, RelayWsDirection::ClientToServer, &data)
                    .await?
            }
            other => other,
        }
    } else {
        message
    };

    Ok(Some(decoded))
}

async fn build_signed_envelope(
    deployment: &DeploymentImpl,
    signing: &RelayWsSigningState,
    direction: RelayWsDirection,
    seq: u64,
    msg_type: &'static str,
    payload: Vec<u8>,
) -> anyhow::Result<RelaySignedWsEnvelope> {
    let payload_hash = sha256_base64(&payload);
    let mac_message = build_ws_mac_message(
        signing.signing_session_id,
        &signing.request_nonce,
        direction,
        seq,
        msg_type,
        &payload_hash,
    );

    let mac_b64 = deployment
        .relay_transport_mac(
            signing.signing_session_id,
            ws_mac_purpose(direction),
            mac_message.as_bytes(),
        )
        .await
        .map_err(|error| anyhow::anyhow!("failed to sign relay WS frame: {}", error.as_str()))?;

    Ok(RelaySignedWsEnvelope {
        version: WS_ENVELOPE_VERSION,
        seq,
        msg_type: msg_type.to_string(),
        payload_b64: BASE64_STANDARD.encode(payload),
        mac_b64,
    })
}

async fn decode_signed_envelope(
    deployment: &DeploymentImpl,
    signing: &mut RelayWsSigningState,
    direction: RelayWsDirection,
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

    let payload_hash = sha256_base64(&payload);
    let mac_message = build_ws_mac_message(
        signing.signing_session_id,
        &signing.request_nonce,
        direction,
        envelope.seq,
        &envelope.msg_type,
        &payload_hash,
    );

    deployment
        .verify_relay_transport_mac(
            signing.signing_session_id,
            ws_mac_purpose(direction),
            mac_message.as_bytes(),
            &envelope.mac_b64,
        )
        .await
        .map_err(|error| anyhow::anyhow!("invalid relay WS frame MAC: {}", error.as_str()))?;

    signing.inbound_seq = envelope.seq;

    match envelope.msg_type.as_str() {
        "text" => {
            let text = String::from_utf8(payload).context("invalid UTF-8 text frame")?;
            Ok(Message::Text(text.into()))
        }
        "binary" => Ok(Message::Binary(payload.into())),
        other => Err(anyhow::anyhow!("unsupported relay WS msg_type: {}", other)),
    }
}

fn build_ws_mac_message(
    signing_session_id: Uuid,
    request_nonce: &str,
    direction: RelayWsDirection,
    seq: u64,
    msg_type: &str,
    payload_hash: &str,
) -> String {
    format!(
        "v1|{signing_session_id}|{request_nonce}|{}|{seq}|{msg_type}|{payload_hash}",
        ws_direction_name(direction)
    )
}

fn ws_direction_name(direction: RelayWsDirection) -> &'static str {
    match direction {
        RelayWsDirection::ClientToServer => "c2s",
        RelayWsDirection::ServerToClient => "s2c",
    }
}

fn ws_mac_purpose(direction: RelayWsDirection) -> &'static str {
    match direction {
        RelayWsDirection::ClientToServer => WS_CLIENT_TO_SERVER_MAC_PURPOSE,
        RelayWsDirection::ServerToClient => WS_SERVER_TO_CLIENT_MAC_PURPOSE,
    }
}

fn sha256_base64(data: &[u8]) -> String {
    let digest = Sha256::digest(data);
    BASE64_STANDARD.encode(digest)
}
