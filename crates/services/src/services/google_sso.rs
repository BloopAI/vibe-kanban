//! Google SSO service for ID token validation and session management.
//!
//! This module provides authentication via Google Sign-In by:
//! 1. Validating Google ID tokens via Google's tokeninfo endpoint
//! 2. Managing sessions with in-memory storage
//! 3. Optionally restricting access to specific email domains

use chrono::{DateTime, Duration, Utc};
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::env;
use std::sync::Arc;
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

/// Session duration in hours
const SESSION_DURATION_HOURS: i64 = 24;

/// Cookie name for the session
pub const SESSION_COOKIE_NAME: &str = "google_sso_session";

#[derive(Debug, Error)]
pub enum GoogleSsoError {
    #[error("Google SSO is not enabled")]
    NotEnabled,
    #[error("Missing Google Client ID configuration")]
    MissingClientId,
    #[error("Failed to validate token: {0}")]
    TokenValidation(String),
    #[error("Email domain not allowed: {0}")]
    DomainNotAllowed(String),
    #[error("Session not found or expired")]
    InvalidSession,
    #[error("HTTP request failed: {0}")]
    HttpError(#[from] reqwest::Error),
}

/// Response from Google's tokeninfo endpoint
#[derive(Debug, Deserialize)]
struct GoogleTokenInfo {
    /// The email address of the user
    email: String,
    /// Whether the email has been verified
    email_verified: String,
    /// The audience (client ID) the token was issued for
    aud: String,
    /// Token expiration time (Unix timestamp)
    exp: String,
}

/// A session for an authenticated user
#[derive(Debug, Clone)]
pub struct GoogleSsoSession {
    pub user_email: String,
    pub created_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
}

/// Configuration for Google SSO
#[derive(Debug, Clone)]
pub struct GoogleSsoConfig {
    pub enabled: bool,
    pub client_id: Option<String>,
    pub allowed_domains: Option<Vec<String>>,
}

impl GoogleSsoConfig {
    /// Load configuration from environment variables
    pub fn from_env() -> Self {
        let enabled = env::var("GOOGLE_SSO_ENABLED")
            .map(|v| v.to_lowercase() == "true" || v == "1")
            .unwrap_or(false);

        let client_id = env::var("GOOGLE_CLIENT_ID").ok();

        let allowed_domains = env::var("GOOGLE_ALLOWED_DOMAINS").ok().map(|domains| {
            domains
                .split(',')
                .map(|d| d.trim().to_lowercase())
                .filter(|d| !d.is_empty())
                .collect()
        });

        Self {
            enabled,
            client_id,
            allowed_domains,
        }
    }
}

/// DTO for exposing SSO config to the frontend
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct GoogleSsoConfigDto {
    pub enabled: bool,
    pub client_id: Option<String>,
}

impl From<&GoogleSsoConfig> for GoogleSsoConfigDto {
    fn from(config: &GoogleSsoConfig) -> Self {
        Self {
            enabled: config.enabled,
            client_id: config.client_id.clone(),
        }
    }
}

/// Google SSO service for token validation and session management
#[derive(Clone)]
pub struct GoogleSsoService {
    config: GoogleSsoConfig,
    sessions: Arc<DashMap<String, GoogleSsoSession>>,
    http_client: reqwest::Client,
}

impl GoogleSsoService {
    /// Create a new GoogleSsoService from environment configuration
    pub fn new() -> Self {
        Self {
            config: GoogleSsoConfig::from_env(),
            sessions: Arc::new(DashMap::new()),
            http_client: reqwest::Client::new(),
        }
    }

    /// Create a new GoogleSsoService with explicit configuration (for testing)
    pub fn with_config(config: GoogleSsoConfig) -> Self {
        Self {
            config,
            sessions: Arc::new(DashMap::new()),
            http_client: reqwest::Client::new(),
        }
    }

    /// Check if Google SSO is enabled
    pub fn is_enabled(&self) -> bool {
        self.config.enabled
    }

    /// Get the configuration DTO for frontend
    pub fn config_dto(&self) -> GoogleSsoConfigDto {
        GoogleSsoConfigDto::from(&self.config)
    }

    /// Validate a Google ID token and create a session
    ///
    /// Returns the session ID on success
    pub async fn verify_token(&self, id_token: &str) -> Result<(String, String), GoogleSsoError> {
        if !self.config.enabled {
            return Err(GoogleSsoError::NotEnabled);
        }

        let client_id = self
            .config
            .client_id
            .as_ref()
            .ok_or(GoogleSsoError::MissingClientId)?;

        // Validate token via Google's tokeninfo endpoint
        let token_info = self.validate_with_google(id_token).await?;

        // Verify the token was issued for our client
        if token_info.aud != *client_id {
            return Err(GoogleSsoError::TokenValidation(
                "Token was not issued for this application".to_string(),
            ));
        }

        // Verify email is verified
        if token_info.email_verified != "true" {
            return Err(GoogleSsoError::TokenValidation(
                "Email not verified".to_string(),
            ));
        }

        // Check domain allowlist if configured
        if let Some(ref allowed_domains) = self.config.allowed_domains {
            let email_domain = token_info
                .email
                .split('@')
                .nth(1)
                .map(|d| d.to_lowercase())
                .unwrap_or_default();

            if !allowed_domains.contains(&email_domain) {
                return Err(GoogleSsoError::DomainNotAllowed(email_domain));
            }
        }

        // Create session
        let session_id = self.create_session(&token_info.email);

        Ok((session_id, token_info.email))
    }

    /// Validate token with Google's tokeninfo endpoint
    async fn validate_with_google(&self, id_token: &str) -> Result<GoogleTokenInfo, GoogleSsoError> {
        let url = format!(
            "https://oauth2.googleapis.com/tokeninfo?id_token={}",
            id_token
        );

        let response = self.http_client.get(&url).send().await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(GoogleSsoError::TokenValidation(format!(
                "Google returned {}: {}",
                status, body
            )));
        }

        let token_info: GoogleTokenInfo = response.json().await?;

        // Check expiration
        let exp: i64 = token_info
            .exp
            .parse()
            .map_err(|_| GoogleSsoError::TokenValidation("Invalid expiration".to_string()))?;
        let exp_time = DateTime::from_timestamp(exp, 0)
            .ok_or_else(|| GoogleSsoError::TokenValidation("Invalid expiration timestamp".to_string()))?;

        if exp_time < Utc::now() {
            return Err(GoogleSsoError::TokenValidation("Token expired".to_string()));
        }

        Ok(token_info)
    }

    /// Create a new session for the given email
    fn create_session(&self, email: &str) -> String {
        let session_id = Uuid::new_v4().to_string();
        let now = Utc::now();

        let session = GoogleSsoSession {
            user_email: email.to_string(),
            created_at: now,
            expires_at: now + Duration::hours(SESSION_DURATION_HOURS),
        };

        self.sessions.insert(session_id.clone(), session);
        self.cleanup_expired_sessions();

        session_id
    }

    /// Validate a session and return the user email if valid
    pub fn validate_session(&self, session_id: &str) -> Option<String> {
        self.sessions.get(session_id).and_then(|session| {
            if session.expires_at > Utc::now() {
                Some(session.user_email.clone())
            } else {
                None
            }
        })
    }

    /// Get session info if valid
    pub fn get_session(&self, session_id: &str) -> Option<GoogleSsoSession> {
        self.sessions.get(session_id).and_then(|session| {
            if session.expires_at > Utc::now() {
                Some(session.clone())
            } else {
                None
            }
        })
    }

    /// Remove a session (logout)
    pub fn remove_session(&self, session_id: &str) {
        self.sessions.remove(session_id);
    }

    /// Clean up expired sessions
    fn cleanup_expired_sessions(&self) {
        let now = Utc::now();
        self.sessions.retain(|_, session| session.expires_at > now);
    }
}

impl Default for GoogleSsoService {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_from_env_disabled() {
        // Clear any existing env vars
        env::remove_var("GOOGLE_SSO_ENABLED");
        env::remove_var("GOOGLE_CLIENT_ID");
        env::remove_var("GOOGLE_ALLOWED_DOMAINS");

        let config = GoogleSsoConfig::from_env();
        assert!(!config.enabled);
        assert!(config.client_id.is_none());
        assert!(config.allowed_domains.is_none());
    }

    #[test]
    fn test_session_creation_and_validation() {
        let config = GoogleSsoConfig {
            enabled: true,
            client_id: Some("test-client-id".to_string()),
            allowed_domains: None,
        };

        let service = GoogleSsoService::with_config(config);
        let session_id = service.create_session("test@example.com");

        // Session should be valid
        let email = service.validate_session(&session_id);
        assert_eq!(email, Some("test@example.com".to_string()));

        // Invalid session should return None
        assert!(service.validate_session("invalid-session").is_none());

        // Remove session
        service.remove_session(&session_id);
        assert!(service.validate_session(&session_id).is_none());
    }
}
