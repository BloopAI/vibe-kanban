use anyhow::Error;
use executors::command::ProfileVariant;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
pub use v2::{EditorConfig, EditorType, GitHubConfig, NotificationConfig, SoundFile, ThemeMode};

use crate::services::config::versions::v2;

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct Config {
    pub config_version: String,
    pub theme: ThemeMode,
    pub profile: ProfileVariant,
    pub disclaimer_acknowledged: bool,
    pub onboarding_acknowledged: bool,
    pub github_login_acknowledged: bool,
    pub telemetry_acknowledged: bool,
    pub notifications: NotificationConfig,
    pub editor: EditorConfig,
    pub github: GitHubConfig,
    pub analytics_enabled: Option<bool>,
    pub workspace_dir: Option<String>,
}

impl Config {
    pub fn from_previous_version(raw_config: &str) -> Result<Self, Error> {
        let old_config = match serde_json::from_str::<v2::Config>(raw_config) {
            Ok(cfg) => cfg,
            Err(e) => {
                tracing::error!("❌ Failed to parse config: {}", e);
                tracing::error!("   at line {}, column {}", e.line(), e.column());
                return Err(e.into());
            }
        };
        let mut onboarding_acknowledged = old_config.onboarding_acknowledged;
        let profile = match old_config.profile.as_str() {
            "claude-code" => ProfileVariant::default("claude-code".to_string()),
            "claude-code-plan" => {
                ProfileVariant::with_variant("claude-code".to_string(), "plan".to_string())
            }
            "claude-code-router" => {
                ProfileVariant::with_variant("claude-code".to_string(), "router".to_string())
            }
            "amp" => ProfileVariant::default("amp".to_string()),
            "gemini" => ProfileVariant::default("gemini".to_string()),
            "codex" => ProfileVariant::default("codex".to_string()),
            "opencode" => ProfileVariant::default("opencode".to_string()),
            "qwen-code" => ProfileVariant::default("qwen-code".to_string()),
            _ => {
                onboarding_acknowledged = false; // Reset the user's onboarding if executor is not supported
                ProfileVariant::default("claude-code".to_string())
            }
        };

        Ok(Self {
            config_version: "v4".to_string(),
            theme: old_config.theme,
            profile: profile,
            disclaimer_acknowledged: old_config.disclaimer_acknowledged,
            onboarding_acknowledged: onboarding_acknowledged,
            github_login_acknowledged: old_config.github_login_acknowledged,
            telemetry_acknowledged: old_config.telemetry_acknowledged,
            notifications: old_config.notifications,
            editor: old_config.editor,
            github: old_config.github,
            analytics_enabled: old_config.analytics_enabled,
            workspace_dir: old_config.workspace_dir,
        })
    }
}

impl From<String> for Config {
    fn from(raw_config: String) -> Self {
        if let Ok(config) = serde_json::from_str::<Config>(&raw_config) {
            if config.config_version == "v4" {
                return config;
            }
        }

        match Self::from_previous_version(&raw_config) {
            Ok(config) => {
                tracing::info!("Config upgraded to v3");
                config
            }
            Err(e) => {
                tracing::warn!("Config migration failed: {}, using default", e);
                Self::default()
            }
        }
    }
}

impl Default for Config {
    fn default() -> Self {
        Self {
            config_version: "v4".to_string(),
            theme: ThemeMode::System,
            profile: ProfileVariant::default("claude-code".to_string()),
            disclaimer_acknowledged: false,
            onboarding_acknowledged: false,
            github_login_acknowledged: false,
            telemetry_acknowledged: false,
            notifications: NotificationConfig::default(),
            editor: EditorConfig::default(),
            github: GitHubConfig::default(),
            analytics_enabled: None,
            workspace_dir: None,
        }
    }
}
