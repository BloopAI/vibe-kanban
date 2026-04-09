//! Codex executor log normalization using the shared LogNormalizer trait.
//!
//! This module implements log normalization for the Codex executor,
//! converting JSONRPC events into normalized conversation entries.

use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::Arc,
};

use codex_app_server_protocol::{
    JSONRPCNotification, JSONRPCResponse, NewConversationResponse, ServerNotification,
};
use codex_mcp_types::ContentBlock;
use codex_protocol::{
    openai_models::ReasoningEffort,
    plan_tool::{StepStatus, UpdatePlanArgs},
    protocol::{
        AgentMessageDeltaEvent, AgentMessageEvent, AgentReasoningDeltaEvent, AgentReasoningEvent,
        AgentReasoningSectionBreakEvent, ApplyPatchApprovalRequestEvent, BackgroundEventEvent,
        ErrorEvent, EventMsg, ExecApprovalRequestEvent, ExecCommandBeginEvent, ExecCommandEndEvent,
        ExecCommandOutputDeltaEvent, ExecOutputStream, FileChange as CodexProtoFileChange,
        McpInvocation, McpToolCallBeginEvent, McpToolCallEndEvent, PatchApplyBeginEvent,
        PatchApplyEndEvent, StreamErrorEvent, TokenUsageInfo, ViewImageToolCallEvent, WarningEvent,
        WebSearchBeginEvent, WebSearchEndEvent,
    },
};
use json_patch::Patch;
use lazy_static::lazy_static;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use workspace_utils::{
    approvals::ApprovalStatus,
    diff::{concatenate_diff_hunks, extract_unified_diff_hunks},
    msg_store::MsgStore,
    path::make_path_relative,
};

use crate::{
    approvals::ToolCallMetadata,
    executors::codex::session::SessionHandler,
    logs::{
        ActionType, CommandExitStatus, CommandRunResult, FileChange, NormalizedEntry,
        NormalizedEntryError, NormalizedEntryType, TodoItem, ToolResult, ToolResultValueType,
        ToolStatus,
        normalizer::{LogNormalizer, normalize_logs_with},
        stderr_processor::normalize_stderr_logs,
        utils::{ConversationPatch, EntryIndexProvider},
    },
};

trait ToNormalizedEntry {
    fn to_normalized_entry(&self) -> NormalizedEntry;
}

trait ToNormalizedEntryOpt {
    fn to_normalized_entry_opt(&self) -> Option<NormalizedEntry>;
}

#[derive(Debug, Deserialize)]
struct CodexNotificationParams {
    #[serde(rename = "msg")]
    msg: EventMsg,
}

/// Event types that can be parsed from Codex log lines.
#[derive(Debug, Clone)]
pub enum CodexEvent {
    /// An error event (LaunchError or AuthRequired)
    Error(Error),
    /// An approval response (denied or timed out only generates entries)
    Approval(Approval),
    /// Session ID extracted from various sources (without model params)
    SessionStart(String),
    /// Model parameters with optional session ID (from NewConversationResponse)
    ModelParamsWithSession {
        session_id: Option<String>,
        model: String,
        reasoning_effort: Option<ReasoningEffort>,
    },
    /// Main event from JSONRPC notification
    Event(EventMsg),
}

/// Normalizer for Codex executor logs.
///
/// Implements the `LogNormalizer` trait to process Codex protocol events
/// and convert them into normalized conversation entries.
pub struct CodexNormalizer {
    /// Path to the worktree for relative path resolution.
    worktree_path: PathBuf,
    /// Log processing state.
    state: LogState,
}

impl CodexNormalizer {
    /// Create a new CodexNormalizer for the given worktree path.
    pub fn new(worktree_path: PathBuf, entry_index: EntryIndexProvider) -> Self {
        Self {
            worktree_path,
            state: LogState::new(entry_index),
        }
    }
}

impl LogNormalizer for CodexNormalizer {
    type Event = CodexEvent;

    fn parse_line(&self, line: &str) -> Option<Self::Event> {
        // Try to parse as Error first
        if let Ok(error) = serde_json::from_str::<Error>(line) {
            return Some(CodexEvent::Error(error));
        }

        // Try to parse as Approval
        if let Ok(approval) = serde_json::from_str::<Approval>(line) {
            return Some(CodexEvent::Approval(approval));
        }

        // Try to parse as JSONRPCResponse for session ID and model params
        if let Ok(response) = serde_json::from_str::<JSONRPCResponse>(line) {
            if let Ok(conv_response) =
                serde_json::from_value::<NewConversationResponse>(response.result.clone())
            {
                let session_id = SessionHandler::extract_session_id_from_rollout_path(
                    conv_response.rollout_path,
                )
                .ok();
                return Some(CodexEvent::ModelParamsWithSession {
                    session_id,
                    model: conv_response.model,
                    reasoning_effort: conv_response.reasoning_effort,
                });
            }
            // Even if we can't parse NewConversationResponse, it's a JSONRPC response, skip
            return None;
        }

        // Try to parse as ServerNotification for session ID
        if let Ok(server_notification) = serde_json::from_str::<ServerNotification>(line) {
            if let ServerNotification::SessionConfigured(session_configured) = server_notification {
                return Some(CodexEvent::SessionStart(
                    session_configured.session_id.to_string(),
                ));
            }
            return None;
        }

        // Best-effort extraction of session ID from logs
        if let Some(session_id) = line
            .strip_prefix(r#"{"method":"sessionConfigured","params":{"sessionId":""#)
            .and_then(|suffix| SESSION_ID.captures(suffix).and_then(|caps| caps.get(1)))
        {
            return Some(CodexEvent::SessionStart(session_id.as_str().to_string()));
        }

        // Try to parse as JSONRPCNotification
        let notification: JSONRPCNotification = serde_json::from_str(line).ok()?;

        if !notification.method.starts_with("codex/event") {
            return None;
        }

        let params = notification
            .params
            .and_then(|p| serde_json::from_value::<CodexNotificationParams>(p).ok())?;

        Some(CodexEvent::Event(params.msg))
    }

    fn extract_session_id(&self, event: &Self::Event) -> Option<String> {
        match event {
            CodexEvent::SessionStart(id) => Some(id.clone()),
            CodexEvent::ModelParamsWithSession {
                session_id: Some(id),
                ..
            } => Some(id.clone()),
            CodexEvent::Event(EventMsg::SessionConfigured(payload)) => {
                Some(payload.session_id.to_string())
            }
            _ => None,
        }
    }

    fn process_event(
        &mut self,
        event: Self::Event,
        msg_store: &Arc<MsgStore>,
        entry_index: &EntryIndexProvider,
    ) -> Vec<Patch> {
        match event {
            CodexEvent::Error(error) => {
                let entry = error.to_normalized_entry();
                let idx = entry_index.next();
                vec![ConversationPatch::add_normalized_entry(idx, entry)]
            }
            CodexEvent::Approval(approval) => {
                if let Some(entry) = approval.to_normalized_entry_opt() {
                    let idx = entry_index.next();
                    vec![ConversationPatch::add_normalized_entry(idx, entry)]
                } else {
                    vec![]
                }
            }
            CodexEvent::SessionStart(_) => {
                // Session ID is handled by extract_session_id and driver
                vec![]
            }
            CodexEvent::ModelParamsWithSession {
                model,
                reasoning_effort,
                ..
            } => {
                // Session ID is handled by extract_session_id and driver
                let entry = create_model_params_entry(model, reasoning_effort);
                let idx = entry_index.next();
                vec![ConversationPatch::add_normalized_entry(idx, entry)]
            }
            CodexEvent::Event(event_msg) => {
                self.process_event_msg(event_msg, msg_store, entry_index)
            }
        }
    }
}

impl CodexNormalizer {
    /// Process an EventMsg and return patches.
    fn process_event_msg(
        &mut self,
        event: EventMsg,
        _msg_store: &Arc<MsgStore>,
        entry_index: &EntryIndexProvider,
    ) -> Vec<Patch> {
        let worktree_path_str = self.worktree_path.to_string_lossy().to_string();

        match event {
            EventMsg::SessionConfigured(payload) => {
                // Session ID handled by extract_session_id
                // Return model params entry
                let entry = create_model_params_entry(payload.model, payload.reasoning_effort);
                let idx = entry_index.next();
                vec![ConversationPatch::add_normalized_entry(idx, entry)]
            }
            EventMsg::AgentMessageDelta(AgentMessageDeltaEvent { delta }) => {
                self.state.thinking = None;
                let (entry, index, is_new) = self.state.assistant_message_append(delta);
                vec![upsert_patch(index, entry, is_new)]
            }
            EventMsg::AgentReasoningDelta(AgentReasoningDeltaEvent { delta }) => {
                self.state.assistant = None;
                let (entry, index, is_new) = self.state.thinking_append(delta);
                vec![upsert_patch(index, entry, is_new)]
            }
            EventMsg::AgentMessage(AgentMessageEvent { message }) => {
                self.state.thinking = None;
                let (entry, index, is_new) = self.state.assistant_message(message);
                let patch = upsert_patch(index, entry, is_new);
                self.state.assistant = None;
                vec![patch]
            }
            EventMsg::AgentReasoning(AgentReasoningEvent { text }) => {
                self.state.assistant = None;
                let (entry, index, is_new) = self.state.thinking(text);
                let patch = upsert_patch(index, entry, is_new);
                self.state.thinking = None;
                vec![patch]
            }
            EventMsg::AgentReasoningSectionBreak(AgentReasoningSectionBreakEvent { .. }) => {
                self.state.assistant = None;
                self.state.thinking = None;
                vec![]
            }
            EventMsg::ExecApprovalRequest(ExecApprovalRequestEvent {
                call_id,
                command,
                reason,
                ..
            }) => {
                self.state.assistant = None;
                self.state.thinking = None;

                let command_text = if command.is_empty() {
                    reason
                        .filter(|r| !r.is_empty())
                        .unwrap_or_else(|| "command execution".to_string())
                } else {
                    command.join(" ")
                };

                let command_state = self.state.commands.entry(call_id.clone()).or_default();

                if command_state.command.is_empty() {
                    command_state.command = command_text;
                }
                command_state.awaiting_approval = true;
                command_state.call_id = call_id;

                if let Some(index) = command_state.index {
                    vec![ConversationPatch::replace(
                        index,
                        command_state.to_normalized_entry(),
                    )]
                } else {
                    let index = entry_index.next();
                    command_state.index = Some(index);
                    vec![ConversationPatch::add_normalized_entry(
                        index,
                        command_state.to_normalized_entry(),
                    )]
                }
            }
            EventMsg::ApplyPatchApprovalRequest(ApplyPatchApprovalRequestEvent {
                call_id,
                changes,
                ..
            }) => {
                self.state.assistant = None;
                self.state.thinking = None;

                let normalized = normalize_file_changes(&worktree_path_str, &changes);
                let patch_state = self.state.patches.entry(call_id.clone()).or_default();

                let mut patches = Vec::new();

                // Remove old entries
                for entry in patch_state.entries.drain(..) {
                    if let Some(index) = entry.index {
                        patches.push(ConversationPatch::remove(index));
                    }
                }

                // Add new entries
                for (path, file_changes) in normalized {
                    let index = entry_index.next();
                    let entry = PatchEntry {
                        index: Some(index),
                        path,
                        changes: file_changes,
                        status: ToolStatus::Created,
                        awaiting_approval: true,
                        call_id: call_id.clone(),
                    };
                    patches.push(ConversationPatch::add_normalized_entry(
                        index,
                        entry.to_normalized_entry(),
                    ));
                    patch_state.entries.push(entry);
                }

                patches
            }
            EventMsg::ExecCommandBegin(ExecCommandBeginEvent {
                call_id, command, ..
            }) => {
                self.state.assistant = None;
                self.state.thinking = None;
                let command_text = command.join(" ");
                if command_text.is_empty() {
                    return vec![];
                }
                let index = entry_index.next();
                self.state.commands.insert(
                    call_id.clone(),
                    CommandState {
                        index: Some(index),
                        command: command_text,
                        stdout: String::new(),
                        stderr: String::new(),
                        formatted_output: None,
                        status: ToolStatus::Created,
                        exit_code: None,
                        awaiting_approval: false,
                        call_id: call_id.clone(),
                    },
                );
                let command_state = self.state.commands.get(&call_id).unwrap();
                vec![ConversationPatch::add_normalized_entry(
                    index,
                    command_state.to_normalized_entry(),
                )]
            }
            EventMsg::ExecCommandOutputDelta(ExecCommandOutputDeltaEvent {
                call_id,
                stream,
                chunk,
            }) => {
                if let Some(command_state) = self.state.commands.get_mut(&call_id) {
                    let chunk = String::from_utf8_lossy(&chunk);
                    if chunk.is_empty() {
                        return vec![];
                    }
                    match stream {
                        ExecOutputStream::Stdout => command_state.stdout.push_str(&chunk),
                        ExecOutputStream::Stderr => command_state.stderr.push_str(&chunk),
                    }
                    let Some(index) = command_state.index else {
                        tracing::error!("missing entry index for existing command state");
                        return vec![];
                    };
                    vec![ConversationPatch::replace(
                        index,
                        command_state.to_normalized_entry(),
                    )]
                } else {
                    vec![]
                }
            }
            EventMsg::ExecCommandEnd(ExecCommandEndEvent {
                call_id,
                exit_code,
                formatted_output,
                ..
            }) => {
                if let Some(mut command_state) = self.state.commands.remove(&call_id) {
                    command_state.formatted_output = Some(formatted_output);
                    command_state.exit_code = Some(exit_code);
                    command_state.awaiting_approval = false;
                    command_state.status = if exit_code == 0 {
                        ToolStatus::Success
                    } else {
                        ToolStatus::Failed
                    };
                    let Some(index) = command_state.index else {
                        tracing::error!("missing entry index for existing command state");
                        return vec![];
                    };
                    vec![ConversationPatch::replace(
                        index,
                        command_state.to_normalized_entry(),
                    )]
                } else {
                    vec![]
                }
            }
            EventMsg::BackgroundEvent(BackgroundEventEvent { message }) => {
                let idx = entry_index.next();
                let entry = NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::SystemMessage,
                    content: format!("Background event: {message}"),
                    metadata: None,
                };
                vec![ConversationPatch::add_normalized_entry(idx, entry)]
            }
            EventMsg::StreamError(StreamErrorEvent {
                message,
                codex_error_info,
                ..
            }) => {
                let idx = entry_index.next();
                let entry = NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::ErrorMessage {
                        error_type: NormalizedEntryError::Other,
                    },
                    content: format!("Stream error: {message} {codex_error_info:?}"),
                    metadata: None,
                };
                vec![ConversationPatch::add_normalized_entry(idx, entry)]
            }
            EventMsg::McpToolCallBegin(McpToolCallBeginEvent {
                call_id,
                invocation,
            }) => {
                self.state.assistant = None;
                self.state.thinking = None;
                let index = entry_index.next();
                self.state.mcp_tools.insert(
                    call_id.clone(),
                    McpToolState {
                        index: Some(index),
                        invocation,
                        result: None,
                        status: ToolStatus::Created,
                    },
                );
                let mcp_tool_state = self.state.mcp_tools.get(&call_id).unwrap();
                vec![ConversationPatch::add_normalized_entry(
                    index,
                    mcp_tool_state.to_normalized_entry(),
                )]
            }
            EventMsg::McpToolCallEnd(McpToolCallEndEvent {
                call_id, result, ..
            }) => {
                if let Some(mut mcp_tool_state) = self.state.mcp_tools.remove(&call_id) {
                    match result {
                        Ok(value) => {
                            mcp_tool_state.status = if value.is_error.unwrap_or(false) {
                                ToolStatus::Failed
                            } else {
                                ToolStatus::Success
                            };
                            if value
                                .content
                                .iter()
                                .all(|block| matches!(block, ContentBlock::TextContent(_)))
                            {
                                mcp_tool_state.result = Some(ToolResult {
                                    r#type: ToolResultValueType::Markdown,
                                    value: Value::String(
                                        value
                                            .content
                                            .iter()
                                            .map(|block| {
                                                if let ContentBlock::TextContent(content) = block {
                                                    content.text.clone()
                                                } else {
                                                    unreachable!()
                                                }
                                            })
                                            .collect::<Vec<String>>()
                                            .join("\n"),
                                    ),
                                });
                            } else {
                                mcp_tool_state.result = Some(ToolResult {
                                    r#type: ToolResultValueType::Json,
                                    value: value.structured_content.unwrap_or_else(|| {
                                        serde_json::to_value(value.content).unwrap_or_default()
                                    }),
                                });
                            }
                        }
                        Err(err) => {
                            mcp_tool_state.status = ToolStatus::Failed;
                            mcp_tool_state.result = Some(ToolResult {
                                r#type: ToolResultValueType::Markdown,
                                value: Value::String(err),
                            });
                        }
                    };
                    let Some(index) = mcp_tool_state.index else {
                        tracing::error!("missing entry index for existing mcp tool state");
                        return vec![];
                    };
                    vec![ConversationPatch::replace(
                        index,
                        mcp_tool_state.to_normalized_entry(),
                    )]
                } else {
                    vec![]
                }
            }
            EventMsg::PatchApplyBegin(PatchApplyBeginEvent {
                call_id, changes, ..
            }) => {
                self.state.assistant = None;
                self.state.thinking = None;
                let normalized = normalize_file_changes(&worktree_path_str, &changes);

                let mut patches = Vec::new();

                if let Some(patch_state) = self.state.patches.get_mut(&call_id) {
                    let mut iter = normalized.into_iter();
                    for entry in &mut patch_state.entries {
                        if let Some((path, file_changes)) = iter.next() {
                            entry.path = path;
                            entry.changes = file_changes;
                        }
                        entry.status = ToolStatus::Created;
                        entry.awaiting_approval = false;
                        if let Some(index) = entry.index {
                            patches.push(ConversationPatch::replace(
                                index,
                                entry.to_normalized_entry(),
                            ));
                        } else {
                            let index = entry_index.next();
                            entry.index = Some(index);
                            patches.push(ConversationPatch::add_normalized_entry(
                                index,
                                entry.to_normalized_entry(),
                            ));
                        }
                    }
                    for (path, file_changes) in iter {
                        let index = entry_index.next();
                        let entry = PatchEntry {
                            index: Some(index),
                            path,
                            changes: file_changes,
                            status: ToolStatus::Created,
                            awaiting_approval: false,
                            call_id: call_id.clone(),
                        };
                        patches.push(ConversationPatch::add_normalized_entry(
                            index,
                            entry.to_normalized_entry(),
                        ));
                        patch_state.entries.push(entry);
                    }
                } else {
                    let mut patch_state = PatchState::default();
                    for (path, file_changes) in normalized {
                        let index = entry_index.next();
                        let entry = PatchEntry {
                            index: Some(index),
                            path,
                            changes: file_changes,
                            status: ToolStatus::Created,
                            awaiting_approval: false,
                            call_id: call_id.clone(),
                        };
                        patches.push(ConversationPatch::add_normalized_entry(
                            index,
                            entry.to_normalized_entry(),
                        ));
                        patch_state.entries.push(entry);
                    }
                    self.state.patches.insert(call_id, patch_state);
                }

                patches
            }
            EventMsg::PatchApplyEnd(PatchApplyEndEvent {
                call_id, success, ..
            }) => {
                if let Some(patch_state) = self.state.patches.remove(&call_id) {
                    let status = if success {
                        ToolStatus::Success
                    } else {
                        ToolStatus::Failed
                    };

                    let mut patches = Vec::new();
                    for mut entry in patch_state.entries {
                        entry.status = status.clone();
                        let Some(index) = entry.index else {
                            tracing::error!("missing entry index for existing patch entry");
                            continue;
                        };
                        patches.push(ConversationPatch::replace(
                            index,
                            entry.to_normalized_entry(),
                        ));
                    }
                    patches
                } else {
                    vec![]
                }
            }
            EventMsg::WebSearchBegin(WebSearchBeginEvent { call_id }) => {
                self.state.assistant = None;
                self.state.thinking = None;
                let index = entry_index.next();
                self.state
                    .web_searches
                    .insert(call_id.clone(), WebSearchState::new_with_index(index));
                let web_search_state = self.state.web_searches.get(&call_id).unwrap();
                vec![ConversationPatch::add_normalized_entry(
                    index,
                    web_search_state.to_normalized_entry(),
                )]
            }
            EventMsg::WebSearchEnd(WebSearchEndEvent { call_id, query, .. }) => {
                self.state.assistant = None;
                self.state.thinking = None;
                if let Some(mut entry) = self.state.web_searches.remove(&call_id) {
                    entry.status = ToolStatus::Success;
                    entry.query = Some(query.clone());
                    let Some(index) = entry.index else {
                        tracing::error!("missing entry index for existing websearch entry");
                        return vec![];
                    };
                    vec![ConversationPatch::replace(
                        index,
                        entry.to_normalized_entry(),
                    )]
                } else {
                    vec![]
                }
            }
            EventMsg::ViewImageToolCall(ViewImageToolCallEvent { path, .. }) => {
                self.state.assistant = None;
                self.state.thinking = None;
                let path_str = path.to_string_lossy().to_string();
                let relative_path = make_path_relative(&path_str, &worktree_path_str);
                let idx = entry_index.next();
                let entry = NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::ToolUse {
                        tool_name: "view_image".to_string(),
                        action_type: ActionType::FileRead {
                            path: relative_path.clone(),
                        },
                        status: ToolStatus::Success,
                    },
                    content: format!("`{relative_path}`"),
                    metadata: None,
                };
                vec![ConversationPatch::add_normalized_entry(idx, entry)]
            }
            EventMsg::PlanUpdate(UpdatePlanArgs { plan, explanation }) => {
                let todos: Vec<TodoItem> = plan
                    .iter()
                    .map(|item| TodoItem {
                        content: item.step.clone(),
                        status: format_todo_status(&item.status),
                        priority: None,
                    })
                    .collect();
                let explanation = explanation
                    .as_ref()
                    .map(|text| text.trim())
                    .filter(|text| !text.is_empty())
                    .map(|text| text.to_string());
                let content = explanation.clone().unwrap_or_else(|| {
                    if todos.is_empty() {
                        "Plan updated".to_string()
                    } else {
                        format!("Plan updated ({} steps)", todos.len())
                    }
                });

                let idx = entry_index.next();
                let entry = NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::ToolUse {
                        tool_name: "plan".to_string(),
                        action_type: ActionType::TodoManagement {
                            todos,
                            operation: "update".to_string(),
                        },
                        status: ToolStatus::Success,
                    },
                    content,
                    metadata: None,
                };
                vec![ConversationPatch::add_normalized_entry(idx, entry)]
            }
            EventMsg::Warning(WarningEvent { message }) => {
                let idx = entry_index.next();
                let entry = NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::ErrorMessage {
                        error_type: NormalizedEntryError::Other,
                    },
                    content: message,
                    metadata: None,
                };
                vec![ConversationPatch::add_normalized_entry(idx, entry)]
            }
            EventMsg::Error(ErrorEvent {
                message,
                codex_error_info,
            }) => {
                let idx = entry_index.next();
                let entry = NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::ErrorMessage {
                        error_type: NormalizedEntryError::Other,
                    },
                    content: format!("Error: {message} {codex_error_info:?}"),
                    metadata: None,
                };
                vec![ConversationPatch::add_normalized_entry(idx, entry)]
            }
            EventMsg::TokenCount(payload) => {
                if let Some(info) = payload.info {
                    self.state.token_usage_info = Some(info);
                }
                vec![]
            }
            // Events we don't need to handle
            EventMsg::AgentReasoningRawContent(..)
            | EventMsg::AgentReasoningRawContentDelta(..)
            | EventMsg::TurnStarted(..)
            | EventMsg::UserMessage(..)
            | EventMsg::TurnDiff(..)
            | EventMsg::GetHistoryEntryResponse(..)
            | EventMsg::McpListToolsResponse(..)
            | EventMsg::McpStartupComplete(..)
            | EventMsg::McpStartupUpdate(..)
            | EventMsg::DeprecationNotice(..)
            | EventMsg::UndoCompleted(..)
            | EventMsg::UndoStarted(..)
            | EventMsg::RawResponseItem(..)
            | EventMsg::ItemStarted(..)
            | EventMsg::ItemCompleted(..)
            | EventMsg::AgentMessageContentDelta(..)
            | EventMsg::ReasoningContentDelta(..)
            | EventMsg::ReasoningRawContentDelta(..)
            | EventMsg::ListCustomPromptsResponse(..)
            | EventMsg::TurnAborted(..)
            | EventMsg::ShutdownComplete
            | EventMsg::EnteredReviewMode(..)
            | EventMsg::ExitedReviewMode(..)
            | EventMsg::TurnComplete(..) => vec![],
            other => {
                tracing::debug!(event = ?other, "ignoring unhandled codex event");
                vec![]
            }
        }
    }
}

/// Helper to create an upsert patch (add or replace depending on is_new)
fn upsert_patch(index: usize, entry: NormalizedEntry, is_new: bool) -> Patch {
    if is_new {
        ConversationPatch::add_normalized_entry(index, entry)
    } else {
        ConversationPatch::replace(index, entry)
    }
}

/// Create a model params system message entry
fn create_model_params_entry(
    model: String,
    reasoning_effort: Option<ReasoningEffort>,
) -> NormalizedEntry {
    let mut params = vec![];
    params.push(format!("model: {model}"));
    if let Some(reasoning_effort) = reasoning_effort {
        params.push(format!("reasoning effort: {reasoning_effort}"));
    }

    NormalizedEntry {
        timestamp: None,
        entry_type: NormalizedEntryType::SystemMessage,
        content: params.join("  ").to_string(),
        metadata: None,
    }
}

#[derive(Default)]
struct StreamingText {
    index: usize,
    content: String,
}

#[derive(Default)]
struct CommandState {
    index: Option<usize>,
    command: String,
    stdout: String,
    stderr: String,
    formatted_output: Option<String>,
    status: ToolStatus,
    exit_code: Option<i32>,
    awaiting_approval: bool,
    call_id: String,
}

impl ToNormalizedEntry for CommandState {
    fn to_normalized_entry(&self) -> NormalizedEntry {
        let content = format!("`{}`", self.command);

        NormalizedEntry {
            timestamp: None,
            entry_type: NormalizedEntryType::ToolUse {
                tool_name: "bash".to_string(),
                action_type: ActionType::CommandRun {
                    command: self.command.clone(),
                    result: Some(CommandRunResult {
                        exit_status: self
                            .exit_code
                            .map(|code| CommandExitStatus::ExitCode { code }),
                        output: if self.formatted_output.is_some() {
                            self.formatted_output.clone()
                        } else {
                            build_command_output(Some(&self.stdout), Some(&self.stderr))
                        },
                    }),
                },
                status: self.status.clone(),
            },
            content,
            metadata: serde_json::to_value(ToolCallMetadata {
                tool_call_id: self.call_id.clone(),
            })
            .ok(),
        }
    }
}

struct McpToolState {
    index: Option<usize>,
    invocation: McpInvocation,
    result: Option<ToolResult>,
    status: ToolStatus,
}

impl ToNormalizedEntry for McpToolState {
    fn to_normalized_entry(&self) -> NormalizedEntry {
        let tool_name = format!("mcp:{}:{}", self.invocation.server, self.invocation.tool);
        NormalizedEntry {
            timestamp: None,
            entry_type: NormalizedEntryType::ToolUse {
                tool_name: tool_name.clone(),
                action_type: ActionType::Tool {
                    tool_name,
                    arguments: self.invocation.arguments.clone(),
                    result: self.result.clone(),
                },
                status: self.status.clone(),
            },
            content: self.invocation.tool.clone(),
            metadata: None,
        }
    }
}

#[derive(Default)]
struct WebSearchState {
    index: Option<usize>,
    query: Option<String>,
    status: ToolStatus,
}

impl WebSearchState {
    fn new_with_index(index: usize) -> Self {
        Self {
            index: Some(index),
            ..Default::default()
        }
    }
}

impl ToNormalizedEntry for WebSearchState {
    fn to_normalized_entry(&self) -> NormalizedEntry {
        NormalizedEntry {
            timestamp: None,
            entry_type: NormalizedEntryType::ToolUse {
                tool_name: "web_search".to_string(),
                action_type: ActionType::WebFetch {
                    url: self.query.clone().unwrap_or_else(|| "...".to_string()),
                },
                status: self.status.clone(),
            },
            content: self
                .query
                .clone()
                .unwrap_or_else(|| "Web search".to_string()),
            metadata: None,
        }
    }
}

#[derive(Default)]
struct PatchState {
    entries: Vec<PatchEntry>,
}

struct PatchEntry {
    index: Option<usize>,
    path: String,
    changes: Vec<FileChange>,
    status: ToolStatus,
    awaiting_approval: bool,
    call_id: String,
}

impl ToNormalizedEntry for PatchEntry {
    fn to_normalized_entry(&self) -> NormalizedEntry {
        let content = self.path.clone();

        NormalizedEntry {
            timestamp: None,
            entry_type: NormalizedEntryType::ToolUse {
                tool_name: "edit".to_string(),
                action_type: ActionType::FileEdit {
                    path: self.path.clone(),
                    changes: self.changes.clone(),
                },
                status: self.status.clone(),
            },
            content,
            metadata: serde_json::to_value(ToolCallMetadata {
                tool_call_id: self.call_id.clone(),
            })
            .ok(),
        }
    }
}

struct LogState {
    entry_index: EntryIndexProvider,
    assistant: Option<StreamingText>,
    thinking: Option<StreamingText>,
    commands: HashMap<String, CommandState>,
    mcp_tools: HashMap<String, McpToolState>,
    patches: HashMap<String, PatchState>,
    web_searches: HashMap<String, WebSearchState>,
    token_usage_info: Option<TokenUsageInfo>,
}

enum StreamingTextKind {
    Assistant,
    Thinking,
}

impl LogState {
    fn new(entry_index: EntryIndexProvider) -> Self {
        Self {
            entry_index,
            assistant: None,
            thinking: None,
            commands: HashMap::new(),
            mcp_tools: HashMap::new(),
            patches: HashMap::new(),
            web_searches: HashMap::new(),
            token_usage_info: None,
        }
    }

    fn streaming_text_update(
        &mut self,
        content: String,
        type_: StreamingTextKind,
        mode: UpdateMode,
    ) -> (NormalizedEntry, usize, bool) {
        let index_provider = &self.entry_index;
        let entry = match type_ {
            StreamingTextKind::Assistant => &mut self.assistant,
            StreamingTextKind::Thinking => &mut self.thinking,
        };
        let is_new = entry.is_none();
        let (content, index) = if entry.is_none() {
            let index = index_provider.next();
            *entry = Some(StreamingText { index, content });
            (&entry.as_ref().unwrap().content, index)
        } else {
            let streaming_state = entry.as_mut().unwrap();
            match mode {
                UpdateMode::Append => streaming_state.content.push_str(&content),
                UpdateMode::Set => streaming_state.content = content,
            }
            (&streaming_state.content, streaming_state.index)
        };
        let normalized_entry = NormalizedEntry {
            timestamp: None,
            entry_type: match type_ {
                StreamingTextKind::Assistant => NormalizedEntryType::AssistantMessage,
                StreamingTextKind::Thinking => NormalizedEntryType::Thinking,
            },
            content: content.clone(),
            metadata: None,
        };
        (normalized_entry, index, is_new)
    }

    fn streaming_text_append(
        &mut self,
        content: String,
        type_: StreamingTextKind,
    ) -> (NormalizedEntry, usize, bool) {
        self.streaming_text_update(content, type_, UpdateMode::Append)
    }

    fn streaming_text_set(
        &mut self,
        content: String,
        type_: StreamingTextKind,
    ) -> (NormalizedEntry, usize, bool) {
        self.streaming_text_update(content, type_, UpdateMode::Set)
    }

    fn assistant_message_append(&mut self, content: String) -> (NormalizedEntry, usize, bool) {
        self.streaming_text_append(content, StreamingTextKind::Assistant)
    }

    fn thinking_append(&mut self, content: String) -> (NormalizedEntry, usize, bool) {
        self.streaming_text_append(content, StreamingTextKind::Thinking)
    }

    fn assistant_message(&mut self, content: String) -> (NormalizedEntry, usize, bool) {
        self.streaming_text_set(content, StreamingTextKind::Assistant)
    }

    fn thinking(&mut self, content: String) -> (NormalizedEntry, usize, bool) {
        self.streaming_text_set(content, StreamingTextKind::Thinking)
    }
}

enum UpdateMode {
    Append,
    Set,
}

fn normalize_file_changes(
    worktree_path: &str,
    changes: &HashMap<PathBuf, CodexProtoFileChange>,
) -> Vec<(String, Vec<FileChange>)> {
    changes
        .iter()
        .map(|(path, change)| {
            let path_str = path.to_string_lossy();
            let relative = make_path_relative(path_str.as_ref(), worktree_path);
            let file_changes = match change {
                CodexProtoFileChange::Add { content } => vec![FileChange::Write {
                    content: content.clone(),
                }],
                CodexProtoFileChange::Delete { .. } => vec![FileChange::Delete],
                CodexProtoFileChange::Update {
                    unified_diff,
                    move_path,
                } => {
                    let mut edits = Vec::new();
                    if let Some(dest) = move_path {
                        let dest_rel =
                            make_path_relative(dest.to_string_lossy().as_ref(), worktree_path);
                        edits.push(FileChange::Rename { new_path: dest_rel });
                    }
                    let hunks = extract_unified_diff_hunks(unified_diff);
                    let diff = concatenate_diff_hunks(&relative, &hunks);
                    edits.push(FileChange::Edit {
                        unified_diff: diff,
                        has_line_numbers: true,
                    });
                    edits
                }
            };
            (relative, file_changes)
        })
        .collect()
}

fn format_todo_status(status: &StepStatus) -> String {
    match status {
        StepStatus::Pending => "pending",
        StepStatus::InProgress => "in_progress",
        StepStatus::Completed => "completed",
    }
    .to_string()
}

/// Main entry point for Codex log normalization.
///
/// Spawns background tasks to normalize both stdout (Codex events) and stderr logs.
/// The stdout normalization uses the shared `normalize_logs_with` driver function.
pub fn normalize_logs(
    msg_store: Arc<MsgStore>,
    worktree_path: &Path,
    entry_index: EntryIndexProvider,
) -> tokio::task::JoinHandle<()> {
    // stderr normalization
    let stderr_handle = normalize_stderr_logs(msg_store.clone(), entry_index.clone());

    // stdout normalization using the shared driver
    let normalizer = CodexNormalizer::new(worktree_path.to_path_buf(), entry_index);
    let stdout_handle = normalize_logs_with(normalizer, msg_store, worktree_path);

    // Return a handle that awaits both normalization tasks
    tokio::spawn(async move {
        let _ = stderr_handle.await;
        let _ = stdout_handle.await;
    })
}

fn build_command_output(stdout: Option<&str>, stderr: Option<&str>) -> Option<String> {
    let mut sections = Vec::new();
    if let Some(out) = stdout {
        let cleaned = out.trim();
        if !cleaned.is_empty() {
            sections.push(format!("stdout:\n{cleaned}"));
        }
    }
    if let Some(err) = stderr {
        let cleaned = err.trim();
        if !cleaned.is_empty() {
            sections.push(format!("stderr:\n{cleaned}"));
        }
    }

    if sections.is_empty() {
        None
    } else {
        Some(sections.join("\n\n"))
    }
}

lazy_static! {
    static ref SESSION_ID: Regex = Regex::new(
        r#"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})"#
    )
    .expect("valid regex");
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum Error {
    LaunchError { error: String },
    AuthRequired { error: String },
}

impl Error {
    pub fn launch_error(error: String) -> Self {
        Self::LaunchError { error }
    }
    pub fn auth_required(error: String) -> Self {
        Self::AuthRequired { error }
    }

    pub fn raw(&self) -> String {
        serde_json::to_string(self).unwrap_or_default()
    }
}

impl ToNormalizedEntry for Error {
    fn to_normalized_entry(&self) -> NormalizedEntry {
        match self {
            Error::LaunchError { error } => NormalizedEntry {
                timestamp: None,
                entry_type: NormalizedEntryType::ErrorMessage {
                    error_type: NormalizedEntryError::Other,
                },
                content: error.clone(),
                metadata: None,
            },
            Error::AuthRequired { error } => NormalizedEntry {
                timestamp: None,
                entry_type: NormalizedEntryType::ErrorMessage {
                    error_type: NormalizedEntryError::SetupRequired,
                },
                content: error.clone(),
                metadata: None,
            },
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum Approval {
    ApprovalResponse {
        call_id: String,
        tool_name: String,
        approval_status: ApprovalStatus,
    },
}

impl Approval {
    pub fn approval_response(
        call_id: String,
        tool_name: String,
        approval_status: ApprovalStatus,
    ) -> Self {
        Self::ApprovalResponse {
            call_id,
            tool_name,
            approval_status,
        }
    }

    pub fn raw(&self) -> String {
        serde_json::to_string(self).unwrap_or_default()
    }

    pub fn display_tool_name(&self) -> String {
        let Self::ApprovalResponse { tool_name, .. } = self;
        match tool_name.as_str() {
            "codex.exec_command" => "Exec Command".to_string(),
            "codex.apply_patch" => "Edit".to_string(),
            other => other.to_string(),
        }
    }
}

impl ToNormalizedEntryOpt for Approval {
    fn to_normalized_entry_opt(&self) -> Option<NormalizedEntry> {
        let Self::ApprovalResponse {
            call_id: _,
            tool_name: _,
            approval_status,
        } = self;
        let tool_name = self.display_tool_name();

        match approval_status {
            ApprovalStatus::Pending => None,
            ApprovalStatus::Approved => None,
            ApprovalStatus::Denied { reason } => Some(NormalizedEntry {
                timestamp: None,
                entry_type: NormalizedEntryType::UserFeedback {
                    denied_tool: tool_name.clone(),
                },
                content: reason
                    .clone()
                    .unwrap_or_else(|| "User denied this tool use request".to_string())
                    .trim()
                    .to_string(),
                metadata: None,
            }),
            ApprovalStatus::TimedOut => Some(NormalizedEntry {
                timestamp: None,
                entry_type: NormalizedEntryType::ErrorMessage {
                    error_type: NormalizedEntryError::Other,
                },
                content: format!("Approval timed out for tool {tool_name}"),
                metadata: None,
            }),
        }
    }
}
