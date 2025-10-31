use std::{path::Path, process::Stdio, sync::Arc};

use async_trait::async_trait;
use command_group::AsyncCommandGroup;
use tokio::{io::AsyncWriteExt, process::Command};
use workspace_utils::{msg_store::MsgStore, shell::get_shell_command};

use crate::{
    executors::{ExecutorError, SpawnedChild, StandardCodingAgentExecutor},
    logs::{stderr_processor::normalize_stderr_logs, utils::EntryIndexProvider},
};

pub mod log_event_converter;
mod patch_converter;
mod processor;
pub mod types;

use processor::DroidLogProcessor;
pub use types::{Autonomy, Droid, ReasoningEffortLevel};

async fn exec_command_with_prompt(
    cmd: &String,
    prompt: &String,
    current_dir: &Path,
) -> Result<SpawnedChild, ExecutorError> {
    let (shell_cmd, shell_arg) = get_shell_command();
    let mut command = Command::new(shell_cmd);
    command
        .kill_on_drop(true)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .current_dir(current_dir)
        .arg(shell_arg)
        .arg(cmd);

    let mut child = command.group_spawn()?;

    if let Some(mut stdin) = child.inner().stdin.take() {
        stdin.write_all(prompt.as_bytes()).await?;
        stdin.shutdown().await?;
    }

    Ok(child.into())
}

#[async_trait]
impl StandardCodingAgentExecutor for Droid {
    async fn spawn(&self, current_dir: &Path, prompt: &str) -> Result<SpawnedChild, ExecutorError> {
        let droid_command = self.build_command_builder().build_initial();
        let combined_prompt = self.append_prompt.combine_prompt(prompt);

        exec_command_with_prompt(&droid_command, &combined_prompt, current_dir).await
    }

    async fn spawn_follow_up(
        &self,
        current_dir: &Path,
        prompt: &str,
        session_id: &str,
    ) -> Result<SpawnedChild, ExecutorError> {
        let continue_cmd = self
            .build_command_builder()
            .build_follow_up(&["--session-id".to_string(), session_id.to_string()]);
        let combined_prompt = self.append_prompt.combine_prompt(prompt);

        exec_command_with_prompt(&continue_cmd, &combined_prompt, current_dir).await
    }

    fn normalize_logs(&self, msg_store: Arc<MsgStore>, current_dir: &Path) {
        let entry_index_provider = EntryIndexProvider::start_from(&msg_store);
        DroidLogProcessor::process_logs(
            msg_store.clone(),
            current_dir,
            entry_index_provider.clone(),
        );

        normalize_stderr_logs(msg_store, entry_index_provider);
    }

    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        dirs::home_dir().map(|home| home.join(".factory").join("mcp.json"))
    }
}
