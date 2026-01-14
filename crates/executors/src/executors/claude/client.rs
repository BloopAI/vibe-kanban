use std::{
    path::{Path, PathBuf},
    sync::Arc,
};

use tokio::process::Command;
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
pub const AUTO_APPROVE_CALLBACK_ID: &str = "AUTO_APPROVE_CALLBACK_ID";
pub const STOP_GIT_CHECK_CALLBACK_ID: &str = "STOP_GIT_CHECK_CALLBACK_ID";

/// Claude Agent client with control protocol support
pub struct ClaudeAgentClient {
    log_writer: LogWriter,
    approvals: Option<Arc<dyn ExecutorApprovalService>>,
    auto_approve: bool, // true when approvals is None
    working_dir: PathBuf,
}

impl ClaudeAgentClient {
    /// Create a new client with optional approval service
    pub fn new(
        log_writer: LogWriter,
        approvals: Option<Arc<dyn ExecutorApprovalService>>,
        working_dir: PathBuf,
    ) -> Arc<Self> {
        let auto_approve = approvals.is_none();
        Arc::new(Self {
            log_writer,
            approvals,
            auto_approve,
            working_dir,
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
                                    destination: Some(PermissionUpdateDestination::Session),
                                    rules: None,
                                    behavior: None,
                                    directories: None,
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
        callback_id: String,
        _input: serde_json::Value,
        _tool_use_id: Option<String>,
    ) -> Result<serde_json::Value, ExecutorError> {
        // Stop hook git check - uses top-level `continue` and `stopReason` fields
        // (not wrapped in hookSpecificOutput like PreToolUse hooks)
        if callback_id == STOP_GIT_CHECK_CALLBACK_ID {
            return Ok(check_git_status(&self.working_dir).await);
        }

        if self.auto_approve {
            Ok(serde_json::json!({
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "allow",
                    "permissionDecisionReason": "Auto-approved by SDK"
                }
            }))
        } else {
            match callback_id.as_str() {
                AUTO_APPROVE_CALLBACK_ID => Ok(serde_json::json!({
                    "hookSpecificOutput": {
                        "hookEventName": "PreToolUse",
                        "permissionDecision": "allow",
                        "permissionDecisionReason": "Approved by SDK"
                    }
                })),
                _ => {
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
        }
    }

    pub async fn on_non_control(&self, line: &str) -> Result<(), ExecutorError> {
        // Forward all non-control messages to stdout
        self.log_writer.log_raw(line).await
    }
}

/// Check for uncommitted git changes in the working directory.
/// Returns a Stop hook response using `decision` (approve/block) and `reason` fields.
async fn check_git_status(working_dir: &Path) -> serde_json::Value {
    // Find git repo - check current dir first, then subdirs
    let git_dir = if working_dir.join(".git").exists() {
        Some(working_dir.to_path_buf())
    } else {
        // Check immediate subdirectories (fallback for multi-repo or edge cases)
        find_git_repo_in_subdirs(working_dir).await
    };

    let Some(repo_dir) = git_dir else {
        // No git repo found, allow stop
        return serde_json::json!({"decision": "approve"});
    };

    // Check for uncommitted changes using git status --porcelain
    let output = Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(&repo_dir)
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()
        .await;

    match output {
        Ok(out) if out.stdout.is_empty() => {
            // No uncommitted changes, allow stop
            serde_json::json!({"decision": "approve"})
        }
        Ok(out) => {
            // Has uncommitted changes, block stop
            let status = String::from_utf8_lossy(&out.stdout);
            serde_json::json!({
                "decision": "block",
                "reason": format!(
                    "There are uncommitted changes. Please stage and commit them now with a descriptive commit message.\n\ngit status:\n{}",
                    status.trim()
                )
            })
        }
        Err(e) => {
            // Git command failed, log warning but allow stop
            tracing::warn!("Failed to check git status: {e}");
            serde_json::json!({"decision": "approve"})
        }
    }
}

/// Search for a git repository in immediate subdirectories
async fn find_git_repo_in_subdirs(dir: &Path) -> Option<PathBuf> {
    let mut entries = match tokio::fs::read_dir(dir).await {
        Ok(entries) => entries,
        Err(_) => return None,
    };

    while let Ok(Some(entry)) = entries.next_entry().await {
        let file_type = match entry.file_type().await {
            Ok(ft) => ft,
            Err(_) => continue,
        };

        if file_type.is_dir() {
            let subdir = entry.path();
            if subdir.join(".git").exists() {
                return Some(subdir);
            }
        }
    }
    None
}
