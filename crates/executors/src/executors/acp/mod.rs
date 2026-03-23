pub mod client;
pub mod discovery;
pub mod harness;
pub mod normalize_logs;

use std::{fmt::Display, str::FromStr};

pub use client::AcpClient;
pub use harness::AcpAgentHarness;
pub use normalize_logs::*;
use serde::{Deserialize, Serialize};
use workspace_utils::approvals::ApprovalStatus;

/// Parsed event types for internal processing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AcpEvent {
    User(String),
    SessionStart(String),
    Message(agent_client_protocol::ContentBlock),
    Thought(agent_client_protocol::ContentBlock),
    ToolCall(agent_client_protocol::ToolCall),
    ToolUpdate(agent_client_protocol::ToolCallUpdate),
    Plan(agent_client_protocol::Plan),
    AvailableCommands(Vec<agent_client_protocol::AvailableCommand>),
    CurrentMode(agent_client_protocol::SessionModeId),
    RequestPermission(agent_client_protocol::RequestPermissionRequest),
    ApprovalRequested {
        tool_call_id: String,
        approval_id: String,
    },
    ApprovalResponse(ApprovalResponse),
    /// Capabilities detected after ACP initialize()
    Capabilities(agent_client_protocol::AgentCapabilities),
    /// Session metadata returned from session/new, session/load, or session/fork.
    /// Contains available modes, models, and config options for the model selector.
    SessionMetadata {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        modes: Option<agent_client_protocol::SessionModeState>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        models: Option<agent_client_protocol::SessionModelState>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        config_options: Option<Vec<agent_client_protocol::SessionConfigOption>>,
    },
    /// Model info after session creation: default model, override attempt result.
    ModelInfo {
        /// The session's default model (from SessionModelState.current_model_id)
        #[serde(default, skip_serializing_if = "Option::is_none")]
        session_default: Option<String>,
        /// What happened when trying to set the model override
        model_set_result: ModelSetResult,
        /// What happened when trying to set reasoning/effort config
        #[serde(default)]
        reasoning_set_result: ModelSetResult,
    },
    Error(String),
    Done(String),
    Other(agent_client_protocol::SessionNotification),
}

impl Display for AcpEvent {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", serde_json::to_string(self).unwrap_or_default())
    }
}

impl FromStr for AcpEvent {
    type Err = serde_json::Error;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        serde_json::from_str(s)
    }
}

/// Outcome of attempting to set a model override via set_session_model.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub enum ModelSetResult {
    /// No override was requested
    #[default]
    NotAttempted,
    /// set_session_model succeeded
    Success { model: String },
    /// set_session_model failed
    Failed { model: String, error: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApprovalResponse {
    pub tool_call_id: String,
    pub status: ApprovalStatus,
}
