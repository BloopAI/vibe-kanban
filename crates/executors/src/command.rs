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
        let parts = split_windows_command_line(input)?;
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

#[cfg(windows)]
fn split_windows_command_line(input: &str) -> Result<Vec<String>, CommandBuildError> {
    let mut parts = Vec::new();
    let mut current = String::new();
    let mut chars = input.chars().peekable();
    let mut in_single_quote = false;
    let mut in_double_quote = false;
    let mut token_started = false;

    while let Some(ch) = chars.next() {
        match ch {
            '\'' if !in_double_quote => {
                in_single_quote = !in_single_quote;
                token_started = true;
            }
            '"' if !in_single_quote => {
                in_double_quote = !in_double_quote;
                token_started = true;
            }
            '\\' => {
                if matches!(chars.peek(), Some(&'"') | Some(&'\'')) {
                    if let Some(next) = chars.next() {
                        current.push(next);
                    }
                } else {
                    current.push(ch);
                }
                token_started = true;
            }
            ch if ch.is_whitespace() && !in_single_quote && !in_double_quote => {
                if token_started {
                    parts.push(std::mem::take(&mut current));
                    token_started = false;
                }
            }
            _ => {
                current.push(ch);
                token_started = true;
            }
        }
    }

    if in_single_quote || in_double_quote {
        return Err(CommandBuildError::InvalidBase(input.to_string()));
    }

    if token_started {
        parts.push(current);
    }

    Ok(parts)
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
        Ok(builder.extend_params(extra.clone()))
    } else {
        Ok(builder)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_scoped_npm_package_names() {
        let parts = CommandBuilder::new("npx -y @google/gemini-cli@0.29.3")
            .build_initial()
            .expect("command should parse");

        assert_eq!(parts.program, "npx");
        assert_eq!(parts.args, vec!["-y", "@google/gemini-cli@0.29.3"]);
    }

    #[test]
    fn parses_anthropic_scoped_npm_package_name() {
        let parts = CommandBuilder::new("npx -y @anthropic-ai/claude-code@2.1.119")
            .build_initial()
            .expect("command should parse");

        assert_eq!(parts.program, "npx");
        assert_eq!(parts.args, vec!["-y", "@anthropic-ai/claude-code@2.1.119"]);
    }

    #[test]
    fn parses_builtin_scoped_npm_executor_commands() {
        let cases = [
            (
                "npx -y @musistudio/claude-code-router@1.0.66 code",
                vec!["-y", "@musistudio/claude-code-router@1.0.66", "code"],
            ),
            (
                "npx -y @sourcegraph/amp@latest",
                vec!["-y", "@sourcegraph/amp@latest"],
            ),
            (
                "npx -y --package @openai/codex@0.124.0 codex",
                vec!["-y", "--package", "@openai/codex@0.124.0", "codex"],
            ),
            (
                "npx -y @qwen-code/qwen-code@0.9.1",
                vec!["-y", "@qwen-code/qwen-code@0.9.1"],
            ),
            (
                "npx -y @github/copilot@0.0.403",
                vec!["-y", "@github/copilot@0.0.403"],
            ),
        ];

        for (command, expected_args) in cases {
            let parts = CommandBuilder::new(command)
                .build_initial()
                .expect("command should parse");

            assert_eq!(parts.program, "npx");
            assert_eq!(parts.args, expected_args);
        }
    }

    #[test]
    fn parses_builtin_unscoped_and_binary_executor_commands() {
        let cases = [
            (
                "npx -y opencode-ai@1.4.7",
                "npx",
                vec!["-y", "opencode-ai@1.4.7"],
            ),
            ("droid exec", "droid", vec!["exec"]),
            ("cursor-agent", "cursor-agent", vec![]),
        ];

        for (command, expected_program, expected_args) in cases {
            let parts = CommandBuilder::new(command)
                .build_initial()
                .expect("command should parse");

            assert_eq!(parts.program, expected_program);
            assert_eq!(parts.args, expected_args);
        }
    }

    #[test]
    fn parses_quoted_windows_paths() {
        let parts = CommandBuilder::new(
            r#""C:\Program Files\nodejs\npx.cmd" -y @google/gemini-cli@0.29.3"#,
        )
        .build_initial()
        .expect("command should parse");

        assert_eq!(parts.program, r#"C:\Program Files\nodejs\npx.cmd"#);
        assert_eq!(parts.args, vec!["-y", "@google/gemini-cli@0.29.3"]);
    }

    #[test]
    fn base_command_override_preserves_scoped_package_and_params() {
        let builder = CommandBuilder::new("npx -y @google/gemini-cli@0.29.3")
            .extend_params(["--experimental-acp"]);
        let overrides = CmdOverrides {
            base_command_override: Some(
                r#""C:\Program Files\nodejs\npx.cmd" -y @google/gemini-cli@0.29.3"#.to_string(),
            ),
            ..Default::default()
        };

        let parts = apply_overrides(builder, &overrides)
            .expect("overrides should apply")
            .build_initial()
            .expect("command should parse");

        assert_eq!(parts.program, r#"C:\Program Files\nodejs\npx.cmd"#);
        assert_eq!(
            parts.args,
            vec!["-y", "@google/gemini-cli@0.29.3", "--experimental-acp"]
        );
    }

    #[test]
    fn additional_params_preserve_argument_boundaries() {
        let builder = CommandBuilder::new("npx -y @anthropic-ai/claude-code@2.1.119");
        let overrides = CmdOverrides {
            additional_params: Some(vec![
                "--model".to_string(),
                "claude sonnet".to_string(),
                "--flag=value with spaces".to_string(),
            ]),
            ..Default::default()
        };

        let parts = apply_overrides(builder, &overrides)
            .expect("overrides should apply")
            .build_initial()
            .expect("command should parse");

        assert_eq!(
            parts.args,
            vec![
                "-y",
                "@anthropic-ai/claude-code@2.1.119",
                "--model",
                "claude sonnet",
                "--flag=value with spaces",
            ]
        );
    }
}
