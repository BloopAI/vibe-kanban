pub mod normalize_logs;

use std::{
    path::{Path, PathBuf},
    process::Stdio,
    sync::Arc,
};

use async_trait::async_trait;
use command_group::AsyncCommandGroup;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use strum_macros::AsRefStr;
use tokio::process::Command;
use ts_rs::TS;
use workspace_utils::msg_store::MsgStore;

use self::normalize_logs::normalize_logs;
use crate::{
    command::{CmdOverrides, CommandBuildError, CommandBuilder, CommandParts, apply_overrides},
    env::ExecutionEnv,
    executor_discovery::ExecutorDiscoveredOptions,
    executors::{
        AppendPrompt, AvailabilityInfo, BaseCodingAgent, ExecutorError, SlashCommandDescription,
        SpawnedChild, StandardCodingAgentExecutor,
    },
    logs::utils::{EntryIndexProvider, patch},
    model_selector::{ModelInfo, ModelSelectorConfig, PermissionPolicy},
    profile::ExecutorConfig,
};

/// Permission mode for Devin CLI
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema, AsRefStr)]
#[serde(rename_all = "lowercase")]
#[strum(serialize_all = "lowercase")]
pub enum DevinPermissionMode {
    /// Default: auto-approve read-only tools, ask for write/execute
    Auto,
    /// Auto-approve all tools including writes and shell commands
    Dangerous,
}

fn default_permission_mode() -> DevinPermissionMode {
    DevinPermissionMode::Dangerous
}

/// Devin CLI executor configuration
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema)]
pub struct DevinCli {
    #[serde(default)]
    pub append_prompt: AppendPrompt,

    #[serde(default = "default_permission_mode")]
    #[schemars(
        title = "Permission Mode",
        description = "Permission mode: auto (ask for writes) or dangerous (auto-approve all)"
    )]
    pub permission_mode: DevinPermissionMode,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(
        title = "Model",
        description = "Model to use (e.g., opus, sonnet, swe, codex, gemini)"
    )]
    pub model: Option<String>,

    #[serde(flatten)]
    pub cmd: CmdOverrides,
}

impl DevinCli {
    pub fn base_command() -> &'static str {
        "devin"
    }

    fn build_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        let mut builder = CommandBuilder::new(Self::base_command()).params(["-p"]);

        builder = builder.extend_params(["--permission-mode", self.permission_mode.as_ref()]);

        if let Some(model) = &self.model {
            builder = builder.extend_params(["--model", model.as_str()]);
        }

        apply_overrides(builder, &self.cmd)
    }
}

async fn spawn_devin(
    command_parts: CommandParts,
    prompt: &str,
    current_dir: &Path,
    env: &ExecutionEnv,
    cmd_overrides: &CmdOverrides,
) -> Result<SpawnedChild, ExecutorError> {
    let (program_path, mut args) = command_parts.into_resolved().await?;

    // Append `--` separator and prompt as positional arguments
    args.push("--".to_string());
    args.push(prompt.to_string());

    let mut command = Command::new(program_path);
    command
        .kill_on_drop(true)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .current_dir(current_dir)
        .env("NO_COLOR", "1")
        .args(&args);

    env.clone()
        .with_profile(cmd_overrides)
        .apply_to_command(&mut command);

    let child = command.group_spawn()?;

    Ok(child.into())
}

#[async_trait]
impl StandardCodingAgentExecutor for DevinCli {
    fn apply_overrides(&mut self, executor_config: &ExecutorConfig) {
        if let Some(model_id) = &executor_config.model_id {
            self.model = Some(model_id.clone());
        }
        if let Some(permission_policy) = executor_config.permission_policy.clone() {
            self.permission_mode = match permission_policy {
                PermissionPolicy::Auto => DevinPermissionMode::Dangerous,
                PermissionPolicy::Supervised | PermissionPolicy::Plan => DevinPermissionMode::Auto,
            };
        }
    }

    async fn spawn(
        &self,
        current_dir: &Path,
        prompt: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let devin_command = self.build_command_builder()?.build_initial()?;
        let combined_prompt = self.append_prompt.combine_prompt(prompt);

        spawn_devin(devin_command, &combined_prompt, current_dir, env, &self.cmd).await
    }

    async fn spawn_follow_up(
        &self,
        current_dir: &Path,
        prompt: &str,
        session_id: &str,
        _reset_to_message_id: Option<&str>,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let continue_cmd = self
            .build_command_builder()?
            .build_follow_up(&["-r".to_string(), session_id.to_string()])?;
        let combined_prompt = self.append_prompt.combine_prompt(prompt);

        spawn_devin(continue_cmd, &combined_prompt, current_dir, env, &self.cmd).await
    }

    fn normalize_logs(
        &self,
        msg_store: Arc<MsgStore>,
        current_dir: &Path,
    ) -> Vec<tokio::task::JoinHandle<()>> {
        normalize_logs(
            msg_store.clone(),
            current_dir,
            EntryIndexProvider::start_from(&msg_store),
        )
    }

    fn default_mcp_config_path(&self) -> Option<PathBuf> {
        dirs::config_dir().map(|config| config.join("cognition").join("config.json"))
    }

    fn get_availability_info(&self) -> AvailabilityInfo {
        // Check if the config directory exists as an indicator of installation
        let config_found = dirs::config_dir()
            .map(|config| config.join("cognition").exists())
            .unwrap_or(false);

        if config_found {
            AvailabilityInfo::InstallationFound
        } else {
            AvailabilityInfo::NotFound
        }
    }

    fn get_preset_options(&self) -> ExecutorConfig {
        let permission_policy = if matches!(self.permission_mode, DevinPermissionMode::Dangerous) {
            PermissionPolicy::Auto
        } else {
            PermissionPolicy::Supervised
        };

        ExecutorConfig {
            executor: BaseCodingAgent::DevinCli,
            variant: None,
            model_id: self.model.clone(),
            agent_id: None,
            reasoning_id: None,
            permission_policy: Some(permission_policy),
        }
    }

    async fn discover_options(
        &self,
        _workdir: Option<&Path>,
        _repo_path: Option<&Path>,
    ) -> Result<futures::stream::BoxStream<'static, json_patch::Patch>, ExecutorError> {
        let options = ExecutorDiscoveredOptions {
            model_selector: ModelSelectorConfig {
                models: [
                    ("opus", "Claude Opus 4.6"),
                    ("sonnet", "Claude Sonnet 4.5"),
                    ("swe", "SWE 1.5"),
                    ("codex", "Codex 5.3"),
                    ("gemini", "Gemini 3 Pro"),
                    ("gemini-3-flash", "Gemini 3 Flash"),
                ]
                .into_iter()
                .map(|(id, name)| ModelInfo {
                    id: id.to_string(),
                    name: name.to_string(),
                    provider_id: None,
                    reasoning_options: vec![],
                })
                .collect(),
                permissions: vec![PermissionPolicy::Auto, PermissionPolicy::Supervised],
                ..Default::default()
            },
            slash_commands: vec![
                SlashCommandDescription {
                    name: "mode".to_string(),
                    description: Some("show or switch mode (normal, plan, bypass)".to_string()),
                },
                SlashCommandDescription {
                    name: "model".to_string(),
                    description: Some("show or change the current model".to_string()),
                },
                SlashCommandDescription {
                    name: "compact".to_string(),
                    description: Some("force conversation compaction".to_string()),
                },
            ],
            ..Default::default()
        };
        Ok(Box::pin(futures::stream::once(async move {
            patch::executor_discovered_options(options)
        })))
    }
}
