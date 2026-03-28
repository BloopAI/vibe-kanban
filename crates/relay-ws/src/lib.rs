//! Signed relay WebSocket channel wrappers.
//!
//! - [`crypto`] — [`WsFrameSigner::encode`] signs frames, [`WsFrameVerifier::decode`] verifies them.
//! - [`signed`] — [`SignedWebSocket`] composes crypto + protocol over a generic stream.

mod crypto;
mod signed;
pub use signed::{
    SignedAxumSocket, SignedTungsteniteSocket, signed_axum_websocket, signed_tungstenite_websocket,
};
