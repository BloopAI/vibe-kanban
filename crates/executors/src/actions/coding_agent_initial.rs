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
pub struct CodingAgentInitialRequest {
    pub prompt: String,
    pub executor: CodingAgentExecutors,
}

#[async_trait]
impl ExecutorAction for CodingAgentInitialRequest {
    async fn spawn(&self, current_dir: &PathBuf) -> Result<AsyncGroupChild, ExecutorError> {
        self.executor.spawn(current_dir, &self.prompt).await
    }
}
