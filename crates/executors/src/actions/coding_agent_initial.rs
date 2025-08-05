use std::path::PathBuf;

use async_trait::async_trait;
use command_group::AsyncGroupChild;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::{
    actions::ExecutorAction,
    executors::{CodingAgentExecutors, ExecutorError, StandardCodingAgentExecutor},
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export)]
pub struct CodingAgentInitialRequest {
    pub prompt: String,
    pub profile: String,
}

#[async_trait]
impl ExecutorAction for CodingAgentInitialRequest {
    async fn spawn(&self, current_dir: &PathBuf) -> Result<AsyncGroupChild, ExecutorError> {
        let executor = CodingAgentExecutors::from_profile_str(&self.profile)?;
        executor.spawn(current_dir, &self.prompt).await
    }
}
