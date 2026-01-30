use std::time::Duration;

use serde_json::{Value, json};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct AnalyticsConfig {
    pub posthog_api_key: String,
    pub posthog_api_endpoint: String,
}

impl AnalyticsConfig {
    pub fn from_env() -> Option<Self> {
        let api_key = std::env::var("POSTHOG_API_KEY").ok()?;
        let api_endpoint = std::env::var("POSTHOG_API_ENDPOINT").ok()?;
        Some(Self {
            posthog_api_key: api_key,
            posthog_api_endpoint: api_endpoint,
        })
    }
}

#[derive(Clone, Debug)]
pub struct AnalyticsService {
    config: AnalyticsConfig,
    client: reqwest::Client,
}

impl AnalyticsService {
    pub fn new(config: AnalyticsConfig) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .expect("failed to build analytics HTTP client");
        Self { config, client }
    }

    pub fn track(&self, user_id: Uuid, event_name: &str, properties: Value) {
        let endpoint = format!(
            "{}/capture/",
            self.config.posthog_api_endpoint.trim_end_matches('/')
        );

        let payload = if event_name == "$identify" {
            json!({
                "api_key": self.config.posthog_api_key,
                "event": event_name,
                "distinct_id": user_id.to_string(),
                "$set": properties,
            })
        } else {
            let mut event_properties = properties;
            if let Some(props) = event_properties.as_object_mut() {
                props.insert(
                    "timestamp".to_string(),
                    json!(chrono::Utc::now().to_rfc3339()),
                );
                props.insert("version".to_string(), json!(env!("CARGO_PKG_VERSION")));
                props.insert("source".to_string(), json!("remote"));
            }
            json!({
                "api_key": self.config.posthog_api_key,
                "event": event_name,
                "distinct_id": user_id.to_string(),
                "properties": event_properties,
            })
        };

        let client = self.client.clone();
        let event_name = event_name.to_string();

        tokio::spawn(async move {
            match client
                .post(&endpoint)
                .header("Content-Type", "application/json")
                .json(&payload)
                .send()
                .await
            {
                Ok(response) if !response.status().is_success() => {
                    tracing::warn!(
                        event = %event_name,
                        status = %response.status(),
                        "analytics event failed"
                    );
                }
                Err(e) => {
                    tracing::warn!(event = %event_name, error = ?e, "analytics request failed");
                }
                _ => {}
            }
        });
    }
}
