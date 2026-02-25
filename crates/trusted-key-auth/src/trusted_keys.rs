use std::path::Path;

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use ed25519_dalek::VerifyingKey;
use serde::{Deserialize, Serialize};
use tokio::fs;

use crate::error::TrustedKeyAuthError;

pub const TRUSTED_KEYS_FILE_NAME: &str = "trusted_ed25519_public_keys.json";

#[derive(Debug, Default, Deserialize, Serialize)]
struct TrustedPublicKeysFile {
    keys: Vec<String>,
}

pub async fn add_trusted_public_key(
    trusted_keys_path: &Path,
    public_key_b64: &str,
) -> Result<bool, TrustedKeyAuthError> {
    let mut trusted_keys_file = read_trusted_keys_file(trusted_keys_path).await?;

    if trusted_keys_file
        .keys
        .iter()
        .any(|key| key == public_key_b64)
    {
        return Ok(false);
    }

    trusted_keys_file.keys.push(public_key_b64.to_string());
    let serialized = serde_json::to_string_pretty(&trusted_keys_file).map_err(|error| {
        TrustedKeyAuthError::BadRequest(format!("Failed to serialize trusted keys: {error}"))
    })?;
    fs::write(trusted_keys_path, format!("{serialized}\n")).await?;

    Ok(true)
}

pub async fn load_trusted_public_keys(
    trusted_keys_path: &Path,
) -> Result<Vec<VerifyingKey>, TrustedKeyAuthError> {
    let trusted_keys_file = read_trusted_keys_file(trusted_keys_path).await?;
    if trusted_keys_file.keys.is_empty() {
        return Err(TrustedKeyAuthError::Unauthorized);
    }

    let mut parsed_keys = Vec::with_capacity(trusted_keys_file.keys.len());
    for key in &trusted_keys_file.keys {
        let parsed_key =
            parse_public_key_base64(key).map_err(|_| TrustedKeyAuthError::Unauthorized)?;
        parsed_keys.push(parsed_key);
    }

    Ok(parsed_keys)
}

pub fn parse_public_key_base64(raw_public_key: &str) -> Result<VerifyingKey, TrustedKeyAuthError> {
    let public_key_bytes = decode_base64(raw_public_key)?;
    let public_key_bytes: [u8; 32] = public_key_bytes
        .try_into()
        .map_err(|_| TrustedKeyAuthError::Unauthorized)?;
    VerifyingKey::from_bytes(&public_key_bytes).map_err(|_| TrustedKeyAuthError::Unauthorized)
}

async fn read_trusted_keys_file(
    trusted_keys_path: &Path,
) -> Result<TrustedPublicKeysFile, TrustedKeyAuthError> {
    if !trusted_keys_path.exists() {
        return Ok(TrustedPublicKeysFile::default());
    }

    let file_contents = fs::read_to_string(trusted_keys_path).await?;
    if file_contents.trim().is_empty() {
        return Ok(TrustedPublicKeysFile::default());
    }

    let trusted_keys_file: TrustedPublicKeysFile =
        serde_json::from_str(&file_contents).map_err(|error| {
            TrustedKeyAuthError::BadRequest(format!("Trusted key file is invalid JSON: {error}"))
        })?;

    for key in &trusted_keys_file.keys {
        parse_public_key_base64(key).map_err(|_| {
            TrustedKeyAuthError::BadRequest("Trusted key file contains invalid keys".to_string())
        })?;
    }

    Ok(trusted_keys_file)
}

fn decode_base64(input: &str) -> Result<Vec<u8>, TrustedKeyAuthError> {
    BASE64_STANDARD
        .decode(input)
        .map_err(|_| TrustedKeyAuthError::Unauthorized)
}

#[cfg(test)]
mod tests {
    use ed25519_dalek::SigningKey;

    use super::*;

    fn test_public_key() -> VerifyingKey {
        SigningKey::from_bytes(&[7; 32]).verifying_key()
    }

    #[test]
    fn parse_public_key_base64_accepts_valid_key() {
        let public_key = test_public_key();
        let key_b64 = BASE64_STANDARD.encode(public_key.as_bytes());

        let parsed = parse_public_key_base64(&key_b64).unwrap();
        assert_eq!(parsed.as_bytes(), public_key.as_bytes());
    }
}
