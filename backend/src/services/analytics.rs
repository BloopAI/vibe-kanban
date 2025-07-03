use anyhow::Result;
use posthog_rs::{client, Event};
use serde_json::Value;

#[derive(Debug, Clone)]
pub struct AnalyticsConfig {
    pub posthog_api_key: String,
    pub enabled: bool,
}

impl AnalyticsConfig {
    pub fn new(posthog_api_key: Option<String>, user_enabled: bool) -> Self {
        let api_key = posthog_api_key
            .or_else(|| std::env::var("POSTHOG_API_KEY").ok())
            .unwrap_or_default();
        let enabled = user_enabled && !api_key.is_empty();

        Self {
            posthog_api_key: api_key,
            enabled,
        }
    }
}

#[derive(Debug)]
pub struct AnalyticsService {
    config: AnalyticsConfig,
}

impl AnalyticsService {
    pub fn new(config: AnalyticsConfig) -> Self {
        Self { config }
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
            return Ok(());
        }

        let analytics_client = client(self.config.posthog_api_key.as_str()).await;
        let mut event = Event::new(event_name, user_id);

        if let Some(Value::Object(map)) = properties {
            for (key, value) in map {
                match value {
                    Value::String(s) => {
                        let _ = event.insert_prop(key, s);
                    }
                    Value::Number(n) => {
                        if let Some(i) = n.as_i64() {
                            let _ = event.insert_prop(key, i);
                        } else if let Some(f) = n.as_f64() {
                            let _ = event.insert_prop(key, f);
                        }
                    }
                    Value::Bool(b) => {
                        let _ = event.insert_prop(key, b);
                    }
                    _ => {
                        let _ = event.insert_prop(key, value.to_string());
                    }
                }
            }
        }

        match analytics_client.capture(event).await {
            Ok(_) => {
                tracing::info!("Sent analytics event");
            }
            Err(e) => tracing::warn!("Failed to send analytics event: {:?}", e),
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
