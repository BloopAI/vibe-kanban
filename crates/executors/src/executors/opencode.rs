use std::{path::Path, sync::Arc};

use async_trait::async_trait;
use derivative::Derivative;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use workspace_utils::msg_store::MsgStore;

use crate::{
    approvals::ExecutorApprovalService,
    command::{CmdOverrides, CommandBuilder, apply_overrides},
    env::ExecutionEnv,
    executors::{
        AppendPrompt, AvailabilityInfo, ExecutorError, SpawnedChild, StandardCodingAgentExecutor,
        acp::AcpAgentHarness,
    },
};

#[derive(Derivative, Clone, Serialize, Deserialize, TS, JsonSchema)]
#[derivative(Debug, PartialEq)]
pub struct Opencode {
    #[serde(default)]
    pub append_prompt: AppendPrompt,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "agent")]
    pub mode: Option<String>,
    /// Auto-approve agent actions
    #[serde(default = "default_to_true")]
    pub auto_approve: bool,
    #[serde(flatten)]
    pub cmd: CmdOverrides,
    #[serde(skip)]
    #[ts(skip)]
    #[derivative(Debug = "ignore", PartialEq = "ignore")]
    pub approvals: Option<Arc<dyn ExecutorApprovalService>>,
}

impl Opencode {
    fn build_command_builder(&self) -> CommandBuilder {
        let builder = CommandBuilder::new("npx -y opencode-ai@1.0.134").extend_params(["acp"]);
        apply_overrides(builder, &self.cmd)
    }

    fn harness() -> AcpAgentHarness {
        AcpAgentHarness::with_session_namespace("opencode_sessions")
    }
}

#[async_trait]
impl StandardCodingAgentExecutor for Opencode {
    fn use_approvals(&mut self, approvals: Arc<dyn ExecutorApprovalService>) {
        self.approvals = Some(approvals);
    }

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
        let approvals = if self.auto_approve {
            None
        } else {
            self.approvals.clone()
        };
        let env = setup_approvals_env(self.auto_approve, env);
        harness
            .spawn_with_command(
                current_dir,
                combined_prompt,
                opencode_command,
                &env,
                &self.cmd,
                approvals,
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
        let approvals = if self.auto_approve {
            None
        } else {
            self.approvals.clone()
        };
        let env = setup_approvals_env(self.auto_approve, env);
        harness
            .spawn_follow_up_with_command(
                current_dir,
                combined_prompt,
                session_id,
                opencode_command,
                &env,
                &self.cmd,
                approvals,
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

fn default_to_true() -> bool {
    true
}

fn setup_approvals_env(auto_approve: bool, env: &ExecutionEnv) -> ExecutionEnv {
    let mut env = env.clone();
    if !auto_approve && !env.contains_key("OPENCODE_PERMISSION") {
        env.insert("OPENCODE_PERMISSION", r#"{"edit": "ask", "bash": "ask", "webfetch": "ask", "doom_loop": "ask", "external_directory": "ask"}"#);
    }
    env
}
