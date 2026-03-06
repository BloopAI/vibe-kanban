use std::{path::Path, sync::Arc};

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

use crate::{
    actions::Executable,
    approvals::ExecutorApprovalService,
    env::ExecutionEnv,
    executors::{BaseCodingAgent, ExecutorError, SpawnedChild, StandardCodingAgentExecutor},
    profile::{ExecutorConfig, ExecutorConfigs},
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct RepoReviewContext {
    pub repo_id: Uuid,
    pub repo_name: String,
    pub base_commit: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct ReviewRequest {
    /// Unified executor identity + overrides
    #[serde(alias = "executor_profile_id", alias = "profile_variant_label")]
    pub executor_config: ExecutorConfig,
    pub context: Option<Vec<RepoReviewContext>>,
    pub prompt: String,
    /// Optional session ID to resume an existing session
    #[serde(default)]
    pub session_id: Option<String>,
    /// Optional relative path to execute the agent in (relative to container_ref).
    #[serde(default)]
    pub working_dir: Option<String>,
}

impl ReviewRequest {
    pub fn base_executor(&self) -> BaseCodingAgent {
        self.executor_config.executor
    }

    pub fn effective_dir(&self, current_dir: &Path) -> std::path::PathBuf {
        match &self.working_dir {
            Some(rel_path) => current_dir.join(rel_path),
            None => current_dir.to_path_buf(),
        }
    }
}

#[async_trait]
impl Executable for ReviewRequest {
    async fn spawn(
        &self,
        current_dir: &Path,
        approvals: Arc<dyn ExecutorApprovalService>,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let effective_dir = self.effective_dir(current_dir);

        let profile_id = self.executor_config.profile_id();
        let mut agent = ExecutorConfigs::get_cached()
            .get_coding_agent(&profile_id)
            .ok_or(ExecutorError::UnknownExecutorType(profile_id.to_string()))?;

        if self.executor_config.has_overrides() {
            agent.apply_overrides(&self.executor_config);
        }
        agent.use_approvals(approvals.clone());

        agent
            .spawn_review(
                &effective_dir,
                &self.prompt,
                self.session_id.as_deref(),
                env,
            )
            .await
    }
}
