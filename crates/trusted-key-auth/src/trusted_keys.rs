use std::path::Path;

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use ed25519_dalek::VerifyingKey;
use serde::{Deserialize, Serialize};
use tokio::fs;
use uuid::Uuid;

use crate::error::TrustedKeyAuthError;

pub const TRUSTED_KEYS_FILE_NAME: &str = "trusted_ed25519_public_keys.json";

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct TrustedRelayClient {
    pub client_id: Uuid,
    pub client_name: String,
    pub client_browser: String,
    pub client_os: String,
    pub client_device: String,
    pub public_key_b64: String,
}

#[derive(Debug, Default, Deserialize, Serialize)]
struct TrustedRelayClientsFile {
    clients: Vec<TrustedRelayClient>,
}

pub async fn upsert_trusted_client(
    trusted_keys_path: &Path,
    client: TrustedRelayClient,
) -> Result<bool, TrustedKeyAuthError> {
    validate_client(&client)?;
    let mut trusted_clients_file = read_trusted_clients_file(trusted_keys_path).await?;

    if let Some(existing_client) = trusted_clients_file
        .clients
        .iter_mut()
        .find(|existing_client| {
            existing_client.client_id == client.client_id
                || existing_client.public_key_b64 == client.public_key_b64
        })
    {
        *existing_client = client;
        write_trusted_clients_file(trusted_keys_path, &trusted_clients_file).await?;
        return Ok(false);
    }

    trusted_clients_file.clients.push(client);
    write_trusted_clients_file(trusted_keys_path, &trusted_clients_file).await?;
    Ok(true)
}

pub async fn load_trusted_public_keys(
    trusted_keys_path: &Path,
) -> Result<Vec<VerifyingKey>, TrustedKeyAuthError> {
    let trusted_clients_file = read_trusted_clients_file(trusted_keys_path).await?;
    if trusted_clients_file.clients.is_empty() {
        return Err(TrustedKeyAuthError::Unauthorized);
    }

    let mut parsed_keys = Vec::with_capacity(trusted_clients_file.clients.len());
    for client in &trusted_clients_file.clients {
        let parsed_key = parse_public_key_base64(&client.public_key_b64)
            .map_err(|_| TrustedKeyAuthError::Unauthorized)?;
        parsed_keys.push(parsed_key);
    }

    Ok(parsed_keys)
}

pub async fn list_trusted_clients(
    trusted_keys_path: &Path,
) -> Result<Vec<TrustedRelayClient>, TrustedKeyAuthError> {
    Ok(read_trusted_clients_file(trusted_keys_path).await?.clients)
}

pub async fn remove_trusted_client(
    trusted_keys_path: &Path,
    client_id: Uuid,
) -> Result<bool, TrustedKeyAuthError> {
    let mut trusted_clients_file = read_trusted_clients_file(trusted_keys_path).await?;
    let previous_len = trusted_clients_file.clients.len();
    trusted_clients_file
        .clients
        .retain(|client| client.client_id != client_id);

    if trusted_clients_file.clients.len() == previous_len {
        return Ok(false);
    }

    write_trusted_clients_file(trusted_keys_path, &trusted_clients_file).await?;
    Ok(true)
}

pub fn parse_public_key_base64(raw_public_key: &str) -> Result<VerifyingKey, TrustedKeyAuthError> {
    let public_key_bytes = decode_base64(raw_public_key)?;
    let public_key_bytes: [u8; 32] = public_key_bytes
        .try_into()
        .map_err(|_| TrustedKeyAuthError::Unauthorized)?;
    VerifyingKey::from_bytes(&public_key_bytes).map_err(|_| TrustedKeyAuthError::Unauthorized)
}

async fn read_trusted_clients_file(
    trusted_keys_path: &Path,
) -> Result<TrustedRelayClientsFile, TrustedKeyAuthError> {
    if !trusted_keys_path.exists() {
        return Ok(TrustedRelayClientsFile::default());
    }

    let file_contents = fs::read_to_string(trusted_keys_path).await?;
    if file_contents.trim().is_empty() {
        return Ok(TrustedRelayClientsFile::default());
    }

    let trusted_clients_file: TrustedRelayClientsFile = serde_json::from_str(&file_contents)
        .map_err(|error| {
            TrustedKeyAuthError::BadRequest(format!("Trusted key file is invalid JSON: {error}"))
        })?;

    for client in &trusted_clients_file.clients {
        validate_client(client)?;
    }

    Ok(trusted_clients_file)
}

async fn write_trusted_clients_file(
    trusted_keys_path: &Path,
    trusted_clients_file: &TrustedRelayClientsFile,
) -> Result<(), TrustedKeyAuthError> {
    let serialized = serde_json::to_string_pretty(trusted_clients_file).map_err(|error| {
        TrustedKeyAuthError::BadRequest(format!("Failed to serialize trusted keys: {error}"))
    })?;
    fs::write(trusted_keys_path, format!("{serialized}\n")).await?;
    Ok(())
}

fn validate_client(client: &TrustedRelayClient) -> Result<(), TrustedKeyAuthError> {
    if client.client_name.trim().is_empty() {
        return Err(TrustedKeyAuthError::BadRequest(
            "Trusted key file contains invalid client name".to_string(),
        ));
    }
    if client.client_browser.trim().is_empty() {
        return Err(TrustedKeyAuthError::BadRequest(
            "Trusted key file contains invalid client browser".to_string(),
        ));
    }
    if client.client_os.trim().is_empty() {
        return Err(TrustedKeyAuthError::BadRequest(
            "Trusted key file contains invalid client OS".to_string(),
        ));
    }
    if client.client_device.trim().is_empty() {
        return Err(TrustedKeyAuthError::BadRequest(
            "Trusted key file contains invalid client device".to_string(),
        ));
    }

    parse_public_key_base64(&client.public_key_b64).map_err(|_| {
        TrustedKeyAuthError::BadRequest("Trusted key file contains invalid keys".to_string())
    })?;
    Ok(())
}

fn decode_base64(input: &str) -> Result<Vec<u8>, TrustedKeyAuthError> {
    BASE64_STANDARD
        .decode(input)
        .map_err(|_| TrustedKeyAuthError::Unauthorized)
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use ed25519_dalek::SigningKey;
    use tokio::fs;
    use uuid::Uuid;

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

    #[tokio::test]
    async fn can_upsert_list_and_remove_trusted_clients() {
        let trusted_keys_path = temp_trusted_keys_path();
        let key_b64 = BASE64_STANDARD.encode(test_public_key().as_bytes());
        let client_id = Uuid::new_v4();

        let inserted = upsert_trusted_client(
            &trusted_keys_path,
            TrustedRelayClient {
                client_id,
                client_name: "Chrome on macOS (Desktop)".to_string(),
                client_browser: "Chrome".to_string(),
                client_os: "macOS".to_string(),
                client_device: "desktop".to_string(),
                public_key_b64: key_b64.clone(),
            },
        )
        .await
        .unwrap();
        assert!(inserted);

        let clients = list_trusted_clients(&trusted_keys_path).await.unwrap();
        assert_eq!(clients.len(), 1);
        assert_eq!(clients[0].client_id, client_id);
        assert_eq!(clients[0].public_key_b64, key_b64);

        let removed = remove_trusted_client(&trusted_keys_path, client_id)
            .await
            .unwrap();
        assert!(removed);
        let clients = list_trusted_clients(&trusted_keys_path).await.unwrap();
        assert!(clients.is_empty());

        let _ = fs::remove_file(&trusted_keys_path).await;
    }

    fn temp_trusted_keys_path() -> PathBuf {
        let mut path = std::env::temp_dir();
        path.push(format!("vk-trusted-keys-{}.json", Uuid::new_v4()));
        path
    }
}
