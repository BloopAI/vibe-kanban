//! Connection token validation for direct frontend-to-node log streaming.
//!
//! This module validates JWT tokens issued by the Hive for frontend clients
//! to connect directly to a node's log streaming endpoints.

use std::collections::HashSet;

use chrono::{DateTime, Utc};
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode};
use secrecy::{ExposeSecret, SecretString};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum ConnectionTokenError {
    #[error("invalid token")]
    InvalidToken,
    #[error("token expired")]
    TokenExpired,
    #[error("execution id mismatch")]
    ExecutionMismatch,
    #[error("missing secret - connection tokens not configured")]
    MissingSecret,
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

/// Validator for connection tokens.
///
/// Nodes use this to validate tokens from frontend clients attempting
/// direct log streaming connections.
#[derive(Clone)]
pub struct ConnectionTokenValidator {
    /// The JWT secret shared with the Hive (base64 encoded)
    secret: Option<SecretString>,
}

impl ConnectionTokenValidator {
    /// Create a new validator with the given secret.
    pub fn new(secret: SecretString) -> Self {
        Self {
            secret: Some(secret),
        }
    }

    /// Create a validator without a secret (will reject all tokens).
    pub fn disabled() -> Self {
        Self { secret: None }
    }

    /// Check if token validation is enabled.
    pub fn is_enabled(&self) -> bool {
        self.secret.is_some()
    }

    /// Validate a connection token and return the decoded claims.
    pub fn validate(&self, token: &str) -> Result<ConnectionToken, ConnectionTokenError> {
        let secret = self
            .secret
            .as_ref()
            .ok_or(ConnectionTokenError::MissingSecret)?;

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

        let decoding_key = DecodingKey::from_base64_secret(secret.expose_secret())?;
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

    /// Validate a connection token for a specific execution process.
    ///
    /// If the token has an execution_process_id, it must match the expected one.
    pub fn validate_for_execution(
        &self,
        token: &str,
        expected_execution_id: Uuid,
    ) -> Result<ConnectionToken, ConnectionTokenError> {
        let connection_token = self.validate(token)?;

        // If the token specifies an execution process ID, it must match
        if let Some(token_exec_id) = connection_token.execution_process_id {
            if token_exec_id != expected_execution_id {
                return Err(ConnectionTokenError::ExecutionMismatch);
            }
        }

        Ok(connection_token)
    }
}

impl Default for ConnectionTokenValidator {
    fn default() -> Self {
        Self::disabled()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    use jsonwebtoken::{EncodingKey, Header, encode};

    fn test_secret() -> SecretString {
        let bytes: [u8; 32] = [
            0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d,
            0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b,
            0x1c, 0x1d, 0x1e, 0x1f,
        ];
        SecretString::from(STANDARD.encode(bytes))
    }

    fn create_test_token(secret: &SecretString, claims: &ConnectionTokenClaims) -> String {
        let encoding_key = EncodingKey::from_base64_secret(secret.expose_secret()).unwrap();
        encode(&Header::new(Algorithm::HS256), claims, &encoding_key).unwrap()
    }

    #[test]
    fn test_validate_valid_token() {
        let secret = test_secret();
        let validator = ConnectionTokenValidator::new(secret.clone());

        let user_id = Uuid::new_v4();
        let node_id = Uuid::new_v4();
        let assignment_id = Uuid::new_v4();
        let now = Utc::now();

        let claims = ConnectionTokenClaims {
            sub: user_id,
            node_id,
            assignment_id,
            execution_process_id: None,
            iat: now.timestamp(),
            exp: (now + chrono::Duration::minutes(15)).timestamp(),
            aud: "connection".to_string(),
        };

        let token = create_test_token(&secret, &claims);
        let validated = validator.validate(&token).unwrap();

        assert_eq!(validated.user_id, user_id);
        assert_eq!(validated.node_id, node_id);
        assert_eq!(validated.assignment_id, assignment_id);
    }

    #[test]
    fn test_validate_expired_token() {
        let secret = test_secret();
        let validator = ConnectionTokenValidator::new(secret.clone());

        let now = Utc::now();
        let claims = ConnectionTokenClaims {
            sub: Uuid::new_v4(),
            node_id: Uuid::new_v4(),
            assignment_id: Uuid::new_v4(),
            execution_process_id: None,
            iat: (now - chrono::Duration::hours(1)).timestamp(),
            exp: (now - chrono::Duration::minutes(30)).timestamp(), // Expired
            aud: "connection".to_string(),
        };

        let token = create_test_token(&secret, &claims);
        let result = validator.validate(&token);

        assert!(result.is_err());
    }

    #[test]
    fn test_validate_for_execution_match() {
        let secret = test_secret();
        let validator = ConnectionTokenValidator::new(secret.clone());

        let exec_id = Uuid::new_v4();
        let now = Utc::now();

        let claims = ConnectionTokenClaims {
            sub: Uuid::new_v4(),
            node_id: Uuid::new_v4(),
            assignment_id: Uuid::new_v4(),
            execution_process_id: Some(exec_id),
            iat: now.timestamp(),
            exp: (now + chrono::Duration::minutes(15)).timestamp(),
            aud: "connection".to_string(),
        };

        let token = create_test_token(&secret, &claims);
        let result = validator.validate_for_execution(&token, exec_id);

        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_for_execution_mismatch() {
        let secret = test_secret();
        let validator = ConnectionTokenValidator::new(secret.clone());

        let exec_id = Uuid::new_v4();
        let wrong_exec_id = Uuid::new_v4();
        let now = Utc::now();

        let claims = ConnectionTokenClaims {
            sub: Uuid::new_v4(),
            node_id: Uuid::new_v4(),
            assignment_id: Uuid::new_v4(),
            execution_process_id: Some(exec_id),
            iat: now.timestamp(),
            exp: (now + chrono::Duration::minutes(15)).timestamp(),
            aud: "connection".to_string(),
        };

        let token = create_test_token(&secret, &claims);
        let result = validator.validate_for_execution(&token, wrong_exec_id);

        assert!(matches!(
            result,
            Err(ConnectionTokenError::ExecutionMismatch)
        ));
    }

    #[test]
    fn test_disabled_validator_rejects_all() {
        let validator = ConnectionTokenValidator::disabled();
        let result = validator.validate("some.token.here");
        assert!(matches!(result, Err(ConnectionTokenError::MissingSecret)));
    }
}
