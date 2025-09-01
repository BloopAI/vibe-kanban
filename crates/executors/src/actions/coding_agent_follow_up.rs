use std::path::PathBuf;

use async_trait::async_trait;
use command_group::AsyncGroupChild;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::{
    actions::Executable,
    executors::{CodingAgent, ExecutorError, StandardCodingAgentExecutor},
    profile::ExecutorProfileId,
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
}

#[async_trait]
impl Executable for CodingAgentFollowUpRequest {
    async fn spawn(&self, current_dir: &PathBuf) -> Result<AsyncGroupChild, ExecutorError> {
        let executor_profile_id = self.get_executor_profile_id();
        let agent = CodingAgent::from_executor_profile_id(&executor_profile_id)?;

        agent
            .spawn_follow_up(current_dir, &self.prompt, &self.session_id)
            .await
    }
}
