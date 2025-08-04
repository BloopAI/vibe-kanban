use std::{path::PathBuf, sync::Arc};

use async_trait::async_trait;
use command_group::AsyncGroupChild;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use utils::msg_store::MsgStore;

use crate::{
    actions::ExecutorAction,
    executors::{CodingAgentExecutors, ExecutorError, StandardCodingAgentExecutor},
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export)]
pub struct CodingAgentFollowUpRequest {
    pub prompt: String,
    pub session_id: String,
    pub profile: String,
}

#[async_trait]
impl ExecutorAction for CodingAgentFollowUpRequest {
    async fn spawn(&self, current_dir: &PathBuf) -> Result<AsyncGroupChild, ExecutorError> {
        let executor = CodingAgentExecutors::from_profile_str(&self.profile)?;
        executor
            .spawn_follow_up(current_dir, &self.prompt, &self.session_id)
            .await
    }
}
