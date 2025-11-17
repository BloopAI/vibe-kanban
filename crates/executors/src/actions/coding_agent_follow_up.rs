use std::{path::Path, sync::Arc};

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::{
    actions::Executable,
    approvals::ExecutorApprovalService,
    executors::{BaseCodingAgent, ExecutorError, SpawnedChild, StandardCodingAgentExecutor},
    profile::{ExecutorConfigs, ExecutorProfileId},
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct CodingAgentFollowUpRequest {
    pub prompt: String,
    pub session_id: String,
    /// Executor profile specification
    #[serde(alias = "profile_variant_label")]
    // Backwards compatability with ProfileVariantIds, esp stored in DB under ExecutorAction
    pub executor_profile_id: ExecutorProfileId,
}

impl CodingAgentFollowUpRequest {
    /// Get the executor profile ID
    pub fn get_executor_profile_id(&self) -> ExecutorProfileId {
        self.executor_profile_id.clone()
    }

    pub fn base_executor(&self) -> BaseCodingAgent {
        self.executor_profile_id.executor
    }
}

#[async_trait]
impl Executable for CodingAgentFollowUpRequest {
    async fn spawn(
        &self,
        current_dir: &Path,
        approvals: Arc<dyn ExecutorApprovalService>,
    ) -> Result<SpawnedChild, ExecutorError> {
        let executor_profile_id = self.get_executor_profile_id();
        let mut agent = ExecutorConfigs::get_cached()
            .get_coding_agent(&executor_profile_id)
            .ok_or(ExecutorError::UnknownExecutorType(
                executor_profile_id.to_string(),
            ))?;

        agent.use_approvals(approvals.clone());

        agent
            .spawn_follow_up(current_dir, &self.prompt, &self.session_id)
            .await
    }
}
