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
    pub images: Option<Vec<String>>,
    pub session_id: String,
    pub profile_variant_label: ProfileVariantLabel,
}

#[async_trait]
impl Executable for CodingAgentFollowUpRequest {
    async fn spawn(&self, current_dir: &PathBuf) -> Result<AsyncGroupChild, ExecutorError> {
        let executor = CodingAgent::from_profile_variant_label(&self.profile_variant_label)?;

        // Build prompt with image paths if provided
        // TODO: This isn't a great stategy. The prompt is built elsewhere, we should try and
        // centralise this if possible.
        let prompt_with_images = if let Some(images) = &self.images {
            if !images.is_empty() {
                let image_refs = images
                    .iter()
                    .map(|path| format!("{}", path))
                    .collect::<Vec<_>>()
                    .join("\n");
                format!("{}\n\n{}", self.prompt, image_refs)
            } else {
                self.prompt.clone()
            }
        } else {
            self.prompt.clone()
        };

        executor
            .spawn_follow_up(current_dir, &prompt_with_images, &self.session_id)
            .await
    }
}
