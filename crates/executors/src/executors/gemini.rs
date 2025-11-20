use std::{path::Path, sync::Arc};

use async_trait::async_trait;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use workspace_utils::msg_store::MsgStore;

pub use super::acp::AcpAgentHarness;
use crate::{
    command::{CmdOverrides, CommandBuilder, apply_overrides},
    executors::{AppendPrompt, ExecutorError, SpawnedChild, StandardCodingAgentExecutor},
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema)]
pub struct Gemini {
    #[serde(default)]
    pub append_prompt: AppendPrompt,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub yolo: Option<bool>,
    #[serde(flatten)]
    pub cmd: CmdOverrides,
}

impl Gemini {
    fn build_command_builder(&self) -> CommandBuilder {
        let mut builder = CommandBuilder::new("npx -y @google/gemini-cli@0.16.0");

        if let Some(model) = &self.model {
            builder = builder.extend_params(["--model", model.as_str()]);
        }

        if self.yolo.unwrap_or(false) {
            builder = builder.extend_params(["--yolo"]);
            builder = builder.extend_params(["--allowed-tools", "run_shell_command"]);
        }

        builder = builder.extend_params(["--experimental-acp"]);

        apply_overrides(builder, &self.cmd)
    }
}

#[async_trait]
impl StandardCodingAgentExecutor for Gemini {
    async fn spawn(&self, current_dir: &Path, prompt: &str) -> Result<SpawnedChild, ExecutorError> {
        let harness = AcpAgentHarness::new();
        let combined_prompt = self.append_prompt.combine_prompt(prompt);
        let gemini_command = self.build_command_builder().build_initial()?;
        harness
            .spawn_with_command(current_dir, combined_prompt, gemini_command)
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
        harness
            .spawn_follow_up_with_command(current_dir, combined_prompt, session_id, gemini_command)
            .await
    }

    fn normalize_logs(&self, msg_store: Arc<MsgStore>, worktree_path: &Path) {
        super::acp::normalize_logs(msg_store, worktree_path);
    }

    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        dirs::home_dir().map(|home| home.join(".gemini").join("settings.json"))
    }
}
