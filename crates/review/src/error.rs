use thiserror::Error;

#[derive(Debug, Error)]
pub enum ReviewError {
    #[error("GitHub CLI (gh) is not installed. Install it from https://cli.github.com/")]
    GhNotInstalled,

    #[error("GitHub CLI is not authenticated. Run 'gh auth login' first.")]
    GhNotAuthenticated,

    #[error("Invalid GitHub PR URL format. Expected: https://github.com/owner/repo/pull/123")]
    InvalidPrUrl,

    #[error("Failed to get PR information: {0}")]
    PrInfoFailed(String),

    #[error("Failed to clone repository: {0}")]
    CloneFailed(String),

    #[error("Failed to checkout PR: {0}")]
    CheckoutFailed(String),

    #[error("Failed to create archive: {0}")]
    ArchiveFailed(String),

    #[error("API request failed: {0}")]
    ApiError(String),

    #[error("Upload failed: {0}")]
    UploadFailed(String),

    #[error("Review failed: {0}")]
    ReviewFailed(String),

    #[error("Review timed out after 10 minutes")]
    Timeout,

    #[error("Failed to discover Claude Code sessions: {0}")]
    SessionDiscoveryFailed(String),

    #[error("Failed to parse JSONL file: {0}")]
    JsonlParseFailed(String),
}
