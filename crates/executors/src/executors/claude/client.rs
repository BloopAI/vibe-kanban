use std::sync::Arc;

use workspace_utils::approvals::{ApprovalStatus, Question};

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
        })
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
        tool_use_id: Option<String>,
    ) -> Result<PermissionResult, ExecutorError> {
        if self.auto_approve {
            Ok(PermissionResult::Allow {
                updated_input: input,
                updated_permissions: None,
            })
        } else if let Some(latest_tool_use_id) = tool_use_id {
            self.handle_approval(latest_tool_use_id, tool_name, input)
                .await
        } else {
            // Auto approve tools with no matching tool_use_id
            // tool_use_id is undocumented so this may not be possible
            tracing::warn!(
                "No tool_use_id available for tool '{}', cannot request approval",
                tool_name
            );
            Ok(PermissionResult::Allow {
                updated_input: input,
                updated_permissions: None,
            })
        }
    }

    pub async fn on_hook_callback(
        &self,
        _callback_id: String,
        _input: serde_json::Value,
        _tool_use_id: Option<String>,
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
            // Hook callbacks is only used to forward approval requests to can_use_tool.
            // This works because `ask` decision in hook callback triggers a can_use_tool request
            // https://docs.claude.com/en/api/agent-sdk/permissions#permission-flow-diagram
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

    /// Handle AskUserQuestion control request
    pub async fn on_ask_user_question(
        &self,
        questions: Vec<Question>,
        tool_use_id: Option<String>,
    ) -> Result<serde_json::Value, ExecutorError> {
        // AskUserQuestion should always prompt the user, even in auto_approve mode
        // This is because it's gathering information, not requesting permissions
        let approval_service = match self.approvals.as_ref() {
            Some(service) => service,
            None => {
                // No approval service available - return empty answers with error
                tracing::warn!("AskUserQuestion called without approval service");
                return Ok(serde_json::json!({
                    "error": "User questions not available in auto-approve mode"
                }));
            }
        };

        let call_id = match tool_use_id {
            Some(id) => id,
            None => {
                tracing::warn!("AskUserQuestion called without tool_use_id");
                return Ok(serde_json::json!({
                    "error": "No tool_use_id provided for question"
                }));
            }
        };

        // Use the approval service to request user questions
        match approval_service
            .request_question_approval(&questions, &call_id)
            .await
        {
            Ok((status, answers)) => {
                // Log the question response
                self.log_writer
                    .log_raw(&serde_json::to_string(&ClaudeJson::ApprovalResponse {
                        call_id: call_id.clone(),
                        tool_name: "AskUserQuestion".to_string(),
                        approval_status: status.clone(),
                    })?)
                    .await?;

                match status {
                    ApprovalStatus::Approved => {
                        // Return answers in format expected by Claude Code
                        Ok(serde_json::json!({ "answers": answers.unwrap_or_default() }))
                    }
                    ApprovalStatus::Denied { reason } => Ok(serde_json::json!({
                        "error": reason.unwrap_or_else(|| "User cancelled".to_string())
                    })),
                    ApprovalStatus::TimedOut => {
                        Ok(serde_json::json!({ "error": "Question request timed out" }))
                    }
                    ApprovalStatus::Pending => {
                        Ok(serde_json::json!({ "error": "Question still pending (unexpected)" }))
                    }
                }
            }
            Err(e) => {
                tracing::error!("Question approval request failed: {e}");
                Ok(serde_json::json!({ "error": "Question request failed" }))
            }
        }
    }
}
