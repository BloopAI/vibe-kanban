//! Relay WebSocket frame types, signing, transport adapters, and signed
//! channel wrappers.
//!
//! - [`crypto`] — [`WsFrameSigner::encode`] signs frames, [`WsFrameVerifier::decode`] verifies them.
//! - [`protocol`] — [`RelayTransportMessage`] converts between native WS messages and [`RelayWsFrame`].
//! - [`signed`] — [`SignedWebSocket`] composes crypto + protocol over a generic stream.

mod crypto;
mod protocol;
mod signed;

pub use signed::{
    SignedAxumSocket, SignedTungsteniteSocket, signed_axum_websocket, signed_tungstenite_websocket,
};
