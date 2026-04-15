use anyhow::Error;
use executors::{executors::BaseCodingAgent, profile::ExecutorProfileId};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
pub use v10::{
    CodeFont, DevBannerConfig, EditorConfig, EditorType, FontConfig, GitHubConfig,
    NotificationConfig, PaginationConfig, ProseFont, SoundFile, ThemeMode, UiFont, UiLanguage,
};

use crate::services::config::versions::v10;

fn default_git_branch_prefix() -> String {
    "vk".to_string()
}

fn default_timezone() -> String {
    "LOCAL".to_string()
}

fn default_token_timestamp_format() -> String {
    "[HH:mm:ss.SSS dd/MM/yyyy]".to_string()
}

/// Timestamp display configuration
#[derive(Clone, Debug, Serialize, Deserialize, TS, PartialEq)]
#[ts(export)]
pub struct TimestampConfig {
    /// IANA timezone name (e.g., "America/New_York", "Europe/London")
    /// "LOCAL" means use browser's local timezone
    #[serde(default = "default_timezone")]
    pub timezone: String,

    /// Show timestamps on token usage lines
    #[serde(default)]
    pub token_timestamp_enabled: bool,

    /// Format string for token usage timestamps (uses date-fns tokens:
    /// HH=hour, mm=minute, ss=second, SSS=ms, dd=day, MM=month, yyyy=year)
    #[serde(default = "default_token_timestamp_format")]
    pub token_timestamp_format: String,
}

impl Default for TimestampConfig {
    fn default() -> Self {
        Self {
            timezone: default_timezone(),
            token_timestamp_enabled: false,
            token_timestamp_format: default_token_timestamp_format(),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct Config {
    pub config_version: String,
    pub theme: ThemeMode,
    pub executor_profile: ExecutorProfileId,
    pub disclaimer_acknowledged: bool,
    pub onboarding_acknowledged: bool,
    pub notifications: NotificationConfig,
    pub editor: EditorConfig,
    pub github: GitHubConfig,
    /// Deprecated: analytics has been removed. Field kept for config compatibility.
    #[serde(default)]
    pub analytics_enabled: bool,
    /// Deprecated: Sentry error reporting has been removed. Field kept for config compatibility.
    #[serde(default)]
    pub sentry_enabled: bool,
    pub workspace_dir: Option<String>,
    pub last_app_version: Option<String>,
    pub show_release_notes: bool,
    #[serde(default)]
    pub language: UiLanguage,
    #[serde(default = "default_git_branch_prefix")]
    pub git_branch_prefix: String,
    #[serde(default)]
    pub dev_banner: DevBannerConfig,
    /// Pagination settings for log display
    #[serde(default)]
    pub pagination: PaginationConfig,
    /// Font settings for UI, code, and prose contexts
    #[serde(default)]
    pub fonts: FontConfig,
    /// Timestamp display settings
    #[serde(default)]
    pub timestamps: TimestampConfig,
}

impl Config {
    fn from_v10_config(old_config: v10::Config) -> Self {
        Self {
            config_version: "v11".to_string(),
            theme: old_config.theme,
            executor_profile: old_config.executor_profile,
            disclaimer_acknowledged: old_config.disclaimer_acknowledged,
            onboarding_acknowledged: old_config.onboarding_acknowledged,
            notifications: old_config.notifications,
            editor: old_config.editor,
            github: old_config.github,
            analytics_enabled: old_config.analytics_enabled,
            sentry_enabled: old_config.sentry_enabled,
            workspace_dir: old_config.workspace_dir,
            last_app_version: old_config.last_app_version,
            show_release_notes: old_config.show_release_notes,
            language: old_config.language,
            git_branch_prefix: old_config.git_branch_prefix,
            dev_banner: old_config.dev_banner,
            pagination: old_config.pagination,
            fonts: old_config.fonts,
            timestamps: TimestampConfig::default(),
        }
    }

    pub fn from_previous_version(raw_config: &str) -> Result<Self, Error> {
        let old_config = v10::Config::from(raw_config.to_string());
        Ok(Self::from_v10_config(old_config))
    }
}

impl From<String> for Config {
    fn from(raw_config: String) -> Self {
        if let Ok(config) = serde_json::from_str::<Config>(&raw_config)
            && config.config_version == "v11"
        {
            return config;
        }

        match Self::from_previous_version(&raw_config) {
            Ok(config) => {
                tracing::info!("Config upgraded to v11");
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
            config_version: "v11".to_string(),
            theme: ThemeMode::System,
            executor_profile: ExecutorProfileId::new(BaseCodingAgent::ClaudeCode),
            disclaimer_acknowledged: false,
            onboarding_acknowledged: false,
            notifications: NotificationConfig::default(),
            editor: EditorConfig::default(),
            github: GitHubConfig::default(),
            analytics_enabled: false,
            sentry_enabled: false,
            workspace_dir: None,
            last_app_version: None,
            show_release_notes: false,
            language: UiLanguage::default(),
            git_branch_prefix: default_git_branch_prefix(),
            dev_banner: DevBannerConfig::default(),
            pagination: PaginationConfig::default(),
            fonts: FontConfig::default(),
            timestamps: TimestampConfig::default(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_timestamp_config() {
        let config = TimestampConfig::default();
        assert_eq!(config.timezone, "LOCAL");
    }

    #[test]
    fn test_default_config_has_v11_version() {
        let config = Config::default();
        assert_eq!(config.config_version, "v11");
        assert_eq!(config.timestamps.timezone, "LOCAL");
    }

    #[test]
    fn test_v10_migrates_to_v11_with_default_timestamps() {
        let v10_json = r#"{
            "config_version": "v10",
            "theme": "DARK",
            "executor_profile": {"executor": "CLAUDE_CODE"},
            "disclaimer_acknowledged": true,
            "onboarding_acknowledged": true,
            "notifications": {
                "sound_enabled": true,
                "push_enabled": true,
                "sound_file": "ABSTRACT_SOUND1"
            },
            "editor": {
                "enabled": true,
                "editor_type": "VS_CODE"
            },
            "github": {
                "oauth_token": null
            },
            "analytics_enabled": true,
            "sentry_enabled": false,
            "workspace_dir": null,
            "last_app_version": "1.0.0",
            "show_release_notes": true,
            "language": "EN",
            "git_branch_prefix": "vk",
            "dev_banner": {},
            "pagination": {
                "initial_load": 200,
                "max_limit": 1000
            },
            "fonts": {
                "ui_font": "INTER",
                "code_font": "JET_BRAINS_MONO",
                "prose_font": "INTER",
                "disable_ligatures": false
            }
        }"#;

        let config = Config::from(v10_json.to_string());

        assert_eq!(config.config_version, "v11");
        assert_eq!(config.timestamps.timezone, "LOCAL");
        // Verify other fields migrated correctly
        assert!(config.disclaimer_acknowledged);
        assert!(config.onboarding_acknowledged);
        assert_eq!(config.pagination.initial_load, 200);
    }

    #[test]
    fn test_v11_preserves_timestamp_settings() {
        let v11_json = r#"{
            "config_version": "v11",
            "theme": "LIGHT",
            "executor_profile": {"executor": "CLAUDE_CODE"},
            "disclaimer_acknowledged": true,
            "onboarding_acknowledged": true,
            "notifications": {
                "sound_enabled": true,
                "push_enabled": true,
                "sound_file": "ABSTRACT_SOUND1"
            },
            "editor": {
                "enabled": true,
                "editor_type": "VS_CODE"
            },
            "github": {
                "oauth_token": null
            },
            "analytics_enabled": true,
            "sentry_enabled": false,
            "workspace_dir": null,
            "last_app_version": null,
            "show_release_notes": false,
            "language": "EN",
            "git_branch_prefix": "vk",
            "dev_banner": {},
            "pagination": {
                "initial_load": 100,
                "max_limit": 500
            },
            "fonts": {
                "ui_font": "ROBOTO",
                "code_font": "CASCADIA_MONO",
                "prose_font": "GEORGIA",
                "disable_ligatures": true
            },
            "timestamps": {
                "timezone": "America/New_York"
            }
        }"#;

        let config = Config::from(v11_json.to_string());

        assert_eq!(config.config_version, "v11");
        assert_eq!(config.timestamps.timezone, "America/New_York");
    }

    #[test]
    fn test_v11_without_timestamps_field_uses_defaults() {
        let v11_json = r#"{
            "config_version": "v11",
            "theme": "SYSTEM",
            "executor_profile": {"executor": "CLAUDE_CODE"},
            "disclaimer_acknowledged": false,
            "onboarding_acknowledged": false,
            "notifications": {
                "sound_enabled": true,
                "push_enabled": true,
                "sound_file": "ABSTRACT_SOUND1"
            },
            "editor": {
                "enabled": true,
                "editor_type": "VS_CODE"
            },
            "github": {
                "oauth_token": null
            },
            "workspace_dir": null,
            "last_app_version": null,
            "show_release_notes": false,
            "language": "EN",
            "git_branch_prefix": "vk",
            "dev_banner": {},
            "pagination": {
                "initial_load": 100,
                "max_limit": 500
            },
            "fonts": {}
        }"#;

        let config = Config::from(v11_json.to_string());

        assert_eq!(config.config_version, "v11");
        assert_eq!(config.timestamps.timezone, "LOCAL");
    }

    #[test]
    fn test_timestamp_config_serialization_roundtrip() {
        let config = Config::default();
        let json = serde_json::to_string(&config).unwrap();
        let parsed: Config = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.config_version, "v11");
        assert_eq!(parsed.timestamps.timezone, config.timestamps.timezone);
    }
}
