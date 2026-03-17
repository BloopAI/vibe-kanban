//! Transport-level conversions between native WebSocket message types and
//! [`RelayWsFrame`].

use anyhow::Context as _;

use crate::crypto::{RelayWsFrame, RelayWsMessageType};

/// Convert between a native WebSocket message type and [`RelayWsFrame`].
pub trait RelayTransportMessage: Sized {
    /// Decompose into a [`RelayWsFrame`] preserving the original message type.
    fn decompose(self) -> RelayWsFrame;
    /// Reconstruct a native WS message from a [`RelayWsFrame`].
    fn reconstruct(frame: RelayWsFrame) -> anyhow::Result<Self>;
}

// ---------------------------------------------------------------------------
// axum WebSocket
// ---------------------------------------------------------------------------

mod axum_impl {
    use axum::extract::ws::{CloseFrame, Message};

    use super::*;

    impl RelayTransportMessage for Message {
        fn decompose(self) -> RelayWsFrame {
            let (msg_type, payload) = match self {
                Self::Text(text) => (RelayWsMessageType::Text, text.as_str().as_bytes().to_vec()),
                Self::Binary(payload) => (RelayWsMessageType::Binary, payload.to_vec()),
                Self::Ping(payload) => (RelayWsMessageType::Ping, payload.to_vec()),
                Self::Pong(payload) => (RelayWsMessageType::Pong, payload.to_vec()),
                Self::Close(close_frame) => {
                    (RelayWsMessageType::Close, encode_axum_close(close_frame))
                }
            };
            RelayWsFrame { msg_type, payload }
        }

        fn reconstruct(frame: RelayWsFrame) -> anyhow::Result<Self> {
            match frame.msg_type {
                RelayWsMessageType::Text => {
                    let text =
                        String::from_utf8(frame.payload).context("invalid UTF-8 text frame")?;
                    Ok(Self::Text(text.into()))
                }
                RelayWsMessageType::Binary => Ok(Self::Binary(frame.payload.into())),
                RelayWsMessageType::Ping => Ok(Self::Ping(frame.payload.into())),
                RelayWsMessageType::Pong => Ok(Self::Pong(frame.payload.into())),
                RelayWsMessageType::Close => Ok(Self::Close(decode_axum_close(frame.payload)?)),
            }
        }
    }

    fn encode_axum_close(close_frame: Option<CloseFrame>) -> Vec<u8> {
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

    fn decode_axum_close(payload: Vec<u8>) -> anyhow::Result<Option<CloseFrame>> {
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
}

// ---------------------------------------------------------------------------
// tungstenite WebSocket
// ---------------------------------------------------------------------------

mod tungstenite_impl {
    use tokio_tungstenite::tungstenite;

    use super::*;

    impl RelayTransportMessage for tungstenite::Message {
        fn decompose(self) -> RelayWsFrame {
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

        fn reconstruct(frame: RelayWsFrame) -> anyhow::Result<Self> {
            match frame.msg_type {
                RelayWsMessageType::Text => {
                    let text =
                        String::from_utf8(frame.payload).context("invalid UTF-8 text frame")?;
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
}
