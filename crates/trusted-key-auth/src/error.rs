use thiserror::Error;

#[derive(Debug, Error)]
pub enum TrustedKeyAuthError {
    #[error("Unauthorized")]
    Unauthorized,
    #[error("Bad request: {0}")]
    BadRequest(String),
    #[error("Forbidden: {0}")]
    Forbidden(String),
    #[error("Too many requests: {0}")]
    TooManyRequests(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}
