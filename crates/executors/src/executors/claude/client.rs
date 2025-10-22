use std::sync::{Arc, OnceLock};

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use workspace_utils::approvals::ApprovalStatus;

use super::{
    protocol::{ProtocolCallbacks, ProtocolPeer},
    types::PermissionMode,
};
use crate::{
    approvals::ExecutorApprovalService,
    executors::{ExecutorError, codex::client::LogWriter},
};

const EXIT_PLAN_MODE_NAME: &str = "ExitPlanMode";

/// Claude Agent client with control protocol support
pub struct ClaudeAgentClient {
    protocol: OnceLock<ProtocolPeer>,
    log_writer: LogWriter,
    approvals: Option<Arc<dyn ExecutorApprovalService>>,
    auto_approve: bool, // true when approvals is None
    session_id: Mutex<Option<String>>,
}

impl ClaudeAgentClient {
    /// Create a new client with optional approval service
    pub fn new(
        log_writer: LogWriter,
        approvals: Option<Arc<dyn ExecutorApprovalService>>,
    ) -> Arc<Self> {
        let auto_approve = approvals.is_none();
        Arc::new(Self {
            protocol: OnceLock::new(),
            log_writer,
            approvals,
            auto_approve,
            session_id: Mutex::new(None),
        })
    }

    /// Register the session with the approval service
    pub async fn register_session(&self, session_id: String) -> Result<(), ExecutorError> {
        {
            let mut guard = self.session_id.lock().await;
            guard.replace(session_id.clone());
        }

        if let Some(approvals) = self.approvals.as_ref() {
            approvals
                .register_session(&session_id)
                .await
                .map_err(|err| ExecutorError::Io(std::io::Error::other(err.to_string())))?;
        }

        Ok(())
    }

    /// Connect the protocol peer
    pub fn connect(&self, peer: ProtocolPeer) {
        let _ = self.protocol.set(peer);
    }
}

/// Approval message for logging to output stream
#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "snake_case")]
pub struct Approval {
    #[serde(rename = "type")]
    message_type: String,
    pub call_id: String,
    pub tool_name: String,
    pub approval_status: ApprovalStatus,
}

impl Approval {
    pub fn approval_response(
        call_id: String,
        tool_name: String,
        approval_status: ApprovalStatus,
    ) -> Self {
        Self {
            message_type: "approval_response".to_string(),
            call_id,
            tool_name,
            approval_status,
        }
    }

    pub fn raw(&self) -> String {
        serde_json::to_string(self).unwrap_or_default()
    }
}

#[async_trait]
impl ProtocolCallbacks for ClaudeAgentClient {
    async fn on_hook_callback(
        &self,
        peer: &ProtocolPeer,
        _callback_id: String,
        input: serde_json::Value,
        tool_use_id: Option<String>,
    ) -> Result<serde_json::Value, ExecutorError> {
        // Hook callback provides tool_use_id for approval matching
        let tool_name = input
            .get("tool_name")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();

        let tool_input = input
            .get("tool_input")
            .cloned()
            .unwrap_or(serde_json::Value::Null);
        let tool_use_id = tool_use_id.unwrap_or("unknown_tool_use_id".to_string());

        if self.auto_approve {
            self.log_writer
                .log_raw(&format!("[AUTO-APPROVE via hook] Tool: {tool_name}"))
                .await?;
            Ok(serde_json::json!({
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "allow",
                    "permissionDecisionReason": "Auto-approved by SDK"
                }
            }))
        } else {
            // Use approval service with real tool_use_id
            let approval_service = self.approvals.as_ref().ok_or_else(|| {
                ExecutorError::Io(std::io::Error::other("Approval service not available"))
            })?;

            tracing::debug!(
                "Requesting approval for tool: {} with tool_use_id: {}",
                tool_name,
                tool_use_id
            );

            let status = approval_service
                .request_tool_approval(&tool_name, tool_input.clone(), &tool_use_id)
                .await?;

            // Log approval response for UI
            self.log_writer
                .log_raw(
                    &Approval::approval_response(
                        tool_use_id.clone(),
                        tool_name.clone(),
                        status.clone(),
                    )
                    .raw(),
                )
                .await?;

            match status {
                ApprovalStatus::Approved => {
                    if tool_name == EXIT_PLAN_MODE_NAME {
                        if let Err(e) = peer.set_permission_mode(PermissionMode::AcceptEdits).await
                        {
                            tracing::warn!("Failed to set permission mode: {}", e);
                        } else {
                            tracing::debug!("Exited plan mode");
                        }
                    }
                    Ok(serde_json::json!({
                        "hookSpecificOutput": {
                            "hookEventName": "PreToolUse",
                            "permissionDecision": "allow"
                        }
                    }))
                }
                ApprovalStatus::Denied { reason } => {
                    let message = reason.unwrap_or_else(|| "Denied by user".to_string());

                    Ok(serde_json::json!({
                        "hookSpecificOutput": {
                            "hookEventName": "PreToolUse",
                            "permissionDecision": "deny",
                            "permissionDecisionReason": message
                        }
                    }))
                }
                ApprovalStatus::TimedOut => Ok(serde_json::json!({
                    "hookSpecificOutput": {
                        "hookEventName": "PreToolUse",
                        "permissionDecision": "deny",
                        "permissionDecisionReason": "Approval request timed out"
                    }
                })),
                ApprovalStatus::Pending => Ok(serde_json::json!({
                    "hookSpecificOutput": {
                        "hookEventName": "PreToolUse",
                        "permissionDecision": "deny",
                        "permissionDecisionReason": "Approval still pending (unexpected)"
                    }
                })),
            }
        }
    }

    async fn on_session_init(&self, session_id: String) -> Result<(), ExecutorError> {
        self.register_session(session_id).await
    }

    async fn on_non_control(&self, line: &str) -> Result<bool, ExecutorError> {
        // Forward all non-control messages to stdout
        self.log_writer.log_raw(line).await?;

        // Check for result message indicating task completion
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(line)
            && value.get("type").and_then(|t| t.as_str()) == Some("result")
        {
            tracing::info!("Detected result message, task complete");
            return Ok(true);
        }

        Ok(false)
    }
}
