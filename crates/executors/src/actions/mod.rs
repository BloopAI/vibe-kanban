use std::path::PathBuf;

use async_trait::async_trait;
use command_group::AsyncGroupChild;
use enum_dispatch::enum_dispatch;
use serde::{Deserialize, Serialize};
use strum_macros::{Display, EnumDiscriminants};
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
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, EnumDiscriminants, Display)]
#[serde(tag = "type")]
#[ts(export)]
#[strum_discriminants(name(ExecutorActionKind), derive(Display))]
pub enum ExecutorActionType {
    CodingAgentInitialRequest,
    CodingAgentFollowUpRequest,
    ScriptRequest,
}

impl ExecutorActionType {
    /// Get the action type as a string (matches the JSON "type" field)
    pub fn action_type(&self) -> &'static str {
        match self {
            ExecutorActionType::CodingAgentInitialRequest(_) => "CodingAgentInitialRequest",
            ExecutorActionType::CodingAgentFollowUpRequest(_) => "CodingAgentFollowUpRequest",
            ExecutorActionType::ScriptRequest(_) => "ScriptRequest",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ExecutorAction {
    pub typ: ExecutorActionType,
    pub next_action: Option<Box<ExecutorAction>>,
}

impl ExecutorAction {
    pub fn new(type_: ExecutorActionType, next_action: Option<Box<ExecutorAction>>) -> Self {
        Self {
            typ: type_,
            next_action,
        }
    }

    pub fn typ(&self) -> &ExecutorActionType {
        &self.typ
    }

    pub fn next_action(&self) -> Option<&Box<ExecutorAction>> {
        self.next_action.as_ref()
    }

    pub fn action_type(&self) -> &'static str {
        self.typ.action_type()
    }
}

#[async_trait]
#[enum_dispatch(ExecutorActionType)]
pub trait Executable {
    async fn spawn(&self, current_dir: &PathBuf) -> Result<AsyncGroupChild, ExecutorError>;
}

#[async_trait]
impl Executable for ExecutorAction {
    async fn spawn(&self, current_dir: &PathBuf) -> Result<AsyncGroupChild, ExecutorError> {
        self.typ.spawn(current_dir).await
    }
}
