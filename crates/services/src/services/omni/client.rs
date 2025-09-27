use super::types::{OmniInstance, RawOmniInstance, SendTextRequest, SendTextResponse};
use anyhow::Result;

pub struct OmniClient {
    base_url: String,
    api_key: Option<String>,
    client: reqwest::Client,
}

impl OmniClient {
    pub fn new(base_url: String, api_key: Option<String>) -> Self {
        Self {
            base_url,
            api_key,
            client: reqwest::Client::new(),
        }
    }

    pub async fn list_instances(&self) -> Result<Vec<OmniInstance>> {
        let url = if self.base_url.ends_with("/api/v1") || self.base_url.contains("/api/v1/") {
            format!("{}/instances", self.base_url.trim_end_matches('/'))
        } else {
            format!("{}/api/v1/instances", self.base_url.trim_end_matches('/'))
        };

        let mut request = self.client.get(url);

        if let Some(key) = &self.api_key {
            request = request.header("X-API-Key", key);
        }

        let response: Vec<RawOmniInstance> = request.send().await?.json().await?;

        let instances = response.into_iter().map(OmniInstance::from).collect();

        Ok(instances)
    }

    pub async fn send_text(
        &self,
        instance: &str,
        req: SendTextRequest,
    ) -> Result<SendTextResponse> {
        let url = if self.base_url.ends_with("/api/v1") || self.base_url.contains("/api/v1/") {
            format!("{}/instance/{}/send-text", self.base_url.trim_end_matches('/'), instance)
        } else {
            format!("{}/api/v1/instance/{}/send-text", self.base_url.trim_end_matches('/'), instance)
        };

        let mut request = self.client.post(url).json(&req);

        if let Some(key) = &self.api_key {
            request = request.header("X-API-Key", key);
        }

        let response = request.send().await?.json().await?;

        Ok(response)
    }
}
