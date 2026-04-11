//! Shared relay WebSocket transport message protocol.
//!
//! Defines transport-agnostic frame/message types and conversions between
//! native WebSocket messages and relay frame envelopes.

use anyhow::Context as _;
use axum::extract::ws::{CloseFrame as AxumCloseFrame, Message as AxumMessage};
use serde::{Deserialize, Serialize};
use tokio_tungstenite::tungstenite;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "lowercase")]
pub enum RelayWsMessageType {
    Text,
    Binary,
    Ping,
    Pong,
    Close,
}

impl RelayWsMessageType {
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

#[derive(Debug)]
pub struct RelayWsFrame {
    pub msg_type: RelayWsMessageType,
    pub payload: Vec<u8>,
}

/// Convert between a native WebSocket message type and [`RelayWsFrame`].
pub trait RelayTransportMessage: Sized {
    /// Convert a native WS message into a [`RelayWsFrame`].
    fn into_frame(self) -> RelayWsFrame;
    /// Convert a [`RelayWsFrame`] back into a native WS message.
    fn try_from_frame(frame: RelayWsFrame) -> anyhow::Result<Self>;
}

impl RelayTransportMessage for AxumMessage {
    fn into_frame(self) -> RelayWsFrame {
        let (msg_type, payload) = match self {
            Self::Text(text) => (RelayWsMessageType::Text, text.as_str().as_bytes().to_vec()),
            Self::Binary(payload) => (RelayWsMessageType::Binary, payload.to_vec()),
            Self::Ping(payload) => (RelayWsMessageType::Ping, payload.to_vec()),
            Self::Pong(payload) => (RelayWsMessageType::Pong, payload.to_vec()),
            Self::Close(close_frame) => {
                let payload = if let Some(f) = close_frame {
                    let code: u16 = f.code;
                    let reason = f.reason.to_string();
                    let mut p = Vec::with_capacity(2 + reason.len());
                    p.extend_from_slice(&code.to_be_bytes());
                    p.extend_from_slice(reason.as_bytes());
                    p
                } else {
                    Vec::new()
                };
                (RelayWsMessageType::Close, payload)
            }
        };
        RelayWsFrame { msg_type, payload }
    }

    fn try_from_frame(frame: RelayWsFrame) -> anyhow::Result<Self> {
        match frame.msg_type {
            RelayWsMessageType::Text => {
                let text = String::from_utf8(frame.payload).context("invalid UTF-8 text frame")?;
                Ok(Self::Text(text.into()))
            }
            RelayWsMessageType::Binary => Ok(Self::Binary(frame.payload.into())),
            RelayWsMessageType::Ping => Ok(Self::Ping(frame.payload.into())),
            RelayWsMessageType::Pong => Ok(Self::Pong(frame.payload.into())),
            RelayWsMessageType::Close => {
                if frame.payload.is_empty() {
                    return Ok(Self::Close(None));
                }
                if frame.payload.len() < 2 {
                    anyhow::bail!("invalid close payload");
                }
                let code = u16::from_be_bytes([frame.payload[0], frame.payload[1]]);
                let reason = String::from_utf8(frame.payload[2..].to_vec())
                    .context("invalid UTF-8 close frame reason")?;
                Ok(Self::Close(Some(AxumCloseFrame {
                    code,
                    reason: reason.into(),
                })))
            }
        }
    }
}

impl RelayTransportMessage for tungstenite::Message {
    fn into_frame(self) -> RelayWsFrame {
        let (msg_type, payload) = match self {
            Self::Text(text) => (RelayWsMessageType::Text, text.to_string().into_bytes()),
            Self::Binary(data) => (RelayWsMessageType::Binary, data.to_vec()),
            Self::Ping(data) => (RelayWsMessageType::Ping, data.to_vec()),
            Self::Pong(data) => (RelayWsMessageType::Pong, data.to_vec()),
            Self::Close(frame) => {
                let payload = if let Some(f) = frame {
                    let code: u16 = f.code.into();
                    let mut p = Vec::with_capacity(2 + f.reason.len());
                    p.extend_from_slice(&code.to_be_bytes());
                    p.extend_from_slice(f.reason.as_bytes());
                    p
                } else {
                    Vec::new()
                };
                (RelayWsMessageType::Close, payload)
            }
            _ => (RelayWsMessageType::Binary, Vec::new()),
        };
        RelayWsFrame { msg_type, payload }
    }

    fn try_from_frame(frame: RelayWsFrame) -> anyhow::Result<Self> {
        match frame.msg_type {
            RelayWsMessageType::Text => {
                let text = String::from_utf8(frame.payload).context("invalid UTF-8 text frame")?;
                Ok(Self::Text(text.into()))
            }
            RelayWsMessageType::Binary => Ok(Self::Binary(frame.payload.into())),
            RelayWsMessageType::Ping => Ok(Self::Ping(frame.payload.into())),
            RelayWsMessageType::Pong => Ok(Self::Pong(frame.payload.into())),
            RelayWsMessageType::Close => {
                if frame.payload.is_empty() {
                    return Ok(Self::Close(None));
                }
                if frame.payload.len() < 2 {
                    anyhow::bail!("invalid close payload");
                }
                let code = u16::from_be_bytes([frame.payload[0], frame.payload[1]]);
                let reason = String::from_utf8(frame.payload[2..].to_vec())
                    .context("invalid UTF-8 close frame reason")?;
                Ok(Self::Close(Some(tungstenite::protocol::CloseFrame {
                    code: code.into(),
                    reason: reason.into(),
                })))
            }
        }
    }
}
