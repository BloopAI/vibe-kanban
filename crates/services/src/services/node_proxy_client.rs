//! HTTP proxy client for routing requests to remote nodes.
//!
//! This module provides a client for proxying API requests from a local node
//! to a remote node when accessing projects that live on other nodes.

use std::time::Duration;

use base64::{Engine as _, engine::general_purpose::STANDARD};
use chrono::Utc;
use jsonwebtoken::{Algorithm, EncodingKey, Header, encode};
use reqwest::Client;
use secrecy::{ExposeSecret, SecretString};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use thiserror::Error;
use uuid::Uuid;

/// Errors that can occur when proxying requests to remote nodes.
#[derive(Debug, Clone, Error)]
pub enum NodeProxyError {
    #[error("Remote node is offline")]
    NodeOffline,
    #[error("Remote node URL not configured")]
    NoNodeUrl,
    #[error("Project not linked to hive (no remote_project_id)")]
    NoRemoteProjectId,
    #[error("Connection token secret not configured")]
    NoTokenSecret,
    #[error("Request to remote node timed out")]
    Timeout,
    #[error("Request to remote node failed: {0}")]
    Transport(String),
    #[error("Remote node returned error: HTTP {status} - {body}")]
    RemoteError { status: u16, body: String },
    #[error("Failed to parse remote response: {0}")]
    ParseError(String),
    #[error("JWT encoding error: {0}")]
    JwtError(String),
}

impl NodeProxyError {
    /// Returns true if the error is transient and could be retried.
    pub fn is_transient(&self) -> bool {
        matches!(
            self,
            Self::Timeout | Self::Transport(_) | Self::NodeOffline
        )
    }
}

/// Claims embedded in a node-to-node proxy token.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct ProxyTokenClaims {
    /// Source node ID (the node making the request)
    pub sub: String,
    /// Target node ID (the node receiving the request)
    pub node_id: String,
    /// Issued at timestamp
    pub iat: i64,
    /// Expiration timestamp
    pub exp: i64,
    /// Audience - always "node_proxy"
    pub aud: String,
}

/// HTTP client for proxying requests to remote nodes.
///
/// This client generates JWT tokens for authentication and forwards
/// HTTP requests to remote nodes that own specific projects.
#[derive(Clone)]
pub struct NodeProxyClient {
    http: Client,
    /// JWT secret shared between nodes (base64 encoded)
    connection_token_secret: Option<SecretString>,
    /// This node's ID (for token generation)
    local_node_id: Option<Uuid>,
}

impl std::fmt::Debug for NodeProxyClient {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("NodeProxyClient")
            .field("http", &"<reqwest::Client>")
            .field(
                "connection_token_secret",
                &self.connection_token_secret.as_ref().map(|_| "<secret>"),
            )
            .field("local_node_id", &self.local_node_id)
            .finish()
    }
}

impl NodeProxyClient {
    const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
    const TOKEN_TTL_SECS: i64 = 300; // 5 minutes

    /// Create a new NodeProxyClient with the given secret.
    ///
    /// # Arguments
    /// * `secret` - The base64-encoded JWT secret shared between nodes
    /// * `local_node_id` - This node's ID (used in token generation)
    pub fn new(secret: Option<SecretString>, local_node_id: Option<Uuid>) -> Self {
        let http = Client::builder()
            .timeout(Self::REQUEST_TIMEOUT)
            .user_agent(concat!("vibe-kanban-node-proxy/", env!("CARGO_PKG_VERSION")))
            .build()
            .expect("failed to build HTTP client");

        Self {
            http,
            connection_token_secret: secret,
            local_node_id,
        }
    }

    /// Create a disabled proxy client (will reject all proxy requests).
    pub fn disabled() -> Self {
        Self {
            http: Client::new(),
            connection_token_secret: None,
            local_node_id: None,
        }
    }

    /// Check if proxying is enabled (has secret and node ID).
    pub fn is_enabled(&self) -> bool {
        self.connection_token_secret.is_some()
    }

    /// Set the local node ID (called after node registration).
    pub fn set_local_node_id(&mut self, node_id: Uuid) {
        self.local_node_id = Some(node_id);
    }

    /// Generate a JWT token for authenticating to a remote node.
    fn generate_token(&self, target_node_id: Uuid) -> Result<String, NodeProxyError> {
        let secret = self
            .connection_token_secret
            .as_ref()
            .ok_or(NodeProxyError::NoTokenSecret)?;

        let local_node_id = self
            .local_node_id
            .map(|id| id.to_string())
            .unwrap_or_else(|| "unknown".to_string());

        let now = Utc::now().timestamp();
        let claims = ProxyTokenClaims {
            sub: local_node_id,
            node_id: target_node_id.to_string(),
            iat: now,
            exp: now + Self::TOKEN_TTL_SECS,
            aud: "node_proxy".to_string(),
        };

        // Decode base64 secret to get raw bytes
        let secret_bytes = STANDARD
            .decode(secret.expose_secret())
            .map_err(|e| NodeProxyError::JwtError(format!("Invalid base64 secret: {}", e)))?;

        let encoding_key = EncodingKey::from_secret(&secret_bytes);

        encode(&Header::new(Algorithm::HS256), &claims, &encoding_key)
            .map_err(|e| NodeProxyError::JwtError(e.to_string()))
    }

    /// Proxy a GET request to a remote node.
    ///
    /// # Arguments
    /// * `node_url` - Base URL of the remote node (e.g., "https://node.example.com")
    /// * `path` - API path (e.g., "/projects/by-remote-id/{id}/branches")
    /// * `target_node_id` - UUID of the target node (for token generation)
    pub async fn proxy_get<T: DeserializeOwned>(
        &self,
        node_url: &str,
        path: &str,
        target_node_id: Uuid,
    ) -> Result<T, NodeProxyError> {
        let token = self.generate_token(target_node_id)?;
        let url = format!("{}/api{}", node_url.trim_end_matches('/'), path);

        tracing::debug!(url = %url, target_node_id = %target_node_id, "Proxying GET request to remote node");

        let response = self
            .http
            .get(&url)
            .bearer_auth(&token)
            .send()
            .await
            .map_err(map_reqwest_error)?;

        self.handle_response(response).await
    }

    /// Proxy a POST request to a remote node.
    ///
    /// # Arguments
    /// * `node_url` - Base URL of the remote node
    /// * `path` - API path
    /// * `body` - Request body to serialize as JSON
    /// * `target_node_id` - UUID of the target node
    pub async fn proxy_post<T: DeserializeOwned, B: Serialize>(
        &self,
        node_url: &str,
        path: &str,
        body: &B,
        target_node_id: Uuid,
    ) -> Result<T, NodeProxyError> {
        let token = self.generate_token(target_node_id)?;
        let url = format!("{}/api{}", node_url.trim_end_matches('/'), path);

        tracing::debug!(url = %url, target_node_id = %target_node_id, "Proxying POST request to remote node");

        let response = self
            .http
            .post(&url)
            .bearer_auth(&token)
            .json(body)
            .send()
            .await
            .map_err(map_reqwest_error)?;

        self.handle_response(response).await
    }

    /// Proxy a DELETE request to a remote node.
    pub async fn proxy_delete<T: DeserializeOwned>(
        &self,
        node_url: &str,
        path: &str,
        target_node_id: Uuid,
    ) -> Result<T, NodeProxyError> {
        let token = self.generate_token(target_node_id)?;
        let url = format!("{}/api{}", node_url.trim_end_matches('/'), path);

        tracing::debug!(url = %url, target_node_id = %target_node_id, "Proxying DELETE request to remote node");

        let response = self
            .http
            .delete(&url)
            .bearer_auth(&token)
            .send()
            .await
            .map_err(map_reqwest_error)?;

        self.handle_response(response).await
    }

    /// Handle the response from a remote node.
    async fn handle_response<T: DeserializeOwned>(
        &self,
        response: reqwest::Response,
    ) -> Result<T, NodeProxyError> {
        let status = response.status();

        if status.is_success() {
            response
                .json::<T>()
                .await
                .map_err(|e| NodeProxyError::ParseError(e.to_string()))
        } else {
            let body = response.text().await.unwrap_or_default();
            tracing::warn!(
                status = status.as_u16(),
                body = %body,
                "Remote node returned error"
            );
            Err(NodeProxyError::RemoteError {
                status: status.as_u16(),
                body,
            })
        }
    }
}

impl Default for NodeProxyClient {
    fn default() -> Self {
        Self::disabled()
    }
}

fn map_reqwest_error(e: reqwest::Error) -> NodeProxyError {
    if e.is_timeout() {
        NodeProxyError::Timeout
    } else if e.is_connect() {
        NodeProxyError::NodeOffline
    } else {
        NodeProxyError::Transport(e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_secret() -> SecretString {
        // 32 bytes encoded as base64
        let bytes: [u8; 32] = [
            0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d,
            0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b,
            0x1c, 0x1d, 0x1e, 0x1f,
        ];
        SecretString::from(STANDARD.encode(bytes))
    }

    #[test]
    fn test_client_disabled_by_default() {
        let client = NodeProxyClient::disabled();
        assert!(!client.is_enabled());
    }

    #[test]
    fn test_client_enabled_with_secret() {
        let client = NodeProxyClient::new(Some(test_secret()), Some(Uuid::new_v4()));
        assert!(client.is_enabled());
    }

    #[test]
    fn test_generate_token_without_secret() {
        let client = NodeProxyClient::disabled();
        let result = client.generate_token(Uuid::new_v4());
        assert!(matches!(result, Err(NodeProxyError::NoTokenSecret)));
    }

    #[test]
    fn test_generate_token_success() {
        let client = NodeProxyClient::new(Some(test_secret()), Some(Uuid::new_v4()));
        let target_node_id = Uuid::new_v4();
        let result = client.generate_token(target_node_id);
        assert!(result.is_ok());

        let token = result.unwrap();
        assert!(!token.is_empty());
        // JWT tokens have 3 parts separated by dots
        assert_eq!(token.split('.').count(), 3);
    }

    #[test]
    fn test_error_is_transient() {
        assert!(NodeProxyError::Timeout.is_transient());
        assert!(NodeProxyError::NodeOffline.is_transient());
        assert!(NodeProxyError::Transport("test".to_string()).is_transient());
        assert!(!NodeProxyError::NoTokenSecret.is_transient());
        assert!(!NodeProxyError::NoRemoteProjectId.is_transient());
    }
}
