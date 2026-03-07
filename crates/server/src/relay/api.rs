//! HTTP client for communicating with the relay server.
//!
//! Handles session creation (Bearer-authenticated) and proxy requests
//! (both Bearer-authenticated and signature-authenticated).

use anyhow::Context as _;
use ed25519_dalek::SigningKey;
use relay_control::signing;
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use utils::response::ApiResponse;
use uuid::Uuid;

#[derive(Debug, Clone, Deserialize)]
struct CreateRelaySessionResponse {
    session_id: Uuid,
}

#[derive(Debug, Clone)]
pub struct RemoteSession {
    pub host_id: Uuid,
    pub id: Uuid,
}

#[derive(Debug, Clone)]
pub struct RelayApiClient {
    http: reqwest::Client,
    access_token: String,
}

impl RelayApiClient {
    pub fn new(access_token: String) -> Self {
        Self {
            http: reqwest::Client::new(),
            access_token,
        }
    }

    fn authenticated_post(&self, url: String) -> reqwest::RequestBuilder {
        self.http
            .post(url)
            .header("X-Client-Version", env!("CARGO_PKG_VERSION"))
            .header("X-Client-Type", "local-backend")
            .bearer_auth(&self.access_token)
    }

    pub async fn create_session(&self, host_id: Uuid) -> anyhow::Result<RemoteSession> {
        let relay_base = super::relay_api_base()
            .ok_or_else(|| anyhow::anyhow!("VK_SHARED_RELAY_API_BASE is not configured"))?;
        let url = format!("{relay_base}/v1/relay/create/{host_id}");
        let response = self
            .authenticated_post(url)
            .send()
            .await
            .context("Failed to create relay session")?;
        let status = response.status();

        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to create relay session (status {status}): {body}");
        }

        let res = response
            .json::<CreateRelaySessionResponse>()
            .await
            .context("Failed to decode relay session response")?;

        Ok(RemoteSession {
            host_id,
            id: res.session_id,
        })
    }

    pub async fn post_session_api<TPayload, TData>(
        &self,
        remote_session: &RemoteSession,
        path: &str,
        payload: &TPayload,
    ) -> anyhow::Result<TData>
    where
        TPayload: Serialize,
        TData: for<'de> Deserialize<'de>,
    {
        let session_url = super::relay_session_url(remote_session.host_id, remote_session.id)
            .ok_or_else(|| anyhow::anyhow!("VK_SHARED_RELAY_API_BASE is not configured"))?;
        let url = format!("{session_url}{path}");
        let response = self
            .authenticated_post(url)
            .json(payload)
            .send()
            .await
            .with_context(|| format!("Relay request failed for '{path}'"))?;
        let status = response.status();
        let response_json = response
            .json::<ApiResponse<TData>>()
            .await
            .with_context(|| format!("Failed to parse relay response for '{path}'"))?;

        if !status.is_success() {
            let message = response_json.message().unwrap_or("Relay request failed");
            anyhow::bail!("{message} (status {status})");
        }

        if !response_json.is_success() {
            let message = response_json.message().unwrap_or("Relay request failed");
            anyhow::bail!("{message}");
        }

        response_json
            .into_data()
            .ok_or_else(|| anyhow::anyhow!("Relay response was missing data"))
    }
}

/// Make a signed GET request through the relay proxy for a given host/session.
///
/// Uses Ed25519 signature headers since this goes through the public relay proxy path.
pub async fn get_signed_relay_api<TData>(
    host_id: Uuid,
    session_id: Uuid,
    path: &str,
    signing_key: &SigningKey,
    signing_session_id: &str,
) -> anyhow::Result<TData>
where
    TData: DeserializeOwned,
{
    let session_url = super::relay_session_url(host_id, session_id)
        .ok_or_else(|| anyhow::anyhow!("VK_SHARED_RELAY_API_BASE is not configured"))?;
    let url = format!("{session_url}{path}");
    let sig = signing::build_request_signature(signing_key, signing_session_id, "GET", path, &[]);

    let response = reqwest::Client::new()
        .get(url)
        .header(signing::SIGNING_SESSION_HEADER, &sig.signing_session_id)
        .header(signing::TIMESTAMP_HEADER, sig.timestamp.to_string())
        .header(signing::NONCE_HEADER, &sig.nonce)
        .header(signing::REQUEST_SIGNATURE_HEADER, &sig.signature_b64)
        .send()
        .await
        .with_context(|| format!("Relay request failed for '{path}'"))?;

    let status = response.status();
    let payload = response
        .json::<ApiResponse<TData>>()
        .await
        .with_context(|| format!("Failed to decode relay response for '{path}'"))?;

    if !status.is_success() || !payload.is_success() {
        let message = payload
            .message()
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| format!("Relay request failed for '{path}'"));
        anyhow::bail!("{message}");
    }

    payload
        .into_data()
        .ok_or_else(|| anyhow::anyhow!("Missing response data for relay path '{path}'"))
}
