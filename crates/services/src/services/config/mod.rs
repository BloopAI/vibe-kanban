use std::path::PathBuf;

use thiserror::Error;

mod versions;

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error("Validation error: {0}")]
    ValidationError(String),
}

pub type Config = versions::v8::Config;
pub type NotificationConfig = versions::v8::NotificationConfig;
pub type EditorConfig = versions::v8::EditorConfig;
pub type ThemeMode = versions::v8::ThemeMode;
pub type SoundFile = versions::v8::SoundFile;
pub type EditorType = versions::v8::EditorType;
pub type GitPlatformConfig = versions::v8::GitPlatformConfig;
pub type GitPlatformType = versions::v8::GitPlatformType;
pub type UiLanguage = versions::v8::UiLanguage;

// Backwards compatibility alias
pub type GitHubConfig = versions::v7::GitHubConfig;

/// Will always return config, trying old schemas or eventually returning default
pub async fn load_config_from_file(config_path: &PathBuf) -> Config {
    match std::fs::read_to_string(config_path) {
        Ok(raw_config) => Config::from(raw_config),
        Err(_) => {
            tracing::info!("No config file found, creating one");
            Config::default()
        }
    }
}

/// Saves the config to the given path
pub async fn save_config_to_file(
    config: &Config,
    config_path: &PathBuf,
) -> Result<(), ConfigError> {
    let raw_config = serde_json::to_string_pretty(config)?;
    std::fs::write(config_path, raw_config)?;
    Ok(())
}
