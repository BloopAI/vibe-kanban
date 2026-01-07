use std::{collections::HashSet, sync::Arc};

use aes_gcm::{
    Aes256Gcm, Key, Nonce,
    aead::{Aead, AeadCore, KeyInit, OsRng},
};
use base64::{
    Engine as _,
    engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD},
};
use chrono::{DateTime, Duration as ChronoDuration, Utc};
use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, Validation, decode, encode};
use secrecy::{ExposeSecret, SecretString};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;
use uuid::Uuid;

use crate::{
    auth::provider::ProviderTokenDetails,
    db::{auth::AuthSession, users::User},
};

pub const ACCESS_TOKEN_TTL_SECONDS: i64 = 120;
pub const REFRESH_TOKEN_TTL_DAYS: i64 = 365;
const DEFAULT_JWT_LEEWAY_SECONDS: u64 = 60;

#[derive(Debug, Error)]
pub enum JwtError {
    #[error("invalid token")]
    InvalidToken,
    #[error("invalid jwt secret")]
    InvalidSecret,
    #[error("token expired")]
    TokenExpired,
    #[error("refresh token reused - possible theft detected")]
    TokenReuseDetected,
    #[error("session revoked")]
    SessionRevoked,
    #[error("token type mismatch")]
    InvalidTokenType,
    #[error("encryption error")]
    EncryptionError,
    #[error("serialization error")]
    SerializationError,
    #[error(transparent)]
    Jwt(#[from] jsonwebtoken::errors::Error),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccessTokenClaims {
    pub sub: Uuid,
    pub session_id: Uuid,
    pub iat: i64,
    pub exp: i64,
    pub aud: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RefreshTokenClaims {
    pub sub: Uuid,
    pub session_id: Uuid,
    pub jti: Uuid,
    pub iat: i64,
    pub exp: i64,
    pub aud: String,
    pub provider_tokens_blob: String, // Encrypted JSON blob containing provider tokens
}

#[derive(Debug, Clone)]
pub struct AccessTokenDetails {
    pub user_id: Uuid,
    pub session_id: Uuid,
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct RefreshTokenDetails {
    pub user_id: Uuid,
    pub session_id: Uuid,
    pub refresh_token_id: Uuid,
    pub provider_token_details: ProviderTokenDetails,
}

#[derive(Clone)]
pub struct JwtService {
    pub secret: Arc<SecretString>,
}

#[derive(Debug, Clone)]
pub struct Tokens {
    pub access_token: String,
    pub refresh_token: String,
    pub refresh_token_id: Uuid,
    pub encrypted_provider_tokens: String,
}

impl JwtService {
    pub fn new(secret: SecretString) -> Self {
        Self {
            secret: Arc::new(secret),
        }
    }

    pub fn generate_tokens(
        &self,
        session: &AuthSession,
        user: &User,
        provider_token: ProviderTokenDetails,
    ) -> Result<Tokens, JwtError> {
        let now = Utc::now();
        let refresh_token_id = Uuid::new_v4();

        // Access token, short-lived (~2 minutes)
        let access_exp = now + ChronoDuration::seconds(ACCESS_TOKEN_TTL_SECONDS);
        let access_claims = AccessTokenClaims {
            sub: user.id,
            session_id: session.id,
            iat: now.timestamp(),
            exp: access_exp.timestamp(),
            aud: "access".to_string(),
        };

        let encrypted_provider_tokens = self.encrypt_provider_tokens(&provider_token)?;

        // Refresh token, long-lived (~1 year)
        let refresh_exp = now + ChronoDuration::days(REFRESH_TOKEN_TTL_DAYS);
        let refresh_claims = RefreshTokenClaims {
            sub: user.id,
            session_id: session.id,
            jti: refresh_token_id,
            iat: now.timestamp(),
            exp: refresh_exp.timestamp(),
            aud: "refresh".to_string(),
            provider_tokens_blob: encrypted_provider_tokens.clone(),
        };

        let encoding_key = EncodingKey::from_base64_secret(self.secret.expose_secret())?;

        let access_token = encode(
            &Header::new(Algorithm::HS256),
            &access_claims,
            &encoding_key,
        )?;

        let refresh_token = encode(
            &Header::new(Algorithm::HS256),
            &refresh_claims,
            &encoding_key,
        )?;

        Ok(Tokens {
            access_token,
            refresh_token,
            refresh_token_id,
            encrypted_provider_tokens,
        })
    }

    pub fn decode_access_token(&self, token: &str) -> Result<AccessTokenDetails, JwtError> {
        self.decode_access_token_with_leeway(token, DEFAULT_JWT_LEEWAY_SECONDS)
    }

    pub fn decode_access_token_with_leeway(
        &self,
        token: &str,
        leeway_seconds: u64,
    ) -> Result<AccessTokenDetails, JwtError> {
        if token.trim().is_empty() {
            return Err(JwtError::InvalidToken);
        }

        let mut validation = Validation::new(Algorithm::HS256);
        validation.validate_exp = true;
        validation.validate_nbf = false;
        validation.set_audience(&["access"]);
        validation.required_spec_claims =
            HashSet::from(["sub".to_string(), "exp".to_string(), "aud".to_string()]);
        validation.leeway = leeway_seconds;

        let decoding_key = DecodingKey::from_base64_secret(self.secret.expose_secret())?;
        let data = decode::<AccessTokenClaims>(token, &decoding_key, &validation)?;
        let claims = data.claims;
        let expires_at = DateTime::from_timestamp(claims.exp, 0).ok_or(JwtError::InvalidToken)?;

        Ok(AccessTokenDetails {
            user_id: claims.sub,
            session_id: claims.session_id,
            expires_at,
        })
    }

    pub fn decode_refresh_token(&self, token: &str) -> Result<RefreshTokenDetails, JwtError> {
        if token.trim().is_empty() {
            return Err(JwtError::InvalidToken);
        }

        let mut validation = Validation::new(Algorithm::HS256);
        validation.validate_exp = true;
        validation.validate_nbf = false;
        validation.set_audience(&["refresh"]);
        validation.required_spec_claims = HashSet::from([
            "sub".to_string(),
            "exp".to_string(),
            "aud".to_string(),
            "jti".to_string(),
        ]);
        validation.leeway = DEFAULT_JWT_LEEWAY_SECONDS;

        let decoding_key = DecodingKey::from_base64_secret(self.secret.expose_secret())?;
        let data = decode::<RefreshTokenClaims>(token, &decoding_key, &validation)?;
        let claims = data.claims;
        let provider_token_details = self.decrypt_provider_tokens(&claims.provider_tokens_blob)?;

        Ok(RefreshTokenDetails {
            user_id: claims.sub,
            session_id: claims.session_id,
            refresh_token_id: claims.jti,
            provider_token_details,
        })
    }

    pub fn decrypt_provider_tokens(
        &self,
        provider_tokens_blob: &str,
    ) -> Result<ProviderTokenDetails, JwtError> {
        let decrypted = self.decrypt_data(provider_tokens_blob)?;
        let decrypted_str = String::from_utf8_lossy(&decrypted);
        serde_json::from_str(&decrypted_str).map_err(|_| JwtError::InvalidToken)
    }

    pub fn encrypt_provider_tokens(
        &self,
        provider_tokens: &ProviderTokenDetails,
    ) -> Result<String, JwtError> {
        let json =
            serde_json::to_string(provider_tokens).map_err(|_| JwtError::SerializationError)?;
        self.encrypt_data(json.as_bytes())
    }

    fn encrypt_data(&self, data: &[u8]) -> Result<String, JwtError> {
        let key_bytes = self.derive_key()?;
        let key = Key::<Aes256Gcm>::from(key_bytes);
        let cipher = Aes256Gcm::new(&key);
        let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
        let ciphertext = cipher
            .encrypt(&nonce, data)
            .map_err(|_| JwtError::EncryptionError)?;

        let mut combined = nonce.to_vec();
        combined.extend_from_slice(&ciphertext);

        Ok(URL_SAFE_NO_PAD.encode(combined))
    }

    fn decrypt_data(&self, encrypted: &str) -> Result<Vec<u8>, JwtError> {
        let decoded = URL_SAFE_NO_PAD
            .decode(encrypted)
            .map_err(|_| JwtError::InvalidToken)?;

        const NONCE_SIZE: usize = 12; // 96 bits for AES-256-GCM
        if decoded.len() < NONCE_SIZE {
            return Err(JwtError::InvalidToken);
        }

        let key_bytes = self.derive_key()?;
        let key = Key::<Aes256Gcm>::from(key_bytes);
        let cipher = Aes256Gcm::new(&key);
        let nonce_bytes: [u8; NONCE_SIZE] = decoded[..NONCE_SIZE]
            .try_into()
            .map_err(|_| JwtError::InvalidToken)?;
        let nonce = Nonce::from(nonce_bytes);
        let ciphertext = &decoded[NONCE_SIZE..];

        cipher
            .decrypt(&nonce, ciphertext)
            .map_err(|_| JwtError::EncryptionError)
    }

    fn derive_key(&self) -> Result<[u8; 32], JwtError> {
        let secret_bytes = STANDARD
            .decode(self.secret.expose_secret())
            .map_err(|_| JwtError::InvalidSecret)?;

        let mut hasher = Sha256::new();
        hasher.update(&secret_bytes);
        Ok(hasher.finalize().into())
    }
}
