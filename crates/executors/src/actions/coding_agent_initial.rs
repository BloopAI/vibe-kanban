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
pub struct CodingAgentInitialRequest {
    pub prompt: String,
    pub profile_variant_label: ProfileVariantLabel,
}

#[async_trait]
impl Executable for CodingAgentInitialRequest {
    async fn spawn(&self, current_dir: &PathBuf) -> Result<AsyncGroupChild, ExecutorError> {
        let agent = CodingAgent::from_profile_variant_label(&self.profile_variant_label)?;
        agent.spawn(current_dir, &self.prompt).await
    }
}
