use std::{path::Path, sync::Arc};

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[cfg(not(feature = "qa-mode"))]
use crate::profile::ExecutorConfigs;
use crate::{
    actions::Executable,
    approvals::ExecutorApprovalService,
    env::ExecutionEnv,
    executors::{BaseCodingAgent, ExecutorError, SpawnedChild, StandardCodingAgentExecutor},
    profile::ExecutorConfig,
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct CodingAgentFollowUpRequest {
    pub prompt: String,
    pub session_id: String,
    #[serde(default)]
    pub reset_to_message_id: Option<String>,
    /// Unified executor identity + overrides
    #[serde(alias = "executor_profile_id", alias = "profile_variant_label")]
    pub executor_config: ExecutorConfig,
    /// Optional relative path to execute the agent in (relative to container_ref).
    /// If None, uses the container_ref directory directly.
    #[serde(default)]
    pub working_dir: Option<String>,
}

impl CodingAgentFollowUpRequest {
    pub fn effective_dir(&self, current_dir: &Path) -> std::path::PathBuf {
        match &self.working_dir {
            Some(rel_path) => current_dir.join(rel_path),
            None => current_dir.to_path_buf(),
        }
    }

    pub fn base_executor(&self) -> BaseCodingAgent {
        self.executor_config.executor
    }
}

#[async_trait]
impl Executable for CodingAgentFollowUpRequest {
    #[cfg_attr(feature = "qa-mode", allow(unused_variables))]
    async fn spawn(
        &self,
        current_dir: &Path,
        approvals: Arc<dyn ExecutorApprovalService>,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let effective_dir = self.effective_dir(current_dir);

        #[cfg(feature = "qa-mode")]
        {
            tracing::info!("QA mode: using mock executor for follow-up instead of real agent");
            let executor = crate::executors::qa_mock::QaMockExecutor;
            return executor
                .spawn_follow_up(
                    &effective_dir,
                    &self.prompt,
                    &self.session_id,
                    self.reset_to_message_id.as_deref(),
                    env,
                )
                .await;
        }

        #[cfg(not(feature = "qa-mode"))]
        {
            let profile_id = self.executor_config.profile_id();
            let mut agent = ExecutorConfigs::get_cached()
                .get_coding_agent(&profile_id)
                .ok_or(ExecutorError::UnknownExecutorType(profile_id.to_string()))?;

            if self.executor_config.has_overrides() {
                agent.apply_overrides(&self.executor_config);
            }
            agent.use_approvals(approvals.clone());

            agent
                .spawn_follow_up(
                    &effective_dir,
                    &self.prompt,
                    &self.session_id,
                    self.reset_to_message_id.as_deref(),
                    env,
                )
                .await
        }
    }
}
