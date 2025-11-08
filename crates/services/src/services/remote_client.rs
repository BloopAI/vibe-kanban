use std::time::Duration;

use backon::{ExponentialBuilder, Retryable};
use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tracing::warn;
use url::Url;
use utils::api::oauth::{
    DeviceInitResponse as DeviceInitOk, DevicePollResponse as DevicePollRaw, ProfileResponse,
};
use uuid::Uuid;

#[derive(Debug, Error)]
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
    pub fn should_retry(&self) -> bool {
        match self {
            Self::Transport(_) | Self::Timeout => true,
            Self::Http { status, .. } => (500..=599).contains(status),
            _ => false,
        }
    }
}

#[derive(Debug, Clone)]
pub enum DeviceFlowErrorCode {
    UnsupportedProvider,
    ProviderError,
    NotFound,
    Expired,
    AccessDenied,
    InternalError,
    UserFetchFailed,
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

#[derive(Debug, Clone)]
pub enum DevicePollResult {
    Pending,
    Success { access_token: String },
    Error { code: DeviceFlowErrorCode },
}

#[derive(Deserialize)]
struct ApiErrorResponse {
    error: String,
}

#[derive(Debug, Clone)]
pub struct RemoteClient {
    base: Url,
    http: Client,
}

impl RemoteClient {
    pub fn new(base_url: &str) -> Result<Self, RemoteClientError> {
        let base = Url::parse(base_url).map_err(|e| RemoteClientError::Url(e.to_string()))?;
        let http = Client::builder()
            .timeout(Duration::from_secs(10))
            .user_agent("remote-client/1.0")
            .build()
            .map_err(|e| RemoteClientError::Transport(e.to_string()))?;
        Ok(Self { base, http })
    }

    pub async fn device_init(&self, provider: &str) -> Result<DeviceInitOk, RemoteClientError> {
        #[derive(Serialize)]
        struct DeviceInitRequest<'a> {
            provider: &'a str,
        }

        self.post_json("/device-init", &DeviceInitRequest { provider })
            .await
            .or_else(|e| self.map_api_error(e))
    }

    pub async fn device_poll(
        &self,
        handoff_id: Uuid,
    ) -> Result<DevicePollResult, RemoteClientError> {
        #[derive(Serialize)]
        struct DevicePollRequest {
            handoff_id: Uuid,
        }

        let raw: DevicePollRaw = self
            .post_json("/device-poll", &DevicePollRequest { handoff_id })
            .await
            .or_else(|e| self.map_poll_error(e))?;

        Ok(match raw.status.as_str() {
            "pending" => DevicePollResult::Pending,
            "success" => DevicePollResult::Success {
                access_token: raw
                    .access_token
                    .unwrap_or_else(|| String::from("missing_token")),
            },
            _ => DevicePollResult::Error {
                code: map_error_code(raw.error.as_deref()),
            },
        })
    }

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
            && let Ok(api_err) = serde_json::from_str::<ApiErrorResponse>(body) {
                return Err(RemoteClientError::Api(map_error_code(Some(&api_err.error))));
            }
        Err(err)
    }

    fn map_poll_error(&self, err: RemoteClientError) -> Result<DevicePollRaw, RemoteClientError> {
        if let RemoteClientError::Http { body, .. } = &err
            && let Ok(poll_raw) = serde_json::from_str::<DevicePollRaw>(body) {
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
