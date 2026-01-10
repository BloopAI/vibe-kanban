//! Error types for API executor operations

use thiserror::Error;

/// Errors that can occur during API executor operations
#[derive(Debug, Error)]
pub enum ApiExecutorError {
    /// API key is missing from environment
    #[error("Missing API key: {0}")]
    MissingApiKey(&'static str),

    /// HTTP request failed
    #[error("HTTP request failed: {0}")]
    HttpError(#[from] reqwest::Error),

    /// JSON serialization/deserialization error
    #[error("JSON error: {0}")]
    JsonError(#[from] serde_json::Error),

    /// API returned an error response
    #[error("API error: {status} - {message}")]
    ApiError { status: u16, message: String },

    /// Rate limit exceeded
    #[error("Rate limit exceeded. Retry after {retry_after:?} seconds")]
    RateLimited { retry_after: Option<u64> },

    /// Invalid API response format
    #[error("Invalid response format: {0}")]
    InvalidResponse(String),

    /// Stream parsing error
    #[error("Stream error: {0}")]
    StreamError(String),

    /// Provider not supported
    #[error("Unsupported provider: {0}")]
    UnsupportedProvider(String),

    /// Model not supported
    #[error("Unsupported model: {0}")]
    UnsupportedModel(String),

    /// Configuration error
    #[error("Configuration error: {0}")]
    ConfigError(String),

    /// Authentication failed
    #[error("Authentication failed: {0}")]
    AuthError(String),

    /// Request timeout
    #[error("Request timed out")]
    Timeout,

    /// Connection error
    #[error("Connection error: {0}")]
    ConnectionError(String),

    /// I/O error
    #[error("I/O error: {0}")]
    IoError(#[from] std::io::Error),
}

impl ApiExecutorError {
    /// Check if this error is retryable
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            ApiExecutorError::RateLimited { .. }
                | ApiExecutorError::Timeout
                | ApiExecutorError::ConnectionError(_)
        )
    }

    /// Get retry delay in seconds if applicable
    pub fn retry_delay(&self) -> Option<u64> {
        match self {
            ApiExecutorError::RateLimited { retry_after } => *retry_after,
            ApiExecutorError::Timeout => Some(5),
            ApiExecutorError::ConnectionError(_) => Some(2),
            _ => None,
        }
    }
}
