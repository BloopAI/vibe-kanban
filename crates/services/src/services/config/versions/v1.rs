use std::str::FromStr;

use serde::{Deserialize, Serialize};
use strum_macros::EnumString;
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(super) struct Config {
    pub(super) theme: ThemeMode,
    pub(super) executor: ExecutorConfig,
    pub(super) disclaimer_acknowledged: bool,
    pub(super) onboarding_acknowledged: bool,
    pub(super) github_login_acknowledged: bool,
    pub(super) telemetry_acknowledged: bool,
    pub(super) sound_alerts: bool,
    pub(super) sound_file: SoundFile,
    pub(super) push_notifications: bool,
    pub(super) editor: EditorConfig,
    pub(super) github: GitHubConfig,
    pub(super) analytics_enabled: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub(crate) enum ExecutorConfig {
    Echo,
    Claude,
    ClaudePlan,
    Amp,
    Gemini,
    #[serde(alias = "setup_script")]
    SetupScript {
        script: String,
    },
    ClaudeCodeRouter,
    #[serde(alias = "charmopencode")]
    CharmOpencode,
    #[serde(alias = "opencode")]
    SstOpencode,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
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

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct EditorConfig {
    editor_type: EditorType,
    custom_command: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(super) struct GitHubConfig {
    pub(super) pat: Option<String>,
    pub(super) token: Option<String>,
    pub(super) username: Option<String>,
    pub(super) primary_email: Option<String>,
    pub(super) default_pr_base: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, EnumString)]
#[ts(use_ts_enum)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[strum(serialize_all = "SCREAMING_SNAKE_CASE")]
pub enum EditorType {
    VsCode,
    Cursor,
    Windsurf,
    IntelliJ,
    Zed,
    Custom,
}

impl Default for EditorConfig {
    fn default() -> Self {
        Self {
            editor_type: EditorType::VsCode,
            custom_command: None,
        }
    }
}

impl EditorConfig {
    pub fn get_command(&self) -> Vec<String> {
        match &self.editor_type {
            EditorType::VsCode => vec!["code".to_string()],
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

    pub fn open_file(&self, path: &str) -> Result<(), std::io::Error> {
        let command = self.get_command();
        let mut cmd = std::process::Command::new(&command[0]);
        for arg in &command[1..] {
            cmd.arg(arg);
        }
        cmd.arg(path);
        cmd.spawn()?;
        Ok(())
    }

    pub fn with_override(&self, editor_type_str: Option<&str>) -> Self {
        if let Some(editor_type_str) = editor_type_str {
            let editor_type =
                EditorType::from_str(editor_type_str).unwrap_or(self.editor_type.clone());
            EditorConfig {
                editor_type,
                custom_command: self.custom_command.clone(),
            }
        } else {
            self.clone()
        }
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
// Constants for frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
struct EditorConstants {
    editor_types: Vec<EditorType>,
    editor_labels: Vec<String>,
}
