use std::{path::PathBuf, process::Stdio, sync::Arc};

use async_trait::async_trait;
use command_group::{AsyncCommandGroup, AsyncGroupChild};
use serde::{Deserialize, Serialize};
use tokio::{io::AsyncWriteExt, process::Command};
use ts_rs::TS;
use utils::{msg_store::MsgStore, shell::get_shell_command};

use crate::{
    command::CommandBuilder,
    executors::{ExecutorError, StandardCodingAgentExecutor, gemini::Gemini},
    logs::{stderr_processor::normalize_stderr_logs, utils::EntryIndexProvider},
};

/// An executor that uses QwenCode CLI to process tasks
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct QwenCode {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub append_prompt: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub yolo: Option<bool>,
}

impl QwenCode {
    fn build_command_builder(&self) -> CommandBuilder {
        let mut builder = CommandBuilder::new("npx -y @qwen-code/qwen-code@latest");
        if self.yolo.unwrap_or(false) {
            builder = builder.params(["--yolo"]);
        }
        builder
    }
}

#[async_trait]
impl StandardCodingAgentExecutor for QwenCode {
    async fn spawn(
        &self,
        current_dir: &PathBuf,
        prompt: &str,
    ) -> Result<AsyncGroupChild, ExecutorError> {
        let (shell_cmd, shell_arg) = get_shell_command();
        let qwen_command = self.build_command_builder().build_initial();

        let combined_prompt = utils::text::combine_prompt(&self.append_prompt, prompt);

        let mut command = Command::new(shell_cmd);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .arg(shell_arg)
            .arg(&qwen_command);

        let mut child = command.group_spawn()?;

        // Feed the prompt in, then close the pipe
        if let Some(mut stdin) = child.inner().stdin.take() {
            stdin.write_all(combined_prompt.as_bytes()).await?;
            stdin.shutdown().await?;
        }

        Ok(child)
    }

    async fn spawn_follow_up(
        &self,
        current_dir: &PathBuf,
        prompt: &str,
        session_id: &str,
    ) -> Result<AsyncGroupChild, ExecutorError> {
        let (shell_cmd, shell_arg) = get_shell_command();
        let qwen_command = self
            .build_command_builder()
            .build_follow_up(&["--resume".to_string(), session_id.to_string()]);

        let combined_prompt = utils::text::combine_prompt(&self.append_prompt, prompt);

        let mut command = Command::new(shell_cmd);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .arg(shell_arg)
            .arg(&qwen_command);

        let mut child = command.group_spawn()?;

        // Feed the followup prompt in, then close the pipe
        if let Some(mut stdin) = child.inner().stdin.take() {
            stdin.write_all(combined_prompt.as_bytes()).await?;
            stdin.shutdown().await?;
        }

        Ok(child)
    }

    fn normalize_logs(&self, msg_store: Arc<MsgStore>, current_dir: &PathBuf) {
        // QwenCode has similar output format to Gemini CLI
        // Use Gemini's proven sentence-break formatting instead of simple replace
        let entry_index_counter = EntryIndexProvider::start_from(&msg_store);
        normalize_stderr_logs(msg_store.clone(), entry_index_counter.clone());

        // Send session ID to msg_store to enable follow-ups
        msg_store.push_session_id(
            current_dir
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string(),
        );

        // Use Gemini's log processor for consistent formatting
        tokio::spawn(async move {
            use futures::StreamExt;
            let mut stdout = msg_store.stdout_chunked_stream();

            // Use Gemini's proven sentence-break heuristics
            let mut processor = Gemini::create_gemini_style_processor(entry_index_counter);

            while let Some(Ok(chunk)) = stdout.next().await {
                for patch in processor.process(chunk) {
                    msg_store.push_patch(patch);
                }
            }
        });
    }

    // MCP configuration methods
    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        dirs::home_dir().map(|home| home.join(".qwen").join("settings.json"))
    }
}
