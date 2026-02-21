//! Relay protocol types shared between local and remote backends.
//!
//! The relay uses a single WebSocket "control channel" between local and remote.
//! Multiple concurrent HTTP requests and WebSocket streams are multiplexed
//! over this channel using `stream_id`.

use serde::{Deserialize, Serialize};

/// A wrapper around `Vec<u8>` that serializes as base64.
#[derive(Debug, Clone, Default)]
pub struct Base64Bytes(pub Vec<u8>);

impl Serialize for Base64Bytes {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use base64::Engine;
        serializer.serialize_str(&base64::engine::general_purpose::STANDARD.encode(&self.0))
    }
}

impl<'de> Deserialize<'de> for Base64Bytes {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        use base64::Engine;
        let s = String::deserialize(deserializer)?;
        base64::engine::general_purpose::STANDARD
            .decode(&s)
            .map(Base64Bytes)
            .map_err(serde::de::Error::custom)
    }
}

/// Messages sent from the remote server to the local relay client.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum RelayToLocal {
    HttpRequest {
        stream_id: u64,
        method: String,
        path: String,
        headers: Vec<(String, String)>,
        body: Base64Bytes,
    },
    WsOpen {
        stream_id: u64,
        path: String,
        headers: Vec<(String, String)>,
    },
    WsData {
        stream_id: u64,
        data: Base64Bytes,
        is_text: bool,
    },
    WsClose {
        stream_id: u64,
    },
    Ping {
        ts: u64,
    },
}

/// Messages sent from the local relay client to the remote server.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum LocalToRelay {
    HttpResponse {
        stream_id: u64,
        status: u16,
        headers: Vec<(String, String)>,
        body: Base64Bytes,
    },
    WsOpened {
        stream_id: u64,
    },
    WsRejected {
        stream_id: u64,
        status: u16,
    },
    WsData {
        stream_id: u64,
        data: Base64Bytes,
        is_text: bool,
    },
    WsClose {
        stream_id: u64,
    },
    Pong {
        ts: u64,
    },
}

/// Response from `GET /v1/relay/mine`.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RelayStatus {
    pub connected: bool,
    /// Full URL to the relay subdomain (e.g. `https://user-id.relay.example.com/`).
    /// Present only when `connected` is true and `RELAY_BASE_DOMAIN` is configured.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub relay_url: Option<String>,
}
