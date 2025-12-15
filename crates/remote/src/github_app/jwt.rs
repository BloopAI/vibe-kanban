use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use jsonwebtoken::{Algorithm, EncodingKey, Header, encode};
use secrecy::{ExposeSecret, SecretString};
use serde::Serialize;
use thiserror::Error;

/// JWT generator for GitHub App authentication.
/// GitHub Apps authenticate using RS256-signed JWTs with a 10-minute max TTL.
#[derive(Clone)]
pub struct GitHubAppJwt {
    app_id: u64,
    private_key_pem: SecretString,
}

#[derive(Debug, Error)]
pub enum JwtError {
    #[error("invalid private key: {0}")]
    InvalidPrivateKey(String),
    #[error("failed to encode JWT: {0}")]
    EncodingError(#[from] jsonwebtoken::errors::Error),
    #[error("invalid base64 encoding")]
    Base64Error,
}

#[derive(Debug, Serialize)]
struct GitHubAppClaims {
    /// Issuer - the GitHub App ID
    iss: String,
    /// Issued at (Unix timestamp)
    iat: i64,
    /// Expiration (Unix timestamp) - max 10 minutes from iat
    exp: i64,
}

impl GitHubAppJwt {
    /// Create a new JWT generator from base64-encoded PEM private key
    pub fn new(app_id: u64, private_key_base64: SecretString) -> Result<Self, JwtError> {
        // Decode base64 to get raw PEM
        let pem_bytes = BASE64_STANDARD
            .decode(private_key_base64.expose_secret().as_bytes())
            .map_err(|_| JwtError::Base64Error)?;

        let pem_string = String::from_utf8(pem_bytes)
            .map_err(|_| JwtError::InvalidPrivateKey("PEM is not valid UTF-8".to_string()))?;

        // Validate we can parse this as an RSA key
        EncodingKey::from_rsa_pem(pem_string.as_bytes())
            .map_err(|e| JwtError::InvalidPrivateKey(e.to_string()))?;

        Ok(Self {
            app_id,
            private_key_pem: SecretString::new(pem_string.into()),
        })
    }

    /// Generate a JWT for authenticating as the GitHub App.
    /// This JWT is used to get installation access tokens.
    /// Max TTL is 10 minutes as per GitHub's requirements.
    pub fn generate(&self) -> Result<String, JwtError> {
        let now = chrono::Utc::now().timestamp();
        // Subtract 60 seconds from iat to account for clock drift
        let iat = now - 60;
        // GitHub allows max 10 minutes, we use 9 to be safe
        let exp = now + (9 * 60);

        let claims = GitHubAppClaims {
            iss: self.app_id.to_string(),
            iat,
            exp,
        };

        let header = Header::new(Algorithm::RS256);
        let key = EncodingKey::from_rsa_pem(self.private_key_pem.expose_secret().as_bytes())?;

        encode(&header, &claims, &key).map_err(JwtError::EncodingError)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Test with a dummy key - in real tests you'd use a proper test key
    #[test]
    fn test_invalid_base64_fails() {
        let result = GitHubAppJwt::new(12345, SecretString::new("not-valid-base64!!!".into()));
        assert!(matches!(result, Err(JwtError::Base64Error)));
    }

    #[test]
    fn test_invalid_pem_fails() {
        // Valid base64, but not a valid PEM
        let invalid_pem_b64 = BASE64_STANDARD.encode("not a real pem key");
        let result = GitHubAppJwt::new(12345, SecretString::new(invalid_pem_b64.into()));
        assert!(matches!(result, Err(JwtError::InvalidPrivateKey(_))));
    }
}
