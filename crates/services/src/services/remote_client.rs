//! OAuth client library for interacting with the remote OAuth server.
//!
//! This module provides a simple client for the OAuth device flow authentication.
//! The client handles automatic retries with exponential backoff for transient failures.
//!
//! # Example Usage
//!
//! ```no_run
//! use services::services::remote_client::{RemoteClient, DevicePollResult};
//! use std::time::Duration;
//!
//! # async fn example() -> Result<(), Box<dyn std::error::Error>> {
//! // Create a client
//! let client = RemoteClient::new("http://localhost:8081")?;
//!
//! // Initiate device flow
//! let init = client.device_init("github").await?;
//! println!("Visit: {}", init.verification_uri);
//! println!("Enter code: {}", init.user_code);
//!
//! // Poll until authorized
//! let access_token = loop {
//!     tokio::time::sleep(Duration::from_secs(5)).await;
//!     match client.device_poll(init.handoff_id).await? {
//!         DevicePollResult::Pending => continue,
//!         DevicePollResult::Success { access_token } => break access_token,
//!         DevicePollResult::Error { code } => {
//!             return Err(format!("Authorization failed: {:?}", code).into());
//!         }
//!     }
//! };
//!
//! // Fetch user profile
//! let profile = client.profile(&access_token).await?;
//! println!("Logged in as: {}", profile.email);
//! # Ok(())
//! # }
//! ```
//!
//! # Manual Testing
//!
//! You can test the OAuth flow manually using curl commands:
//!
//! 1. Start the remote server (default: http://localhost:8081)
//!
//! 2. Initiate device flow:
//! ```bash
//! curl -X POST http://localhost:8081/device-init \
//!   -H "Content-Type: application/json" \
//!   -d '{"provider":"github"}'
//! ```
//!
//! 3. Open the `verification_uri` and enter the `user_code`, then poll:
//! ```bash
//! curl -X POST http://localhost:8081/device-poll \
//!   -H "Content-Type: application/json" \
//!   -d '{"handoff_id":"<uuid-from-init>"}'
//! ```
//!
//! 4. Once you get an `access_token`, fetch the profile:
//! ```bash
//! curl http://localhost:8081/profile \
//!   -H "Authorization: Bearer <access_token>"
//! ```

use std::time::Duration;

use backon::{ExponentialBuilder, Retryable};
use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tracing::warn;
use url::Url;
use utils::api::oauth::{
    DeviceInitRequest, DeviceInitResponse, DevicePollRequest, DevicePollResponse, ProfileResponse,
};
use uuid::Uuid;

/// Errors that can occur when using the RemoteClient.
#[derive(Debug, Clone, Error)]
pub enum RemoteClientError {
    #[error("network error: {0}")]
    Transport(String),
    #[error("timeout")]
    Timeout,
    #[error("http {status}: {body}")]
    Http { status: u16, body: String },
    #[error("api error: {0:?}")]
    Api(DeviceFlowErrorCode),
    #[error("unauthorized")]
    Auth,
    #[error("json error: {0}")]
    Serde(String),
    #[error("url error: {0}")]
    Url(String),
}

impl RemoteClientError {
    /// Returns true if the error is transient and the request should be retried.
    ///
    /// Retryable errors include network transport errors, timeouts, and 5xx server errors.
    pub fn should_retry(&self) -> bool {
        match self {
            Self::Transport(_) | Self::Timeout => true,
            Self::Http { status, .. } => (500..=599).contains(status),
            _ => false,
        }
    }
}

/// Error codes returned by the OAuth device flow.
#[derive(Debug, Clone)]
pub enum DeviceFlowErrorCode {
    /// The specified OAuth provider is not supported.
    UnsupportedProvider,
    /// The OAuth provider returned an error.
    ProviderError,
    /// The device authorization was not found.
    NotFound,
    /// The device authorization has expired.
    Expired,
    /// The user denied access.
    AccessDenied,
    /// An internal server error occurred.
    InternalError,
    /// Failed to fetch user details from the provider.
    UserFetchFailed,
    /// An unrecognized error code.
    Other(String),
}

fn map_error_code(code: Option<&str>) -> DeviceFlowErrorCode {
    match code.unwrap_or("internal_error") {
        "unsupported_provider" => DeviceFlowErrorCode::UnsupportedProvider,
        "provider_error" => DeviceFlowErrorCode::ProviderError,
        "not_found" => DeviceFlowErrorCode::NotFound,
        "expired" | "expired_token" => DeviceFlowErrorCode::Expired,
        "access_denied" => DeviceFlowErrorCode::AccessDenied,
        "internal_error" => DeviceFlowErrorCode::InternalError,
        "user_fetch_failed" => DeviceFlowErrorCode::UserFetchFailed,
        other => DeviceFlowErrorCode::Other(other.to_string()),
    }
}

/// Result of polling the device authorization status.
#[derive(Debug, Clone)]
pub enum DevicePollResult {
    /// The authorization is still pending user action.
    Pending,
    /// The authorization succeeded and an access token is available.
    Success { access_token: String },
    /// The authorization failed with an error code.
    Error { code: DeviceFlowErrorCode },
}

#[derive(Deserialize)]
struct ApiErrorResponse {
    error: String,
}

/// HTTP client for the remote OAuth server.
///
/// The client is cloneable and can be shared across threads. All methods
/// implement automatic retry with exponential backoff for transient failures.
#[derive(Debug, Clone)]
pub struct RemoteClient {
    base: Url,
    http: Client,
}

impl RemoteClient {
    /// Creates a new client for the given base URL.
    ///
    /// # Arguments
    ///
    /// * `base_url` - The base URL of the remote OAuth server (e.g., "http://localhost:8081")
    ///
    /// # Errors
    ///
    /// Returns an error if the base URL is invalid.
    pub fn new(base_url: &str) -> Result<Self, RemoteClientError> {
        let base = Url::parse(base_url).map_err(|e| RemoteClientError::Url(e.to_string()))?;
        let http = Client::builder()
            .timeout(Duration::from_secs(10))
            .user_agent(concat!("remote-client/", env!("CARGO_PKG_VERSION")))
            .build()
            .map_err(|e| RemoteClientError::Transport(e.to_string()))?;
        Ok(Self { base, http })
    }

    /// Initiates the OAuth device flow for the specified provider.
    ///
    /// # Arguments
    ///
    /// * `provider` - The OAuth provider name (e.g., "github", "google")
    ///
    /// # Returns
    ///
    /// Returns the device authorization details including the verification URI
    /// and user code that the user must enter.
    ///
    /// # Errors
    ///
    /// Returns an error if the provider is unsupported or the request fails.
    pub async fn device_init(
        &self,
        provider: &str,
    ) -> Result<DeviceInitResponse, RemoteClientError> {
        self.post_json(
            "/device-init",
            &DeviceInitRequest {
                provider: provider.to_string(),
            },
        )
        .await
        .or_else(|e| self.map_api_error(e))
    }

    /// Polls the status of a device authorization.
    ///
    /// # Arguments
    ///
    /// * `handoff_id` - The handoff ID returned from `device_init()`
    ///
    /// # Returns
    ///
    /// Returns the current status of the authorization. Callers should poll
    /// repeatedly until receiving `Success` or `Error`.
    ///
    /// # Errors
    ///
    /// Returns an error if the request fails or the handoff ID is invalid.
    pub async fn device_poll(
        &self,
        handoff_id: Uuid,
    ) -> Result<DevicePollResult, RemoteClientError> {
        let raw: DevicePollResponse = self
            .post_json("/device-poll", &DevicePollRequest { handoff_id })
            .await
            .or_else(|e| self.map_poll_error(e))?;

        Ok(match raw.status.as_str() {
            "pending" => DevicePollResult::Pending,
            "success" => {
                if let Some(token) = raw.access_token {
                    DevicePollResult::Success {
                        access_token: token,
                    }
                } else {
                    warn!("device flow returned success without access_token");
                    DevicePollResult::Error {
                        code: DeviceFlowErrorCode::InternalError,
                    }
                }
            }
            _ => DevicePollResult::Error {
                code: map_error_code(raw.error.as_deref()),
            },
        })
    }

    /// Fetches the user profile using an access token.
    ///
    /// # Arguments
    ///
    /// * `token` - The access token obtained from a successful device flow
    ///
    /// # Returns
    ///
    /// Returns the user's profile information including user ID, email,
    /// and connected OAuth provider accounts.
    ///
    /// # Errors
    ///
    /// Returns an error if the token is invalid or the request fails.
    pub async fn profile(&self, token: &str) -> Result<ProfileResponse, RemoteClientError> {
        self.get_json("/profile", Some(token)).await
    }

    async fn post_json<T, B>(&self, path: &str, body: &B) -> Result<T, RemoteClientError>
    where
        T: for<'de> Deserialize<'de>,
        B: Serialize,
    {
        let url = self
            .base
            .join(path)
            .map_err(|e| RemoteClientError::Url(e.to_string()))?;

        (|| async {
            let res = self
                .http
                .post(url.clone())
                .json(body)
                .send()
                .await
                .map_err(map_reqwest_error)?;

            if !res.status().is_success() {
                let status = res.status().as_u16();
                let body = res.text().await.unwrap_or_default();
                return Err(RemoteClientError::Http { status, body });
            }

            res.json::<T>()
                .await
                .map_err(|e| RemoteClientError::Serde(e.to_string()))
        })
        .retry(
            &ExponentialBuilder::default()
                .with_min_delay(Duration::from_secs(1))
                .with_max_delay(Duration::from_secs(30))
                .with_max_times(3)
                .with_jitter(),
        )
        .when(|e: &RemoteClientError| e.should_retry())
        .notify(|e, dur| {
            warn!(
                "Remote call failed, retrying after {:.2}s: {}",
                dur.as_secs_f64(),
                e
            )
        })
        .await
    }

    async fn get_json<T>(&self, path: &str, auth: Option<&str>) -> Result<T, RemoteClientError>
    where
        T: for<'de> Deserialize<'de>,
    {
        let url = self
            .base
            .join(path)
            .map_err(|e| RemoteClientError::Url(e.to_string()))?;

        (|| async {
            let mut req = self.http.get(url.clone());
            if let Some(token) = auth {
                req = req.bearer_auth(token);
            }

            let res = req.send().await.map_err(map_reqwest_error)?;

            match res.status() {
                StatusCode::OK => res
                    .json::<T>()
                    .await
                    .map_err(|e| RemoteClientError::Serde(e.to_string())),
                StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => Err(RemoteClientError::Auth),
                s if s.is_server_error() => {
                    let status = s.as_u16();
                    let body = res.text().await.unwrap_or_default();
                    Err(RemoteClientError::Http { status, body })
                }
                s => {
                    let status = s.as_u16();
                    let body = res.text().await.unwrap_or_default();
                    Err(RemoteClientError::Http { status, body })
                }
            }
        })
        .retry(
            &ExponentialBuilder::default()
                .with_min_delay(Duration::from_secs(1))
                .with_max_delay(Duration::from_secs(30))
                .with_max_times(3)
                .with_jitter(),
        )
        .when(|e: &RemoteClientError| e.should_retry())
        .notify(|e, dur| {
            warn!(
                "Remote call failed, retrying after {:.2}s: {}",
                dur.as_secs_f64(),
                e
            )
        })
        .await
    }

    fn map_api_error<T>(&self, err: RemoteClientError) -> Result<T, RemoteClientError> {
        if let RemoteClientError::Http { body, .. } = &err
            && let Ok(api_err) = serde_json::from_str::<ApiErrorResponse>(body)
        {
            return Err(RemoteClientError::Api(map_error_code(Some(&api_err.error))));
        }
        Err(err)
    }

    fn map_poll_error(
        &self,
        err: RemoteClientError,
    ) -> Result<DevicePollResponse, RemoteClientError> {
        if let RemoteClientError::Http { body, .. } = &err
            && let Ok(poll_raw) = serde_json::from_str::<DevicePollResponse>(body)
        {
            return Ok(poll_raw);
        }
        Err(err)
    }
}

fn map_reqwest_error(e: reqwest::Error) -> RemoteClientError {
    if e.is_timeout() {
        RemoteClientError::Timeout
    } else if e.is_connect() || e.is_request() || e.is_body() {
        RemoteClientError::Transport(e.to_string())
    } else {
        RemoteClientError::Transport(e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_map_error_code_variants() {
        assert!(matches!(
            map_error_code(Some("unsupported_provider")),
            DeviceFlowErrorCode::UnsupportedProvider
        ));
        assert!(matches!(
            map_error_code(Some("provider_error")),
            DeviceFlowErrorCode::ProviderError
        ));
        assert!(matches!(
            map_error_code(Some("not_found")),
            DeviceFlowErrorCode::NotFound
        ));
        assert!(matches!(
            map_error_code(Some("expired")),
            DeviceFlowErrorCode::Expired
        ));
        assert!(matches!(
            map_error_code(Some("expired_token")),
            DeviceFlowErrorCode::Expired
        ));
        assert!(matches!(
            map_error_code(Some("access_denied")),
            DeviceFlowErrorCode::AccessDenied
        ));
        assert!(matches!(
            map_error_code(Some("internal_error")),
            DeviceFlowErrorCode::InternalError
        ));
        assert!(matches!(
            map_error_code(Some("user_fetch_failed")),
            DeviceFlowErrorCode::UserFetchFailed
        ));
        assert!(matches!(
            map_error_code(Some("unknown_code")),
            DeviceFlowErrorCode::Other(_)
        ));
        assert!(matches!(
            map_error_code(None),
            DeviceFlowErrorCode::InternalError
        ));
    }

    #[test]
    fn test_should_retry() {
        assert!(RemoteClientError::Transport("conn reset".into()).should_retry());
        assert!(RemoteClientError::Timeout.should_retry());
        assert!(
            RemoteClientError::Http {
                status: 500,
                body: "".into()
            }
            .should_retry()
        );
        assert!(
            RemoteClientError::Http {
                status: 503,
                body: "".into()
            }
            .should_retry()
        );

        assert!(
            !RemoteClientError::Http {
                status: 400,
                body: "".into()
            }
            .should_retry()
        );
        assert!(
            !RemoteClientError::Http {
                status: 404,
                body: "".into()
            }
            .should_retry()
        );
        assert!(!RemoteClientError::Auth.should_retry());
        assert!(!RemoteClientError::Url("bad url".into()).should_retry());
    }

    #[test]
    fn test_map_api_error() {
        let client = RemoteClient::new("http://localhost:8081").unwrap();

        let json_body = r#"{"error":"expired"}"#;
        let http_err = RemoteClientError::Http {
            status: 400,
            body: json_body.to_string(),
        };

        let result: Result<String, RemoteClientError> = client.map_api_error(http_err);
        assert!(matches!(
            result,
            Err(RemoteClientError::Api(DeviceFlowErrorCode::Expired))
        ));

        let non_json_err = RemoteClientError::Http {
            status: 500,
            body: "plain text error".to_string(),
        };
        let result: Result<String, RemoteClientError> = client.map_api_error(non_json_err.clone());
        assert!(matches!(result, Err(RemoteClientError::Http { .. })));
    }
}
