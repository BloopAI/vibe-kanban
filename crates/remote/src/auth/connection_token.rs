//! Connection tokens for direct frontend-to-node log streaming.
//!
//! These are short-lived JWT tokens that allow a frontend client to connect
//! directly to a node's WebSocket endpoint for log streaming. The tokens are
//! issued by the Hive and validated by both the Hive (for relay) and the node
//! (for direct connections).

use chrono::{DateTime, Duration as ChronoDuration, Utc};
use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, Validation, decode, encode};
use secrecy::{ExposeSecret, SecretString};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::Arc;
use thiserror::Error;
use uuid::Uuid;

/// Default TTL for connection tokens (15 minutes).
pub const CONNECTION_TOKEN_TTL_MINUTES: i64 = 15;

#[derive(Debug, Error)]
pub enum ConnectionTokenError {
    #[error("invalid token")]
    InvalidToken,
    #[error("token expired")]
    TokenExpired,
    #[error("execution id mismatch")]
    ExecutionMismatch,
    #[error("jwt error: {0}")]
    Jwt(#[from] jsonwebtoken::errors::Error),
}

/// Claims embedded in a connection token.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionTokenClaims {
    /// User ID requesting the connection
    pub sub: Uuid,
    /// Node ID the connection is authorized for
    pub node_id: Uuid,
    /// Assignment ID this token grants access to
    pub assignment_id: Uuid,
    /// Optional: Local execution process ID on the node
    pub execution_process_id: Option<Uuid>,
    /// Issued at timestamp
    pub iat: i64,
    /// Expiration timestamp
    pub exp: i64,
    /// Audience - always "connection"
    pub aud: String,
}

/// Decoded connection token with parsed claims.
#[derive(Debug, Clone)]
pub struct ConnectionToken {
    pub user_id: Uuid,
    pub node_id: Uuid,
    pub assignment_id: Uuid,
    pub execution_process_id: Option<Uuid>,
    pub expires_at: DateTime<Utc>,
}

/// Service for generating and validating connection tokens.
#[derive(Clone)]
pub struct ConnectionTokenService {
    secret: Arc<SecretString>,
}

impl ConnectionTokenService {
    pub fn new(secret: SecretString) -> Self {
        Self {
            secret: Arc::new(secret),
        }
    }

    /// Generate a connection token for a user to access a specific assignment's logs.
    pub fn generate(
        &self,
        user_id: Uuid,
        node_id: Uuid,
        assignment_id: Uuid,
        execution_process_id: Option<Uuid>,
    ) -> Result<String, ConnectionTokenError> {
        let now = Utc::now();
        let exp = now + ChronoDuration::minutes(CONNECTION_TOKEN_TTL_MINUTES);

        let claims = ConnectionTokenClaims {
            sub: user_id,
            node_id,
            assignment_id,
            execution_process_id,
            iat: now.timestamp(),
            exp: exp.timestamp(),
            aud: "connection".to_string(),
        };

        let encoding_key = EncodingKey::from_base64_secret(self.secret.expose_secret())?;

        let token = encode(&Header::new(Algorithm::HS256), &claims, &encoding_key)?;

        Ok(token)
    }

    /// Validate a connection token and return the decoded claims.
    pub fn validate(&self, token: &str) -> Result<ConnectionToken, ConnectionTokenError> {
        if token.trim().is_empty() {
            return Err(ConnectionTokenError::InvalidToken);
        }

        let mut validation = Validation::new(Algorithm::HS256);
        validation.validate_exp = true;
        validation.validate_nbf = false;
        validation.set_audience(&["connection"]);
        validation.required_spec_claims = HashSet::from([
            "sub".to_string(),
            "exp".to_string(),
            "aud".to_string(),
            "node_id".to_string(),
            "assignment_id".to_string(),
        ]);
        validation.leeway = 30; // 30 seconds leeway for clock skew

        let decoding_key = DecodingKey::from_base64_secret(self.secret.expose_secret())?;
        let data = decode::<ConnectionTokenClaims>(token, &decoding_key, &validation)?;
        let claims = data.claims;

        let expires_at =
            DateTime::from_timestamp(claims.exp, 0).ok_or(ConnectionTokenError::InvalidToken)?;

        Ok(ConnectionToken {
            user_id: claims.sub,
            node_id: claims.node_id,
            assignment_id: claims.assignment_id,
            execution_process_id: claims.execution_process_id,
            expires_at,
        })
    }

    /// Validate a connection token and verify it matches the expected assignment.
    pub fn validate_for_assignment(
        &self,
        token: &str,
        expected_assignment_id: Uuid,
    ) -> Result<ConnectionToken, ConnectionTokenError> {
        let connection_token = self.validate(token)?;

        if connection_token.assignment_id != expected_assignment_id {
            return Err(ConnectionTokenError::ExecutionMismatch);
        }

        Ok(connection_token)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::{Engine as _, engine::general_purpose::STANDARD};

    fn test_secret() -> SecretString {
        // Generate a valid base64-encoded secret for testing
        let bytes: [u8; 32] = [
            0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d,
            0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b,
            0x1c, 0x1d, 0x1e, 0x1f,
        ];
        SecretString::from(STANDARD.encode(bytes))
    }

    #[test]
    fn test_generate_and_validate_token() {
        let service = ConnectionTokenService::new(test_secret());

        let user_id = Uuid::new_v4();
        let node_id = Uuid::new_v4();
        let assignment_id = Uuid::new_v4();

        let token = service
            .generate(user_id, node_id, assignment_id, None)
            .unwrap();

        let validated = service.validate(&token).unwrap();

        assert_eq!(validated.user_id, user_id);
        assert_eq!(validated.node_id, node_id);
        assert_eq!(validated.assignment_id, assignment_id);
        assert!(validated.execution_process_id.is_none());
    }

    #[test]
    fn test_validate_for_assignment_success() {
        let service = ConnectionTokenService::new(test_secret());

        let user_id = Uuid::new_v4();
        let node_id = Uuid::new_v4();
        let assignment_id = Uuid::new_v4();

        let token = service
            .generate(user_id, node_id, assignment_id, None)
            .unwrap();

        let validated = service
            .validate_for_assignment(&token, assignment_id)
            .unwrap();
        assert_eq!(validated.assignment_id, assignment_id);
    }

    #[test]
    fn test_validate_for_assignment_mismatch() {
        let service = ConnectionTokenService::new(test_secret());

        let user_id = Uuid::new_v4();
        let node_id = Uuid::new_v4();
        let assignment_id = Uuid::new_v4();
        let wrong_assignment_id = Uuid::new_v4();

        let token = service
            .generate(user_id, node_id, assignment_id, None)
            .unwrap();

        let result = service.validate_for_assignment(&token, wrong_assignment_id);
        assert!(matches!(
            result,
            Err(ConnectionTokenError::ExecutionMismatch)
        ));
    }

    #[test]
    fn test_empty_token_rejected() {
        let service = ConnectionTokenService::new(test_secret());
        let result = service.validate("");
        assert!(matches!(result, Err(ConnectionTokenError::InvalidToken)));
    }
}
