use anyhow::Error;
use executors::{executors::BaseCodingAgent, profile::ExecutorProfileId};
use serde::{Deserialize, Serialize};
use strum_macros::EnumString;
use ts_rs::TS;
pub use v6::{EditorConfig, EditorType, GitHubConfig, NotificationConfig, SoundFile, UiLanguage};

use crate::services::config::versions::v6;

fn default_git_branch_prefix() -> String {
    "vk".to_string()
}

#[derive(Clone, Debug, Serialize, Deserialize, TS, Default)]
pub struct ShowcaseState {
    #[serde(default)]
    pub seen_features: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, EnumString)]
#[ts(use_ts_enum)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[strum(serialize_all = "SCREAMING_SNAKE_CASE")]
pub enum ThemeMode {
    Light,
    Dark,
    System,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct Config {
    pub config_version: String,
    pub theme: ThemeMode,
    pub executor_profile: ExecutorProfileId,
    pub disclaimer_acknowledged: bool,
    pub onboarding_acknowledged: bool,
    pub github_login_acknowledged: bool,
    #[serde(default)]
    pub login_acknowledged: bool,
    pub telemetry_acknowledged: bool,
    pub notifications: NotificationConfig,
    pub editor: EditorConfig,
    pub github: GitHubConfig,
    pub analytics_enabled: Option<bool>,
    pub workspace_dir: Option<String>,
    pub last_app_version: Option<String>,
    pub show_release_notes: bool,
    #[serde(default)]
    pub language: UiLanguage,
    #[serde(default = "default_git_branch_prefix")]
    pub git_branch_prefix: String,
    #[serde(default)]
    pub showcases: ShowcaseState,
}

impl Config {
    pub fn from_previous_version(raw_config: &str) -> Result<Self, Error> {
        let old_config = match serde_json::from_str::<v6::Config>(raw_config) {
            Ok(cfg) => cfg,
            Err(e) => {
                tracing::error!("❌ Failed to parse config: {}", e);
                tracing::error!("   at line {}, column {}", e.line(), e.column());
                return Err(e.into());
            }
        };

        // Map old theme modes to new simplified theme modes
        let theme = match old_config.theme {
            v6::ThemeMode::Light => ThemeMode::Light,
            v6::ThemeMode::Dark => ThemeMode::Dark,
            v6::ThemeMode::System => ThemeMode::System,
            // Map all color themes to System (respects user's OS preference)
            v6::ThemeMode::Purple
            | v6::ThemeMode::Green
            | v6::ThemeMode::Blue
            | v6::ThemeMode::Orange
            | v6::ThemeMode::Red => {
                tracing::info!(
                    "Migrating color theme {:?} to System theme",
                    old_config.theme
                );
                ThemeMode::System
            }
        };

        Ok(Self {
            config_version: "v7".to_string(),
            theme,
            executor_profile: old_config.executor_profile,
            disclaimer_acknowledged: old_config.disclaimer_acknowledged,
            onboarding_acknowledged: old_config.onboarding_acknowledged,
            github_login_acknowledged: old_config.github_login_acknowledged,
            login_acknowledged: false,
            telemetry_acknowledged: old_config.telemetry_acknowledged,
            notifications: old_config.notifications,
            editor: old_config.editor,
            github: old_config.github,
            analytics_enabled: old_config.analytics_enabled,
            workspace_dir: old_config.workspace_dir,
            last_app_version: old_config.last_app_version,
            show_release_notes: old_config.show_release_notes,
            language: old_config.language,
            git_branch_prefix: default_git_branch_prefix(),
            showcases: ShowcaseState::default(),
        })
    }
}

impl From<String> for Config {
    fn from(raw_config: String) -> Self {
        if let Ok(config) = serde_json::from_str::<Config>(&raw_config)
            && config.config_version == "v7"
        {
            return config;
        }

        match Self::from_previous_version(&raw_config) {
            Ok(config) => {
                tracing::info!("Config upgraded to v7");
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
            config_version: "v7".to_string(),
            theme: ThemeMode::System,
            executor_profile: ExecutorProfileId::new(BaseCodingAgent::ClaudeCode),
            disclaimer_acknowledged: false,
            onboarding_acknowledged: false,
            github_login_acknowledged: false,
            login_acknowledged: false,
            telemetry_acknowledged: false,
            notifications: NotificationConfig::default(),
            editor: EditorConfig::default(),
            github: GitHubConfig::default(),
            analytics_enabled: None,
            workspace_dir: None,
            last_app_version: None,
            show_release_notes: false,
            language: UiLanguage::default(),
            git_branch_prefix: default_git_branch_prefix(),
            showcases: ShowcaseState::default(),
        }
    }
}
