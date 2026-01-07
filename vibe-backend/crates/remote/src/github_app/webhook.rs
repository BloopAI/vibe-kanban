use hmac::{Hmac, Mac};
use sha2::Sha256;
use subtle::ConstantTimeEq;

type HmacSha256 = Hmac<Sha256>;

/// Verify a GitHub webhook signature.
///
/// GitHub sends the HMAC-SHA256 signature in the `X-Hub-Signature-256` header
/// in the format `sha256=<hex-signature>`.
///
/// Returns true if the signature is valid.
pub fn verify_webhook_signature(secret: &[u8], signature_header: &str, payload: &[u8]) -> bool {
    // Extract the hex signature from the header
    let Some(hex_signature) = signature_header.strip_prefix("sha256=") else {
        return false;
    };

    // Decode the hex signature
    let Ok(expected_signature) = hex::decode(hex_signature) else {
        return false;
    };

    // Compute HMAC-SHA256
    let Ok(mut mac) = HmacSha256::new_from_slice(secret) else {
        return false;
    };
    mac.update(payload);
    let computed_signature = mac.finalize().into_bytes();

    // Constant-time comparison to prevent timing attacks
    computed_signature[..].ct_eq(&expected_signature).into()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_signature() {
        let secret = b"test-secret";
        let payload = b"test payload";

        // Compute expected signature
        let mut mac = HmacSha256::new_from_slice(secret).unwrap();
        mac.update(payload);
        let signature = mac.finalize().into_bytes();
        let signature_header = format!("sha256={}", hex::encode(signature));

        assert!(verify_webhook_signature(secret, &signature_header, payload));
    }

    #[test]
    fn test_invalid_signature() {
        let secret = b"test-secret";
        let payload = b"test payload";
        let wrong_signature =
            "sha256=0000000000000000000000000000000000000000000000000000000000000000";

        assert!(!verify_webhook_signature(secret, wrong_signature, payload));
    }

    #[test]
    fn test_missing_prefix() {
        let secret = b"test-secret";
        let payload = b"test payload";
        let no_prefix = "0000000000000000000000000000000000000000000000000000000000000000";

        assert!(!verify_webhook_signature(secret, no_prefix, payload));
    }

    #[test]
    fn test_invalid_hex() {
        let secret = b"test-secret";
        let payload = b"test payload";
        let invalid_hex = "sha256=not-valid-hex";

        assert!(!verify_webhook_signature(secret, invalid_hex, payload));
    }
}
