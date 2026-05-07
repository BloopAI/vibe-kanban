use std::{path::Path, sync::Arc};

use async_trait::async_trait;
use derivative::Derivative;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use workspace_utils::msg_store::MsgStore;

pub use super::acp::AcpAgentHarness;
use crate::{
    approvals::ExecutorApprovalService,
    command::{CmdOverrides, CommandBuildError, CommandBuilder, apply_overrides},
    env::ExecutionEnv,
    executors::{
        AppendPrompt, AvailabilityInfo, BaseCodingAgent, ExecutorError, SpawnedChild,
        StandardCodingAgentExecutor,
    },
    model_selector::PermissionPolicy,
    profile::ExecutorConfig,
};

const VIBE_COMMAND: &str = "vibe-acp";
const SESSION_NAMESPACE: &str = "vibe_sessions";

#[derive(Derivative, Clone, Serialize, Deserialize, TS, JsonSchema)]
#[derivative(Debug, PartialEq)]
pub struct MistralVibe {
    #[serde(default)]
    pub append_prompt: AppendPrompt,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auto_approve: Option<bool>,
    #[serde(flatten)]
    pub cmd: CmdOverrides,
    #[serde(skip)]
    #[ts(skip)]
    #[derivative(Debug = "ignore", PartialEq = "ignore")]
    pub approvals: Option<Arc<dyn ExecutorApprovalService>>,
}

impl MistralVibe {
    fn build_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        let builder = CommandBuilder::new(VIBE_COMMAND);
        apply_overrides(builder, &self.cmd)
    }

    fn build_harness(&self) -> AcpAgentHarness {
        let mut harness = AcpAgentHarness::with_session_namespace(SESSION_NAMESPACE);
        if let Some(ref model) = self.model {
            harness = harness.with_model(model);
        }
        harness
    }

    fn effective_approvals(&self) -> Option<Arc<dyn ExecutorApprovalService>> {
        if self.auto_approve.unwrap_or(false) {
            None
        } else {
            self.approvals.clone()
        }
    }
}

#[async_trait]
impl StandardCodingAgentExecutor for MistralVibe {
    fn apply_overrides(&mut self, executor_config: &ExecutorConfig) {
        if let Some(model_id) = &executor_config.model_id {
            self.model = Some(model_id.clone());
        }
        if let Some(permission_policy) = executor_config.permission_policy.clone() {
            self.auto_approve = Some(matches!(permission_policy, PermissionPolicy::Auto));
        }
    }

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
        let vibe_command = self.build_command_builder()?.build_initial()?;
        self.build_harness()
            .spawn_with_command(
                current_dir,
                combined_prompt,
                vibe_command,
                env,
                &self.cmd,
                self.effective_approvals(),
            )
            .await
    }

    async fn spawn_follow_up(
        &self,
        current_dir: &Path,
        prompt: &str,
        session_id: &str,
        _reset_to_message_id: Option<&str>,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let combined_prompt = self.append_prompt.combine_prompt(prompt);
        let vibe_command = self.build_command_builder()?.build_follow_up(&[])?;
        self.build_harness()
            .spawn_follow_up_with_command(
                current_dir,
                combined_prompt,
                session_id,
                vibe_command,
                env,
                &self.cmd,
                self.effective_approvals(),
            )
            .await
    }

    fn normalize_logs(
        &self,
        msg_store: Arc<MsgStore>,
        worktree_path: &Path,
    ) -> Vec<tokio::task::JoinHandle<()>> {
        super::acp::normalize_logs(msg_store, worktree_path)
    }

    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        dirs::home_dir().map(|home| home.join(".mistral").join("vibe").join("mcp.json"))
    }

    fn get_availability_info(&self) -> AvailabilityInfo {
        let mcp_config_found = self
            .default_mcp_config_path()
            .map(|p| p.exists())
            .unwrap_or(false);

        let installation_indicator_found = dirs::home_dir()
            .map(|home| home.join(".mistral").join("vibe").exists())
            .unwrap_or(false);

        if mcp_config_found || installation_indicator_found {
            AvailabilityInfo::InstallationFound
        } else {
            AvailabilityInfo::NotFound
        }
    }

    fn get_preset_options(&self) -> ExecutorConfig {
        ExecutorConfig {
            executor: BaseCodingAgent::MistralVibe,
            variant: None,
            model_id: self.model.clone(),
            agent_id: None,
            reasoning_id: None,
            permission_policy: Some(if self.auto_approve.unwrap_or(false) {
                PermissionPolicy::Auto
            } else {
                PermissionPolicy::Supervised
            }),
        }
    }
}
