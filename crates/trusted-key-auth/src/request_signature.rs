use std::{
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use ed25519_dalek::{Signature, VerifyingKey};
use http::{HeaderMap, Method};
use thiserror::Error;

use crate::trusted_keys::load_trusted_public_keys;

pub const SIGNATURE_HEADER: &str = "x-vk-signature";
pub const TIMESTAMP_HEADER: &str = "x-vk-timestamp";
pub const MAX_TIMESTAMP_DRIFT_SECONDS: i64 = 30;

#[derive(Debug, Clone, Copy)]
pub struct VerifiedRequestSignature {
    pub timestamp: i64,
    pub now: i64,
    pub drift_seconds: i64,
    pub trusted_key_count: usize,
}

#[derive(Debug, Error)]
pub enum SignatureVerificationError {
    #[error("missing or invalid x-vk-timestamp header")]
    InvalidTimestampHeader,
    #[error("failed to read system clock")]
    ClockUnavailable,
    #[error("timestamp is outside allowed drift")]
    TimestampOutOfDrift {
        timestamp: i64,
        now: i64,
        drift_seconds: i64,
        max_drift_seconds: i64,
    },
    #[error("missing or invalid x-vk-signature header")]
    InvalidSignatureHeader,
    #[error("failed to load trusted Ed25519 public keys")]
    TrustedKeysUnavailable,
    #[error("signature does not match any trusted key")]
    SignatureMismatch { trusted_key_count: usize },
}

pub async fn verify_trusted_ed25519_signature(
    headers: &HeaderMap,
    method: &Method,
    path: &str,
    trusted_keys_path: &Path,
) -> Result<VerifiedRequestSignature, SignatureVerificationError> {
    let timestamp = parse_timestamp(headers)?;
    let now = current_unix_timestamp().map_err(|_| SignatureVerificationError::ClockUnavailable)?;
    let drift_seconds = now.saturating_sub(timestamp).abs();

    if !timestamp_is_within_drift(timestamp, now) {
        return Err(SignatureVerificationError::TimestampOutOfDrift {
            timestamp,
            now,
            drift_seconds,
            max_drift_seconds: MAX_TIMESTAMP_DRIFT_SECONDS,
        });
    }

    let signature = parse_signature(headers)?;
    let message = build_signed_message(timestamp, method, path);
    let trusted_keys = load_trusted_public_keys(trusted_keys_path)
        .await
        .map_err(|_| SignatureVerificationError::TrustedKeysUnavailable)?;
    let trusted_key_count = trusted_keys.len();

    if !verify_signature(&message, &signature, &trusted_keys) {
        return Err(SignatureVerificationError::SignatureMismatch { trusted_key_count });
    }

    Ok(VerifiedRequestSignature {
        timestamp,
        now,
        drift_seconds,
        trusted_key_count,
    })
}

fn build_signed_message(timestamp: i64, method: &Method, path: &str) -> String {
    format!("{timestamp}.{}.{}", method.as_str(), path)
}

fn parse_timestamp(headers: &HeaderMap) -> Result<i64, SignatureVerificationError> {
    let raw_timestamp = required_header(headers, TIMESTAMP_HEADER)
        .ok_or(SignatureVerificationError::InvalidTimestampHeader)?;
    raw_timestamp
        .parse::<i64>()
        .map_err(|_| SignatureVerificationError::InvalidTimestampHeader)
}

fn parse_signature(headers: &HeaderMap) -> Result<Signature, SignatureVerificationError> {
    let raw_signature = required_header(headers, SIGNATURE_HEADER)
        .ok_or(SignatureVerificationError::InvalidSignatureHeader)?;
    parse_signature_base64(raw_signature)
        .map_err(|_| SignatureVerificationError::InvalidSignatureHeader)
}

fn parse_signature_base64(raw_signature: &str) -> Result<Signature, SignatureVerificationError> {
    let signature_bytes = BASE64_STANDARD
        .decode(raw_signature)
        .map_err(|_| SignatureVerificationError::InvalidSignatureHeader)?;
    let signature_bytes: [u8; 64] = signature_bytes
        .try_into()
        .map_err(|_| SignatureVerificationError::InvalidSignatureHeader)?;
    Ok(Signature::from_bytes(&signature_bytes))
}

fn required_header<'a>(headers: &'a HeaderMap, name: &'static str) -> Option<&'a str> {
    let value = headers.get(name)?;
    let value = value.to_str().ok()?;
    let value = value.trim();
    if value.is_empty() {
        return None;
    }
    Some(value)
}

fn timestamp_is_within_drift(timestamp: i64, now: i64) -> bool {
    let drift = now.saturating_sub(timestamp).abs();
    drift <= MAX_TIMESTAMP_DRIFT_SECONDS
}

fn current_unix_timestamp() -> Result<i64, SignatureVerificationError> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| SignatureVerificationError::ClockUnavailable)?;
    i64::try_from(duration.as_secs()).map_err(|_| SignatureVerificationError::ClockUnavailable)
}

fn verify_signature(message: &str, signature: &Signature, trusted_keys: &[VerifyingKey]) -> bool {
    trusted_keys
        .iter()
        .any(|key| key.verify_strict(message.as_bytes(), signature).is_ok())
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
    use ed25519_dalek::{Signer, SigningKey};
    use http::{HeaderMap, HeaderValue, Method};
    use tokio::fs;
    use uuid::Uuid;

    use super::*;

    fn signing_key(seed: u8) -> SigningKey {
        SigningKey::from_bytes(&[seed; 32])
    }

    #[test]
    fn accepts_signature_from_trusted_key() {
        let trusted_signing_key = signing_key(7);
        let trusted_public_key = trusted_signing_key.verifying_key();

        let timestamp = 1_700_000_000_i64;
        let message = build_signed_message(timestamp, &Method::POST, "/auth/signed-test");
        let signature = trusted_signing_key.sign(message.as_bytes());

        assert!(verify_signature(
            &message,
            &signature,
            &[trusted_public_key]
        ));
    }

    #[test]
    fn rejects_signature_from_untrusted_key() {
        let trusted_signing_key = signing_key(11);
        let untrusted_signing_key = signing_key(13);

        let timestamp = 1_700_000_000_i64;
        let message = build_signed_message(timestamp, &Method::POST, "/auth/signed-test");
        let signature = untrusted_signing_key.sign(message.as_bytes());

        assert!(!verify_signature(
            &message,
            &signature,
            &[trusted_signing_key.verifying_key()]
        ));
    }

    #[test]
    fn rejects_stale_timestamps() {
        let now = 1_700_000_000_i64;
        assert!(timestamp_is_within_drift(now, now));
        assert!(timestamp_is_within_drift(
            now - MAX_TIMESTAMP_DRIFT_SECONDS,
            now
        ));
        assert!(!timestamp_is_within_drift(
            now - MAX_TIMESTAMP_DRIFT_SECONDS - 1,
            now
        ));
    }

    #[test]
    fn rejects_malformed_signature() {
        assert!(parse_signature_base64("not-base64").is_err());

        let short_signature = BASE64_STANDARD.encode([1_u8; 63]);
        assert!(parse_signature_base64(&short_signature).is_err());
    }

    #[tokio::test]
    async fn verifies_request_signature_end_to_end() {
        let signing_key = signing_key(17);
        let public_key_b64 = BASE64_STANDARD.encode(signing_key.verifying_key().as_bytes());
        let trusted_keys_json = serde_json::json!({
            "clients": [
                {
                    "client_id": Uuid::new_v4(),
                    "client_name": "Test Client",
                    "client_browser": "Chrome",
                    "client_os": "macOS",
                    "client_device": "desktop",
                    "public_key_b64": public_key_b64
                }
            ]
        })
        .to_string();

        let trusted_keys_path = temp_trusted_keys_path();
        fs::write(&trusted_keys_path, trusted_keys_json)
            .await
            .unwrap();

        let path = "/api/auth/signed-test";
        let timestamp = current_unix_timestamp().unwrap();
        let message = build_signed_message(timestamp, &Method::POST, path);
        let signature_b64 = BASE64_STANDARD.encode(signing_key.sign(message.as_bytes()).to_bytes());

        let mut headers = HeaderMap::new();
        headers.insert(
            TIMESTAMP_HEADER,
            HeaderValue::from_str(&timestamp.to_string()).unwrap(),
        );
        headers.insert(
            SIGNATURE_HEADER,
            HeaderValue::from_str(&signature_b64).unwrap(),
        );

        let result =
            verify_trusted_ed25519_signature(&headers, &Method::POST, path, &trusted_keys_path)
                .await;
        assert!(result.is_ok());

        let _ = fs::remove_file(&trusted_keys_path).await;
    }

    fn temp_trusted_keys_path() -> PathBuf {
        let mut path = std::env::temp_dir();
        path.push(format!("vk-trusted-keys-{}.json", Uuid::new_v4()));
        path
    }
}
