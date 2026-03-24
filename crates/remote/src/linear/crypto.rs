use aes_gcm::{
    Aes256Gcm, KeyInit,
    aead::{Aead, OsRng, rand_core::RngCore},
};
use base64::{Engine, engine::general_purpose::STANDARD as BASE64};

#[derive(Debug, thiserror::Error)]
pub enum CryptoError {
    #[error("invalid key length")]
    InvalidKey,
    #[error("encryption failed")]
    Encrypt,
    #[error("decryption failed")]
    Decrypt,
    #[error("invalid base64")]
    Base64(#[from] base64::DecodeError),
}

/// Encrypt plaintext with AES-256-GCM. Returns base64(nonce || ciphertext).
pub fn encrypt(key_hex: &str, plaintext: &str) -> Result<String, CryptoError> {
    let key_bytes = hex::decode(key_hex).map_err(|_| CryptoError::InvalidKey)?;
    let cipher = Aes256Gcm::new_from_slice(&key_bytes).map_err(|_| CryptoError::InvalidKey)?;
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = aes_gcm::Nonce::from(nonce_bytes);
    let ciphertext = cipher
        .encrypt(&nonce, plaintext.as_bytes())
        .map_err(|_| CryptoError::Encrypt)?;
    let mut combined = nonce_bytes.to_vec();
    combined.extend_from_slice(&ciphertext);
    Ok(BASE64.encode(combined))
}

/// Decrypt base64(nonce || ciphertext) with AES-256-GCM.
pub fn decrypt(key_hex: &str, encoded: &str) -> Result<String, CryptoError> {
    let key_bytes = hex::decode(key_hex).map_err(|_| CryptoError::InvalidKey)?;
    let cipher = Aes256Gcm::new_from_slice(&key_bytes).map_err(|_| CryptoError::InvalidKey)?;
    let combined = BASE64.decode(encoded)?;
    if combined.len() < 12 {
        return Err(CryptoError::Decrypt);
    }
    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let nonce_arr: [u8; 12] = nonce_bytes.try_into().map_err(|_| CryptoError::Decrypt)?;
    let nonce = aes_gcm::Nonce::from(nonce_arr);
    let plaintext = cipher
        .decrypt(&nonce, ciphertext)
        .map_err(|_| CryptoError::Decrypt)?;
    String::from_utf8(plaintext).map_err(|_| CryptoError::Decrypt)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_key() -> String {
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef".to_string()
    }

    #[test]
    fn roundtrip() {
        let key = test_key();
        let plaintext = "lnk_supersecretapikey";
        let encrypted = encrypt(&key, plaintext).unwrap();
        let decrypted = decrypt(&key, &encrypted).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn different_ciphertexts_same_plaintext() {
        let key = test_key();
        let a = encrypt(&key, "test").unwrap();
        let b = encrypt(&key, "test").unwrap();
        assert_ne!(a, b);
    }

    #[test]
    fn wrong_key_fails() {
        let key = test_key();
        let encrypted = encrypt(&key, "secret").unwrap();
        let wrong_key = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
        assert!(decrypt(wrong_key, &encrypted).is_err());
    }
}
