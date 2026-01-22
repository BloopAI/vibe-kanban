use std::{path::Path, process::Stdio, sync::Arc};

use async_trait::async_trait;
use command_group::AsyncCommandGroup;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use strum_macros::AsRefStr;
use tokio::{io::AsyncWriteExt, process::Command};
use ts_rs::TS;
use workspace_utils::msg_store::MsgStore;

use crate::{
    command::{CommandBuildError, CommandBuilder, CommandParts},
    env::ExecutionEnv,
    executors::{AppendPrompt, ExecutorError, SpawnedChild, StandardCodingAgentExecutor},
    logs::utils::EntryIndexProvider,
};

pub mod normalize_logs;
pub mod session;

use normalize_logs::normalize_logs;

use self::session::fork_session;

// Configuration types for Droid executor
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, TS, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum Autonomy {
    Normal,
    Low,
    Medium,
    High,
    SkipPermissionsUnsafe,
}

fn default_autonomy() -> Autonomy {
    Autonomy::SkipPermissionsUnsafe
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema, AsRefStr)]
#[serde(rename_all = "lowercase")]
#[strum(serialize_all = "lowercase")]
#[ts(rename = "DroidReasoningEffort")]
pub enum ReasoningEffortLevel {
    None,
    Dynamic,
    Off,
    Low,
    Medium,
    High,
}

/// Droid executor configuration
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema)]
pub struct Droid {
    #[serde(default)]
    pub append_prompt: AppendPrompt,

    #[serde(default = "default_autonomy")]
    #[schemars(
        title = "Autonomy Level",
        description = "Permission level for file and system operations"
    )]
    pub autonomy: Autonomy,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(
        title = "Model",
        description = "Model to use (e.g., gpt-5-codex, claude-sonnet-4-5-20250929, gpt-5-2025-08-07, claude-opus-4-1-20250805, claude-haiku-4-5-20251001, glm-4.6)"
    )]
    pub model: Option<String>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(
        title = "Reasoning Effort",
        description = "Reasoning effort level: none, dynamic, off, low, medium, high"
    )]
    pub reasoning_effort: Option<ReasoningEffortLevel>,

    #[serde(flatten)]
    pub cmd: crate::command::CmdOverrides,
}

impl Droid {
    pub fn build_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        use crate::command::{CommandBuilder, apply_overrides};
        let mut builder =
            CommandBuilder::new("droid exec").params(["--output-format", "stream-json"]);
        builder = match &self.autonomy {
            Autonomy::Normal => builder,
            Autonomy::Low => builder.extend_params(["--auto", "low"]),
            Autonomy::Medium => builder.extend_params(["--auto", "medium"]),
            Autonomy::High => builder.extend_params(["--auto", "high"]),
            Autonomy::SkipPermissionsUnsafe => builder.extend_params(["--skip-permissions-unsafe"]),
        };
        if let Some(model) = &self.model {
            builder = builder.extend_params(["--model", model.as_str()]);
        }
        if let Some(effort) = &self.reasoning_effort {
            builder = builder.extend_params(["--reasoning-effort", effort.as_ref()]);
        }

        apply_overrides(builder, &self.cmd)
    }
}

async fn spawn_droid(
    command_parts: CommandParts,
    prompt: &String,
    current_dir: &Path,
    env: &ExecutionEnv,
    cmd_overrides: &crate::command::CmdOverrides,
) -> Result<SpawnedChild, ExecutorError> {
    let (program_path, args) = command_parts.into_resolved().await?;

    let mut command = Command::new(program_path);
    command
        .kill_on_drop(true)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .current_dir(current_dir)
        .env("NPM_CONFIG_LOGLEVEL", "error")
        .args(args);

    env.clone()
        .with_profile(cmd_overrides)
        .apply_to_command(&mut command);

    let mut child = command.group_spawn()?;

    if let Some(mut stdin) = child.inner().stdin.take() {
        stdin.write_all(prompt.as_bytes()).await?;
        stdin.shutdown().await?;
    }

    Ok(child.into())
}

#[async_trait]
impl StandardCodingAgentExecutor for Droid {
    async fn spawn(
        &self,
        current_dir: &Path,
        prompt: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let droid_command = self.build_command_builder()?.build_initial()?;
        let combined_prompt = self.append_prompt.combine_prompt(prompt);

        spawn_droid(droid_command, &combined_prompt, current_dir, env, &self.cmd).await
    }

    async fn spawn_follow_up(
        &self,
        current_dir: &Path,
        prompt: &str,
        session_id: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let forked_session_id = fork_session(session_id).map_err(|e| {
            ExecutorError::FollowUpNotSupported(format!(
                "Failed to fork Droid session {session_id}: {e}"
            ))
        })?;
        let continue_cmd = self
            .build_command_builder()?
            .build_follow_up(&["--session-id".to_string(), forked_session_id.clone()])?;
        let combined_prompt = self.append_prompt.combine_prompt(prompt);

        spawn_droid(continue_cmd, &combined_prompt, current_dir, env, &self.cmd).await
    }

    fn normalize_logs(&self, msg_store: Arc<MsgStore>, current_dir: &Path) {
        normalize_logs(
            msg_store.clone(),
            current_dir,
            EntryIndexProvider::start_from(&msg_store),
        );
    }

    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        dirs::home_dir().map(|home| home.join(".factory").join("mcp.json"))
    }
}
