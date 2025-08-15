use std::path::PathBuf;

use async_trait::async_trait;
use command_group::AsyncGroupChild;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::format_prompt_with_images;
use crate::{
    actions::Executable,
    executors::{CodingAgent, ExecutorError, StandardCodingAgentExecutor},
    profile::ProfileVariantLabel,
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct CodingAgentFollowUpRequest {
    pub prompt: String,
    pub images: Option<Vec<String>>,
    pub session_id: String,
    pub profile_variant_label: ProfileVariantLabel,
}

#[async_trait]
impl Executable for CodingAgentFollowUpRequest {
    async fn spawn(&self, current_dir: &PathBuf) -> Result<AsyncGroupChild, ExecutorError> {
        let agent = CodingAgent::from_profile_variant_label(&self.profile_variant_label)?;

        let prompt = match (agent.supports_images(), &self.images) {
            (true, Some(images)) => format_prompt_with_images(&self.prompt, images),
            _ => self.prompt.clone(),
        };

        agent
            .spawn_follow_up(current_dir, &prompt, &self.session_id)
            .await
    }
}
