use std::time::Duration;

#[derive(Debug, thiserror::Error)]
pub enum JiraError {
    #[error("network error: {0}")]
    Transport(String),

    #[error("timeout")]
    Timeout,

    #[error("http {status}: {body}")]
    Http { status: u16, body: String },

    #[error("authentication failed")]
    Auth,

    #[error("rate limited")]
    RateLimited { retry_after: Option<Duration> },

    #[error("not found: {0}")]
    NotFound(String),

    #[error("json error: {0}")]
    Deserialize(String),
}

impl JiraError {
    pub fn should_retry(&self) -> bool {
        matches!(
            self,
            JiraError::Transport(_)
                | JiraError::Timeout
                | JiraError::RateLimited { .. }
                | JiraError::Http {
                    status: 500..=599,
                    ..
                }
        )
    }
}

impl From<reqwest::Error> for JiraError {
    fn from(err: reqwest::Error) -> Self {
        if err.is_timeout() {
            JiraError::Timeout
        } else {
            JiraError::Transport(err.to_string())
        }
    }
}
