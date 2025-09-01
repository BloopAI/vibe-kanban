use anyhow::Error;
use executors::profile::{ExecutorProfileConfigs, ExecutorProfileId};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use utils;
pub use v5::{EditorConfig, EditorType, GitHubConfig, NotificationConfig, SoundFile, ThemeMode};

use crate::services::config::versions::v5;

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct Config {
    pub config_version: String,
    pub theme: ThemeMode,
    pub executor_profile: ExecutorProfileId,
    pub disclaimer_acknowledged: bool,
    pub onboarding_acknowledged: bool,
    pub github_login_acknowledged: bool,
    pub telemetry_acknowledged: bool,
    pub notifications: NotificationConfig,
    pub editor: EditorConfig,
    pub github: GitHubConfig,
    pub analytics_enabled: Option<bool>,
    pub workspace_dir: Option<String>,
    pub last_app_version: Option<String>,
    pub show_release_notes: bool,
}

impl Config {
    pub fn from_previous_version(raw_config: &str) -> Result<Self, Error> {
        let old_config = match serde_json::from_str::<v5::Config>(raw_config) {
            Ok(cfg) => cfg,
            Err(e) => {
                tracing::error!("❌ Failed to parse config: {}", e);
                tracing::error!("   at line {}, column {}", e.line(), e.column());
                return Err(e.into());
            }
        };

        // Backup custom profiles.json if it exists (v6 migration may break compatibility)
        let profiles_path = utils::assets::profiles_path();
        if profiles_path.exists() {
            let backup_name = format!(
                "profiles_v5_backup_{}.json",
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs()
            );
            let backup_path = profiles_path.parent().unwrap().join(backup_name);

            if let Err(e) = std::fs::rename(&profiles_path, &backup_path) {
                tracing::warn!("Failed to backup profiles.json: {}", e);
            } else {
                tracing::info!("Custom profiles.json backed up to {:?}", backup_path);
                tracing::info!("Please review your custom profiles after migration to v6");
            }
        }

        // Validate and convert ProfileVariantLabel to ExecutorProfileId
        let configs = ExecutorProfileConfigs::from_defaults_v3();
        let executor_upper = old_config.profile.profile.to_uppercase();

        let (executor_profile, onboarding_acknowledged) = if let Some(executor_profile) =
            configs.get_executor_profile(&executor_upper)
        {
            // Check if variant exists for this executor
            let variant_upper = old_config
                .profile
                .variant
                .as_ref()
                .map(|v| v.to_uppercase());

            if variant_upper.is_none()
                || executor_profile
                    .configurations
                    .contains_key(variant_upper.as_ref().unwrap())
            {
                // Valid combination
                (
                    ExecutorProfileId {
                        executor: executor_upper,
                        variant: variant_upper,
                    },
                    old_config.onboarding_acknowledged,
                )
            } else {
                // Invalid variant → fallback + reset onboarding
                tracing::warn!(
                    "Invalid executor variant '{}' for executor '{}', falling back to CLAUDE_CODE",
                    variant_upper.as_ref().unwrap(),
                    executor_upper
                );
                (
                    ExecutorProfileId {
                        executor: "CLAUDE_CODE".to_string(),
                        variant: None,
                    },
                    false,
                )
            }
        } else {
            // Invalid executor → fallback + reset onboarding
            tracing::warn!(
                "Invalid executor '{}', falling back to CLAUDE_CODE",
                executor_upper
            );
            (
                ExecutorProfileId {
                    executor: "CLAUDE_CODE".to_string(),
                    variant: None,
                },
                false,
            )
        };

        Ok(Self {
            config_version: "v6".to_string(),
            theme: old_config.theme,
            executor_profile,
            disclaimer_acknowledged: old_config.disclaimer_acknowledged,
            onboarding_acknowledged,
            github_login_acknowledged: old_config.github_login_acknowledged,
            telemetry_acknowledged: old_config.telemetry_acknowledged,
            notifications: old_config.notifications,
            editor: old_config.editor,
            github: old_config.github,
            analytics_enabled: old_config.analytics_enabled,
            workspace_dir: old_config.workspace_dir,
            last_app_version: old_config.last_app_version,
            show_release_notes: old_config.show_release_notes,
        })
    }
}

impl From<String> for Config {
    fn from(raw_config: String) -> Self {
        if let Ok(config) = serde_json::from_str::<Config>(&raw_config)
            && config.config_version == "v6"
        {
            return config;
        }

        match Self::from_previous_version(&raw_config) {
            Ok(config) => {
                tracing::info!("Config upgraded to v6");
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
            config_version: "v6".to_string(),
            theme: ThemeMode::System,
            executor_profile: ExecutorProfileId::new("CLAUDE_CODE".to_string()),
            disclaimer_acknowledged: false,
            onboarding_acknowledged: false,
            github_login_acknowledged: false,
            telemetry_acknowledged: false,
            notifications: NotificationConfig::default(),
            editor: EditorConfig::default(),
            github: GitHubConfig::default(),
            analytics_enabled: None,
            workspace_dir: None,
            last_app_version: None,
            show_release_notes: false,
        }
    }
}
