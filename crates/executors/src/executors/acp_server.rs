use std::{path::Path, sync::Arc};

use async_trait::async_trait;
use derivative::Derivative;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use tokio::task::JoinHandle;
use ts_rs::TS;
use workspace_utils::msg_store::MsgStore;

use crate::{
    approvals::ExecutorApprovalService,
    command::{CmdOverrides, CommandBuilder, apply_overrides},
    env::ExecutionEnv,
    executors::{
        AppendPrompt, AvailabilityInfo, ExecutorError, SpawnedChild, StandardCodingAgentExecutor,
        acp::{AcpAgentHarnessV2, registry, registry::registry_key},
    },
    profile::ExecutorConfig,
};

/// An agent installed from the ACP registry
#[derive(Derivative, Clone, Serialize, Deserialize, TS, JsonSchema)]
#[derivative(Debug, PartialEq)]
pub struct AcpServer {
    #[schemars(
        title = "Registry ID",
        description = "ID of the agent in the ACP registry",
        extend("readOnly" = true)
    )]
    pub registry_id: String,
    #[serde(default)]
    pub append_prompt: AppendPrompt,
    #[serde(flatten)]
    pub cmd: CmdOverrides,
    #[serde(skip)]
    #[ts(skip)]
    #[derivative(Debug = "ignore", PartialEq = "ignore")]
    pub approvals: Option<Arc<dyn ExecutorApprovalService>>,
}

#[async_trait]
impl StandardCodingAgentExecutor for AcpServer {
    async fn spawn(
        &self,
        current_dir: &Path,
        prompt: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let (combined_prompt, command, env) = self.build_spawn_args(prompt, env).await?;

        let command = command.build_initial()?;

        AcpAgentHarnessV2::new()
            .spawn_with_command(
                current_dir,
                combined_prompt,
                command,
                &env,
                &self.cmd,
                self.approvals.clone(),
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
        let (combined_prompt, command, env) = self.build_spawn_args(prompt, env).await?;

        let command = command.build_follow_up(&[])?;

        AcpAgentHarnessV2::new()
            .spawn_follow_up_with_command(
                current_dir,
                combined_prompt,
                session_id,
                command,
                &env,
                &self.cmd,
                self.approvals.clone(),
            )
            .await
    }

    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        None
    }

    /// Installed means present in profiles: npx downloads the agent on first run
    fn get_availability_info(&self) -> AvailabilityInfo {
        AvailabilityInfo::InstallationFound
    }

    fn get_preset_options(&self) -> ExecutorConfig {
        ExecutorConfig::new(registry_key(&self.registry_id))
    }

    fn normalize_logs(
        &self,
        msg_store: Arc<MsgStore>,
        worktree_path: &Path,
    ) -> Vec<JoinHandle<()>> {
        super::acp::normalize_logs(msg_store, worktree_path)
    }

    fn use_approvals(&mut self, approvals: Arc<dyn ExecutorApprovalService>) {
        self.approvals = Some(approvals);
    }
}

impl AcpServer {
    pub fn new(registry_id: impl Into<String>) -> Self {
        Self {
            registry_id: registry_id.into(),
            append_prompt: AppendPrompt::default(),
            approvals: None,
            cmd: CmdOverrides::default(),
        }
    }

    async fn build_spawn_args(
        &self,
        prompt: &str,
        env: &ExecutionEnv,
    ) -> Result<(String, CommandBuilder, ExecutionEnv), ExecutorError> {
        let agent = registry::cached()
            .await?
            .into_iter()
            .find(|a| a.id == self.registry_id)
            .ok_or_else(|| ExecutorError::AcpRegistryAgentNotFound(self.registry_id.clone()))?;
        let npx = agent
            .distribution
            .npx
            .ok_or(ExecutorError::AcpRegistryAgentNotFound(
                self.registry_id.clone(),
            ))?;
        tracing::info!(registry_id = %self.registry_id, package = %npx.package, "Spawning ACP registry agent");

        let combined_prompt = self.append_prompt.combine_prompt(prompt);

        let command = CommandBuilder::new("npx -y")
            .extend_params([npx.package])
            .extend_params(npx.args);

        let env = env.clone().with_overrides(&npx.env);

        let command = apply_overrides(command, &self.cmd)?;

        Ok((combined_prompt, command, env))
    }
}
