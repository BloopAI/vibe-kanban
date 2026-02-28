use std::time::{SystemTime, UNIX_EPOCH};

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use uuid::Uuid;

use crate::error::TrustedKeyAuthError;

pub const REFRESH_MAX_TIMESTAMP_DRIFT_SECS: i64 = 30;

pub fn build_refresh_message(timestamp: i64, nonce: &str, client_id: Uuid) -> String {
    format!("v1|refresh|{timestamp}|{nonce}|{client_id}")
}

pub fn validate_refresh_timestamp(timestamp: i64) -> Result<(), TrustedKeyAuthError> {
    let now = current_unix_timestamp()?;
    let drift = now.saturating_sub(timestamp).abs();
    if drift > REFRESH_MAX_TIMESTAMP_DRIFT_SECS {
        return Err(TrustedKeyAuthError::Unauthorized);
    }

    Ok(())
}

pub fn verify_refresh_signature(
    public_key: &VerifyingKey,
    message: &str,
    signature_b64: &str,
) -> Result<(), TrustedKeyAuthError> {
    let signature_bytes = BASE64_STANDARD
        .decode(signature_b64)
        .map_err(|_| TrustedKeyAuthError::Unauthorized)?;
    let signature =
        Signature::from_slice(&signature_bytes).map_err(|_| TrustedKeyAuthError::Unauthorized)?;

    public_key
        .verify(message.as_bytes(), &signature)
        .map_err(|_| TrustedKeyAuthError::Unauthorized)
}

fn current_unix_timestamp() -> Result<i64, TrustedKeyAuthError> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| TrustedKeyAuthError::Unauthorized)?;
    i64::try_from(duration.as_secs()).map_err(|_| TrustedKeyAuthError::Unauthorized)
}

#[cfg(test)]
mod tests {
    use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
    use ed25519_dalek::{Signer, SigningKey};

    use super::*;

    fn signing_key(seed: u8) -> SigningKey {
        SigningKey::from_bytes(&[seed; 32])
    }

    #[test]
    fn build_refresh_message_is_stable() {
        let message = build_refresh_message(
            1_700_000_000,
            "nonce-123",
            Uuid::parse_str("11111111-1111-1111-1111-111111111111").unwrap(),
        );
        assert_eq!(
            message,
            "v1|refresh|1700000000|nonce-123|11111111-1111-1111-1111-111111111111"
        );
    }

    #[test]
    fn verify_refresh_signature_accepts_valid_signature() {
        let signing_key = signing_key(9);
        let client_id = Uuid::new_v4();
        let message = build_refresh_message(1_700_000_000, "nonce", client_id);
        let signature_b64 = BASE64_STANDARD.encode(signing_key.sign(message.as_bytes()).to_bytes());

        verify_refresh_signature(&signing_key.verifying_key(), &message, &signature_b64).unwrap();
    }

    #[test]
    fn verify_refresh_signature_rejects_invalid_signature() {
        let trusted_key = signing_key(11);
        let attacker_key = signing_key(13);
        let client_id = Uuid::new_v4();
        let message = build_refresh_message(1_700_000_000, "nonce", client_id);
        let signature_b64 =
            BASE64_STANDARD.encode(attacker_key.sign(message.as_bytes()).to_bytes());

        assert!(
            verify_refresh_signature(&trusted_key.verifying_key(), &message, &signature_b64)
                .is_err()
        );
    }

    #[test]
    fn validate_refresh_timestamp_rejects_stale_values() {
        let now = current_unix_timestamp().unwrap();
        let stale = now - REFRESH_MAX_TIMESTAMP_DRIFT_SECS - 1;
        assert!(validate_refresh_timestamp(stale).is_err());
    }
}
