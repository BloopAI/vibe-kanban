use serde::{Deserialize, Serialize};

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
pub(super) enum ExecutorConfig {
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(super) enum ThemeMode {
    Light,
    Dark,
    System,
    Purple,
    Green,
    Blue,
    Orange,
    Red,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(super) struct EditorConfig {
    pub editor_type: EditorType,
    pub custom_command: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(super) struct GitHubConfig {
    pub pat: Option<String>,
    pub token: Option<String>,
    pub username: Option<String>,
    pub primary_email: Option<String>,
    pub default_pr_base: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(super) enum EditorType {
    VsCode,
    Cursor,
    Windsurf,
    IntelliJ,
    Zed,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub(super) enum SoundFile {
    AbstractSound1,
    AbstractSound2,
    AbstractSound3,
    AbstractSound4,
    CowMooing,
    PhoneVibration,
    Rooster,
}
