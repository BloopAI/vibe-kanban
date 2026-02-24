use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use ed25519_dalek::VerifyingKey;
use hmac::{Hmac, Mac};
use rand::Rng;
use sha2::Sha256;
use spake2::{Ed25519Group, Identity, Password, Spake2, SysRng, UnwrapErr};
use uuid::Uuid;

use crate::TrustedKeyAuthError;

const SPAKE2_CLIENT_ID: &[u8] = b"vibe-kanban-browser";
const SPAKE2_SERVER_ID: &[u8] = b"vibe-kanban-server";
const CLIENT_PROOF_CONTEXT: &[u8] = b"vk-spake2-client-proof-v1";
const SERVER_PROOF_CONTEXT: &[u8] = b"vk-spake2-server-proof-v1";
pub const ENROLLMENT_CODE_LENGTH: usize = 6;
const ENROLLMENT_CODE_CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug)]
pub struct Spake2StartOutcome {
    pub enrollment_code: String,
    pub shared_key: Vec<u8>,
    pub server_message_b64: String,
}

pub fn start_spake2_enrollment(
    raw_enrollment_code: &str,
    client_message_b64: &str,
) -> Result<Spake2StartOutcome, TrustedKeyAuthError> {
    let enrollment_code = normalize_enrollment_code(raw_enrollment_code)?;
    let client_message = decode_base64(client_message_b64)
        .map_err(|_| TrustedKeyAuthError::BadRequest("Invalid client_message_b64".to_string()))?;

    let password = Password::new(enrollment_code.as_bytes());
    let id_a = Identity::new(SPAKE2_CLIENT_ID);
    let id_b = Identity::new(SPAKE2_SERVER_ID);
    let (server_state, server_message) =
        Spake2::<Ed25519Group>::start_b_with_rng(&password, &id_a, &id_b, UnwrapErr(SysRng));

    let shared_key = server_state
        .finish(&client_message)
        .map_err(|_| TrustedKeyAuthError::Unauthorized)?;

    Ok(Spake2StartOutcome {
        enrollment_code,
        shared_key,
        server_message_b64: BASE64_STANDARD.encode(server_message),
    })
}

pub fn generate_one_time_code() -> String {
    let mut rng = rand::thread_rng();
    let mut code = String::with_capacity(ENROLLMENT_CODE_LENGTH);
    for _ in 0..ENROLLMENT_CODE_LENGTH {
        let idx = rng.gen_range(0..ENROLLMENT_CODE_CHARSET.len());
        code.push(ENROLLMENT_CODE_CHARSET[idx] as char);
    }
    code
}

pub fn normalize_enrollment_code(raw_code: &str) -> Result<String, TrustedKeyAuthError> {
    let code = raw_code.trim().to_ascii_uppercase();
    if code.len() != ENROLLMENT_CODE_LENGTH {
        return Err(TrustedKeyAuthError::BadRequest(format!(
            "Invalid enrollment code length. Expected {ENROLLMENT_CODE_LENGTH} characters."
        )));
    }

    if !code
        .bytes()
        .all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit())
    {
        return Err(TrustedKeyAuthError::BadRequest(
            "Enrollment code must contain only A-Z and 0-9.".to_string(),
        ));
    }

    Ok(code)
}

pub fn verify_client_proof(
    shared_key: &[u8],
    enrollment_id: &Uuid,
    public_key: &VerifyingKey,
    provided_proof_b64: &str,
) -> Result<(), TrustedKeyAuthError> {
    let provided_proof = decode_base64(provided_proof_b64)?;
    let mut mac =
        HmacSha256::new_from_slice(shared_key).map_err(|_| TrustedKeyAuthError::Unauthorized)?;
    mac.update(CLIENT_PROOF_CONTEXT);
    mac.update(enrollment_id.as_bytes());
    mac.update(public_key.as_bytes());
    mac.verify_slice(&provided_proof)
        .map_err(|_| TrustedKeyAuthError::Unauthorized)
}

pub fn build_server_proof_base64(
    shared_key: &[u8],
    enrollment_id: &Uuid,
    public_key: &VerifyingKey,
) -> Result<String, TrustedKeyAuthError> {
    build_proof_base64(shared_key, SERVER_PROOF_CONTEXT, enrollment_id, public_key)
}

#[cfg(test)]
fn build_client_proof_base64(
    shared_key: &[u8],
    enrollment_id: &Uuid,
    public_key: &VerifyingKey,
) -> Result<String, TrustedKeyAuthError> {
    build_proof_base64(shared_key, CLIENT_PROOF_CONTEXT, enrollment_id, public_key)
}

fn build_proof_base64(
    shared_key: &[u8],
    context: &[u8],
    enrollment_id: &Uuid,
    public_key: &VerifyingKey,
) -> Result<String, TrustedKeyAuthError> {
    let mut mac =
        HmacSha256::new_from_slice(shared_key).map_err(|_| TrustedKeyAuthError::Unauthorized)?;
    mac.update(context);
    mac.update(enrollment_id.as_bytes());
    mac.update(public_key.as_bytes());
    Ok(BASE64_STANDARD.encode(mac.finalize().into_bytes()))
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
    fn build_and_verify_client_proof_roundtrip() {
        let public_key = test_public_key();
        let enrollment_id = Uuid::new_v4();
        let shared_key = [9_u8; 32];
        let client_proof_b64 =
            build_client_proof_base64(&shared_key, &enrollment_id, &public_key).unwrap();

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
    fn normalize_enrollment_code_accepts_valid_input() {
        let normalized = normalize_enrollment_code("ab12z9").unwrap();
        assert_eq!(normalized, "AB12Z9");
    }

    #[test]
    fn normalize_enrollment_code_rejects_invalid_characters() {
        assert!(normalize_enrollment_code("AB!2Z9").is_err());
    }

    #[test]
    fn generate_one_time_code_uses_expected_charset_and_length() {
        let code = generate_one_time_code();
        assert_eq!(code.len(), ENROLLMENT_CODE_LENGTH);
        assert!(
            code.bytes()
                .all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit())
        );
    }
}
