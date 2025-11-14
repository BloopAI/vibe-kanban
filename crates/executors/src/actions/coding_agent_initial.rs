use std::{path::Path, sync::Arc};

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use workspace_utils::vk_mcp_context::VkMcpContext;

use crate::{
    actions::Executable,
    approvals::ExecutorApprovalService,
    executors::{BaseCodingAgent, ExecutorError, SpawnedChild, StandardCodingAgentExecutor},
    profile::{ExecutorConfigs, ExecutorProfileId},
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct CodingAgentInitialRequest {
    pub prompt: String,
    /// Executor profile specification
    #[serde(alias = "profile_variant_label")]
    // Backwards compatability with ProfileVariantIds, esp stored in DB under ExecutorAction
    pub executor_profile_id: ExecutorProfileId,
}

impl CodingAgentInitialRequest {
    pub fn base_executor(&self) -> BaseCodingAgent {
        self.executor_profile_id.executor
    }
}

#[async_trait]
impl Executable for CodingAgentInitialRequest {
    async fn spawn(
        &self,
        current_dir: &Path,
        approvals: Arc<dyn ExecutorApprovalService>,
        vk_mcp_context: &VkMcpContext,
    ) -> Result<SpawnedChild, ExecutorError> {
        let executor_profile_id = self.executor_profile_id.clone();
        let mut agent = ExecutorConfigs::get_cached()
            .get_coding_agent(&executor_profile_id)
            .ok_or(ExecutorError::UnknownExecutorType(
                executor_profile_id.to_string(),
            ))?;

        agent.use_approvals(approvals.clone());
        agent.use_vk_mcp_context(vk_mcp_context);

        agent.spawn(current_dir, &self.prompt).await
    }
}
