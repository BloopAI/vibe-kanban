use std::path::Path;

use async_trait::async_trait;
use command_group::AsyncGroupChild;
use enum_dispatch::enum_dispatch;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::{
    actions::{
        coding_agent_follow_up::CodingAgentFollowUpRequest,
        coding_agent_initial::CodingAgentInitialRequest, script::ScriptRequest,
    },
    executors::ExecutorError,
};
pub mod coding_agent_follow_up;
pub mod coding_agent_initial;
pub mod script;

#[enum_dispatch]
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(tag = "type")]
pub enum ExecutorActionType {
    CodingAgentInitialRequest,
    CodingAgentFollowUpRequest,
    ScriptRequest,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ExecutorAction {
    pub typ: ExecutorActionType,
    pub next_action: Option<Box<ExecutorAction>>,
}

impl ExecutorAction {
    pub fn new(typ: ExecutorActionType, next_action: Option<Box<ExecutorAction>>) -> Self {
        Self { typ, next_action }
    }

    pub fn typ(&self) -> &ExecutorActionType {
        &self.typ
    }

    pub fn next_action(&self) -> Option<&ExecutorAction> {
        self.next_action.as_deref()
    }
}

#[async_trait]
#[enum_dispatch(ExecutorActionType)]
pub trait Executable {
    async fn spawn(&self, current_dir: &Path) -> Result<AsyncGroupChild, ExecutorError>;
}

#[async_trait]
impl Executable for ExecutorAction {
    async fn spawn(&self, current_dir: &Path) -> Result<AsyncGroupChild, ExecutorError> {
        self.typ.spawn(current_dir).await
    }
}
