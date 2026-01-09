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
    profile::{ExecutorConfigs, ExecutorProfileId},
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct RepoReviewContext {
    pub repo_id: Uuid,
    pub repo_name: String,
    pub base_commit: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct ReviewRequest {
    pub executor_profile_id: ExecutorProfileId,
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
        self.executor_profile_id.executor
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
        // Use working_dir if specified, otherwise use current_dir
        let effective_dir = match &self.working_dir {
            Some(rel_path) => current_dir.join(rel_path),
            None => current_dir.to_path_buf(),
        };

        let executor_profile_id = self.executor_profile_id.clone();
        let mut agent = ExecutorConfigs::get_cached()
            .get_coding_agent(&executor_profile_id)
            .ok_or(ExecutorError::UnknownExecutorType(
                executor_profile_id.to_string(),
            ))?;

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
