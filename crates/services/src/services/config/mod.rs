use std::path::PathBuf;

use thiserror::Error;

pub mod editor;
mod versions;

pub use editor::EditorOpenError;

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error("Validation error: {0}")]
    ValidationError(String),
}

pub type Config = versions::v12::Config;
pub type NotificationConfig = versions::v12::NotificationConfig;
pub type EditorConfig = versions::v12::EditorConfig;
pub type ThemeMode = versions::v12::ThemeMode;
pub type SoundFile = versions::v12::SoundFile;
pub type EditorType = versions::v12::EditorType;
pub type GitHubConfig = versions::v12::GitHubConfig;
pub type UiLanguage = versions::v12::UiLanguage;
pub type ShowcaseState = versions::v12::ShowcaseState;

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
