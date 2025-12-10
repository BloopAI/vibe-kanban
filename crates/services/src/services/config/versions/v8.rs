use anyhow::Error;
use executors::{executors::BaseCodingAgent, profile::ExecutorProfileId};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
pub use v7::{
    EditorConfig, EditorType, GitHubConfig, NotificationConfig, ShowcaseState, SoundFile,
    ThemeMode, UiLanguage,
};

use crate::services::config::versions::v7;

fn default_git_branch_prefix() -> String {
    "vk".to_string()
}

/// Configuration for the development mode banner
#[derive(Clone, Debug, Serialize, Deserialize, TS, Default)]
pub struct DevBannerConfig {
    /// Custom background color (CSS color string), None = default orange
    #[serde(default)]
    pub background_color: Option<String>,
    /// Custom foreground/text color (CSS color string), None = default white
    #[serde(default)]
    pub foreground_color: Option<String>,
    /// Whether to display the system hostname in the banner
    #[serde(default)]
    pub show_hostname: bool,
    /// Whether to display the OS type and version in the banner
    #[serde(default)]
    pub show_os_info: bool,
    /// Whether to hide the Discord link in the navbar (dev mode only)
    #[serde(default)]
    pub hide_discord_link: bool,
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
    pub analytics_enabled: bool,
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
    pub showcases: ShowcaseState,
    #[serde(default)]
    pub dev_banner: DevBannerConfig,
}

impl Config {
    fn from_v7_config(old_config: v7::Config) -> Self {
        // Convert Option<bool> to bool: None or Some(true) become true, Some(false) stays false
        let analytics_enabled = old_config.analytics_enabled.unwrap_or(true);

        Self {
            config_version: "v8".to_string(),
            theme: old_config.theme,
            executor_profile: old_config.executor_profile,
            disclaimer_acknowledged: old_config.disclaimer_acknowledged,
            onboarding_acknowledged: old_config.onboarding_acknowledged,
            notifications: old_config.notifications,
            editor: old_config.editor,
            github: old_config.github,
            analytics_enabled,
            sentry_enabled: false,
            workspace_dir: old_config.workspace_dir,
            last_app_version: old_config.last_app_version,
            show_release_notes: old_config.show_release_notes,
            language: old_config.language,
            git_branch_prefix: old_config.git_branch_prefix,
            showcases: old_config.showcases,
            dev_banner: DevBannerConfig::default(),
        }
    }

    pub fn from_previous_version(raw_config: &str) -> Result<Self, Error> {
        let old_config = v7::Config::from(raw_config.to_string());
        Ok(Self::from_v7_config(old_config))
    }
}

impl From<String> for Config {
    fn from(raw_config: String) -> Self {
        if let Ok(config) = serde_json::from_str::<Config>(&raw_config)
            && config.config_version == "v8"
        {
            return config;
        }

        match Self::from_previous_version(&raw_config) {
            Ok(config) => {
                tracing::info!("Config upgraded to v8");
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
            config_version: "v8".to_string(),
            theme: ThemeMode::System,
            executor_profile: ExecutorProfileId::new(BaseCodingAgent::ClaudeCode),
            disclaimer_acknowledged: false,
            onboarding_acknowledged: false,
            notifications: NotificationConfig::default(),
            editor: EditorConfig::default(),
            github: GitHubConfig::default(),
            analytics_enabled: true,
            sentry_enabled: false,
            workspace_dir: None,
            last_app_version: None,
            show_release_notes: false,
            language: UiLanguage::default(),
            git_branch_prefix: default_git_branch_prefix(),
            showcases: ShowcaseState::default(),
            dev_banner: DevBannerConfig::default(),
        }
    }
}
