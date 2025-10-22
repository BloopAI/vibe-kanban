//! Claude Agent SDK client implementation
//!
//! This client handles control protocol callbacks and manages tool approvals.
//! MVP: Auto-approves all tools and switches to bypassPermissions mode.

use std::sync::{Arc, OnceLock};

use async_trait::async_trait;

use super::{
    protocol::{ProtocolCallbacks, ProtocolPeer},
    types::{PermissionResult, PermissionUpdate},
};
use crate::executors::{ExecutorError, codex::client::LogWriter};

/// Claude Agent client with control protocol support
pub struct ClaudeAgentClient {
    protocol: OnceLock<ProtocolPeer>,
    log_writer: LogWriter,
    auto_approve: bool, // true for MVP, false when using approval service
}

impl ClaudeAgentClient {
    /// Create a new client with auto-approve mode
    pub fn new(log_writer: LogWriter) -> Arc<Self> {
        Arc::new(Self {
            protocol: OnceLock::new(),
            log_writer,
            auto_approve: true, // Hardcoded for MVP
        })
    }

    /// Connect the protocol peer
    pub fn connect(&self, peer: ProtocolPeer) {
        let _ = self.protocol.set(peer);
    }

    /// Get the protocol peer (panics if not connected)
    #[allow(dead_code)]
    fn protocol(&self) -> &ProtocolPeer {
        self.protocol.get().expect("Protocol peer not attached")
    }
}

#[async_trait]
impl ProtocolCallbacks for ClaudeAgentClient {
    async fn on_can_use_tool(
        &self,
        _peer: &ProtocolPeer,
        tool_name: String,
        input: serde_json::Value,
        _suggestions: Option<Vec<PermissionUpdate>>,
    ) -> Result<PermissionResult, ExecutorError> {
        // MVP: Auto-approve everything
        if self.auto_approve {
            // Log what we're approving
            let input_str =
                serde_json::to_string(&input).unwrap_or_else(|_| "<invalid json>".to_string());

            self.log_writer
                .log_raw(&format!(
                    "[AUTO-APPROVE] Tool: {} Input: {}",
                    tool_name, input_str
                ))
                .await?;

            // Return allow with mode change to bypassPermissions
            Ok(PermissionResult::Allow {
                updated_input: input,
                updated_permissions: Some(vec![PermissionUpdate {
                    update_type: "setMode".to_string(),
                    mode: Some("bypassPermissions".to_string()),
                    destination: Some("session".to_string()),
                }]),
            })
        } else {
            // TODO: Phase 2 - integrate with approval service
            // For now, just deny if auto_approve is false
            Ok(PermissionResult::Deny {
                message: "Approval service not yet implemented".to_string(),
                interrupt: Some(false),
            })
        }
    }

    // async fn on_hook_callback(
    //     &self,
    //     peer: &ProtocolPeer,
    //     _callback_id: String,
    //     input: serde_json::Value,
    // ) -> Result<serde_json::Value, ExecutorError> {
    //     // Hook callback is how the CLI asks for approval via hooks
    //     // Extract tool_name from the hook input
    //     let tool_name = input
    //         .get("tool_name")
    //         .and_then(|v| v.as_str())
    //         .unwrap_or("unknown")
    //         .to_string();
    //     self.log_writer
    //         .log_raw(&format!("[AUTO-APPROVE via hook] Tool: {}", tool_name))
    //         .await?;
    //     // Return hook output format with hookSpecificOutput (no updatedPermissions here)
    //     Ok(serde_json::json!({
    //         "hookSpecificOutput": {
    //             "hookEventName": "PreToolUse",
    //             "permissionDecision": "ask",
    //             "permissionDecisionReason": "Auto-approved by SDK"
    //         }
    //     }))
    // }

    async fn on_non_control(&self, line: &str) -> Result<(), ExecutorError> {
        // Forward all non-control messages to stdout
        self.log_writer.log_raw(line).await
    }
}
