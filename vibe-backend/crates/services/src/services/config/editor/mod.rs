use std::{path::Path, str::FromStr};

use executors::{command::CommandBuilder, executors::ExecutorError};
use serde::{Deserialize, Serialize};
use strum_macros::{EnumIter, EnumString};
use thiserror::Error;
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS, Error)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(tag = "type", rename_all = "snake_case")]
#[ts(export)]
pub enum EditorOpenError {
    #[error("Editor executable '{executable}' not found in PATH")]
    ExecutableNotFound {
        executable: String,
        editor_type: EditorType,
    },
    #[error("Editor command for {editor_type:?} is invalid: {details}")]
    InvalidCommand {
        details: String,
        editor_type: EditorType,
    },
    #[error("Failed to launch '{executable}' for {editor_type:?}: {details}")]
    LaunchFailed {
        executable: String,
        details: String,
        editor_type: EditorType,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct EditorConfig {
    editor_type: EditorType,
    custom_command: Option<String>,
    #[serde(default)]
    remote_ssh_host: Option<String>,
    #[serde(default)]
    remote_ssh_user: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, EnumString, EnumIter)]
#[ts(use_ts_enum)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[strum(serialize_all = "SCREAMING_SNAKE_CASE")]
pub enum EditorType {
    VsCode,
    Cursor,
    Windsurf,
    IntelliJ,
    Zed,
    Xcode,
    Custom,
}

impl Default for EditorConfig {
    fn default() -> Self {
        Self {
            editor_type: EditorType::VsCode,
            custom_command: None,
            remote_ssh_host: None,
            remote_ssh_user: None,
        }
    }
}

impl EditorConfig {
    /// Create a new EditorConfig. This is primarily used by version migrations.
    pub fn new(
        editor_type: EditorType,
        custom_command: Option<String>,
        remote_ssh_host: Option<String>,
        remote_ssh_user: Option<String>,
    ) -> Self {
        Self {
            editor_type,
            custom_command,
            remote_ssh_host,
            remote_ssh_user,
        }
    }

    pub fn get_command(&self) -> CommandBuilder {
        let base_command = match &self.editor_type {
            EditorType::VsCode => "code",
            EditorType::Cursor => "cursor",
            EditorType::Windsurf => "windsurf",
            EditorType::IntelliJ => "idea",
            EditorType::Zed => "zed",
            EditorType::Xcode => "xed",
            EditorType::Custom => {
                // Custom editor - use user-provided command or fallback to VSCode
                self.custom_command.as_deref().unwrap_or("code")
            }
        };
        CommandBuilder::new(base_command)
    }

    /// Resolve the editor command to an executable path and args.
    /// This is shared logic used by both check_availability() and spawn_local().
    async fn resolve_command(&self) -> Result<(std::path::PathBuf, Vec<String>), EditorOpenError> {
        let command_builder = self.get_command();
        let command_parts =
            command_builder
                .build_initial()
                .map_err(|e| EditorOpenError::InvalidCommand {
                    details: e.to_string(),
                    editor_type: self.editor_type.clone(),
                })?;

        let (executable, args) = command_parts.into_resolved().await.map_err(|e| match e {
            ExecutorError::ExecutableNotFound { program } => EditorOpenError::ExecutableNotFound {
                executable: program,
                editor_type: self.editor_type.clone(),
            },
            _ => EditorOpenError::InvalidCommand {
                details: e.to_string(),
                editor_type: self.editor_type.clone(),
            },
        })?;

        Ok((executable, args))
    }

    /// Check if the editor is available on the system.
    /// Uses the same command resolution logic as spawn_local().
    pub async fn check_availability(&self) -> bool {
        self.resolve_command().await.is_ok()
    }

    pub async fn open_file(&self, path: &Path) -> Result<Option<String>, EditorOpenError> {
        if let Some(url) = self.remote_url(path) {
            return Ok(Some(url));
        }
        self.spawn_local(path).await?;
        Ok(None)
    }

    fn remote_url(&self, path: &Path) -> Option<String> {
        let remote_host = self.remote_ssh_host.as_ref()?;
        let scheme = match self.editor_type {
            EditorType::VsCode => "vscode",
            EditorType::Cursor => "cursor",
            EditorType::Windsurf => "windsurf",
            _ => return None,
        };
        let user_part = self
            .remote_ssh_user
            .as_ref()
            .map(|u| format!("{u}@"))
            .unwrap_or_default();
        // files must contain a line and column number
        let line_col = if path.is_file() { ":1:1" } else { "" };
        let path = path.to_string_lossy();
        Some(format!(
            "{scheme}://vscode-remote/ssh-remote+{user_part}{remote_host}{path}{line_col}"
        ))
    }

    pub async fn spawn_local(&self, path: &Path) -> Result<(), EditorOpenError> {
        let (executable, args) = self.resolve_command().await?;

        let mut cmd = std::process::Command::new(&executable);
        cmd.args(&args).arg(path);
        cmd.spawn().map_err(|e| EditorOpenError::LaunchFailed {
            executable: executable.to_string_lossy().into_owned(),
            details: e.to_string(),
            editor_type: self.editor_type.clone(),
        })?;
        Ok(())
    }

    pub fn with_override(&self, editor_type_str: Option<&str>) -> Self {
        if let Some(editor_type_str) = editor_type_str {
            let editor_type =
                EditorType::from_str(editor_type_str).unwrap_or(self.editor_type.clone());
            EditorConfig {
                editor_type,
                custom_command: self.custom_command.clone(),
                remote_ssh_host: self.remote_ssh_host.clone(),
                remote_ssh_user: self.remote_ssh_user.clone(),
            }
        } else {
            self.clone()
        }
    }
}
