use std::{path::Path, process::Stdio, sync::Arc};

use async_trait::async_trait;
use command_group::AsyncCommandGroup;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use tokio::{io::AsyncWriteExt, process::Command};
use ts_rs::TS;
use workspace_utils::msg_store::MsgStore;

use crate::{
    command::{CmdOverrides, CommandBuilder, apply_overrides},
    executors::{
        AppendPrompt, ExecutorError, SpawnedChild, StandardCodingAgentExecutor,
        claude::{ClaudeLogProcessor, HistoryStrategy},
    },
    logs::{stderr_processor::normalize_stderr_logs, utils::EntryIndexProvider},
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema)]
pub struct Amp {
    #[serde(default)]
    pub append_prompt: AppendPrompt,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(
        title = "Dangerously Allow All",
        description = "Allow all commands to be executed, even if they are not safe."
    )]
    pub dangerously_allow_all: Option<bool>,
    #[serde(flatten)]
    pub cmd: CmdOverrides,
}

impl Amp {
    fn build_command_builder(&self) -> CommandBuilder {
        let mut builder = CommandBuilder::new("npx -y @sourcegraph/amp@0.0.1763625676-g928988")
            .params(["--execute", "--stream-json"]);
        if self.dangerously_allow_all.unwrap_or(false) {
            builder = builder.extend_params(["--dangerously-allow-all"]);
        }
        apply_overrides(builder, &self.cmd)
    }
}

#[async_trait]
impl StandardCodingAgentExecutor for Amp {
    async fn spawn(&self, current_dir: &Path, prompt: &str) -> Result<SpawnedChild, ExecutorError> {
        let command_parts = self.build_command_builder().build_initial()?;
        let (executable_path, args) = command_parts.into_resolved().await?;

        let combined_prompt = self.append_prompt.combine_prompt(prompt);

        let mut command = Command::new(executable_path);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .args(&args);

        let mut child = command.group_spawn()?;

        // Feed the prompt in, then close the pipe so amp sees EOF
        if let Some(mut stdin) = child.inner().stdin.take() {
            stdin.write_all(combined_prompt.as_bytes()).await?;
            stdin.shutdown().await?;
        }

        Ok(child.into())
    }

    async fn spawn_follow_up(
        &self,
        current_dir: &Path,
        prompt: &str,
        session_id: &str,
    ) -> Result<SpawnedChild, ExecutorError> {
        // 1) Fork the thread synchronously to obtain new thread id
        let builder = self.build_command_builder();
        let fork_line = builder.build_follow_up(&[
            "threads".to_string(),
            "fork".to_string(),
            session_id.to_string(),
        ])?;
        let (fork_program, fork_args) = fork_line.into_resolved().await?;
        let fork_output = Command::new(fork_program)
            .kill_on_drop(true)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .args(&fork_args)
            .output()
            .await?;
        let stdout_str = String::from_utf8_lossy(&fork_output.stdout);
        let new_thread_id = stdout_str
            .lines()
            .rev()
            .find(|l| !l.trim().is_empty())
            .unwrap_or("")
            .trim()
            .to_string();
        if new_thread_id.is_empty() {
            return Err(ExecutorError::Io(std::io::Error::other(
                "AMP threads fork did not return a thread id",
            )));
        }

        tracing::debug!("AMP threads fork -> new thread id: {}", new_thread_id);

        // 2) Continue using the new thread id
        let continue_line = builder.build_follow_up(&[
            "threads".to_string(),
            "continue".to_string(),
            new_thread_id.clone(),
        ])?;
        let (continue_program, continue_args) = continue_line.into_resolved().await?;

        let combined_prompt = self.append_prompt.combine_prompt(prompt);

        let mut command = Command::new(continue_program);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .args(&continue_args);

        let mut child = command.group_spawn()?;

        // Feed the prompt in, then close the pipe so amp sees EOF
        if let Some(mut stdin) = child.inner().stdin.take() {
            stdin.write_all(combined_prompt.as_bytes()).await?;
            stdin.shutdown().await?;
        }

        Ok(child.into())
    }

    fn normalize_logs(&self, msg_store: Arc<MsgStore>, current_dir: &Path) {
        let entry_index_provider = EntryIndexProvider::start_from(&msg_store);

        // Process stdout logs (Amp's stream JSON output) using Claude's log processor
        ClaudeLogProcessor::process_logs(
            msg_store.clone(),
            current_dir,
            entry_index_provider.clone(),
            HistoryStrategy::AmpResume,
        );

        // Process stderr logs using the standard stderr processor
        normalize_stderr_logs(msg_store, entry_index_provider);
    }

    // MCP configuration methods
    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        dirs::home_dir().map(|home| home.join(".config").join("amp").join("settings.json"))
    }
}
