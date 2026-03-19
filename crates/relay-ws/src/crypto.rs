//! WebSocket frame codec with Ed25519 signing and verification.
//!
//! [`WsFrameSigner::encode`] serializes and signs outgoing frames.
//! [`WsFrameVerifier::decode`] deserializes and verifies incoming frames.
//!
//! Each frame is bound to the signing session, request nonce, a monotonic
//! sequence number, the message type, and a SHA-256 hash of the payload.

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use relay_control::signing::{RelaySigningService, RequestSignature};
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
    request_signature: RequestSignature,
    outbound_seq: u64,
    signing: RelaySigningService,
}

impl WsFrameSigner {
    pub fn new(request_signature: &RequestSignature, signing: RelaySigningService) -> Self {
        Self {
            request_signature: request_signature.clone(),
            outbound_seq: 0,
            signing,
        }
    }

    /// Sign a frame and serialize it into a JSON envelope.
    ///
    /// Increments the sequence counter, Ed25519-signs over the session id,
    /// nonce, sequence number, message type, and SHA-256 of the payload,
    /// then wraps everything into a versioned envelope.
    pub fn encode(&mut self, frame: RelayWsFrame) -> anyhow::Result<Vec<u8>> {
        self.outbound_seq = self.outbound_seq.saturating_add(1);
        let signing_input = ws_signing_input(
            &self.request_signature,
            self.outbound_seq,
            frame.msg_type,
            &frame.payload,
        );
        let signature = self.signing.sign_bytes(signing_input.as_bytes());
        let signature_b64 = BASE64_STANDARD.encode(signature.to_bytes());
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
    request_signature: RequestSignature,
    inbound_seq: u64,
    peer_verify_key: VerifyingKey,
}

impl WsFrameVerifier {
    pub fn new(request_signature: &RequestSignature, peer_verify_key: VerifyingKey) -> Self {
        Self {
            request_signature: request_signature.clone(),
            inbound_seq: 0,
            peer_verify_key,
        }
    }

    /// Verify a signed JSON envelope and deserialize it back into a frame.
    ///
    /// Checks the Ed25519 signature and enforces monotonic sequence ordering.
    pub fn decode(&mut self, raw: &[u8]) -> anyhow::Result<RelayWsFrame> {
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
            &self.request_signature,
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
    sig: &RequestSignature,
    seq: u64,
    msg_type: RelayWsMessageType,
    payload: &[u8],
) -> String {
    let payload_hash = BASE64_STANDARD.encode(Sha256::digest(payload));
    format!(
        "v1|{}|{}|{seq}|{}|{payload_hash}",
        sig.signing_session_id,
        sig.nonce,
        msg_type.as_str()
    )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use ed25519_dalek::SigningKey;

    use super::*;

    fn test_signature() -> RequestSignature {
        RequestSignature {
            signing_session_id: uuid::Uuid::nil(),
            timestamp: 0,
            nonce: uuid::Uuid::nil(),
            signature_b64: String::new(),
        }
    }

    #[test]
    fn roundtrip_encode_decode() {
        let signing_key = SigningKey::generate(&mut rand::thread_rng());
        let verify_key = signing_key.verifying_key();
        let signing = RelaySigningService::new(signing_key);
        let sig = test_signature();

        let mut signer = WsFrameSigner::new(&sig, signing);
        let mut verifier = WsFrameVerifier::new(&sig, verify_key);

        let frame = RelayWsFrame {
            msg_type: RelayWsMessageType::Text,
            payload: b"hello".to_vec(),
        };
        let encoded = signer.encode(frame).expect("encode");
        let decoded = verifier.decode(&encoded).expect("decode");

        assert!(matches!(decoded.msg_type, RelayWsMessageType::Text));
        assert_eq!(decoded.payload, b"hello");
    }

    #[test]
    fn decode_rejects_out_of_order_sequence() {
        let signing_key = SigningKey::generate(&mut rand::thread_rng());
        let verify_key = signing_key.verifying_key();
        let signing = RelaySigningService::new(signing_key);
        let sig = test_signature();

        let mut signer = WsFrameSigner::new(&sig, signing);
        let mut verifier = WsFrameVerifier::new(&sig, verify_key);

        let frame1 = RelayWsFrame {
            msg_type: RelayWsMessageType::Binary,
            payload: b"first".to_vec(),
        };
        let frame2 = RelayWsFrame {
            msg_type: RelayWsMessageType::Binary,
            payload: b"second".to_vec(),
        };
        let encoded1 = signer.encode(frame1).expect("encode first");
        let encoded2 = signer.encode(frame2).expect("encode second");

        let result = verifier.decode(&encoded2);
        assert!(result.is_err());

        verifier.decode(&encoded1).expect("decode first");
        verifier.decode(&encoded2).expect("decode second");
    }

    #[test]
    fn decode_rejects_tampered_payload() {
        let signing_key = SigningKey::generate(&mut rand::thread_rng());
        let verify_key = signing_key.verifying_key();
        let signing = RelaySigningService::new(signing_key);
        let sig = test_signature();

        let mut signer = WsFrameSigner::new(&sig, signing);
        let mut verifier = WsFrameVerifier::new(&sig, verify_key);

        let frame = RelayWsFrame {
            msg_type: RelayWsMessageType::Text,
            payload: b"original".to_vec(),
        };
        let encoded = signer.encode(frame).expect("encode");

        let json_str = String::from_utf8(encoded).unwrap();
        let tampered = json_str.replace(
            &BASE64_STANDARD.encode(b"original"),
            &BASE64_STANDARD.encode(b"tampered"),
        );
        let encoded = tampered.into_bytes();

        let result = verifier.decode(&encoded);
        assert!(result.is_err());
    }
}
