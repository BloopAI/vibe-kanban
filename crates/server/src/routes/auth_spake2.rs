use axum::{
    Router,
    extract::{Json as ExtractJson, State},
    response::{Html, Json as ResponseJson},
    routing::{get, post},
};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use ed25519_dalek::VerifyingKey;
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use spake2::{Ed25519Group, Identity, Password, Spake2, SysRng, UnwrapErr};
use tokio::fs;
use utils::{assets::asset_dir, response::ApiResponse};
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

const TRUSTED_KEYS_FILE_NAME: &str = "trusted_ed25519_public_keys.json";
const PAKE_PASSWORD_ENV: &str = "VK_TRUSTED_KEYS_ENROLL_PASSWORD";
const SPAKE2_CLIENT_ID: &[u8] = b"vibe-kanban-browser";
const SPAKE2_SERVER_ID: &[u8] = b"vibe-kanban-server";
const CLIENT_PROOF_CONTEXT: &[u8] = b"vk-spake2-client-proof-v1";
const SERVER_PROOF_CONTEXT: &[u8] = b"vk-spake2-server-proof-v1";

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Deserialize)]
struct StartSpake2EnrollmentRequest {
    client_message_b64: String,
}

#[derive(Debug, Serialize)]
struct StartSpake2EnrollmentResponse {
    enrollment_id: Uuid,
    server_message_b64: String,
}

#[derive(Debug, Deserialize)]
struct FinishSpake2EnrollmentRequest {
    enrollment_id: Uuid,
    public_key_b64: String,
    client_proof_b64: String,
}

#[derive(Debug, Serialize)]
struct FinishSpake2EnrollmentResponse {
    added: bool,
    server_proof_b64: String,
}

#[derive(Debug, Default, Deserialize, Serialize)]
struct TrustedPublicKeysFile {
    keys: Vec<String>,
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/auth/trusted-keys/spake2/test-page", get(spake2_test_page))
        .route(
            "/auth/trusted-keys/spake2/start",
            post(start_spake2_enrollment),
        )
        .route(
            "/auth/trusted-keys/spake2/finish",
            post(finish_spake2_enrollment),
        )
}

async fn spake2_test_page() -> Html<&'static str> {
    Html(include_str!("auth_spake2_test_page.html"))
}

async fn start_spake2_enrollment(
    State(deployment): State<DeploymentImpl>,
    ExtractJson(payload): ExtractJson<StartSpake2EnrollmentRequest>,
) -> Result<ResponseJson<ApiResponse<StartSpake2EnrollmentResponse>>, ApiError> {
    let password = load_pake_password()?;
    let client_message = decode_base64(&payload.client_message_b64)
        .map_err(|_| ApiError::BadRequest("Invalid client_message_b64".to_string()))?;

    let password = Password::new(password.as_bytes());
    let id_a = Identity::new(SPAKE2_CLIENT_ID);
    let id_b = Identity::new(SPAKE2_SERVER_ID);
    let (server_state, server_message) =
        Spake2::<Ed25519Group>::start_b_with_rng(&password, &id_a, &id_b, UnwrapErr(SysRng));

    let shared_key = server_state.finish(&client_message).map_err(|error| {
        tracing::info!(
            ?error,
            "Rejecting SPAKE2 enrollment start: client SPAKE2 message failed verification"
        );
        ApiError::Unauthorized
    })?;

    let enrollment_id = Uuid::new_v4();
    deployment
        .store_pake_enrollment(enrollment_id, shared_key)
        .await;
    tracing::info!(
        enrollment_id = %enrollment_id,
        "Started SPAKE2 trusted-key enrollment session"
    );

    Ok(ResponseJson(ApiResponse::success(
        StartSpake2EnrollmentResponse {
            enrollment_id,
            server_message_b64: BASE64_STANDARD.encode(server_message),
        },
    )))
}

async fn finish_spake2_enrollment(
    State(deployment): State<DeploymentImpl>,
    ExtractJson(payload): ExtractJson<FinishSpake2EnrollmentRequest>,
) -> Result<ResponseJson<ApiResponse<FinishSpake2EnrollmentResponse>>, ApiError> {
    let Some(shared_key) = deployment
        .take_pake_enrollment(&payload.enrollment_id)
        .await
    else {
        tracing::info!(
            enrollment_id = %payload.enrollment_id,
            "Rejecting SPAKE2 enrollment finish: enrollment session was missing or expired"
        );
        return Err(ApiError::Unauthorized);
    };

    let public_key = parse_public_key_base64(&payload.public_key_b64)
        .map_err(|_| ApiError::BadRequest("Invalid public_key_b64".to_string()))?;
    verify_client_proof(
        &shared_key,
        &payload.enrollment_id,
        &public_key,
        &payload.client_proof_b64,
    )?;

    let canonical_public_key_b64 = BASE64_STANDARD.encode(public_key.as_bytes());
    let added = add_trusted_public_key(&canonical_public_key_b64).await?;
    let server_proof_b64 = build_proof_base64(
        &shared_key,
        SERVER_PROOF_CONTEXT,
        &payload.enrollment_id,
        &public_key,
    )?;

    tracing::info!(
        enrollment_id = %payload.enrollment_id,
        added,
        "Completed SPAKE2 enrollment and processed trusted key"
    );

    Ok(ResponseJson(ApiResponse::success(
        FinishSpake2EnrollmentResponse {
            added,
            server_proof_b64,
        },
    )))
}

fn load_pake_password() -> Result<String, ApiError> {
    let password = std::env::var(PAKE_PASSWORD_ENV).map_err(|_| {
        ApiError::Forbidden(format!(
            "SPAKE2 enrollment is disabled ({} is not set).",
            PAKE_PASSWORD_ENV
        ))
    })?;
    if password.trim().is_empty() {
        return Err(ApiError::Forbidden(format!(
            "SPAKE2 enrollment is disabled ({} is empty).",
            PAKE_PASSWORD_ENV
        )));
    }
    Ok(password)
}

fn decode_base64(input: &str) -> Result<Vec<u8>, ApiError> {
    BASE64_STANDARD
        .decode(input)
        .map_err(|_| ApiError::Unauthorized)
}

fn parse_public_key_base64(raw_public_key: &str) -> Result<VerifyingKey, ApiError> {
    let public_key_bytes = decode_base64(raw_public_key)?;
    let public_key_bytes: [u8; 32] = public_key_bytes
        .try_into()
        .map_err(|_| ApiError::Unauthorized)?;
    VerifyingKey::from_bytes(&public_key_bytes).map_err(|_| ApiError::Unauthorized)
}

fn build_proof_base64(
    shared_key: &[u8],
    context: &[u8],
    enrollment_id: &Uuid,
    public_key: &VerifyingKey,
) -> Result<String, ApiError> {
    let mut mac = HmacSha256::new_from_slice(shared_key).map_err(|_| ApiError::Unauthorized)?;
    mac.update(context);
    mac.update(enrollment_id.as_bytes());
    mac.update(public_key.as_bytes());
    Ok(BASE64_STANDARD.encode(mac.finalize().into_bytes()))
}

fn verify_client_proof(
    shared_key: &[u8],
    enrollment_id: &Uuid,
    public_key: &VerifyingKey,
    provided_proof_b64: &str,
) -> Result<(), ApiError> {
    let provided_proof = decode_base64(provided_proof_b64)?;
    let mut mac = HmacSha256::new_from_slice(shared_key).map_err(|_| ApiError::Unauthorized)?;
    mac.update(CLIENT_PROOF_CONTEXT);
    mac.update(enrollment_id.as_bytes());
    mac.update(public_key.as_bytes());
    mac.verify_slice(&provided_proof).map_err(|_| {
        tracing::info!(
            enrollment_id = %enrollment_id,
            "Rejecting SPAKE2 enrollment finish: invalid client proof"
        );
        ApiError::Unauthorized
    })
}

async fn add_trusted_public_key(public_key_b64: &str) -> Result<bool, ApiError> {
    let trusted_keys_path = asset_dir().join(TRUSTED_KEYS_FILE_NAME);
    let mut trusted_keys_file = read_trusted_keys_file(&trusted_keys_path).await?;

    if trusted_keys_file
        .keys
        .iter()
        .any(|key| key == public_key_b64)
    {
        return Ok(false);
    }

    trusted_keys_file.keys.push(public_key_b64.to_string());
    let serialized = serde_json::to_string_pretty(&trusted_keys_file).map_err(|error| {
        ApiError::BadRequest(format!("Failed to serialize trusted keys: {error}"))
    })?;
    fs::write(&trusted_keys_path, format!("{serialized}\n"))
        .await
        .map_err(ApiError::Io)?;

    Ok(true)
}

async fn read_trusted_keys_file(
    trusted_keys_path: &std::path::Path,
) -> Result<TrustedPublicKeysFile, ApiError> {
    if !trusted_keys_path.exists() {
        return Ok(TrustedPublicKeysFile::default());
    }

    let file_contents = fs::read_to_string(trusted_keys_path)
        .await
        .map_err(ApiError::Io)?;
    if file_contents.trim().is_empty() {
        return Ok(TrustedPublicKeysFile::default());
    }

    let trusted_keys_file: TrustedPublicKeysFile =
        serde_json::from_str(&file_contents).map_err(|error| {
            ApiError::BadRequest(format!("Trusted key file is invalid JSON: {error}"))
        })?;

    for key in &trusted_keys_file.keys {
        parse_public_key_base64(key).map_err(|_| {
            ApiError::BadRequest("Trusted key file contains invalid keys".to_string())
        })?;
    }

    Ok(trusted_keys_file)
}

#[cfg(test)]
mod tests {
    use ed25519_dalek::SigningKey;

    use super::*;

    fn test_public_key() -> VerifyingKey {
        SigningKey::from_bytes(&[7; 32]).verifying_key()
    }

    #[test]
    fn build_and_verify_client_proof_roundtrip() {
        let public_key = test_public_key();
        let enrollment_id = Uuid::new_v4();
        let shared_key = [9_u8; 32];
        let client_proof_b64 = build_proof_base64(
            &shared_key,
            CLIENT_PROOF_CONTEXT,
            &enrollment_id,
            &public_key,
        )
        .unwrap();

        verify_client_proof(&shared_key, &enrollment_id, &public_key, &client_proof_b64).unwrap();
    }

    #[test]
    fn reject_invalid_client_proof() {
        let public_key = test_public_key();
        let enrollment_id = Uuid::new_v4();
        let shared_key = [11_u8; 32];
        let bad_proof_b64 = BASE64_STANDARD.encode([0_u8; 32]);

        assert!(
            verify_client_proof(&shared_key, &enrollment_id, &public_key, &bad_proof_b64).is_err()
        );
    }

    #[test]
    fn parse_public_key_base64_accepts_valid_key() {
        let public_key = test_public_key();
        let key_b64 = BASE64_STANDARD.encode(public_key.as_bytes());

        let parsed = parse_public_key_base64(&key_b64).unwrap();
        assert_eq!(parsed.as_bytes(), public_key.as_bytes());
    }
}
