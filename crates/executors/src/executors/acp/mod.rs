pub mod client;
pub mod harness;
pub mod normalize_logs;
pub mod session;

use std::{fmt::Display, str::FromStr};

pub use client::AcpClient;
pub use harness::AcpAgentHarness;
pub use normalize_logs::*;
use serde::{Deserialize, Serialize};
pub use session::SessionManager;

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
