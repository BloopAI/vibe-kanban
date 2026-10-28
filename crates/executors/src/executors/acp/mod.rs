pub mod client;
pub mod harness;
pub mod harness_v2;
pub mod normalize_logs;
mod permissions;
pub mod session;

use std::{fmt::Display, str::FromStr};

pub use client::AcpClient;
pub use harness::AcpAgentHarness;
pub use harness_v2::AcpAgentHarnessV2;
pub use normalize_logs::*;
use serde::{Deserialize, Serialize, de::DeserializeOwned};
pub use session::SessionManager;
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApprovalResponse {
    pub tool_call_id: String,
    pub status: ApprovalStatus,
}

// ---- TEMPORARY bridge: ACP 3.x types -> 0.8 types (same ACP v1 JSON shape).
// ---- Delete when AcpEvent holds 3.x types.

fn to_v08<T: Serialize, U: DeserializeOwned>(value: T) -> Option<U> {
    serde_json::from_value(serde_json::to_value(value).ok()?).ok()
}

impl TryFrom<acp::schema::v1::SessionNotification> for AcpEvent {
    type Error = ();

    fn try_from(notification: acp::schema::v1::SessionNotification) -> Result<Self, ()> {
        use acp::schema::v1::SessionUpdate;
        match notification.update {
            SessionUpdate::AgentMessageChunk(chunk) => to_v08(chunk.content).map(AcpEvent::Message),
            SessionUpdate::ToolCallUpdate(request) => to_v08(request).map(AcpEvent::ToolUpdate),
            SessionUpdate::Plan(plan) => to_v08(plan).map(AcpEvent::Plan),
            SessionUpdate::AgentThoughtChunk(cc) => to_v08(cc.content).map(AcpEvent::Thought),
            SessionUpdate::ToolCall(tc) => to_v08(tc).map(AcpEvent::ToolCall),
            SessionUpdate::AvailableCommandsUpdate(acu) => {
                to_v08(acu.available_commands).map(AcpEvent::AvailableCommands)
            }
            SessionUpdate::CurrentModeUpdate(cmu) => {
                to_v08(cmu.current_mode_id).map(AcpEvent::CurrentMode)
            }
            _ => {
                tracing::debug!("Unknown ACP Notification Update type {notification:?}");
                None
            }
        }
        .ok_or(())
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn notif(update: serde_json::Value) -> acp::schema::v1::SessionNotification {
        serde_json::from_value(json!({ "sessionId": "s1", "update": update })).unwrap()
    }

    #[test]
    fn thought_chunk_maps_to_thought() {
        let n = notif(json!({
            "sessionUpdate": "agent_thought_chunk",
            "content": {"type":"text","text":"I should glance at the project struct"}
        }));
        assert!(matches!(AcpEvent::try_from(n), Ok(AcpEvent::Thought(_))));
    }

    #[test]
    fn agent_message_chunk_maps_to_message() {
        let n = notif(json!({
            "sessionUpdate":"agent_message_chunk",
            "content":{"type":"text","text":"The README is the st"}
        }));
        assert!(matches!(AcpEvent::try_from(n), Ok(AcpEvent::Message(_))));
    }

    #[test]
    fn tool_call_maps_to_tool_call() {
        let n = notif(json!({
            "sessionUpdate":"tool_call",
            "toolCallId":"toolu_011adCUaiEksbXc17jHQu8wu",
            "title":"Finding files matching README*",
            "kind":"read",
            "rawInput":{"pattern":"README*"}
        }));
        assert!(matches!(AcpEvent::try_from(n), Ok(AcpEvent::ToolCall(_))));
    }

    #[test]
    fn tool_call_update_maps_to_tool_update() {
        let n = notif(json!({
            "sessionUpdate":"tool_call_update",
            "toolCallId":"toolu_011adCUaiEksbXc17jHQu8wu",
            "status":"completed",
            "content":[{"type":"content","content":{"type":"text","text":"./README.md"}}],
            "rawOutput":{"content":"./README.md","detailedContent":"./README.md"}
        }));
        assert!(matches!(AcpEvent::try_from(n), Ok(AcpEvent::ToolUpdate(_))));
    }

    #[test]
    fn available_commands_update_maps_to_available_commands() {
        let n = notif(json!({"sessionUpdate":"available_commands_update",
        "availableCommands":[
            {"name":"add-dir","description":"Allow file access to a directory and load its .github skills and agents as trusted configuration","input":{"hint":"directory"}},
            {"name":"allow-all","description":"Enable all permissions","input":{"hint":"[on|off|show]"}},
            {"name":"permissions","description":"Switch between permission modes","input":{"hint":"[default|allow-all|show]"}},
            {"name":"autopilot","description":"Toggle autopilot mode, or set an autopilot objective with an optional AI-credit limit (--max-ai-credits)","input":{"hint":"[on|off|<objective>] [--max-ai-credits <N>]"}},
            {"name":"compact","description":"Summarize conversation history to reduce context window usage. Optionally provide focus instructions.","input":{"hint":"focus instructions"}},
            {"name":"blame","description":"Trace code history with git blame and linked Copilot sessions","input":{"hint":"text | pull request | commit"}},
            {"name":"chronicle","description":"Session history tools and insights","input":{"hint":"standup|search|tips|cost-tips|improve|reindex"}},
            {"name":"context","description":"Show context window token usage and visualization"},
        ]}));
        assert!(matches!(
            AcpEvent::try_from(n),
            Ok(AcpEvent::AvailableCommands(_))
        ));
    }

    #[test]
    fn agent_message_text_survives_bridge() {
        let n = notif(json!({
            "sessionUpdate": "agent_message_chunk",
            "content": {"type": "text", "text": "Hello"}
        }));
        let Ok(AcpEvent::Message(agent_client_protocol::ContentBlock::Text(text))) =
            AcpEvent::try_from(n)
        else {
            panic!("expected text Message");
        };
        assert_eq!(text.text, "Hello");
    }

    #[test]
    fn tool_call_with_diff_maps_to_tool_call() {
        let n = notif(json!({
            "sessionUpdate": "tool_call",
            "toolCallId": "call_2",
            "title": "Edit README.md",
            "kind": "edit",
            "status": "pending",
            "content": [{
                "type": "diff",
                "path": "/repo/README.md",
                "oldText": "old line",
                "newText": "new line"
            }],
            "locations": [{"path": "/repo/README.md", "line": 3}]
        }));
        assert!(matches!(AcpEvent::try_from(n), Ok(AcpEvent::ToolCall(_))));
    }

    #[test]
    fn plan_maps_to_plan() {
        let n = notif(json!({
            "sessionUpdate": "plan",
            "entries": [
                {"content": "Read README", "priority": "high", "status": "completed"},
                {"content": "Summarize it", "priority": "medium", "status": "in_progress"}
            ]
        }));
        let Ok(AcpEvent::Plan(plan)) = AcpEvent::try_from(n) else {
            panic!("expected Plan");
        };
        assert_eq!(plan.entries.len(), 2);
    }

    #[test]
    fn current_mode_update_maps_to_current_mode() {
        let n = notif(json!({
            "sessionUpdate": "current_mode_update",
            "currentModeId": "plan"
        }));
        let Ok(AcpEvent::CurrentMode(mode)) = AcpEvent::try_from(n) else {
            panic!("expected CurrentMode");
        };
        assert_eq!(&*mode.0, "plan");
    }

    #[test]
    fn user_message_chunk_is_ignored() {
        // Agents replay the user's own messages on session/load; they must not
        // show up as assistant output.
        let n = notif(json!({
            "sessionUpdate": "user_message_chunk",
            "content": {"type": "text", "text": "Summarize the README"}
        }));
        assert!(AcpEvent::try_from(n).is_err());
    }

    #[test]
    fn unmapped_update_is_ignored() {
        let n = notif(json!({
            "sessionUpdate": "usage_update",
            "used": 12000,
            "size": 200000
        }));
        assert!(AcpEvent::try_from(n).is_err());
    }
}
