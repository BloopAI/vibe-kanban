use anyhow::Error;
use executors::{executors::BaseCodingAgent, profile::ExecutorProfileId};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
pub use v11::{
    EditorConfig, EditorType, GitHubConfig, NotificationConfig, ShowcaseState, SoundFile,
    ThemeMode, UiLanguage,
};

use crate::services::config::versions::v11;

fn default_git_branch_prefix() -> String {
    "vk".to_string()
}

fn default_pr_auto_description_enabled() -> bool {
    true
}

fn default_git_auto_commit_enabled() -> bool {
    true
}

fn default_font_family() -> Option<String> {
    None
}

fn default_use_google_fonts() -> bool {
    true
}

fn default_discord_counter_enabled() -> bool {
    true
}

fn default_git_commit_title_mode() -> GitCommitTitleMode {
    GitCommitTitleMode::default()
}

fn default_auto_pr_on_review_enabled() -> bool {
    false
}

fn default_auto_pr_draft() -> bool {
    true
}

/// modo de generación del título de commit para auto-commits
#[derive(Clone, Debug, Serialize, Deserialize, TS, Default, PartialEq)]
pub enum GitCommitTitleMode {
    /// usa el summary del agente (comportamiento actual)
    #[default]
    AgentSummary,
    /// genera el título usando un prompt personalizable
    AiGenerated,
    /// el usuario provee el título manualmente (se encola el commit)
    Manual,
}

/// prompt por defecto para generación de títulos de commit
pub const DEFAULT_COMMIT_TITLE_PROMPT: &str = r#"Generate a concise git commit title for the following changes.
Follow conventional commits format: type(scope): description
Types: feat, fix, docs, style, refactor, perf, test, chore
Keep it under 72 characters.
Only output the commit title, nothing else."#;

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
    pub workspace_dir: Option<String>,
    pub last_app_version: Option<String>,
    pub show_release_notes: bool,
    #[serde(default)]
    pub language: UiLanguage,
    #[serde(default = "default_git_branch_prefix")]
    pub git_branch_prefix: String,
    #[serde(default)]
    pub showcases: ShowcaseState,
    #[serde(default = "default_pr_auto_description_enabled")]
    pub pr_auto_description_enabled: bool,
    #[serde(default)]
    pub pr_auto_description_prompt: Option<String>,
    /// cuando está habilitado, el agente hará commit automático después de cambios exitosos
    #[serde(default = "default_git_auto_commit_enabled")]
    pub git_auto_commit_enabled: bool,
    /// custom font family override (system fonts will be used if None)
    #[serde(default = "default_font_family")]
    pub font_family: Option<String>,
    /// cuando está habilitado, se cargarán las fuentes de Google (Chivo Mono, Inter, JetBrains Mono)
    #[serde(default = "default_use_google_fonts")]
    pub use_google_fonts: bool,
    /// cuando está habilitado, se muestra el contador de usuarios online de Discord en la barra de navegación
    #[serde(default = "default_discord_counter_enabled")]
    pub discord_counter_enabled: bool,
    /// modo de generación del título de commit para auto-commits
    #[serde(default = "default_git_commit_title_mode")]
    pub git_commit_title_mode: GitCommitTitleMode,
    /// prompt personalizado para generación de títulos de commit (modo AiGenerated)
    #[serde(default)]
    pub git_commit_title_prompt: Option<String>,
    /// cuando está habilitado, se crea automáticamente un PR cuando la tarea pasa a "In Review"
    #[serde(default = "default_auto_pr_on_review_enabled")]
    pub auto_pr_on_review_enabled: bool,
    /// cuando está habilitado, los PRs automáticos se crean como draft
    #[serde(default = "default_auto_pr_draft")]
    pub auto_pr_draft: bool,
}

impl Config {
    fn from_v11_config(old_config: v11::Config) -> Self {
        Self {
            config_version: "v12".to_string(),
            theme: old_config.theme,
            executor_profile: old_config.executor_profile,
            disclaimer_acknowledged: old_config.disclaimer_acknowledged,
            onboarding_acknowledged: old_config.onboarding_acknowledged,
            notifications: old_config.notifications,
            editor: old_config.editor,
            github: old_config.github,
            analytics_enabled: old_config.analytics_enabled,
            workspace_dir: old_config.workspace_dir,
            last_app_version: old_config.last_app_version,
            show_release_notes: old_config.show_release_notes,
            language: old_config.language,
            git_branch_prefix: old_config.git_branch_prefix,
            showcases: old_config.showcases,
            pr_auto_description_enabled: old_config.pr_auto_description_enabled,
            pr_auto_description_prompt: old_config.pr_auto_description_prompt,
            git_auto_commit_enabled: old_config.git_auto_commit_enabled,
            font_family: old_config.font_family,
            use_google_fonts: old_config.use_google_fonts,
            discord_counter_enabled: old_config.discord_counter_enabled,
            // nuevos campos con valores por defecto
            git_commit_title_mode: GitCommitTitleMode::default(),
            git_commit_title_prompt: None,
            auto_pr_on_review_enabled: false,
            auto_pr_draft: true,
        }
    }

    pub fn from_previous_version(raw_config: &str) -> Result<Self, Error> {
        let old_config = v11::Config::from(raw_config.to_string());
        Ok(Self::from_v11_config(old_config))
    }
}

impl From<String> for Config {
    fn from(raw_config: String) -> Self {
        if let Ok(config) = serde_json::from_str::<Config>(&raw_config)
            && config.config_version == "v12"
        {
            return config;
        }

        match Self::from_previous_version(&raw_config) {
            Ok(config) => {
                tracing::info!("Config upgraded to v12");
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
            config_version: "v12".to_string(),
            theme: ThemeMode::System,
            executor_profile: ExecutorProfileId::new(BaseCodingAgent::ClaudeCode),
            disclaimer_acknowledged: false,
            onboarding_acknowledged: false,
            notifications: NotificationConfig::default(),
            editor: EditorConfig::default(),
            github: GitHubConfig::default(),
            analytics_enabled: true,
            workspace_dir: None,
            last_app_version: None,
            show_release_notes: false,
            language: UiLanguage::default(),
            git_branch_prefix: default_git_branch_prefix(),
            showcases: ShowcaseState::default(),
            pr_auto_description_enabled: true,
            pr_auto_description_prompt: None,
            git_auto_commit_enabled: true,
            font_family: None,
            use_google_fonts: true,
            discord_counter_enabled: true,
            git_commit_title_mode: GitCommitTitleMode::default(),
            git_commit_title_prompt: None,
            auto_pr_on_review_enabled: false,
            auto_pr_draft: true,
        }
    }
}
