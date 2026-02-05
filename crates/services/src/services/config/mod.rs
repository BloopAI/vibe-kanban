use std::path::PathBuf;

use thiserror::Error;

pub mod editor;
mod versions;

pub use editor::EditorOpenError;

pub const DEFAULT_PR_DESCRIPTION_PROMPT: &str = r#"Update the PR that was just created with a better title and description.
The PR number is #{pr_number} and the URL is {pr_url}.

Analyze the changes in this branch and write:
1. A concise, descriptive title that summarizes the changes, postfixed with "(Vibe Kanban)"
2. A detailed description that explains:
   - What changes were made
   - Why they were made (based on the task context)
   - Any important implementation details
   - At the end, include a note: "This PR was written using [Vibe Kanban](https://vibekanban.com)"

Use the appropriate CLI tool to update the PR (gh pr edit for GitHub, az repos pr update for Azure DevOps)."#;

pub const DEFAULT_COMMIT_REMINDER_PROMPT: &str = "There are uncommitted changes. Please stage and commit them now with a descriptive commit message.";

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
pub type GitHubConfig = versions::v8::GitHubConfig;
pub type UiLanguage = versions::v8::UiLanguage;
pub type ShowcaseState = versions::v8::ShowcaseState;
pub type SendMessageShortcut = versions::v8::SendMessageShortcut;

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
