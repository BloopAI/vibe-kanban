use hmac::{Hmac, Mac};
use sha2::Sha256;
use subtle::ConstantTimeEq;

type HmacSha256 = Hmac<Sha256>;

/// Verify a Linear webhook signature.
/// Linear sends HMAC-SHA256(secret, body) as a plain hex string in the `linear-signature` header
/// (no `sha256=` prefix unlike GitHub's format).
pub fn verify_signature(secret: &[u8], signature_hex: &str, payload: &[u8]) -> bool {
    let Ok(expected) = hex::decode(signature_hex) else {
        return false;
    };
    let Ok(mut mac) = HmacSha256::new_from_slice(secret) else {
        return false;
    };
    mac.update(payload);
    let computed = mac.finalize().into_bytes();
    computed[..].ct_eq(&expected).into()
}

#[cfg(test)]
mod tests {
    use hmac::{Hmac, Mac};
    use sha2::Sha256;

    use super::*;

    fn sign(secret: &[u8], payload: &[u8]) -> String {
        let mut mac = Hmac::<Sha256>::new_from_slice(secret).unwrap();
        mac.update(payload);
        hex::encode(mac.finalize().into_bytes())
    }

    #[test]
    fn valid_signature() {
        let secret = b"mysecret";
        let payload = b"hello world";
        let sig = sign(secret, payload);
        assert!(verify_signature(secret, &sig, payload));
    }

    #[test]
    fn wrong_secret_fails() {
        let payload = b"hello";
        let sig = sign(b"secret", payload);
        assert!(!verify_signature(b"wrong", &sig, payload));
    }

    #[test]
    fn tampered_payload_fails() {
        let secret = b"secret";
        let sig = sign(secret, b"original");
        assert!(!verify_signature(secret, &sig, b"tampered"));
    }

    #[test]
    fn invalid_hex_fails() {
        assert!(!verify_signature(b"secret", "not-hex!!", b"body"));
    }
}
