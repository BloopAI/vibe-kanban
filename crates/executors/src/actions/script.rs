use std::{path::Path, sync::Arc};

use async_trait::async_trait;
use command_group::AsyncCommandGroup;
use serde::{Deserialize, Serialize};
use tokio::process::Command;
use ts_rs::TS;
use workspace_utils::shell::get_shell_command;

use crate::{
    actions::Executable,
    approvals::ExecutorApprovalService,
    executors::{ExecutorError, SpawnedChild},
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub enum ScriptRequestLanguage {
    Bash,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub enum ScriptContext {
    SetupScript,
    CleanupScript,
    DevServer,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct ScriptRequest {
    pub script: String,
    pub language: ScriptRequestLanguage,
    pub context: ScriptContext,
}

#[async_trait]
impl Executable for ScriptRequest {
    async fn spawn(
        &self,
        current_dir: &Path,
        _approvals: Arc<dyn ExecutorApprovalService>,
    ) -> Result<SpawnedChild, ExecutorError> {
        let (shell_cmd, shell_arg) = get_shell_command();
        let mut command = Command::new(shell_cmd);
        command
            .kill_on_drop(true)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .arg(shell_arg)
            .arg(&self.script)
            .current_dir(current_dir);

        let child = command.group_spawn()?;

        Ok(child.into())
    }
}
