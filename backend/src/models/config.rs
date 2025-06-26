use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::executor::ExecutorConfig;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Config {
    pub theme: ThemeMode,
    pub executor: ExecutorConfig,
    pub disclaimer_acknowledged: bool,
    pub onboarding_acknowledged: bool,
    pub sound_alerts: bool,
    pub sound_file: SoundFile,
    pub push_notifications: bool,
    pub editor: EditorConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "lowercase")]
pub enum ThemeMode {
    Light,
    Dark,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct EditorConfig {
    pub editor_type: EditorType,
    pub custom_command: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "lowercase")]
pub enum EditorType {
    VSCode,
    Cursor,
    Windsurf,
    IntelliJ,
    Zed,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "kebab-case")]
pub enum SoundFile {
    AbstractSound1,
    AbstractSound2,
    AbstractSound3,
    AbstractSound4,
    CowMooing,
    PhoneVibration,
    Rooster,
}

// Constants for frontend
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct EditorConstants {
    pub editor_types: Vec<EditorType>,
    pub editor_labels: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct SoundConstants {
    pub sound_files: Vec<SoundFile>,
    pub sound_labels: Vec<String>,
}

impl EditorConstants {
    pub fn new() -> Self {
        Self {
            editor_types: vec![
                EditorType::VSCode,
                EditorType::Cursor,
                EditorType::Windsurf,
                EditorType::IntelliJ,
                EditorType::Zed,
                EditorType::Custom,
            ],
            editor_labels: vec![
                "VS Code".to_string(),
                "Cursor".to_string(),
                "Windsurf".to_string(),
                "IntelliJ IDEA".to_string(),
                "Zed".to_string(),
                "Custom".to_string(),
            ],
        }
    }
}

impl Default for EditorConstants {
    fn default() -> Self {
        Self::new()
    }
}

impl SoundConstants {
    pub fn new() -> Self {
        Self {
            sound_files: vec![
                SoundFile::AbstractSound1,
                SoundFile::AbstractSound2,
                SoundFile::AbstractSound3,
                SoundFile::AbstractSound4,
                SoundFile::CowMooing,
                SoundFile::PhoneVibration,
                SoundFile::Rooster,
            ],
            sound_labels: vec![
                "Gentle Chime".to_string(),
                "Soft Bell".to_string(),
                "Digital Tone".to_string(),
                "Subtle Alert".to_string(),
                "Cow Mooing".to_string(),
                "Phone Vibration".to_string(),
                "Rooster Call".to_string(),
            ],
        }
    }
}

impl Default for SoundConstants {
    fn default() -> Self {
        Self::new()
    }
}

impl Default for Config {
    fn default() -> Self {
        Self {
            theme: ThemeMode::System,
            executor: ExecutorConfig::Claude,
            disclaimer_acknowledged: false,
            onboarding_acknowledged: false,
            sound_alerts: true,
            sound_file: SoundFile::AbstractSound4,
            push_notifications: true,
            editor: EditorConfig::default(),
        }
    }
}

impl Default for EditorConfig {
    fn default() -> Self {
        Self {
            editor_type: EditorType::VSCode,
            custom_command: None,
        }
    }
}

impl EditorConfig {
    pub fn get_command(&self) -> Vec<String> {
        match &self.editor_type {
            EditorType::VSCode => vec!["code".to_string()],
            EditorType::Cursor => vec!["cursor".to_string()],
            EditorType::Windsurf => vec!["windsurf".to_string()],
            EditorType::IntelliJ => vec!["idea".to_string()],
            EditorType::Zed => vec!["zed".to_string()],
            EditorType::Custom => {
                if let Some(custom) = &self.custom_command {
                    custom.split_whitespace().map(|s| s.to_string()).collect()
                } else {
                    vec!["code".to_string()] // fallback to VSCode
                }
            }
        }
    }
}

impl SoundFile {
    pub fn to_filename(&self) -> &'static str {
        match self {
            SoundFile::AbstractSound1 => "abstract-sound1.mp3",
            SoundFile::AbstractSound2 => "abstract-sound2.mp3",
            SoundFile::AbstractSound3 => "abstract-sound3.mp3",
            SoundFile::AbstractSound4 => "abstract-sound4.mp3",
            SoundFile::CowMooing => "cow-mooing.mp3",
            SoundFile::PhoneVibration => "phone-vibration.mp3",
            SoundFile::Rooster => "rooster.mp3",
        }
    }

    pub fn to_path(&self) -> PathBuf {
        PathBuf::from("backend/sounds").join(self.to_filename())
    }
}

impl Config {
    pub fn load(config_path: &PathBuf) -> anyhow::Result<Self> {
        if config_path.exists() {
            let content = std::fs::read_to_string(config_path)?;

            // Try to deserialize as is first
            match serde_json::from_str::<Config>(&content) {
                Ok(config) => Ok(config),
                Err(_) => {
                    // If full deserialization fails, merge with defaults
                    let config = Self::load_with_defaults(&content, config_path)?;
                    Ok(config)
                }
            }
        } else {
            let config = Config::default();
            config.save(config_path)?;
            Ok(config)
        }
    }

    fn load_with_defaults(content: &str, config_path: &PathBuf) -> anyhow::Result<Self> {
        // Parse as generic JSON value
        let existing_value: serde_json::Value = serde_json::from_str(content)?;

        // Get default config as JSON value
        let default_config = Config::default();
        let default_value = serde_json::to_value(&default_config)?;

        // Merge existing config with defaults
        let merged_value = Self::merge_json_values(default_value, existing_value);

        // Deserialize merged value back to Config
        let config: Config = serde_json::from_value(merged_value)?;

        // Save the updated config with any missing defaults
        config.save(config_path)?;

        Ok(config)
    }

    fn merge_json_values(
        mut base: serde_json::Value,
        overlay: serde_json::Value,
    ) -> serde_json::Value {
        match (&mut base, overlay) {
            (serde_json::Value::Object(base_map), serde_json::Value::Object(overlay_map)) => {
                for (key, value) in overlay_map {
                    base_map
                        .entry(key)
                        .and_modify(|base_value| {
                            *base_value =
                                Self::merge_json_values(base_value.clone(), value.clone());
                        })
                        .or_insert(value);
                }
                base
            }
            (_, overlay) => overlay, // Use overlay value for non-objects
        }
    }

    pub fn save(&self, config_path: &PathBuf) -> anyhow::Result<()> {
        let content = serde_json::to_string_pretty(self)?;
        std::fs::write(config_path, content)?;
        Ok(())
    }
}
