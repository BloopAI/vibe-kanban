use std::path::PathBuf;

use anyhow::Error;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;
use utils::{assets::SoundAssets, cache_dir};

use crate::services::config::versions::v1;

// Alias types that are the same as v1
pub type ThemeMode = v1::ThemeMode;
pub type EditorConfig = v1::EditorConfig;
pub type SoundFile = v1::SoundFile;
pub type EditorType = v1::EditorType;

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct Config {
    pub config_schema: String,
    pub theme: ThemeMode,
    pub profile: String,
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
        let old_config = serde_json::from_str::<v1::Config>(raw_config)?;
        let old_config_clone = old_config.clone();

        let mut onboarding_acknowledged = old_config.onboarding_acknowledged;

        // Map old executors to new profiles
        let profile: &str = match old_config.executor {
            v1::ExecutorConfig::Claude => "claude-code",
            v1::ExecutorConfig::ClaudePlan => "claude-plan",
            v1::ExecutorConfig::Amp => "amp",
            v1::ExecutorConfig::Gemini => "gemini",
            _ => {
                onboarding_acknowledged = false; // Reset the user's onboarding if executor is not supported
                "claude-code"
            }
        };

        Ok(Self {
            config_schema: "v2".to_string(),
            theme: old_config.theme,
            profile: profile.to_string(),
            disclaimer_acknowledged: old_config.disclaimer_acknowledged,
            onboarding_acknowledged: onboarding_acknowledged,
            github_login_acknowledged: old_config.github_login_acknowledged,
            telemetry_acknowledged: old_config.telemetry_acknowledged,
            notifications: NotificationConfig::from(old_config_clone),
            editor: old_config.editor,
            github: GitHubConfig::from(old_config.github),
            analytics_enabled: None,
            workspace_dir: None,
        })
    }
}

impl From<String> for Config {
    fn from(raw_config: String) -> Self {
        let value_config: Value = serde_json::from_str(&raw_config).unwrap();
        let config: Config = serde_json::from_value(value_config).unwrap();
        config
    }
}

impl Default for Config {
    fn default() -> Self {
        Self {
            config_schema: "v2".to_string(),
            theme: ThemeMode::System,
            profile: String::from("claude-code"),
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

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct GitHubConfig {
    pub pat: Option<String>,
    pub oauth_token: Option<String>,
    pub username: Option<String>,
    pub primary_email: Option<String>,
    pub default_pr_base: Option<String>,
}

impl From<v1::GitHubConfig> for GitHubConfig {
    fn from(old: v1::GitHubConfig) -> Self {
        Self {
            pat: old.pat,
            oauth_token: old.token, // Map to new field name
            username: old.username,
            primary_email: old.primary_email,
            default_pr_base: old.default_pr_base,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct NotificationConfig {
    pub sound_enabled: bool,
    pub push_enabled: bool,
    pub sound_file: SoundFile,
}

impl From<v1::Config> for NotificationConfig {
    fn from(old: v1::Config) -> Self {
        Self {
            sound_enabled: old.sound_alerts,
            push_enabled: old.push_notifications,
            sound_file: old.sound_file,
        }
    }
}

impl Default for NotificationConfig {
    fn default() -> Self {
        Self {
            sound_enabled: true,
            push_enabled: true,
            sound_file: SoundFile::CowMooing,
        }
    }
}

impl Default for GitHubConfig {
    fn default() -> Self {
        Self {
            pat: None,
            oauth_token: None,
            username: None,
            primary_email: None,
            default_pr_base: Some("main".to_string()),
        }
    }
}

impl GitHubConfig {
    pub fn token(&self) -> Option<String> {
        self.pat
            .as_deref()
            .or(self.oauth_token.as_deref())
            .map(|s| s.to_string())
    }
}

impl SoundFile {
    pub fn to_filename(&self) -> &'static str {
        match self {
            SoundFile::AbstractSound1 => "abstract-sound1.wav",
            SoundFile::AbstractSound2 => "abstract-sound2.wav",
            SoundFile::AbstractSound3 => "abstract-sound3.wav",
            SoundFile::AbstractSound4 => "abstract-sound4.wav",
            SoundFile::CowMooing => "cow-mooing.wav",
            SoundFile::PhoneVibration => "phone-vibration.wav",
            SoundFile::Rooster => "rooster.wav",
        }
    }

    // load the sound file from the embedded assets or cache
    pub async fn serve(&self) -> Result<rust_embed::EmbeddedFile, Error> {
        match SoundAssets::get(self.to_filename()) {
            Some(content) => Ok(content),
            None => {
                tracing::error!("Sound file not found: {}", self.to_filename());
                return Err(anyhow::anyhow!(
                    "Sound file not found: {}",
                    self.to_filename()
                ));
            }
        }
    }
    /// Get or create a cached sound file with the embedded sound data
    pub async fn get_path(&self) -> Result<PathBuf, Box<dyn std::error::Error + Send + Sync>> {
        use std::io::Write;

        let filename = self.to_filename();
        let cache_dir = cache_dir();
        let cached_path = cache_dir.join(format!("sound-{}", filename));

        // Check if cached file already exists and is valid
        if cached_path.exists() {
            // Verify file has content (basic validation)
            if let Ok(metadata) = std::fs::metadata(&cached_path) {
                if metadata.len() > 0 {
                    return Ok(cached_path);
                }
            }
        }

        // File doesn't exist or is invalid, create it
        let sound_data = SoundAssets::get(filename)
            .ok_or_else(|| format!("Embedded sound file not found: {}", filename))?
            .data;

        // Ensure cache directory exists
        std::fs::create_dir_all(&cache_dir)
            .map_err(|e| format!("Failed to create cache directory: {}", e))?;

        let mut file = std::fs::File::create(&cached_path)
            .map_err(|e| format!("Failed to create cached sound file: {}", e))?;

        file.write_all(&sound_data)
            .map_err(|e| format!("Failed to write sound data to cached file: {}", e))?;

        drop(file); // Ensure file is closed

        Ok(cached_path)
    }
}
