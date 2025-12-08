use std::{path::Path, sync::Arc};

use async_trait::async_trait;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use workspace_utils::msg_store::MsgStore;

use crate::{
    command::{CmdOverrides, CommandBuilder, apply_overrides},
    env::ExecutionEnv,
    executors::{
        AppendPrompt, AvailabilityInfo, ExecutorError, SpawnedChild, StandardCodingAgentExecutor,
        acp::AcpAgentHarness,
    },
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema)]
pub struct Opencode {
    #[serde(default)]
    pub append_prompt: AppendPrompt,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "agent")]
    pub mode: Option<String>,
    #[serde(flatten)]
    pub cmd: CmdOverrides,
}

impl Opencode {
    fn build_command_builder(&self) -> CommandBuilder {
        let builder = CommandBuilder::new("npx -y opencode-ai@1.0.134 acp");
        apply_overrides(builder, &self.cmd)
    }

    fn harness() -> AcpAgentHarness {
        AcpAgentHarness::with_session_namespace("opencode_sessions")
    }
}

#[async_trait]
impl StandardCodingAgentExecutor for Opencode {
    async fn spawn(
        &self,
        current_dir: &Path,
        prompt: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let combined_prompt = self.append_prompt.combine_prompt(prompt);

        let mut harness = Self::harness();
        if let Some(model) = &self.model {
            harness = harness.with_model(model);
        }
        if let Some(agent) = &self.mode {
            harness = harness.with_mode(agent);
        }
        let opencode_command = self.build_command_builder().build_initial()?;
        harness
            .spawn_with_command(
                current_dir,
                combined_prompt,
                opencode_command,
                env,
                &self.cmd,
            )
            .await
    }

    async fn spawn_follow_up(
        &self,
        current_dir: &Path,
        prompt: &str,
        session_id: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let combined_prompt = self.append_prompt.combine_prompt(prompt);
        let mut harness = Self::harness();
        if let Some(model) = &self.model {
            harness = harness.with_model(model);
        }
        if let Some(agent) = &self.mode {
            harness = harness.with_mode(agent);
        }
        let opencode_command = self.build_command_builder().build_follow_up(&[])?;
        harness
            .spawn_follow_up_with_command(
                current_dir,
                combined_prompt,
                session_id,
                opencode_command,
                env,
                &self.cmd,
            )
            .await
    }

    fn normalize_logs(&self, msg_store: Arc<MsgStore>, worktree_path: &Path) {
        crate::executors::acp::normalize_logs(msg_store, worktree_path);
    }

    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        #[cfg(unix)]
        {
            xdg::BaseDirectories::with_prefix("opencode").get_config_file("opencode.json")
        }
        #[cfg(not(unix))]
        {
            dirs::config_dir().map(|config| config.join("opencode").join("opencode.json"))
        }
    }

    fn get_availability_info(&self) -> AvailabilityInfo {
        let mcp_config_found = self
            .default_mcp_config_path()
            .map(|p| p.exists())
            .unwrap_or(false);

        let installation_indicator_found = dirs::config_dir()
            .map(|config| config.join("opencode").exists())
            .unwrap_or(false);

        if mcp_config_found || installation_indicator_found {
            AvailabilityInfo::InstallationFound
        } else {
            AvailabilityInfo::NotFound
        }
    }
}
