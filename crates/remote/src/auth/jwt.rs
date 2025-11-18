use std::{collections::HashSet, sync::Arc};

use chrono::{DateTime, Duration as ChronoDuration, Utc};
use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, Validation, decode, encode};
use secrecy::{ExposeSecret, SecretString};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

use crate::db::{auth::AuthSession, users::User};

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
}

#[derive(Clone)]
pub struct JwtService {
    secret: Arc<SecretString>,
}

#[derive(Debug, Clone)]
pub struct TokenPair {
    pub access_token: String,
    pub refresh_token: String,
    pub refresh_token_id: Uuid,
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
    ) -> Result<TokenPair, JwtError> {
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

        // Refresh token, long-lived (~1 year)
        let refresh_exp = now + ChronoDuration::days(REFRESH_TOKEN_TTL_DAYS);
        let refresh_claims = RefreshTokenClaims {
            sub: user.id,
            session_id: session.id,
            jti: refresh_token_id,
            iat: now.timestamp(),
            exp: refresh_exp.timestamp(),
            aud: "refresh".to_string(),
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

        Ok(TokenPair {
            access_token,
            refresh_token,
            refresh_token_id,
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

        Ok(RefreshTokenDetails {
            user_id: claims.sub,
            session_id: claims.session_id,
            refresh_token_id: claims.jti,
        })
    }
}
