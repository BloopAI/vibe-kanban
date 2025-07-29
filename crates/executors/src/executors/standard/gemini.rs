// use std::{
//     path::{Path, PathBuf},
//     process::Stdio,
// };

// use async_trait::async_trait;
// use command_group::{AsyncCommandGroup, AsyncGroupChild};
// use serde::{Deserialize, Serialize};
// use tokio::{io::AsyncWriteExt, process::Command};

// use crate::utils::shell::get_shell_command;
use std::{path::PathBuf, process::Stdio, sync::Arc};

use async_trait::async_trait;
use command_group::{AsyncCommandGroup, AsyncGroupChild};
use serde::{Deserialize, Serialize};
use tokio::{io::AsyncWriteExt, process::Command};
use ts_rs::TS;
use utils::{msg_store::MsgStore, shell::get_shell_command};

use crate::executors::{ExecutorError, standard::StandardCodingAgentExecutor};

/// An executor that uses Gemini to process tasks
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export)]
pub struct GeminiExecutor {}

#[async_trait]
impl StandardCodingAgentExecutor for GeminiExecutor {
    async fn spawn(
        &self,
        current_dir: &PathBuf,
        prompt: &str,
    ) -> Result<AsyncGroupChild, ExecutorError> {
        let (shell_cmd, shell_arg) = get_shell_command();
        let gemini_command = "npx @google/gemini-cli@latest --yolo";

        let mut command = Command::new(shell_cmd);

        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .arg(shell_arg)
            .arg(gemini_command)
            .env("NODE_NO_WARNINGS", "1");

        let mut child = command.group_spawn()?;

        // Write prompt to stdin
        if let Some(mut stdin) = child.inner().stdin.take() {
            stdin.write_all(prompt.as_bytes()).await?;
            stdin.shutdown().await?;
        }

        Ok(child)
    }

    async fn spawn_follow_up(
        &self,
        _current_dir: &PathBuf,
        _prompt: &str,
        _session_id: &str,
    ) -> Result<AsyncGroupChild, ExecutorError> {
        // TODO:
        Err(ExecutorError::FollowUpNotSupported)
    }

    fn normalize_logs(&self, _raw_logs_event_store: Arc<MsgStore>, _worktree_path: &PathBuf) {
        todo!()
    }
}
