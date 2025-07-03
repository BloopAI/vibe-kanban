use std::time::Duration;

use anyhow::Result;
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

    pub async fn track_event(
        &self,
        user_id: &str,
        event_name: &str,
        properties: Option<Value>,
    ) -> Result<()> {
        if !self.is_enabled() {
            tracing::warn!("Analytics are disabled");
            return Ok(());
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

        match self
            .client
            .post(&endpoint)
            .header("Content-Type", "application/json")
            .json(&json!({
                "api_key": self.config.posthog_api_key,
                "event": event_name,
                "distinct_id": user_id,
                "properties": event_properties
            }))
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
                tracing::error!("Error sending event: {}", e);
            }
        }

        Ok(())
    }
}

pub fn generate_user_id() -> String {
    use std::{
        collections::hash_map::DefaultHasher,
        hash::{Hash, Hasher},
    };

    let mut hasher = DefaultHasher::new();

    // Use system information to create a consistent but anonymous ID
    if let Ok(hostname) = std::env::var("HOSTNAME") {
        hostname.hash(&mut hasher);
    }
    if let Ok(user) = std::env::var("USER") {
        user.hash(&mut hasher);
    }
    if let Ok(home) = std::env::var("HOME") {
        home.hash(&mut hasher);
    }

    // Add some system-specific info for better uniqueness
    #[cfg(target_os = "macos")]
    {
        // Use hardware UUID which is more stable than system_profiler output
        if let Ok(output) = std::process::Command::new("system_profiler")
            .arg("SPHardwareDataType")
            .arg("-xml")
            .output()
        {
            if let Ok(hardware_info) = String::from_utf8(output.stdout) {
                // Look for Hardware UUID in the XML output
                if let Some(start) = hardware_info.find("<key>platform_UUID</key>") {
                    if let Some(uuid_start) = hardware_info[start..].find("<string>") {
                        if let Some(uuid_end) =
                            hardware_info[start + uuid_start + 8..].find("</string>")
                        {
                            let uuid = &hardware_info
                                [start + uuid_start + 8..start + uuid_start + 8 + uuid_end];
                            uuid.hash(&mut hasher);
                        }
                    }
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        // Try multiple sources for better uniqueness
        if let Ok(machine_id) = std::fs::read_to_string("/etc/machine-id") {
            machine_id.trim().hash(&mut hasher);
        } else if let Ok(machine_id) = std::fs::read_to_string("/var/lib/dbus/machine-id") {
            machine_id.trim().hash(&mut hasher);
        }

        // Also try /proc/sys/kernel/random/boot_id for additional entropy
        if let Ok(boot_id) = std::fs::read_to_string("/proc/sys/kernel/random/boot_id") {
            boot_id.trim().hash(&mut hasher);
        }
    }

    #[cfg(target_os = "windows")]
    {
        // Use Windows Machine GUID
        if let Ok(output) = std::process::Command::new("wmic")
            .arg("csproduct")
            .arg("get")
            .arg("UUID")
            .arg("/value")
            .output()
        {
            if let Ok(uuid_info) = String::from_utf8(output.stdout) {
                uuid_info.hash(&mut hasher);
            }
        }
    }

    format!("anon_{:x}", hasher.finish())
}
