use std::sync::Arc;

use tokio::sync::Mutex;
use workspace_utils::approvals::ApprovalStatus;

use super::types::PermissionMode;
use crate::{
    approvals::{ExecutorApprovalError, ExecutorApprovalService},
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
    log_writer: LogWriter,
    approvals: Option<Arc<dyn ExecutorApprovalService>>,
    auto_approve: bool, // true when approvals is None
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
            log_writer,
            approvals,
            auto_approve,
            latest_unhandled_tool_use_id: Mutex::new(None),
        })
    }
    async fn set_latest_unhandled_tool_use_id(&self, tool_use_id: String) {
        if self.latest_unhandled_tool_use_id.lock().await.is_some() {
            tracing::warn!(
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

    async fn handle_approval(
        &self,
        tool_use_id: String,
        tool_name: String,
        tool_input: serde_json::Value,
    ) -> Result<PermissionResult, ExecutorError> {
        // Use approval service to request tool approval
        let approval_service = self
            .approvals
            .as_ref()
            .ok_or(ExecutorApprovalError::ServiceUnavailable)?;
        let status = approval_service
            .request_tool_approval(&tool_name, tool_input.clone(), &tool_use_id)
            .await;
        match status {
            Ok(status) => {
                // Log the approval response so we it appears in the executor logs
                self.log_writer
                    .log_raw(&serde_json::to_string(&ClaudeJson::ApprovalResponse {
                        call_id: tool_use_id.clone(),
                        tool_name: tool_name.clone(),
                        approval_status: status.clone(),
                    })?)
                    .await?;
                match status {
                    ApprovalStatus::Approved => {
                        if tool_name == EXIT_PLAN_MODE_NAME {
                            Ok(PermissionResult::Allow {
                                updated_input: tool_input,
                                updated_permissions: Some(vec![PermissionUpdate {
                                    update_type: PermissionUpdateType::SetMode,
                                    mode: Some(PermissionMode::BypassPermissions),
                                    destination: PermissionUpdateDestination::Session,
                                }]),
                            })
                        } else {
                            Ok(PermissionResult::Allow {
                                updated_input: tool_input,
                                updated_permissions: None,
                            })
                        }
                    }
                    ApprovalStatus::Denied { reason } => {
                        let message = reason.unwrap_or("Denied by user".to_string());
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
                tracing::error!("Tool approval request failed: {e}");
                Ok(PermissionResult::Deny {
                    message: "Tool approval request failed".to_string(),
                    interrupt: Some(false),
                })
            }
        }
    }

    pub async fn on_can_use_tool(
        &self,
        tool_name: String,
        input: serde_json::Value,
        _permission_suggestions: Option<Vec<PermissionUpdate>>,
    ) -> Result<PermissionResult, ExecutorError> {
        if self.auto_approve {
            Ok(PermissionResult::Allow {
                updated_input: input,
                updated_permissions: None,
            })
        } else {
            let latest_tool_use_id = {
                let guard = self.latest_unhandled_tool_use_id.lock().await.take();
                guard.clone()
            };

            if let Some(latest_tool_use_id) = latest_tool_use_id {
                self.handle_approval(latest_tool_use_id, tool_name, input)
                    .await
            } else {
                // Auto approve tools with no matching tool_use_id.
                // This rare edge case happens if a tool call triggers no hook callback,
                // so no tool_use_id is available to match the approval request to.
                tracing::warn!(
                    "No unhandled tool_use_id available for tool '{}', cannot request approval",
                    tool_name
                );
                Ok(PermissionResult::Allow {
                    updated_input: input,
                    updated_permissions: None,
                })
            }
        }
    }

    pub async fn on_hook_callback(
        &self,
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
            Ok(serde_json::json!({
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "ask",
                    "permissionDecisionReason": "Forwarding to canusetool service"
                }
            }))
        }
    }

    pub async fn on_non_control(&self, line: &str) -> Result<(), ExecutorError> {
        // Forward all non-control messages to stdout
        self.log_writer.log_raw(line).await
    }
}
