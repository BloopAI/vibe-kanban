use std::{path::Path, process::Stdio, sync::Arc};

use async_trait::async_trait;
use command_group::AsyncCommandGroup;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use tokio::process::Command;
use ts_rs::TS;
use workspace_utils::msg_store::MsgStore;

pub use super::acp::AcpAgentHarness;
use crate::{
    actions::SpawnContext,
    command::{CmdOverrides, CommandBuilder, CommandParts, apply_overrides},
    executors::{
        AppendPrompt, AvailabilityInfo, ExecutorError, ExecutorExitResult, SpawnedChild,
        StandardCodingAgentExecutor,
    },
    logs::utils::EntryIndexProvider,
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema)]
pub struct Gemini {
    #[serde(default)]
    pub append_prompt: AppendPrompt,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub no_context: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub yolo: Option<bool>,
    #[serde(flatten)]
    pub cmd: CmdOverrides,
}

impl Gemini {
    fn build_command_builder(&self) -> CommandBuilder {
        let mut builder = CommandBuilder::new("npx -y @google/gemini-cli@latest");

        if let Some(model) = &self.model {
            builder = builder.extend_params(["--model", model.as_str()]);
        }

        if self.yolo.unwrap_or(false) {
            // --yolo deprecated in v0.30.0; --allowed-tools removed (broken in non-interactive
            // mode: policy denial regardless of flag value, issue #16012)
            builder = builder.extend_params(["--approval-mode=yolo"]);
        }

        // --experimental-acp renamed to --acp in v0.30.0 (old name still aliased)
        builder = builder.extend_params(["--acp"]);
        // Prevent non-TTY sandbox hang: v0.33.2+ regression when spawned as subprocess
        // (github.com/google-gemini/gemini-cli/issues/22782)
        builder = builder.extend_params(["--sandbox=false"]);

        apply_overrides(builder, &self.cmd)
    }

    async fn spawn_internal(
        &self,
        current_dir: &Path,
        prompt: &str,
        command_parts: CommandParts,
        context: SpawnContext,
    ) -> Result<SpawnedChild, ExecutorError> {
        let combined_prompt = self.append_prompt.combine_prompt(prompt);
        let (program_path, args) = command_parts.into_resolved().await?;

        let mut command = Command::new(program_path);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .args(&args)
            .env("NODE_NO_WARNINGS", "1");

        // Remove pnpm-specific env vars that cause npm warnings when using npx
        command.env_remove("npm_config__jsr_registry");
        command.env_remove("npm_config_verify_deps_before_run");
        command.env_remove("npm_config_globalconfig");

        // Set VK context environment variables for MCP tools
        command
            .env("VK_ATTEMPT_ID", context.task_attempt_id.to_string())
            .env("VK_TASK_ID", context.task_id.to_string())
            .env("VK_EXECUTION_PROCESS_ID", context.execution_process_id.to_string());

        let mut child = command.group_spawn()?;

        let (exit_tx, exit_rx) = tokio::sync::oneshot::channel::<ExecutorExitResult>();
        AcpAgentHarness::bootstrap_acp_connection(
            &mut child,
            current_dir.to_path_buf(),
            None,
            combined_prompt,
            Some(exit_tx),
            "gemini_sessions".to_string(),
        )
        .await?;

        Ok(SpawnedChild {
            child,
            exit_signal: Some(exit_rx),
            protocol_peer: None,
        })
    }
}

#[async_trait]
impl StandardCodingAgentExecutor for Gemini {
    async fn spawn(
        &self,
        current_dir: &Path,
        prompt: &str,
        context: SpawnContext,
    ) -> Result<SpawnedChild, ExecutorError> {
        let gemini_command = self.build_command_builder().build_initial()?;
        self.spawn_internal(current_dir, prompt, gemini_command, context)
            .await
    }

    async fn spawn_follow_up(
        &self,
        current_dir: &Path,
        prompt: &str,
        session_id: &str,
    ) -> Result<SpawnedChild, ExecutorError> {
        let harness = AcpAgentHarness::new();
        let combined_prompt = self.append_prompt.combine_prompt(prompt);
        let gemini_command = self.build_command_builder().build_follow_up(&[])?;

        // Follow-up sessions inherit the parent's environment variables,
        // so VK_* env vars will already be set from the initial spawn
        harness
            .spawn_follow_up_with_command(current_dir, combined_prompt, session_id, gemini_command)
            .await
    }

    fn normalize_logs(
        &self,
        msg_store: Arc<MsgStore>,
        worktree_path: &Path,
        entry_index_provider: EntryIndexProvider,
    ) -> tokio::task::JoinHandle<()> {
        super::acp::normalize_logs(msg_store, worktree_path, entry_index_provider)
    }

    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        dirs::home_dir().map(|home| home.join(".gemini").join("settings.json"))
    }

    fn get_availability_info(&self) -> AvailabilityInfo {
        if let Some(timestamp) = dirs::home_dir()
            .and_then(|home| std::fs::metadata(home.join(".gemini").join("oauth_creds.json")).ok())
            .and_then(|m| m.modified().ok())
            .and_then(|modified| modified.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
        {
            return AvailabilityInfo::LoginDetected {
                last_auth_timestamp: timestamp,
            };
        }

        let mcp_config_found = self
            .default_mcp_config_path()
            .map(|p| p.exists())
            .unwrap_or(false);

        let installation_indicator_found = dirs::home_dir()
            .map(|home| home.join(".gemini").join("installation_id").exists())
            .unwrap_or(false);

        if mcp_config_found || installation_indicator_found {
            AvailabilityInfo::InstallationFound
        } else {
            AvailabilityInfo::NotFound
        }
    }
}
