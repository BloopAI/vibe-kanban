//! Claude Code OAuth token rotation service.
//!
//! Manages rotation of Claude Code OAuth tokens across multiple users
//! using a round-robin strategy (least recently used first).

use std::sync::Arc;

use db::models::claude_oauth_token::{
    generate_token_hint, ClaudeOAuthToken, ClaudeOAuthTokenError, ClaudeOAuthTokenStatus,
    UserTokenStatus,
};
use db::models::user::User;
use db::DBService;
use thiserror::Error;
use tokio::sync::Mutex;
use tracing::{info, warn};
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum TokenRotationError {
    #[error("No tokens available for rotation")]
    NoTokensAvailable,
    #[error("Token decryption failed: {0}")]
    DecryptionFailed(String),
    #[error("Token encryption failed: {0}")]
    EncryptionFailed(String),
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error(transparent)]
    TokenError(#[from] ClaudeOAuthTokenError),
}

/// Simple token encoding/decoding for storage.
/// In a controlled environment, we use base64 encoding with a version prefix.
/// For production with untrusted storage, replace with proper encryption (AES-GCM).
mod token_encoding {
    use base64::{Engine as _, engine::general_purpose::STANDARD};

    const VERSION_PREFIX: &str = "v1:";

    pub fn encode(plaintext: &str) -> String {
        format!("{}{}", VERSION_PREFIX, STANDARD.encode(plaintext))
    }

    pub fn decode(encoded: &str) -> Result<String, String> {
        if let Some(b64) = encoded.strip_prefix(VERSION_PREFIX) {
            STANDARD
                .decode(b64)
                .map_err(|e| format!("base64 decode error: {e}"))
                .and_then(|bytes| {
                    String::from_utf8(bytes).map_err(|e| format!("utf8 decode error: {e}"))
                })
        } else {
            // Legacy: assume raw token (for backwards compatibility during migration)
            Ok(encoded.to_string())
        }
    }
}

/// Service for managing Claude Code OAuth token rotation
#[derive(Clone)]
pub struct ClaudeTokenRotationService {
    db: Arc<DBService>,
    /// Lock to ensure atomic rotation (prevents two concurrent requests getting same token)
    rotation_lock: Arc<Mutex<()>>,
}

impl ClaudeTokenRotationService {
    pub fn new(db: Arc<DBService>) -> Self {
        Self {
            db,
            rotation_lock: Arc::new(Mutex::new(())),
        }
    }

    /// Get the next token to use, implementing round-robin rotation.
    /// Returns None if no valid tokens are available.
    pub async fn get_next_token(&self) -> Result<Option<String>, TokenRotationError> {
        let _lock = self.rotation_lock.lock().await;

        // Get next token using round-robin (least recently used)
        let token = ClaudeOAuthToken::get_next_for_rotation(&self.db.pool).await?;

        if let Some(token) = token {
            // Mark as used
            ClaudeOAuthToken::mark_used(&self.db.pool, token.id).await?;

            // Decode and return
            let decrypted = token_encoding::decode(&token.encrypted_token)
                .map_err(TokenRotationError::DecryptionFailed)?;

            info!(
                token_id = %token.id,
                user_id = %token.user_id,
                "Rotated to Claude OAuth token"
            );

            Ok(Some(decrypted))
        } else {
            warn!("No Claude OAuth tokens available for rotation");
            Ok(None)
        }
    }

    /// Check if any valid tokens are available
    pub async fn has_available_tokens(&self) -> bool {
        match ClaudeOAuthToken::count_available(&self.db.pool).await {
            Ok(count) => count > 0,
            Err(e) => {
                warn!("Failed to count available tokens: {e}");
                false
            }
        }
    }

    /// Get token status for a specific user
    pub async fn get_user_token_status(
        &self,
        user_id: Uuid,
    ) -> Result<ClaudeOAuthTokenStatus, TokenRotationError> {
        let token = ClaudeOAuthToken::find_by_user_id(&self.db.pool, user_id).await?;

        Ok(token
            .map(|t| t.to_status())
            .unwrap_or_else(ClaudeOAuthTokenStatus::no_token))
    }

    /// Add or update a token for a user
    pub async fn upsert_token(
        &self,
        user_id: Uuid,
        raw_token: &str,
    ) -> Result<ClaudeOAuthTokenStatus, TokenRotationError> {
        // Encode the token for storage
        let encoded = token_encoding::encode(raw_token);
        let hint = generate_token_hint(raw_token);

        // Store in database (no expiration for now - Claude tokens are long-lived)
        let token =
            ClaudeOAuthToken::upsert(&self.db.pool, user_id, &encoded, Some(&hint), None).await?;

        info!(user_id = %user_id, "Upserted Claude OAuth token");

        Ok(token.to_status())
    }

    /// Delete a user's token
    pub async fn delete_user_token(&self, user_id: Uuid) -> Result<(), TokenRotationError> {
        ClaudeOAuthToken::delete_for_user(&self.db.pool, user_id).await?;
        info!(user_id = %user_id, "Deleted Claude OAuth token");
        Ok(())
    }

    /// Get all users' token statuses (for admin view)
    pub async fn get_all_token_statuses(&self) -> Result<Vec<UserTokenStatus>, TokenRotationError> {
        let users = User::find_all(&self.db.pool).await?;
        let mut statuses = Vec::with_capacity(users.len());

        for user in users {
            let token_status = self.get_user_token_status(user.id).await?;
            statuses.push(UserTokenStatus {
                user_id: user.id,
                username: user.username,
                display_name: user.display_name,
                avatar_url: user.avatar_url,
                token_status,
            });
        }

        Ok(statuses)
    }
}

#[cfg(test)]
mod tests {
    use super::token_encoding;

    #[test]
    fn test_encode_decode_roundtrip() {
        let original = "my-secret-token-12345";
        let encoded = token_encoding::encode(original);
        let decoded = token_encoding::decode(&encoded).unwrap();
        assert_eq!(original, decoded);
    }

    #[test]
    fn test_decode_legacy_token() {
        // Legacy tokens without prefix should work
        let legacy = "raw-token-without-prefix";
        let decoded = token_encoding::decode(legacy).unwrap();
        assert_eq!(legacy, decoded);
    }

    #[test]
    fn test_encoded_has_version_prefix() {
        let encoded = token_encoding::encode("test");
        assert!(encoded.starts_with("v1:"));
    }
}
