use std::fmt::Display;

use anyhow::Context as _;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use relay_ws_protocol::{RelayMessage, RelayMessageType, SignedRelayEnvelope};
use sha2::{Digest, Sha256};

#[derive(Clone)]
pub struct RelaySessionCrypto {
    signing_session_id: String,
    request_nonce: String,
    signing_key: SigningKey,
    peer_verify_key: VerifyingKey,
}

impl RelaySessionCrypto {
    pub fn new(
        signing_session_id: impl Into<String>,
        request_nonce: impl Into<String>,
        signing_key: SigningKey,
        peer_verify_key: VerifyingKey,
    ) -> Self {
        Self {
            signing_session_id: signing_session_id.into(),
            request_nonce: request_nonce.into(),
            signing_key,
            peer_verify_key,
        }
    }
}

pub struct OutboundRelaySigner {
    signing_session_id: String,
    request_nonce: String,
    outbound_seq: u64,
    signing_key: SigningKey,
}

impl OutboundRelaySigner {
    pub fn new(session: &RelaySessionCrypto) -> Self {
        Self {
            signing_session_id: session.signing_session_id.clone(),
            request_nonce: session.request_nonce.clone(),
            outbound_seq: 0,
            signing_key: session.signing_key.clone(),
        }
    }

    pub fn sign_message(&mut self, message: RelayMessage) -> anyhow::Result<SignedRelayEnvelope> {
        let (message_type, payload) = message.into_parts();

        self.outbound_seq = self.outbound_seq.saturating_add(1);

        let signing_input = relay_signing_input(
            &self.signing_session_id,
            &self.request_nonce,
            self.outbound_seq,
            message_type,
            &payload,
        );
        let signature_b64 =
            BASE64_STANDARD.encode(self.signing_key.sign(signing_input.as_bytes()).to_bytes());

        Ok(SignedRelayEnvelope::new(
            self.outbound_seq,
            message_type,
            BASE64_STANDARD.encode(payload),
            signature_b64,
        ))
    }

    pub fn sign_message_bytes(&mut self, message: RelayMessage) -> anyhow::Result<Vec<u8>> {
        self.sign_message(message)?.encode()
    }
}

pub struct InboundRelayVerifier {
    signing_session_id: String,
    request_nonce: String,
    inbound_seq: u64,
    peer_verify_key: VerifyingKey,
}

impl InboundRelayVerifier {
    pub fn new(session: &RelaySessionCrypto) -> Self {
        Self {
            signing_session_id: session.signing_session_id.clone(),
            request_nonce: session.request_nonce.clone(),
            inbound_seq: 0,
            peer_verify_key: session.peer_verify_key,
        }
    }

    pub fn verify_envelope(
        &mut self,
        envelope: SignedRelayEnvelope,
    ) -> anyhow::Result<RelayMessage> {
        envelope.ensure_supported_version()?;

        let expected_seq = self.inbound_seq.saturating_add(1);
        if envelope.seq() != expected_seq {
            anyhow::bail!(
                "invalid relay WS sequence: expected {expected_seq}, got {}",
                envelope.seq()
            );
        }

        let payload = BASE64_STANDARD
            .decode(envelope.payload_b64())
            .context("invalid relay WS payload")?;
        let signing_input = relay_signing_input(
            &self.signing_session_id,
            &self.request_nonce,
            envelope.seq(),
            envelope.message_type(),
            &payload,
        );
        let signature_bytes = BASE64_STANDARD
            .decode(envelope.signature_b64())
            .context("invalid relay WS frame signature encoding")?;
        let signature =
            Signature::from_slice(&signature_bytes).context("invalid relay WS frame signature")?;

        self.peer_verify_key
            .verify(signing_input.as_bytes(), &signature)
            .context("invalid relay WS frame signature")?;

        self.inbound_seq = envelope.seq();
        RelayMessage::from_parts(envelope.message_type(), payload)
    }

    pub fn verify_envelope_bytes(&mut self, raw: &[u8]) -> anyhow::Result<RelayMessage> {
        let envelope = SignedRelayEnvelope::decode(raw)?;
        self.verify_envelope(envelope)
    }
}

fn relay_signing_input(
    signing_session_id: impl Display,
    request_nonce: &str,
    seq: u64,
    message_type: RelayMessageType,
    payload: &[u8],
) -> String {
    let payload_hash = BASE64_STANDARD.encode(Sha256::digest(payload));
    format!("v1|{signing_session_id}|{request_nonce}|{seq}|{message_type}|{payload_hash}")
}

#[cfg(test)]
mod tests {
    use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
    use relay_ws_protocol::{RelayClose, RelayMessage, SignedRelayEnvelope};

    use super::*;

    #[test]
    fn signer_and_verifier_roundtrip() {
        let signing_key = SigningKey::generate(&mut rand::thread_rng());
        let mut signer = OutboundRelaySigner::new(&RelaySessionCrypto::new(
            "session-1",
            "nonce-1",
            signing_key.clone(),
            signing_key.verifying_key(),
        ));
        let mut verifier = InboundRelayVerifier::new(&RelaySessionCrypto::new(
            "session-1",
            "nonce-1",
            signing_key,
            signer.signing_key.verifying_key(),
        ));

        let message = RelayMessage::Close(Some(RelayClose {
            code: 1000,
            reason: "done".into(),
        }));
        let envelope_bytes = signer.sign_message_bytes(message.clone()).expect("sign");

        let decoded = verifier
            .verify_envelope_bytes(&envelope_bytes)
            .expect("verify");

        assert_eq!(decoded, message);
    }

    #[test]
    fn verifier_rejects_out_of_order_sequence() {
        let signing_key = SigningKey::generate(&mut rand::thread_rng());
        let session = RelaySessionCrypto::new(
            "session-1",
            "nonce-1",
            signing_key.clone(),
            signing_key.verifying_key(),
        );
        let mut signer = OutboundRelaySigner::new(&session);
        let mut verifier = InboundRelayVerifier::new(&session);

        let first = signer
            .sign_message_bytes(RelayMessage::Binary(b"first".to_vec()))
            .expect("sign first");
        let second = signer
            .sign_message_bytes(RelayMessage::Binary(b"second".to_vec()))
            .expect("sign second");

        assert!(verifier.verify_envelope_bytes(&second).is_err());
        verifier
            .verify_envelope_bytes(&first)
            .expect("verify first");
        verifier
            .verify_envelope_bytes(&second)
            .expect("verify second");
    }

    #[test]
    fn verifier_rejects_tampered_payload() {
        let signing_key = SigningKey::generate(&mut rand::thread_rng());
        let session = RelaySessionCrypto::new(
            "session-1",
            "nonce-1",
            signing_key.clone(),
            signing_key.verifying_key(),
        );
        let mut signer = OutboundRelaySigner::new(&session);
        let mut verifier = InboundRelayVerifier::new(&session);

        let envelope = signer
            .sign_message(RelayMessage::Binary(b"payload".to_vec()))
            .expect("sign");
        let tampered = SignedRelayEnvelope::new(
            envelope.seq(),
            envelope.message_type(),
            BASE64_STANDARD.encode(b"other"),
            envelope.signature_b64().to_string(),
        );

        assert!(verifier.verify_envelope(tampered).is_err());
    }
}
