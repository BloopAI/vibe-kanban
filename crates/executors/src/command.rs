use std::{collections::HashMap, path::PathBuf};

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use ts_rs::TS;
use workspace_utils::shell::resolve_executable_path;

use crate::executors::ExecutorError;

#[derive(Debug, Error)]
pub enum CommandBuildError {
    #[error("base command cannot be parsed: {0}")]
    InvalidBase(String),
    #[error("base command is empty after parsing")]
    EmptyCommand,
    #[error("failed to quote command: {0}")]
    QuoteError(#[from] shlex::QuoteError),
    #[error("invalid shell parameters: {0}")]
    InvalidShellParams(String),
}

#[derive(Debug, Clone)]
pub struct CommandParts {
    program: String,
    args: Vec<String>,
}

impl CommandParts {
    pub fn new(program: String, args: Vec<String>) -> Self {
        Self { program, args }
    }

    pub async fn into_resolved(self) -> Result<(PathBuf, Vec<String>), ExecutorError> {
        let CommandParts { program, args } = self;
        let executable = resolve_executable_path(&program)
            .await
            .ok_or(ExecutorError::ExecutableNotFound { program })?;
        Ok((executable, args))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema, Default)]
pub struct CmdOverrides {
    #[schemars(
        title = "Base Command Override",
        description = "Override the base command with a custom command"
    )]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base_command_override: Option<String>,
    #[schemars(
        title = "Additional Parameters",
        description = "Additional parameters to append to the base command"
    )]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub additional_params: Option<Vec<String>>,
    #[schemars(
        title = "Environment Variables",
        description = "Environment variables to set when running the executor"
    )]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub env: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema)]
pub struct CommandBuilder {
    /// Base executable command (e.g., "npx -y @anthropic-ai/claude-code@latest")
    pub base: String,
    /// Optional parameters to append to the base command
    pub params: Option<Vec<String>>,
}

impl CommandBuilder {
    pub fn new<S: Into<String>>(base: S) -> Self {
        Self {
            base: base.into(),
            params: None,
        }
    }

    pub fn params<I>(mut self, params: I) -> Self
    where
        I: IntoIterator,
        I::Item: Into<String>,
    {
        self.params = Some(params.into_iter().map(|p| p.into()).collect());
        self
    }

    pub fn override_base<S: Into<String>>(mut self, base: S) -> Self {
        self.base = base.into();
        self
    }

    fn extend_shell_params<I>(mut self, more: I) -> Result<Self, CommandBuildError>
    where
        I: IntoIterator,
        I::Item: Into<String>,
    {
        let joined = more
            .into_iter()
            .map(|p| p.into())
            .collect::<Vec<String>>()
            .join(" ");

        let extra: Vec<String> = split_command_line(&joined)
            .map_err(|err| CommandBuildError::InvalidShellParams(format!("{joined}: {err}")))?;

        match &mut self.params {
            Some(p) => p.extend(extra),
            None => self.params = Some(extra),
        }
        Ok(self)
    }

    pub fn extend_params<I>(mut self, more: I) -> Self
    where
        I: IntoIterator,
        I::Item: Into<String>,
    {
        let extra: Vec<String> = more.into_iter().map(|p| p.into()).collect();
        match &mut self.params {
            Some(p) => p.extend(extra),
            None => self.params = Some(extra),
        }
        self
    }

    pub fn build_initial(&self) -> Result<CommandParts, CommandBuildError> {
        self.build(&[])
    }

    pub fn build_follow_up(
        &self,
        additional_args: &[String],
    ) -> Result<CommandParts, CommandBuildError> {
        self.build(additional_args)
    }

    fn build(&self, additional_args: &[String]) -> Result<CommandParts, CommandBuildError> {
        let mut parts = vec![];
        let base_parts = split_command_line(&self.base)?;
        parts.extend(base_parts);
        if let Some(ref params) = self.params {
            parts.extend(params.clone());
        }
        parts.extend(additional_args.iter().cloned());

        if parts.is_empty() {
            return Err(CommandBuildError::EmptyCommand);
        }

        let program = parts.remove(0);
        Ok(CommandParts::new(program, parts))
    }
}

fn split_command_line(input: &str) -> Result<Vec<String>, CommandBuildError> {
    #[cfg(windows)]
    {
        let parts = winsplit::split(input);
        if parts.is_empty() {
            Err(CommandBuildError::EmptyCommand)
        } else {
            Ok(parts)
        }
    }

    #[cfg(not(windows))]
    {
        shlex::split(input).ok_or_else(|| CommandBuildError::InvalidBase(input.to_string()))
    }
}

pub fn apply_overrides(
    builder: CommandBuilder,
    overrides: &CmdOverrides,
) -> Result<CommandBuilder, CommandBuildError> {
    let builder = if let Some(ref base) = overrides.base_command_override {
        builder.override_base(base.clone())
    } else {
        builder
    };
    if let Some(ref extra) = overrides.additional_params {
        builder.extend_shell_params(extra.clone())
    } else {
        Ok(builder)
    }
}
