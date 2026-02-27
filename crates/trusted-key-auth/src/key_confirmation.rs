use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use hkdf::Hkdf;
use hmac::{Hmac, Mac};
use sha2::Sha256;
use uuid::Uuid;

use crate::error::TrustedKeyAuthError;

const KEY_CONFIRMATION_INFO: &[u8] = b"key-confirmation";
const CLIENT_PROOF_CONTEXT: &[u8] = b"vk-spake2-client-proof-v2";
const SERVER_PROOF_CONTEXT: &[u8] = b"vk-spake2-server-proof-v2";

type HmacSha256 = Hmac<Sha256>;

fn derive_confirmation_key(shared_key: &[u8]) -> [u8; 32] {
    let hk = Hkdf::<Sha256>::new(None, shared_key);
    let mut output = [0u8; 32];
    hk.expand(KEY_CONFIRMATION_INFO, &mut output)
        .expect("32 bytes is valid for HKDF-SHA256");
    output
}

/// Verify the client's proof binding the browser's public key.
/// Client proof = HMAC(confirmation_key, CLIENT_CONTEXT || enrollment_id || browser_pk)
pub fn verify_client_proof(
    shared_key: &[u8],
    enrollment_id: &Uuid,
    browser_pk_bytes: &[u8],
    provided_proof_b64: &str,
) -> Result<(), TrustedKeyAuthError> {
    let provided_proof = BASE64_STANDARD
        .decode(provided_proof_b64)
        .map_err(|_| TrustedKeyAuthError::Unauthorized)?;
    let confirmation_key = derive_confirmation_key(shared_key);
    let mut mac = HmacSha256::new_from_slice(&confirmation_key)
        .map_err(|_| TrustedKeyAuthError::Unauthorized)?;
    mac.update(CLIENT_PROOF_CONTEXT);
    mac.update(enrollment_id.as_bytes());
    mac.update(browser_pk_bytes);
    mac.verify_slice(&provided_proof)
        .map_err(|_| TrustedKeyAuthError::Unauthorized)
}

/// Build the server's proof binding both keys.
/// Server proof = HMAC(confirmation_key, SERVER_CONTEXT || enrollment_id || browser_pk || server_pk)
pub fn build_server_proof(
    shared_key: &[u8],
    enrollment_id: &Uuid,
    browser_pk_bytes: &[u8],
    server_pk_bytes: &[u8],
) -> Result<String, TrustedKeyAuthError> {
    let confirmation_key = derive_confirmation_key(shared_key);
    let mut mac = HmacSha256::new_from_slice(&confirmation_key)
        .map_err(|_| TrustedKeyAuthError::Unauthorized)?;
    mac.update(SERVER_PROOF_CONTEXT);
    mac.update(enrollment_id.as_bytes());
    mac.update(browser_pk_bytes);
    mac.update(server_pk_bytes);
    Ok(BASE64_STANDARD.encode(mac.finalize().into_bytes()))
}

#[cfg(test)]
fn build_client_proof_base64(
    shared_key: &[u8],
    enrollment_id: &Uuid,
    browser_pk_bytes: &[u8],
) -> Result<String, TrustedKeyAuthError> {
    let confirmation_key = derive_confirmation_key(shared_key);
    let mut mac = HmacSha256::new_from_slice(&confirmation_key)
        .map_err(|_| TrustedKeyAuthError::Unauthorized)?;
    mac.update(CLIENT_PROOF_CONTEXT);
    mac.update(enrollment_id.as_bytes());
    mac.update(browser_pk_bytes);
    Ok(BASE64_STANDARD.encode(mac.finalize().into_bytes()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_client_proof() {
        let shared_key = [9u8; 32];
        let enrollment_id = Uuid::new_v4();
        let browser_pk = [1u8; 32];

        let proof_b64 =
            build_client_proof_base64(&shared_key, &enrollment_id, &browser_pk).unwrap();

        verify_client_proof(&shared_key, &enrollment_id, &browser_pk, &proof_b64).unwrap();
    }

    #[test]
    fn reject_invalid_client_proof() {
        let shared_key = [9u8; 32];
        let enrollment_id = Uuid::new_v4();
        let browser_pk = [1u8; 32];
        let bad_proof_b64 = BASE64_STANDARD.encode([0u8; 32]);

        assert!(
            verify_client_proof(&shared_key, &enrollment_id, &browser_pk, &bad_proof_b64).is_err()
        );
    }

    #[test]
    fn server_proof_binds_both_keys() {
        let shared_key = [11u8; 32];
        let enrollment_id = Uuid::new_v4();
        let browser_pk = [3u8; 32];
        let server_pk = [4u8; 32];

        let proof_b64 =
            build_server_proof(&shared_key, &enrollment_id, &browser_pk, &server_pk).unwrap();

        // Re-compute expected proof
        let confirmation_key = derive_confirmation_key(&shared_key);
        let mut mac = HmacSha256::new_from_slice(&confirmation_key).unwrap();
        mac.update(SERVER_PROOF_CONTEXT);
        mac.update(enrollment_id.as_bytes());
        mac.update(&browser_pk);
        mac.update(&server_pk);
        let expected = BASE64_STANDARD.encode(mac.finalize().into_bytes());

        assert_eq!(proof_b64, expected);
    }

    #[test]
    fn different_keys_produce_different_proofs() {
        let enrollment_id = Uuid::new_v4();
        let browser_pk = [1u8; 32];
        let server_pk = [2u8; 32];

        let proof_a =
            build_server_proof(&[5u8; 32], &enrollment_id, &browser_pk, &server_pk).unwrap();
        let proof_b =
            build_server_proof(&[6u8; 32], &enrollment_id, &browser_pk, &server_pk).unwrap();

        assert_ne!(proof_a, proof_b);
    }
}
