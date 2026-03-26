use std::{
    collections::HashMap,
    pin::Pin,
    task::{Context, Poll, ready},
};

use base64::Engine as _;
use futures_util::{Sink, Stream};
use relay_protocol::{RelayTransportMessage, RelayWsFrame, RelayWsMessageType};
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite;
use tokio_util::sync::PollSender;
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, thiserror::Error)]
pub enum DataChannelWsStreamError {
    #[error("Invalid base64 payload for conn_id={conn_id}: {source}")]
    InvalidBase64Payload {
        conn_id: Uuid,
        source: base64::DecodeError,
    },
    #[error("Invalid relay transport frame: {0}")]
    RelayTransport(#[source] anyhow::Error),
    #[error("Failed to serialize data-channel WS message: {0}")]
    SerializeMessage(#[from] serde_json::Error),
    #[error("Data-channel WS queue is closed")]
    ChannelClosed,
}

// ---------------------------------------------------------------------------
// Top-level data channel envelope
// ---------------------------------------------------------------------------

/// A message sent over the WebRTC data channel.
///
/// Uses `#[serde(tag = "type")]` so the JSON always contains a `"type"` field
/// that selects the variant. Existing HTTP messages use `"http_request"` /
/// `"http_response"`; new WebSocket messages use `"ws_*"` prefixes.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "type")]
pub enum DataChannelMessage {
    /// HTTP request (client → host).
    #[serde(rename = "http_request")]
    HttpRequest(DataChannelRequest),
    /// HTTP response (host → client).
    #[serde(rename = "http_response")]
    HttpResponse(DataChannelResponse),

    /// Open a WebSocket connection (client → host).
    #[serde(rename = "ws_open")]
    WsOpen(WsOpen),
    /// WebSocket opened successfully (host → client).
    #[serde(rename = "ws_opened")]
    WsOpened(WsOpened),
    /// A WebSocket frame (bidirectional).
    #[serde(rename = "ws_frame")]
    WsFrame(WsFrame),
    /// Close a WebSocket connection (bidirectional).
    #[serde(rename = "ws_close")]
    WsClose(WsClose),
    /// WebSocket error (host → client).
    #[serde(rename = "ws_error")]
    WsError(WsError),
}

// ---------------------------------------------------------------------------
// HTTP messages (unchanged payload shape)
// ---------------------------------------------------------------------------

/// A request message sent over the data channel.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct DataChannelRequest {
    pub id: Uuid,
    pub method: String,
    pub path: String,
    #[serde(default)]
    pub headers: HashMap<String, Vec<String>>,
    /// Base64-encoded request body, if any.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub body_b64: Option<String>,
}

/// A response message sent back over the data channel.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct DataChannelResponse {
    pub id: Uuid,
    pub status: u16,
    #[serde(default)]
    pub headers: HashMap<String, Vec<String>>,
    /// Base64-encoded response body, if any.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub body_b64: Option<String>,
}

// ---------------------------------------------------------------------------
// WebSocket messages
// ---------------------------------------------------------------------------

/// Request to open a WebSocket to the local backend (client → host).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct WsOpen {
    /// Unique connection ID for multiplexing.
    pub conn_id: Uuid,
    /// Target path, e.g. `/api/sessions/abc/queue`.
    pub path: String,
    /// Optional sub-protocol(s) to negotiate.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub protocols: Option<String>,
}

/// Confirmation that the WebSocket was opened (host → client).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct WsOpened {
    pub conn_id: Uuid,
    /// The sub-protocol selected by the server, if any.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selected_protocol: Option<String>,
}

/// A single WebSocket frame (bidirectional), serialized over the data channel.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct WsFrame {
    pub conn_id: Uuid,
    pub msg_type: RelayWsMessageType,
    /// Base64-encoded payload.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub payload_b64: Option<String>,
}

impl WsFrame {
    /// Create a `WsFrame` from any [`RelayTransportMessage`] and a connection ID.
    pub fn from_transport<M: RelayTransportMessage>(conn_id: Uuid, msg: M) -> Self {
        let RelayWsFrame { msg_type, payload } = msg.into_frame();

        let payload_b64 = if payload.is_empty() {
            None
        } else {
            Some(base64::engine::general_purpose::STANDARD.encode(&payload))
        };

        Self {
            conn_id,
            msg_type,
            payload_b64,
        }
    }

    /// Convert into any [`RelayTransportMessage`], decoding the base64 payload.
    pub fn into_transport<M: RelayTransportMessage>(self) -> Result<M, DataChannelWsStreamError> {
        let WsFrame {
            conn_id,
            msg_type,
            payload_b64,
        } = self;

        let payload = match payload_b64 {
            Some(body_b64) => base64::engine::general_purpose::STANDARD
                .decode(body_b64)
                .map_err(|source| DataChannelWsStreamError::InvalidBase64Payload {
                    conn_id,
                    source,
                })?,
            None => Vec::new(),
        };

        M::try_from_frame(RelayWsFrame { msg_type, payload })
            .map_err(DataChannelWsStreamError::RelayTransport)
    }

    pub fn is_close(&self) -> bool {
        matches!(self.msg_type, RelayWsMessageType::Close)
    }
}

/// Close a WebSocket connection (bidirectional).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct WsClose {
    pub conn_id: Uuid,
    /// Close code (RFC 6455 §7.4).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub code: Option<u16>,
    /// Close reason.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

/// WebSocket error — the connection could not be opened or has failed.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct WsError {
    pub conn_id: Uuid,
    pub error: String,
}

/// Adapts a WebRTC WS connection into `Stream + Sink<tungstenite::Message>`.
pub struct DataChannelWsStream {
    pub conn_id: Uuid,
    pub frame_rx: mpsc::Receiver<WsFrame>,
    pub poll_sender: PollSender<Vec<u8>>,
}

impl Stream for DataChannelWsStream {
    type Item = Result<tungstenite::Message, DataChannelWsStreamError>;

    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let this = self.get_mut();
        match this.frame_rx.poll_recv(cx) {
            Poll::Ready(Some(ws_frame)) => Poll::Ready(Some(ws_frame.into_transport())),
            Poll::Ready(None) => Poll::Ready(None),
            Poll::Pending => Poll::Pending,
        }
    }
}

impl Sink<tungstenite::Message> for DataChannelWsStream {
    type Error = DataChannelWsStreamError;

    fn poll_ready(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        let this = self.get_mut();
        ready!(this.poll_sender.poll_reserve(cx))
            .map_err(|_| DataChannelWsStreamError::ChannelClosed)?;
        Poll::Ready(Ok(()))
    }

    fn start_send(self: Pin<&mut Self>, item: tungstenite::Message) -> Result<(), Self::Error> {
        let this = self.get_mut();
        let ws_frame = WsFrame::from_transport(this.conn_id, item);
        let msg = DataChannelMessage::WsFrame(ws_frame);
        let data = serde_json::to_vec(&msg)?;
        this.poll_sender
            .send_item(data)
            .map_err(|_| DataChannelWsStreamError::ChannelClosed)?;
        Ok(())
    }

    fn poll_flush(self: Pin<&mut Self>, _cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        Poll::Ready(Ok(()))
    }

    fn poll_close(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        let this = self.get_mut();
        ready!(this.poll_sender.poll_reserve(cx))
            .map_err(|_| DataChannelWsStreamError::ChannelClosed)?;
        let msg = DataChannelMessage::WsClose(WsClose {
            conn_id: this.conn_id,
            code: None,
            reason: None,
        });
        let data = serde_json::to_vec(&msg)?;
        this.poll_sender
            .send_item(data)
            .map_err(|_| DataChannelWsStreamError::ChannelClosed)?;
        Poll::Ready(Ok(()))
    }
}

#[cfg(test)]
mod tests {
    use tokio_tungstenite::tungstenite;

    use super::*;

    #[test]
    fn http_response_roundtrip() {
        use base64::Engine as _;
        let body = vec![0xABu8; 1024];
        let body_b64 = base64::engine::general_purpose::STANDARD.encode(&body);
        let response = DataChannelResponse {
            id: Uuid::new_v4(),
            status: 200,
            headers: [(
                "content-type".into(),
                vec!["application/octet-stream".into()],
            )]
            .into_iter()
            .collect(),
            body_b64: Some(body_b64),
        };
        let msg = DataChannelMessage::HttpResponse(response);
        let json = serde_json::to_vec(&msg).unwrap();
        let parsed: DataChannelMessage = serde_json::from_slice(&json).unwrap();
        assert!(matches!(parsed, DataChannelMessage::HttpResponse(_)));
    }

    #[test]
    fn empty_body_response() {
        let response = DataChannelResponse {
            id: Uuid::new_v4(),
            status: 204,
            headers: Default::default(),
            body_b64: None,
        };
        let msg = DataChannelMessage::HttpResponse(response);
        let json = serde_json::to_vec(&msg).unwrap();
        let parsed: DataChannelMessage = serde_json::from_slice(&json).unwrap();
        assert!(matches!(parsed, DataChannelMessage::HttpResponse(_)));
    }

    #[test]
    fn ws_frame_tungstenite_roundtrip() {
        let msg = tungstenite::Message::Text("hello".into());
        let frame = WsFrame::from_transport(Uuid::new_v4(), msg);
        assert!(matches!(frame.msg_type, RelayWsMessageType::Text));
        let back: tungstenite::Message = frame.into_transport().unwrap();
        assert_eq!(back, tungstenite::Message::Text("hello".into()));
    }

    #[test]
    fn ws_frame_binary_roundtrip() {
        let data = vec![1u8, 2, 3, 4];
        let msg = tungstenite::Message::Binary(data.clone().into());
        let frame = WsFrame::from_transport(Uuid::new_v4(), msg);
        assert!(matches!(frame.msg_type, RelayWsMessageType::Binary));
        let back: tungstenite::Message = frame.into_transport().unwrap();
        assert_eq!(back, tungstenite::Message::Binary(data.into()));
    }

    #[test]
    fn ws_frame_close_roundtrip() {
        let msg = tungstenite::Message::Close(Some(tungstenite::protocol::CloseFrame {
            code: 1000u16.into(),
            reason: "normal".into(),
        }));
        let frame = WsFrame::from_transport(Uuid::new_v4(), msg);
        assert!(frame.is_close());
        let back: tungstenite::Message = frame.into_transport().unwrap();
        if let tungstenite::Message::Close(Some(cf)) = back {
            assert_eq!(u16::from(cf.code), 1000);
            assert_eq!(&*cf.reason, "normal");
        } else {
            panic!("expected Close");
        }
    }

    #[test]
    fn ws_frame_invalid_payload_is_error() {
        let frame = WsFrame {
            conn_id: Uuid::new_v4(),
            msg_type: RelayWsMessageType::Binary,
            payload_b64: Some("***not-base64***".into()),
        };

        let result: Result<tungstenite::Message, DataChannelWsStreamError> = frame.into_transport();
        assert!(result.is_err());
    }
}
