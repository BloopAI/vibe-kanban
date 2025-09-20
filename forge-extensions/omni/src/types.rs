use serde::{Deserialize, Serialize};
use ts_rs::TS;

// Match the wish specification exactly - simple flat structure
#[derive(Clone, Debug, Default, Serialize, Deserialize, TS)]
pub struct OmniConfig {
    pub enabled: bool,
    pub host: Option<String>,
    pub api_key: Option<String>,
    pub instance: Option<String>,
    pub recipient: Option<String>, // phone_number or user_id
    pub recipient_type: Option<RecipientType>, // phone or user_id
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub enum RecipientType {
    PhoneNumber,
    UserId,
}

#[derive(Debug, Serialize, Deserialize, TS)]
pub struct OmniInstance {
    pub instance_name: String,
    pub channel_type: String,
    pub display_name: String,
    pub status: String,
    pub is_healthy: bool,
}

impl From<RawOmniInstance> for OmniInstance {
    fn from(raw: RawOmniInstance) -> Self {
        let channel_type = if raw.channel_type.trim().is_empty() {
            "unknown".to_string()
        } else {
            raw.channel_type
        };

        let display_name = raw
            .profile_name
            .clone()
            .filter(|name| !name.trim().is_empty())
            .unwrap_or_else(|| raw.name.clone());

        let status = raw
            .evolution_status
            .as_ref()
            .and_then(|status| status.state.clone())
            .unwrap_or_else(|| {
                if raw.is_active.unwrap_or(false) {
                    "active".to_string()
                } else {
                    "inactive".to_string()
                }
            });

        let is_healthy = raw
            .evolution_status
            .as_ref()
            .map(|status| status.error.is_none())
            .unwrap_or_else(|| raw.is_active.unwrap_or(false));

        OmniInstance {
            instance_name: raw.name,
            channel_type,
            display_name,
            status,
            is_healthy,
        }
    }
}

#[derive(Debug, Deserialize)]
pub(crate) struct RawOmniInstance {
    pub name: String,
    #[serde(default)]
    pub channel_type: String,
    #[serde(default)]
    pub profile_name: Option<String>,
    #[serde(default)]
    pub is_active: Option<bool>,
    #[serde(default)]
    pub evolution_status: Option<RawEvolutionStatus>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct RawEvolutionStatus {
    pub state: Option<String>,
    #[serde(default)]
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SendTextRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub phone_number: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
    pub text: String,
}

#[derive(Debug, Deserialize)]
pub struct SendTextResponse {
    pub success: bool,
    pub message_id: Option<String>,
    pub status: String,
    pub error: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_recipient_type_serialization() {
        let phone = RecipientType::PhoneNumber;
        let json = serde_json::to_string(&phone).unwrap();
        assert_eq!(json, r#""PhoneNumber""#);

        let user = RecipientType::UserId;
        let json = serde_json::to_string(&user).unwrap();
        assert_eq!(json, r#""UserId""#);
    }

    #[test]
    fn test_omni_config_defaults() {
        let config = OmniConfig {
            enabled: false,
            host: Some("https://omni.example.com".to_string()),
            api_key: Some("secret-key".to_string()),
            instance: None,
            recipient: None,
            recipient_type: None,
        };

        assert!(!config.enabled);
        assert_eq!(config.host, Some("https://omni.example.com".to_string()));
        assert!(config.instance.is_none());
        assert!(config.recipient.is_none());
        assert!(config.recipient_type.is_none());
    }

    #[test]
    fn test_send_text_request_serialization() {
        let req = SendTextRequest {
            phone_number: Some("1234567890".to_string()),
            user_id: None,
            text: "Test message".to_string(),
        };

        let json = serde_json::to_string(&req).unwrap();
        assert!(json.contains("phone_number"));
        assert!(!json.contains("user_id")); // Should be skipped when None
        assert!(json.contains("Test message"));
    }

    #[test]
    fn test_raw_instance_conversion() {
        let raw = RawOmniInstance {
            name: "felipe0008".to_string(),
            channel_type: "".to_string(),
            profile_name: Some("Namastex Labs".to_string()),
            is_active: Some(true),
            evolution_status: Some(RawEvolutionStatus {
                state: Some("open".to_string()),
                error: None,
            }),
        };

        let instance: OmniInstance = raw.into();
        assert_eq!(instance.instance_name, "felipe0008");
        assert_eq!(instance.channel_type, "unknown");
        assert_eq!(instance.display_name, "Namastex Labs");
        assert_eq!(instance.status, "open");
        assert!(instance.is_healthy);

        let raw = RawOmniInstance {
            name: "discord-bot".to_string(),
            channel_type: "discord".to_string(),
            profile_name: None,
            is_active: Some(false),
            evolution_status: None,
        };

        let instance: OmniInstance = raw.into();
        assert_eq!(instance.display_name, "discord-bot");
        assert_eq!(instance.status, "inactive");
        assert!(!instance.is_healthy);
    }
}