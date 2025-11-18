use std::path::PathBuf;

use anyhow::Error;
use serde::{Deserialize, Serialize};
use strum_macros::EnumString;
use ts_rs::TS;
use utils::{assets::SoundAssets, cache_dir};

// Re-export editor config from the dedicated editor module
pub use crate::services::config::editor::{EditorConfig, EditorType};
use crate::services::config::versions::v1;

// Keep the From conversions here since v1 types are only accessible within versions module
impl From<v1::EditorConfig> for EditorConfig {
    fn from(old: v1::EditorConfig) -> Self {
        EditorConfig::new(
            EditorType::from(old.editor_type),
            old.custom_command,
            None,
            None,
        )
    }
}

impl From<v1::EditorType> for EditorType {
    fn from(old: v1::EditorType) -> Self {
        match old {
            v1::EditorType::VsCode => EditorType::VsCode,
            v1::EditorType::Cursor => EditorType::Cursor,
            v1::EditorType::Windsurf => EditorType::Windsurf,
            v1::EditorType::IntelliJ => EditorType::IntelliJ,
            v1::EditorType::Zed => EditorType::Zed,
            v1::EditorType::Custom => EditorType::Custom,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct Config {
    pub config_version: String,
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
        let old_config = match serde_json::from_str::<v1::Config>(raw_config) {
            Ok(cfg) => cfg,
            Err(e) => {
                tracing::error!("❌ Failed to parse config: {}", e);
                tracing::error!("   at line {}, column {}", e.line(), e.column());
                return Err(e.into());
            }
        };

        let old_config_clone = old_config.clone();

        let mut onboarding_acknowledged = old_config.onboarding_acknowledged;

        // Map old executors to new profiles
        let profile: &str = match old_config.executor {
            v1::ExecutorConfig::Claude => "claude-code",
            v1::ExecutorConfig::ClaudeCodeRouter => "claude-code",
            v1::ExecutorConfig::ClaudePlan => "claude-code-plan",
            v1::ExecutorConfig::Amp => "amp",
            v1::ExecutorConfig::Gemini => "gemini",
            v1::ExecutorConfig::SstOpencode => "opencode",
            _ => {
                onboarding_acknowledged = false; // Reset the user's onboarding if executor is not supported
                "claude-code"
            }
        };

        Ok(Self {
            config_version: "v2".to_string(),
            theme: ThemeMode::from(old_config.theme), // Now SCREAMING_SNAKE_CASE
            profile: profile.to_string(),
            disclaimer_acknowledged: old_config.disclaimer_acknowledged,
            onboarding_acknowledged,
            github_login_acknowledged: old_config.github_login_acknowledged,
            telemetry_acknowledged: old_config.telemetry_acknowledged,
            notifications: NotificationConfig::from(old_config_clone),
            editor: EditorConfig::from(old_config.editor),
            github: GitHubConfig::from(old_config.github),
            analytics_enabled: None,
            workspace_dir: None,
        })
    }
}

impl From<String> for Config {
    fn from(raw_config: String) -> Self {
        if let Ok(config) = serde_json::from_str(&raw_config) {
            config
        } else if let Ok(config) = Self::from_previous_version(&raw_config) {
            tracing::info!("Config upgraded from previous version");
            config
        } else {
            tracing::warn!("Config reset to default");
            Self::default()
        }
    }
}

impl Default for Config {
    fn default() -> Self {
        Self {
            config_version: "v2".to_string(),
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
            sound_file: SoundFile::from(old.sound_file), // Now SCREAMING_SNAKE_CASE
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

#[derive(Debug, Clone, Serialize, Deserialize, TS, EnumString)]
#[ts(use_ts_enum)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[strum(serialize_all = "SCREAMING_SNAKE_CASE")]
pub enum SoundFile {
    AbstractSound1,
    AbstractSound2,
    AbstractSound3,
    AbstractSound4,
    CowMooing,
    PhoneVibration,
    Rooster,
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
                Err(anyhow::anyhow!(
                    "Sound file not found: {}",
                    self.to_filename()
                ))
            }
        }
    }
    /// Get or create a cached sound file with the embedded sound data
    pub async fn get_path(&self) -> Result<PathBuf, Box<dyn std::error::Error + Send + Sync>> {
        use std::io::Write;

        let filename = self.to_filename();
        let cache_dir = cache_dir();
        let cached_path = cache_dir.join(format!("sound-{filename}"));

        // Check if cached file already exists and is valid
        if cached_path.exists() {
            // Verify file has content (basic validation)
            if let Ok(metadata) = std::fs::metadata(&cached_path)
                && metadata.len() > 0
            {
                return Ok(cached_path);
            }
        }

        // File doesn't exist or is invalid, create it
        let sound_data = SoundAssets::get(filename)
            .ok_or_else(|| format!("Embedded sound file not found: {filename}"))?
            .data;

        // Ensure cache directory exists
        std::fs::create_dir_all(&cache_dir)
            .map_err(|e| format!("Failed to create cache directory: {e}"))?;

        let mut file = std::fs::File::create(&cached_path)
            .map_err(|e| format!("Failed to create cached sound file: {e}"))?;

        file.write_all(&sound_data)
            .map_err(|e| format!("Failed to write sound data to cached file: {e}"))?;

        drop(file); // Ensure file is closed

        Ok(cached_path)
    }
}

impl From<v1::SoundFile> for SoundFile {
    fn from(old: v1::SoundFile) -> Self {
        match old {
            v1::SoundFile::AbstractSound1 => SoundFile::AbstractSound1,
            v1::SoundFile::AbstractSound2 => SoundFile::AbstractSound2,
            v1::SoundFile::AbstractSound3 => SoundFile::AbstractSound3,
            v1::SoundFile::AbstractSound4 => SoundFile::AbstractSound4,
            v1::SoundFile::CowMooing => SoundFile::CowMooing,
            v1::SoundFile::PhoneVibration => SoundFile::PhoneVibration,
            v1::SoundFile::Rooster => SoundFile::Rooster,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, EnumString)]
#[ts(use_ts_enum)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[strum(serialize_all = "SCREAMING_SNAKE_CASE")]
pub enum ThemeMode {
    Light,
    Dark,
    System,
    Purple,
    Green,
    Blue,
    Orange,
    Red,
}

impl From<v1::ThemeMode> for ThemeMode {
    fn from(old: v1::ThemeMode) -> Self {
        match old {
            v1::ThemeMode::Light => ThemeMode::Light,
            v1::ThemeMode::Dark => ThemeMode::Dark,
            v1::ThemeMode::System => ThemeMode::System,
            v1::ThemeMode::Purple => ThemeMode::Purple,
            v1::ThemeMode::Green => ThemeMode::Green,
            v1::ThemeMode::Blue => ThemeMode::Blue,
            v1::ThemeMode::Orange => ThemeMode::Orange,
            v1::ThemeMode::Red => ThemeMode::Red,
        }
    }
}
