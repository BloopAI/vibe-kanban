use std::{collections::HashSet, sync::Arc};

use chrono::Utc;
use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, Validation, decode, encode};
use secrecy::{ExposeSecret, SecretString};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

use crate::db::{auth::AuthSession, users::User};

#[derive(Debug, Error)]
pub enum JwtError {
    #[error("invalid token")]
    InvalidToken,
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

    pub fn encode(&self, session: &AuthSession, user: &User) -> Result<String, JwtError> {
        let claims = JwtClaims {
            sub: user.id,
            session_id: session.id,
            nonce: session.session_secret.clone(),
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
}
