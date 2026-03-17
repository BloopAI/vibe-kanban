//! Non-generic WebSocket frame signing and verification.
//!
//! [`WsFrameSigner::encode`] signs outgoing frames with Ed25519.
//! [`WsFrameVerifier::decode`] verifies incoming frames.
//!
//! Each frame is bound to the signing session, request nonce, a monotonic
//! sequence number, the message type, and a SHA-256 hash of the payload.

use std::fmt::Display;

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

// ---------------------------------------------------------------------------
// Public frame types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
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

// ---------------------------------------------------------------------------
// Signer — encodes and Ed25519-signs outgoing frames
// ---------------------------------------------------------------------------

pub struct WsFrameSigner {
    signing_session_id: String,
    request_nonce: String,
    outbound_seq: u64,
    signing_key: SigningKey,
}

impl WsFrameSigner {
    pub fn new(signing_session_id: String, request_nonce: String, signing_key: SigningKey) -> Self {
        Self {
            signing_session_id,
            request_nonce,
            outbound_seq: 0,
            signing_key,
        }
    }

    /// Sign a frame and serialize it into a JSON envelope.
    ///
    /// Increments the sequence counter, Ed25519-signs over the session id,
    /// nonce, sequence number, message type, and SHA-256 of the payload,
    /// then wraps everything into a versioned envelope.
    pub fn sign_frame(&mut self, frame: RelayWsFrame) -> anyhow::Result<Vec<u8>> {
        self.outbound_seq = self.outbound_seq.saturating_add(1);
        let signing_input = ws_signing_input(
            &self.signing_session_id,
            &self.request_nonce,
            self.outbound_seq,
            frame.msg_type,
            &frame.payload,
        );
        let signature_b64 =
            BASE64_STANDARD.encode(self.signing_key.sign(signing_input.as_bytes()).to_bytes());
        let envelope = SignedWsEnvelope {
            version: ENVELOPE_VERSION,
            seq: self.outbound_seq,
            msg_type: frame.msg_type,
            payload_b64: BASE64_STANDARD.encode(frame.payload),
            signature_b64,
        };
        serde_json::to_vec(&envelope).map_err(anyhow::Error::from)
    }
}

// ---------------------------------------------------------------------------
// Verifier — decodes and Ed25519-verifies incoming frames
// ---------------------------------------------------------------------------

pub struct WsFrameVerifier {
    signing_session_id: String,
    request_nonce: String,
    inbound_seq: u64,
    peer_verify_key: VerifyingKey,
}

impl WsFrameVerifier {
    pub fn new(
        signing_session_id: String,
        request_nonce: String,
        peer_verify_key: VerifyingKey,
    ) -> Self {
        Self {
            signing_session_id,
            request_nonce,
            inbound_seq: 0,
            peer_verify_key,
        }
    }

    /// Verify a signed JSON envelope and deserialize it back into a frame.
    ///
    /// Checks the Ed25519 signature and enforces monotonic sequence ordering.
    pub fn verify_frame(&mut self, raw: &[u8]) -> anyhow::Result<RelayWsFrame> {
        use anyhow::Context as _;

        let envelope: SignedWsEnvelope =
            serde_json::from_slice(raw).context("invalid relay WS envelope JSON")?;

        if envelope.version != ENVELOPE_VERSION {
            anyhow::bail!("unsupported relay WS envelope version");
        }

        let expected_seq = self.inbound_seq.saturating_add(1);
        if envelope.seq != expected_seq {
            anyhow::bail!(
                "invalid relay WS sequence: expected {expected_seq}, got {}",
                envelope.seq
            );
        }

        let payload = BASE64_STANDARD
            .decode(&envelope.payload_b64)
            .context("invalid relay WS payload")?;

        let signing_input = ws_signing_input(
            &self.signing_session_id,
            &self.request_nonce,
            envelope.seq,
            envelope.msg_type,
            &payload,
        );
        let signature_bytes = BASE64_STANDARD
            .decode(&envelope.signature_b64)
            .context("invalid relay WS frame signature encoding")?;
        let signature =
            Signature::from_slice(&signature_bytes).context("invalid relay WS frame signature")?;
        self.peer_verify_key
            .verify(signing_input.as_bytes(), &signature)
            .context("invalid relay WS frame signature")?;

        self.inbound_seq = envelope.seq;
        Ok(RelayWsFrame {
            msg_type: envelope.msg_type,
            payload,
        })
    }
}

// ---------------------------------------------------------------------------
// Private internals
// ---------------------------------------------------------------------------

const ENVELOPE_VERSION: u8 = 1;

#[derive(Debug, Serialize, Deserialize)]
struct SignedWsEnvelope {
    version: u8,
    seq: u64,
    msg_type: RelayWsMessageType,
    payload_b64: String,
    signature_b64: String,
}

fn ws_signing_input(
    signing_session_id: impl Display,
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_encode_decode() {
        let signing_key = SigningKey::generate(&mut rand::thread_rng());
        let verify_key = signing_key.verifying_key();

        let mut signer = WsFrameSigner::new("sess-1".into(), "nonce-1".into(), signing_key);
        let mut verifier = WsFrameVerifier::new("sess-1".into(), "nonce-1".into(), verify_key);

        let frame = RelayWsFrame {
            msg_type: RelayWsMessageType::Text,
            payload: b"hello".to_vec(),
        };
        let encoded = signer.sign_frame(frame).expect("encode");
        let decoded = verifier.verify_frame(&encoded).expect("decode");

        assert!(matches!(decoded.msg_type, RelayWsMessageType::Text));
        assert_eq!(decoded.payload, b"hello");
    }

    #[test]
    fn decode_rejects_out_of_order_sequence() {
        let signing_key = SigningKey::generate(&mut rand::thread_rng());
        let verify_key = signing_key.verifying_key();

        let mut signer = WsFrameSigner::new("sess-1".into(), "nonce-1".into(), signing_key);
        let mut verifier = WsFrameVerifier::new("sess-1".into(), "nonce-1".into(), verify_key);

        let frame1 = RelayWsFrame {
            msg_type: RelayWsMessageType::Binary,
            payload: b"first".to_vec(),
        };
        let frame2 = RelayWsFrame {
            msg_type: RelayWsMessageType::Binary,
            payload: b"second".to_vec(),
        };
        let encoded1 = signer.sign_frame(frame1).expect("encode first");
        let encoded2 = signer.sign_frame(frame2).expect("encode second");

        let result = verifier.verify_frame(&encoded2);
        assert!(result.is_err());

        verifier.verify_frame(&encoded1).expect("decode first");
        verifier.verify_frame(&encoded2).expect("decode second");
    }

    #[test]
    fn decode_rejects_tampered_payload() {
        let signing_key = SigningKey::generate(&mut rand::thread_rng());
        let verify_key = signing_key.verifying_key();

        let mut signer = WsFrameSigner::new("sess-1".into(), "nonce-1".into(), signing_key);
        let mut verifier = WsFrameVerifier::new("sess-1".into(), "nonce-1".into(), verify_key);

        let frame = RelayWsFrame {
            msg_type: RelayWsMessageType::Text,
            payload: b"original".to_vec(),
        };
        let encoded = signer.sign_frame(frame).expect("encode");

        let json_str = String::from_utf8(encoded).unwrap();
        let tampered = json_str.replace(
            &BASE64_STANDARD.encode(b"original"),
            &BASE64_STANDARD.encode(b"tampered"),
        );
        let encoded = tampered.into_bytes();

        let result = verifier.verify_frame(&encoded);
        assert!(result.is_err());
    }
}
