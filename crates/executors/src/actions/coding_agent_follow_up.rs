use std::path::PathBuf;

use async_trait::async_trait;
use command_group::AsyncGroupChild;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::{
    actions::Executable,
    executors::{CodingAgent, ExecutorError, StandardCodingAgentExecutor},
    profile::ProfileVariantLabel,
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct CodingAgentFollowUpRequest {
    pub prompt: String,
    pub session_id: String,
    pub profile_variant_label: ProfileVariantLabel,
}

#[async_trait]
impl Executable for CodingAgentFollowUpRequest {
    async fn spawn(&self, current_dir: &PathBuf) -> Result<AsyncGroupChild, ExecutorError> {
        let executor = CodingAgent::from_profile_variant_label(&self.profile_variant_label)?;
        executor
            .spawn_follow_up(current_dir, &self.prompt, &self.session_id)
            .await
    }
}
