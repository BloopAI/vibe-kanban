use std::sync::{Arc, OnceLock};

use async_trait::async_trait;
use tokio::sync::Mutex;
use workspace_utils::approvals::ApprovalStatus;

use super::{
    protocol::{ProtocolCallbacks, ProtocolPeer},
    types::PermissionMode,
};
use crate::{
    approvals::ExecutorApprovalService,
    executors::{
        ExecutorError,
        claude::{
            ClaudeJson,
            types::{
                PermissionResult, PermissionUpdate, PermissionUpdateDestination,
                PermissionUpdateType,
            },
        },
        codex::client::LogWriter,
    },
};

const EXIT_PLAN_MODE_NAME: &str = "ExitPlanMode";

/// Claude Agent client with control protocol support
pub struct ClaudeAgentClient {
    protocol: OnceLock<ProtocolPeer>,
    log_writer: LogWriter,
    approvals: Option<Arc<dyn ExecutorApprovalService>>,
    auto_approve: bool, // true when approvals is None
    session_id: Mutex<Option<String>>,
    latest_unhandled_tool_use_id: Mutex<Option<String>>,
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
            latest_unhandled_tool_use_id: Mutex::new(None),
        })
    }
    async fn set_latest_unhandled_tool_use_id(&self, tool_use_id: String) {
        if self.latest_unhandled_tool_use_id.lock().await.is_some() {
            tracing::error!(
                "Overwriting unhandled tool_use_id: {} with new tool_use_id: {}",
                self.latest_unhandled_tool_use_id
                    .lock()
                    .await
                    .as_ref()
                    .unwrap(),
                tool_use_id
            );
        }
        let mut guard = self.latest_unhandled_tool_use_id.lock().await;
        guard.replace(tool_use_id);
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

#[async_trait]
impl ProtocolCallbacks for ClaudeAgentClient {
    async fn on_can_use_tool(
        &self,
        _peer: &ProtocolPeer,
        tool_name: String,
        input: serde_json::Value,
        _permission_suggestions: Option<Vec<PermissionUpdate>>,
    ) -> Result<PermissionResult, ExecutorError> {
        if self.auto_approve {
            // Auto-approve mode
            let input_str =
                serde_json::to_string(&input).unwrap_or_else(|_| "<invalid json>".to_string());

            self.log_writer
                .log_raw(&format!(
                    "[AUTO-APPROVE] Tool: {} Input: {}",
                    tool_name, input_str
                ))
                .await?;
            Ok(PermissionResult::Allow {
                updated_input: input,
                updated_permissions: None,
            })
        } else {
            // Use approval service
            let approval_service = self.approvals.as_ref().ok_or_else(|| {
                ExecutorError::Io(std::io::Error::other("Approval service not available"))
            })?;
            let latest_tool_use_id = {
                let guard = self.latest_unhandled_tool_use_id.lock().await;
                guard.clone()
            };
            match approval_service
                .request_tool_approval(&tool_name, input.clone(), latest_tool_use_id.as_deref())
                .await
            {
                Ok(status) => {
                    self.log_writer
                        .log_raw(&serde_json::to_string(&ClaudeJson::ApprovalResponse {
                            call_id: latest_tool_use_id.clone(),
                            tool_name: tool_name.clone(),
                            approval_status: status.clone(),
                        })?)
                        .await?;
                    match status {
                        ApprovalStatus::Approved => {
                            if tool_name == EXIT_PLAN_MODE_NAME {
                                Ok(PermissionResult::Allow {
                                    updated_input: input,
                                    updated_permissions: Some(vec![PermissionUpdate {
                                        update_type: PermissionUpdateType::SetMode,
                                        mode: Some(PermissionMode::BypassPermissions),
                                        destination: PermissionUpdateDestination::Session,
                                    }]),
                                })
                            } else {
                                Ok(PermissionResult::Allow {
                                    updated_input: input,
                                    updated_permissions: None,
                                })
                            }
                        }
                        ApprovalStatus::Denied { reason } => {
                            let message = reason.unwrap_or_else(|| "Denied by user".to_string());
                            Ok(PermissionResult::Deny {
                                message,
                                interrupt: Some(false),
                            })
                        }
                        ApprovalStatus::TimedOut => Ok(PermissionResult::Deny {
                            message: "Approval request timed out".to_string(),
                            interrupt: Some(false),
                        }),
                        ApprovalStatus::Pending => Ok(PermissionResult::Deny {
                            message: "Approval still pending (unexpected)".to_string(),
                            interrupt: Some(false),
                        }),
                    }
                }
                Err(e) => {
                    tracing::error!("Tool approval request failed: {}", e);
                    Ok(PermissionResult::Deny {
                        message: "Tool approval request failed".to_string(),
                        interrupt: Some(false),
                    })
                }
            }
        }
    }

    async fn on_hook_callback(
        &self,
        _peer: &ProtocolPeer,
        _callback_id: String,
        _input: serde_json::Value,
        tool_use_id: Option<String>,
    ) -> Result<serde_json::Value, ExecutorError> {
        if self.auto_approve {
            Ok(serde_json::json!({
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "allow",
                    "permissionDecisionReason": "Auto-approved by SDK"
                }
            }))
        } else {
            // Hook callbacks is only used to store tool_use_id for later approval request
            // Both hook callback and can_use_tool are needed.
            // - Hook callbacks have a constant 60s timeout, so cannot be used for long approvals
            // - can_use_tool does not provide tool_use_id, so cannot be used alone
            // Together they allow matching approval requests to tool uses.
            // This works because `ask` decision in hook callback triggers a can_use_tool request
            // https://docs.claude.com/en/api/agent-sdk/permissions#permission-flow-diagram
            if let Some(tool_use_id) = tool_use_id.clone() {
                self.set_latest_unhandled_tool_use_id(tool_use_id).await;
            }
            return Ok(serde_json::json!({
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "ask",
                    "permissionDecisionReason": "Forwarding to canusetool service"
                }
            }));
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
