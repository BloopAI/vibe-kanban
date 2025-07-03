use std::{
    collections::hash_map::DefaultHasher,
    hash::{Hash, Hasher},
    time::Duration,
};

use serde_json::{json, Value};

#[derive(Debug, Clone)]
pub struct AnalyticsConfig {
    pub posthog_api_key: String,
    pub posthog_api_endpoint: String,
    pub enabled: bool,
}

impl AnalyticsConfig {
    pub fn new(user_enabled: bool) -> Self {
        let api_key = std::env::var("POSTHOG_API_KEY").unwrap_or_default();
        let api_endpoint = std::env::var("POSTHOG_API_ENDPOINT").unwrap_or_default();

        let enabled = user_enabled && !api_key.is_empty() && !api_endpoint.is_empty();

        Self {
            posthog_api_key: api_key,
            posthog_api_endpoint: api_endpoint,
            enabled,
        }
    }
}

#[derive(Debug)]
pub struct AnalyticsService {
    config: AnalyticsConfig,
    client: reqwest::Client,
}

impl AnalyticsService {
    pub fn new(config: AnalyticsConfig) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .unwrap();

        Self { config, client }
    }

    pub fn is_enabled(&self) -> bool {
        self.config.enabled && !self.config.posthog_api_key.is_empty()
    }

    pub fn track_event(&self, user_id: &str, event_name: &str, properties: Option<Value>) {
        if !self.is_enabled() {
            tracing::warn!("Analytics are disabled");
            return;
        }

        let endpoint = format!(
            "{}/capture/",
            self.config.posthog_api_endpoint.trim_end_matches('/')
        );

        let mut event_properties = properties.unwrap_or_else(|| json!({}));
        if let Some(props) = event_properties.as_object_mut() {
            props.insert(
                "timestamp".to_string(),
                json!(chrono::Utc::now().to_rfc3339()),
            );
        }

        let payload = json!({
            "api_key": self.config.posthog_api_key,
            "event": event_name,
            "distinct_id": user_id,
            "properties": event_properties
        });

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
                Ok(response) => {
                    if response.status().is_success() {
                        tracing::info!("Event '{}' sent successfully", event_name);
                    } else {
                        let status = response.status();
                        let response_text = response.text().await.unwrap_or_default();
                        tracing::error!(
                            "Failed to send event. Status: {}. Response: {}",
                            status,
                            response_text
                        );
                    }
                }
                Err(e) => {
                    tracing::error!("Error sending event '{}': {}", event_name, e);
                }
            }
        });
    }
}

/// Generates a consistent, anonymous user ID for npm package telemetry.
/// Returns a hex string prefixed with "npm_user_"
pub fn generate_user_id() -> String {
    let mut hasher = DefaultHasher::new();

    #[cfg(target_os = "macos")]
    {
        // Use ioreg to get hardware UUID
        if let Ok(output) = std::process::Command::new("ioreg")
            .args(["-rd1", "-c", "IOPlatformExpertDevice"])
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if let Some(line) = stdout.lines().find(|l| l.contains("IOPlatformUUID")) {
                line.hash(&mut hasher);
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(machine_id) = std::fs::read_to_string("/etc/machine-id") {
            machine_id.trim().hash(&mut hasher);
        }
    }

    #[cfg(target_os = "windows")]
    {
        // Use PowerShell to get machine GUID from registry
        if let Ok(output) = std::process::Command::new("powershell")
            .args(&[
                "-NoProfile",
                "-Command",
                "(Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Cryptography').MachineGuid",
            ])
            .output()
        {
            if output.status.success() {
                output.stdout.hash(&mut hasher);
            }
        }
    }

    // Add username for per-user differentiation
    if let Ok(user) = std::env::var("USER").or_else(|_| std::env::var("USERNAME")) {
        user.hash(&mut hasher);
    }

    // Add home directory for additional entropy
    if let Ok(home) = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")) {
        home.hash(&mut hasher);
    }

    format!("npm_user_{:016x}", hasher.finish())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_user_id_format() {
        let id = generate_user_id();
        assert!(id.starts_with("npm_user_"));
        assert_eq!(id.len(), 25);
    }

    #[test]
    fn test_consistency() {
        let id1 = generate_user_id();
        let id2 = generate_user_id();
        assert_eq!(id1, id2, "ID should be consistent across calls");
    }
}
