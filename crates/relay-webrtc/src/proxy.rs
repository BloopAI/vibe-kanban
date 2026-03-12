use std::collections::HashMap;

use base64::Engine as _;
use relay_ws::{RelayWsFrame, RelayWsMessageType};
use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Top-level data channel envelope
// ---------------------------------------------------------------------------

/// A message sent over the WebRTC data channel.
///
/// Uses `#[serde(tag = "type")]` so the JSON always contains a `"type"` field
/// that selects the variant. Existing HTTP messages use `"http_request"` /
/// `"http_response"`; new WebSocket messages use `"ws_*"` prefixes.
#[derive(Debug, Clone, Serialize, Deserialize)]
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
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataChannelRequest {
    pub id: String,
    pub method: String,
    pub path: String,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    /// Base64-encoded request body, if any.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub body_b64: Option<String>,
}

/// A response message sent back over the data channel.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataChannelResponse {
    pub id: String,
    pub status: u16,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    /// Base64-encoded response body, if any.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub body_b64: Option<String>,
}

// ---------------------------------------------------------------------------
// WebSocket messages
// ---------------------------------------------------------------------------

/// Request to open a WebSocket to the local backend (client → host).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsOpen {
    /// Unique connection ID for multiplexing.
    pub conn_id: String,
    /// Target path, e.g. `/api/sessions/abc/queue`.
    pub path: String,
    /// Optional sub-protocol(s) to negotiate.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub protocols: Option<String>,
}

/// Confirmation that the WebSocket was opened (host → client).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsOpened {
    pub conn_id: String,
    /// The sub-protocol selected by the server, if any.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selected_protocol: Option<String>,
}

/// A single WebSocket frame (bidirectional), serialized over the data channel.
///
/// Wraps [`RelayWsFrame`] with a `conn_id` for multiplexing and base64-encoded
/// payload for JSON transport.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsFrame {
    pub conn_id: String,
    pub msg_type: RelayWsMessageType,
    /// Base64-encoded payload.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub payload_b64: Option<String>,
}

impl WsFrame {
    /// Create a `WsFrame` from a [`RelayWsFrame`] and a connection ID.
    pub fn from_relay_frame(conn_id: String, frame: RelayWsFrame) -> Self {
        let payload_b64 = if frame.payload.is_empty() {
            None
        } else {
            Some(base64::engine::general_purpose::STANDARD.encode(&frame.payload))
        };
        Self {
            conn_id,
            msg_type: frame.msg_type,
            payload_b64,
        }
    }

    /// Convert back to a [`RelayWsFrame`], decoding the base64 payload.
    pub fn into_relay_frame(self) -> RelayWsFrame {
        let payload = self
            .payload_b64
            .as_deref()
            .map(|b64| {
                base64::engine::general_purpose::STANDARD
                    .decode(b64)
                    .unwrap_or_default()
            })
            .unwrap_or_default();
        RelayWsFrame {
            msg_type: self.msg_type,
            payload,
        }
    }
}

/// Close a WebSocket connection (bidirectional).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsClose {
    pub conn_id: String,
    /// Close code (RFC 6455 §7.4).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub code: Option<u16>,
    /// Close reason.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

/// WebSocket error — the connection could not be opened or has failed.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsError {
    pub conn_id: String,
    pub error: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn http_response_roundtrip() {
        use base64::Engine as _;
        let body = vec![0xABu8; 1024];
        let body_b64 = base64::engine::general_purpose::STANDARD.encode(&body);
        let response = DataChannelResponse {
            id: "test-id".to_string(),
            status: 200,
            headers: [("content-type".into(), "application/octet-stream".into())]
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
            id: "test-id".to_string(),
            status: 204,
            headers: Default::default(),
            body_b64: None,
        };
        let msg = DataChannelMessage::HttpResponse(response);
        let json = serde_json::to_vec(&msg).unwrap();
        let parsed: DataChannelMessage = serde_json::from_slice(&json).unwrap();
        assert!(matches!(parsed, DataChannelMessage::HttpResponse(_)));
    }
}
