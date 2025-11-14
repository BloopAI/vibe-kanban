use std::{collections::HashSet, sync::Arc};

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use chrono::Utc;
use hmac::{Hmac, Mac};
use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, Validation, decode, encode};
use secrecy::{ExposeSecret, SecretString};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use subtle::ConstantTimeEq;
use thiserror::Error;
use uuid::Uuid;

use crate::db::{auth::AuthSession, users::User};

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Error)]
pub enum JwtError {
    #[error("invalid token")]
    InvalidToken,
    #[error("invalid jwt secret")]
    InvalidSecret,
    #[error(transparent)]
    Jwt(#[from] jsonwebtoken::errors::Error),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JwtClaims {
    pub sub: Uuid,
    pub session_id: Uuid,
    pub nonce: String,
    pub iat: i64,
}

#[derive(Debug, Clone)]
pub struct JwtIdentity {
    pub user_id: Uuid,
    pub session_id: Uuid,
    pub nonce: String,
}

#[derive(Clone)]
pub struct JwtService {
    secret: Arc<SecretString>,
}

impl JwtService {
    pub fn new(secret: SecretString) -> Self {
        Self {
            secret: Arc::new(secret),
        }
    }

    pub fn encode(
        &self,
        session: &AuthSession,
        user: &User,
        session_secret: &str,
    ) -> Result<String, JwtError> {
        let claims = JwtClaims {
            sub: user.id,
            session_id: session.id,
            nonce: session_secret.to_string(),
            iat: Utc::now().timestamp(),
        };

        let encoding_key = EncodingKey::from_base64_secret(self.secret.expose_secret())?;
        let token = encode(&Header::new(Algorithm::HS256), &claims, &encoding_key)?;

        Ok(token)
    }

    pub fn decode(&self, token: &str) -> Result<JwtIdentity, JwtError> {
        if token.trim().is_empty() {
            return Err(JwtError::InvalidToken);
        }

        let mut validation = Validation::new(Algorithm::HS256);
        validation.validate_exp = false;
        validation.validate_nbf = false;
        validation.required_spec_claims = HashSet::from(["sub".to_string()]);

        let decoding_key = DecodingKey::from_base64_secret(self.secret.expose_secret())?;
        let data = decode::<JwtClaims>(token, &decoding_key, &validation)?;

        let claims = data.claims;
        Ok(JwtIdentity {
            user_id: claims.sub,
            session_id: claims.session_id,
            nonce: claims.nonce,
        })
    }

    fn secret_key_bytes(&self) -> Result<Vec<u8>, JwtError> {
        let raw = self.secret.expose_secret();
        BASE64_STANDARD
            .decode(raw.as_bytes())
            .map_err(|_| JwtError::InvalidSecret)
    }

    pub fn hash_session_secret(&self, session_secret: &str) -> Result<String, JwtError> {
        let key = self.secret_key_bytes()?;
        let mut mac = HmacSha256::new_from_slice(&key).map_err(|_| JwtError::InvalidSecret)?;
        mac.update(session_secret.as_bytes());
        let digest = mac.finalize().into_bytes();
        Ok(BASE64_STANDARD.encode(digest))
    }

    pub fn verify_session_secret(
        &self,
        stored_hash: Option<&str>,
        candidate_secret: &str,
    ) -> Result<bool, JwtError> {
        let stored = match stored_hash {
            Some(value) => value,
            None => return Ok(false),
        };
        let candidate_hash = self.hash_session_secret(candidate_secret)?;
        Ok(stored.as_bytes().ct_eq(candidate_hash.as_bytes()).into())
    }
}
