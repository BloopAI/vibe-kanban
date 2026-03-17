use std::fmt;

use anyhow::Context as _;
use serde::{Deserialize, Serialize};

pub const RELAY_HEADER: &str = "x-vk-relayed";

const ENVELOPE_VERSION: u8 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RelayMessageType {
    Text,
    Binary,
    Ping,
    Pong,
    Close,
}

impl RelayMessageType {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Text => "text",
            Self::Binary => "binary",
            Self::Ping => "ping",
            Self::Pong => "pong",
            Self::Close => "close",
        }
    }
}

impl fmt::Display for RelayMessageType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RelayClose {
    pub code: u16,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RelayMessage {
    Text(String),
    Binary(Vec<u8>),
    Ping(Vec<u8>),
    Pong(Vec<u8>),
    Close(Option<RelayClose>),
}

impl RelayMessage {
    pub fn message_type(&self) -> RelayMessageType {
        match self {
            Self::Text(_) => RelayMessageType::Text,
            Self::Binary(_) => RelayMessageType::Binary,
            Self::Ping(_) => RelayMessageType::Ping,
            Self::Pong(_) => RelayMessageType::Pong,
            Self::Close(_) => RelayMessageType::Close,
        }
    }

    pub fn is_close(&self) -> bool {
        matches!(self, Self::Close(_))
    }

    pub fn into_parts(self) -> (RelayMessageType, Vec<u8>) {
        match self {
            Self::Text(text) => (RelayMessageType::Text, text.into_bytes()),
            Self::Binary(payload) => (RelayMessageType::Binary, payload),
            Self::Ping(payload) => (RelayMessageType::Ping, payload),
            Self::Pong(payload) => (RelayMessageType::Pong, payload),
            Self::Close(close) => (RelayMessageType::Close, encode_close_payload(close)),
        }
    }

    pub fn from_parts(message_type: RelayMessageType, payload: Vec<u8>) -> anyhow::Result<Self> {
        match message_type {
            RelayMessageType::Text => {
                let text = String::from_utf8(payload).context("invalid UTF-8 relay text frame")?;
                Ok(Self::Text(text))
            }
            RelayMessageType::Binary => Ok(Self::Binary(payload)),
            RelayMessageType::Ping => Ok(Self::Ping(payload)),
            RelayMessageType::Pong => Ok(Self::Pong(payload)),
            RelayMessageType::Close => Ok(Self::Close(decode_close_payload(payload)?)),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SignedRelayEnvelope {
    version: u8,
    seq: u64,
    msg_type: RelayMessageType,
    payload_b64: String,
    signature_b64: String,
}

impl SignedRelayEnvelope {
    pub fn new(
        seq: u64,
        message_type: RelayMessageType,
        payload_b64: String,
        signature_b64: String,
    ) -> Self {
        Self {
            version: ENVELOPE_VERSION,
            seq,
            msg_type: message_type,
            payload_b64,
            signature_b64,
        }
    }

    pub fn version(&self) -> u8 {
        self.version
    }

    pub fn seq(&self) -> u64 {
        self.seq
    }

    pub fn message_type(&self) -> RelayMessageType {
        self.msg_type
    }

    pub fn payload_b64(&self) -> &str {
        &self.payload_b64
    }

    pub fn signature_b64(&self) -> &str {
        &self.signature_b64
    }

    pub fn encode(&self) -> anyhow::Result<Vec<u8>> {
        serde_json::to_vec(self).map_err(anyhow::Error::from)
    }

    pub fn decode(raw: &[u8]) -> anyhow::Result<Self> {
        serde_json::from_slice(raw).context("invalid relay WS envelope JSON")
    }

    pub fn ensure_supported_version(&self) -> anyhow::Result<()> {
        if self.version != ENVELOPE_VERSION {
            anyhow::bail!("unsupported relay WS envelope version");
        }

        Ok(())
    }
}

fn encode_close_payload(close: Option<RelayClose>) -> Vec<u8> {
    let Some(close) = close else {
        return Vec::new();
    };

    let mut payload = Vec::with_capacity(2 + close.reason.len());
    payload.extend_from_slice(&close.code.to_be_bytes());
    payload.extend_from_slice(close.reason.as_bytes());
    payload
}

fn decode_close_payload(payload: Vec<u8>) -> anyhow::Result<Option<RelayClose>> {
    if payload.is_empty() {
        return Ok(None);
    }

    if payload.len() < 2 {
        anyhow::bail!("invalid relay close payload");
    }

    let code = u16::from_be_bytes([payload[0], payload[1]]);
    let reason = String::from_utf8(payload[2..].to_vec())
        .context("invalid UTF-8 relay close frame reason")?;

    Ok(Some(RelayClose { code, reason }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn close_message_roundtrips_via_parts() {
        let message = RelayMessage::Close(Some(RelayClose {
            code: 1000,
            reason: "done".into(),
        }));

        let (message_type, payload) = message.clone().into_parts();
        let decoded = RelayMessage::from_parts(message_type, payload).expect("decode");

        assert_eq!(decoded, message);
    }

    #[test]
    fn signed_envelope_roundtrips_via_json() {
        let envelope = SignedRelayEnvelope::new(
            7,
            RelayMessageType::Binary,
            "cGF5bG9hZA==".into(),
            "c2ln".into(),
        );

        let decoded = SignedRelayEnvelope::decode(&envelope.encode().expect("encode"))
            .expect("decode envelope");

        assert_eq!(decoded, envelope);
        decoded.ensure_supported_version().expect("supported");
    }
}
