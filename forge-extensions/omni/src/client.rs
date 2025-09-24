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
        let mut request = self
            .client
            .get(format!("{}/api/v1/instances/", self.base_url));

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
        let mut request = self
            .client
            .post(format!(
                "{}/api/v1/instance/{}/send-text",
                self.base_url, instance
            ))
            .json(&req);

        if let Some(key) = &self.api_key {
            request = request.header("X-API-Key", key);
        }

        let response = request.send().await?.json().await?;

        Ok(response)
    }
}
