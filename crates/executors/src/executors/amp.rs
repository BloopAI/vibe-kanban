use std::{path::Path, process::Stdio, sync::Arc};

use async_trait::async_trait;
use command_group::{AsyncCommandGroup, AsyncGroupChild};
use serde::{Deserialize, Serialize};
use tokio::{io::AsyncWriteExt, process::Command};
use ts_rs::TS;
use utils::{msg_store::MsgStore, shell::get_shell_command};

use crate::{
    command::{CmdOverrides, CommandBuilder, apply_overrides},
    executors::{
        ExecutorError, StandardCodingAgentExecutor,
        claude::{ClaudeLogProcessor, HistoryStrategy},
    },
    logs::{stderr_processor::normalize_stderr_logs, utils::EntryIndexProvider},
};

/// An executor that uses Amp to process tasks
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct Amp {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub append_prompt: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dangerously_allow_all: Option<bool>,
    #[serde(flatten)]
    pub cmd: CmdOverrides,
}

impl Amp {
    fn build_command_builder(&self) -> CommandBuilder {
        let mut builder = CommandBuilder::new("npx -y @sourcegraph/amp@latest")
            .params(["--execute", "--stream-json"]);
        if self.dangerously_allow_all.unwrap_or(false) {
            builder = builder.extend_params(["--dangerously-allow-all"]);
        }
        apply_overrides(builder, &self.cmd)
    }
}

#[async_trait]
impl StandardCodingAgentExecutor for Amp {
    async fn spawn(
        &self,
        current_dir: &Path,
        prompt: &str,
    ) -> Result<AsyncGroupChild, ExecutorError> {
        let (shell_cmd, shell_arg) = get_shell_command();
        let amp_command = self.build_command_builder().build_initial();

        let combined_prompt = utils::text::combine_prompt(&self.append_prompt, prompt);

        let mut command = Command::new(shell_cmd);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .arg(shell_arg)
            .arg(&amp_command);

        let mut child = command.group_spawn()?;

        // Feed the prompt in, then close the pipe so amp sees EOF
        if let Some(mut stdin) = child.inner().stdin.take() {
            stdin.write_all(combined_prompt.as_bytes()).await?;
            stdin.shutdown().await?;
        }

        Ok(child)
    }

    async fn spawn_follow_up(
        &self,
        current_dir: &Path,
        prompt: &str,
        session_id: &str,
    ) -> Result<AsyncGroupChild, ExecutorError> {
        // Use shell command for cross-platform compatibility
        let (shell_cmd, shell_arg) = get_shell_command();
        let amp_command = self.build_command_builder().build_follow_up(&[
            "threads".to_string(),
            "continue".to_string(),
            session_id.to_string(),
        ]);

        let combined_prompt = utils::text::combine_prompt(&self.append_prompt, prompt);

        let mut command = Command::new(shell_cmd);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .arg(shell_arg)
            .arg(&amp_command);

        let mut child = command.group_spawn()?;

        // Feed the prompt in, then close the pipe so amp sees EOF
        if let Some(mut stdin) = child.inner().stdin.take() {
            stdin.write_all(combined_prompt.as_bytes()).await?;
            stdin.shutdown().await?;
        }

        Ok(child)
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
        dirs::config_dir().map(|config| config.join("amp").join("settings.json"))
    }
}
