use chrono::{Duration, Utc};
use db::models::{auth_session::AuthSession, user::User};
use jsonwebtoken::{DecodingKey, EncodingKey, Header, Validation, decode, encode};
use rand::{Rng, distributions::Alphanumeric};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::SqlitePool;
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum SessionError {
    #[error("Missing session secret configuration")]
    MissingSecret,
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("Token encoding failed: {0}")]
    TokenEncode(#[from] jsonwebtoken::errors::Error),
    #[error("Token validation failed")]
    InvalidToken,
    #[error("Session expired")]
    SessionExpired,
    #[error("Session revoked")]
    SessionRevoked,
    #[error("User not found")]
    UserNotFound,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SessionClaims {
    /// Subject (user ID)
    pub sub: String,
    /// Session ID
    pub sid: String,
    /// Issued at
    pub iat: i64,
    /// Expiration
    pub exp: i64,
}

#[derive(Clone)]
pub struct LocalSessionService {
    secret: String,
    /// Session duration in days
    session_duration_days: i64,
}

impl LocalSessionService {
    /// Create from environment variables
    pub fn from_env() -> Option<Self> {
        let secret = std::env::var("SESSION_SECRET").ok()?;
        let session_duration_days = std::env::var("SESSION_DURATION_DAYS")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(30);

        Some(Self {
            secret,
            session_duration_days,
        })
    }

    /// Create with explicit secret (for testing)
    pub fn new(secret: String, session_duration_days: i64) -> Self {
        Self {
            secret,
            session_duration_days,
        }
    }

    /// Generate a random token string
    fn generate_token_string() -> String {
        rand::thread_rng()
            .sample_iter(&Alphanumeric)
            .take(64)
            .map(char::from)
            .collect()
    }

    /// Hash a token for storage
    fn hash_token(token: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(token.as_bytes());
        format!("{:x}", hasher.finalize())
    }

    /// Create a new session for a user and return the JWT token
    pub async fn create_session(
        &self,
        pool: &SqlitePool,
        user_id: Uuid,
    ) -> Result<String, SessionError> {
        let now = Utc::now();
        let expires_at = now + Duration::days(self.session_duration_days);

        // Generate a random component for the session
        let token_string = Self::generate_token_string();
        let token_hash = Self::hash_token(&token_string);

        // Create session in database
        let session = AuthSession::create(pool, user_id, &token_hash, expires_at).await?;

        // Create JWT with session info
        let claims = SessionClaims {
            sub: user_id.to_string(),
            sid: session.id.to_string(),
            iat: now.timestamp(),
            exp: expires_at.timestamp(),
        };

        let token = encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(self.secret.as_bytes()),
        )?;

        Ok(token)
    }

    /// Validate a JWT token and return the user
    pub async fn validate_token(
        &self,
        pool: &SqlitePool,
        token: &str,
    ) -> Result<User, SessionError> {
        // Decode and validate the JWT
        let token_data = decode::<SessionClaims>(
            token,
            &DecodingKey::from_secret(self.secret.as_bytes()),
            &Validation::default(),
        )
        .map_err(|_| SessionError::InvalidToken)?;

        let claims = token_data.claims;

        // Parse session ID from claims
        let session_id = Uuid::parse_str(&claims.sid).map_err(|_| SessionError::InvalidToken)?;

        // Check if session exists and is valid
        let session = AuthSession::find_by_id(pool, session_id)
            .await?
            .ok_or(SessionError::InvalidToken)?;

        if session.revoked_at.is_some() {
            return Err(SessionError::SessionRevoked);
        }

        if session.expires_at < Utc::now() {
            return Err(SessionError::SessionExpired);
        }

        // Update last_used_at
        AuthSession::touch(pool, session_id).await?;

        // Parse user ID from claims
        let user_id = Uuid::parse_str(&claims.sub).map_err(|_| SessionError::InvalidToken)?;

        // Fetch and return user
        User::find_by_id(pool, user_id)
            .await?
            .ok_or(SessionError::UserNotFound)
    }

    /// Extract user ID from token without full validation (for quick checks)
    pub fn extract_user_id(&self, token: &str) -> Result<Uuid, SessionError> {
        let token_data = decode::<SessionClaims>(
            token,
            &DecodingKey::from_secret(self.secret.as_bytes()),
            &Validation::default(),
        )
        .map_err(|_| SessionError::InvalidToken)?;

        Uuid::parse_str(&token_data.claims.sub).map_err(|_| SessionError::InvalidToken)
    }

    /// Extract session ID from token
    pub fn extract_session_id(&self, token: &str) -> Result<Uuid, SessionError> {
        let token_data = decode::<SessionClaims>(
            token,
            &DecodingKey::from_secret(self.secret.as_bytes()),
            &Validation::default(),
        )
        .map_err(|_| SessionError::InvalidToken)?;

        Uuid::parse_str(&token_data.claims.sid).map_err(|_| SessionError::InvalidToken)
    }

    /// Revoke a specific session
    pub async fn revoke_session(
        &self,
        pool: &SqlitePool,
        session_id: Uuid,
    ) -> Result<(), SessionError> {
        AuthSession::revoke(pool, session_id).await?;
        Ok(())
    }

    /// Revoke all sessions for a user
    pub async fn revoke_all_sessions(
        &self,
        pool: &SqlitePool,
        user_id: Uuid,
    ) -> Result<(), SessionError> {
        AuthSession::revoke_all_for_user(pool, user_id).await?;
        Ok(())
    }
}
