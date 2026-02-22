use std::time::{SystemTime, UNIX_EPOCH};

use axum::{
    extract::{OriginalUri, Request},
    http::{HeaderMap, Method},
    middleware::Next,
    response::Response,
};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use ed25519_dalek::{Signature, VerifyingKey};
use serde::Deserialize;
use tokio::fs;
use utils::assets::asset_dir;

use crate::error::ApiError;

const TRUSTED_KEYS_FILE_NAME: &str = "trusted_ed25519_public_keys.json";
const SIGNATURE_HEADER: &str = "x-vk-signature";
const TIMESTAMP_HEADER: &str = "x-vk-timestamp";
const MAX_TIMESTAMP_DRIFT_SECONDS: i64 = 5 * 60;

#[derive(Debug, Deserialize)]
struct TrustedPublicKeysFile {
    keys: Vec<String>,
}

pub async fn require_trusted_ed25519_signature(
    request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    let timestamp = parse_timestamp(request.headers())?;
    let now = current_unix_timestamp()?;
    if !timestamp_is_within_drift(timestamp, now) {
        return Err(ApiError::Unauthorized);
    }

    let signature = parse_signature(request.headers())?;
    let request_path = request
        .extensions()
        .get::<OriginalUri>()
        .map(|uri| uri.0.path())
        .unwrap_or_else(|| request.uri().path());
    let message = build_signed_message(timestamp, request.method(), request_path);
    let trusted_keys = load_trusted_public_keys().await?;

    if !verify_signature(&message, &signature, &trusted_keys) {
        return Err(ApiError::Unauthorized);
    }

    Ok(next.run(request).await)
}

fn build_signed_message(timestamp: i64, method: &Method, path: &str) -> String {
    format!("{timestamp}.{}.{}", method.as_str(), path)
}

fn parse_timestamp(headers: &HeaderMap) -> Result<i64, ApiError> {
    let raw_timestamp = required_header(headers, TIMESTAMP_HEADER)?;
    raw_timestamp
        .parse::<i64>()
        .map_err(|_| ApiError::Unauthorized)
}

fn parse_signature(headers: &HeaderMap) -> Result<Signature, ApiError> {
    let raw_signature = required_header(headers, SIGNATURE_HEADER)?;
    parse_signature_base64(raw_signature)
}

fn parse_signature_base64(raw_signature: &str) -> Result<Signature, ApiError> {
    let signature_bytes = BASE64_STANDARD
        .decode(raw_signature)
        .map_err(|_| ApiError::Unauthorized)?;
    let signature_bytes: [u8; 64] = signature_bytes
        .try_into()
        .map_err(|_| ApiError::Unauthorized)?;
    Ok(Signature::from_bytes(&signature_bytes))
}

fn required_header<'a>(headers: &'a HeaderMap, name: &'static str) -> Result<&'a str, ApiError> {
    headers
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or(ApiError::Unauthorized)
}

fn timestamp_is_within_drift(timestamp: i64, now: i64) -> bool {
    let drift = now.saturating_sub(timestamp).abs();
    drift <= MAX_TIMESTAMP_DRIFT_SECONDS
}

fn current_unix_timestamp() -> Result<i64, ApiError> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| ApiError::Unauthorized)?;
    i64::try_from(duration.as_secs()).map_err(|_| ApiError::Unauthorized)
}

async fn load_trusted_public_keys() -> Result<Vec<VerifyingKey>, ApiError> {
    let trusted_keys_path = asset_dir().join(TRUSTED_KEYS_FILE_NAME);
    let file_contents = fs::read_to_string(trusted_keys_path)
        .await
        .map_err(|_| ApiError::Unauthorized)?;
    parse_trusted_public_keys(&file_contents)
}

fn parse_trusted_public_keys(file_contents: &str) -> Result<Vec<VerifyingKey>, ApiError> {
    let trusted_keys_file: TrustedPublicKeysFile =
        serde_json::from_str(file_contents).map_err(|_| ApiError::Unauthorized)?;
    if trusted_keys_file.keys.is_empty() {
        return Err(ApiError::Unauthorized);
    }

    trusted_keys_file
        .keys
        .iter()
        .map(|key| parse_public_key_base64(key))
        .collect()
}

fn parse_public_key_base64(raw_public_key: &str) -> Result<VerifyingKey, ApiError> {
    let public_key_bytes = BASE64_STANDARD
        .decode(raw_public_key)
        .map_err(|_| ApiError::Unauthorized)?;
    let public_key_bytes: [u8; 32] = public_key_bytes
        .try_into()
        .map_err(|_| ApiError::Unauthorized)?;
    VerifyingKey::from_bytes(&public_key_bytes).map_err(|_| ApiError::Unauthorized)
}

fn verify_signature(message: &str, signature: &Signature, trusted_keys: &[VerifyingKey]) -> bool {
    trusted_keys
        .iter()
        .any(|key| key.verify_strict(message.as_bytes(), signature).is_ok())
}

#[cfg(test)]
mod tests {
    use axum::http::Method;
    use ed25519_dalek::{Signer, SigningKey};

    use super::*;

    fn signing_key(seed: u8) -> SigningKey {
        SigningKey::from_bytes(&[seed; 32])
    }

    #[test]
    fn accepts_signature_from_trusted_key() {
        let trusted_signing_key = signing_key(7);
        let trusted_public_key = trusted_signing_key.verifying_key();
        let trusted_public_key_base64 = BASE64_STANDARD.encode(trusted_public_key.as_bytes());

        let keys_file = serde_json::json!({
            "keys": [trusted_public_key_base64]
        })
        .to_string();
        let trusted_keys = parse_trusted_public_keys(&keys_file).unwrap();

        let timestamp = 1_700_000_000_i64;
        let message = build_signed_message(timestamp, &Method::POST, "/auth/signed-test");
        let signature = trusted_signing_key.sign(message.as_bytes());

        assert!(verify_signature(&message, &signature, &trusted_keys));
    }

    #[test]
    fn rejects_signature_from_untrusted_key() {
        let trusted_signing_key = signing_key(11);
        let untrusted_signing_key = signing_key(13);

        let trusted_public_key_base64 = BASE64_STANDARD.encode(trusted_signing_key.verifying_key());
        let keys_file = serde_json::json!({
            "keys": [trusted_public_key_base64]
        })
        .to_string();
        let trusted_keys = parse_trusted_public_keys(&keys_file).unwrap();

        let timestamp = 1_700_000_000_i64;
        let message = build_signed_message(timestamp, &Method::POST, "/auth/signed-test");
        let signature = untrusted_signing_key.sign(message.as_bytes());

        assert!(!verify_signature(&message, &signature, &trusted_keys));
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
}
