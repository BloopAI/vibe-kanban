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
    AgentMessageDeltaNotification, CommandExecutionRequestApprovalParams,
    CommandExecutionStatus as V2CommandExecutionStatus, FileUpdateChange as V2FileUpdateChange,
    ItemCompletedNotification, ItemStartedNotification, JSONRPCNotification, JSONRPCRequest,
    JSONRPCResponse, McpToolCallProgressNotification, McpToolCallResult as V2McpToolCallResult,
    McpToolCallStatus as V2McpToolCallStatus, PatchApplyStatus as V2PatchApplyStatus,
    ReasoningSummaryTextDeltaNotification, ReasoningTextDeltaNotification, ServerNotification,
    ThreadForkResponse, ThreadItem, ThreadStartResponse, ThreadTokenUsageUpdatedNotification,
    ToolRequestUserInputParams, ToolRequestUserInputQuestion, TurnPlanStep,
    TurnPlanUpdatedNotification,
};
use codex_mcp_types::ContentBlock;
use codex_protocol::{
    openai_models::ReasoningEffort,
    plan_tool::{StepStatus, UpdatePlanArgs},
    protocol::{
        AgentMessageDeltaEvent, AgentMessageEvent, AgentReasoningDeltaEvent, AgentReasoningEvent,
        AgentReasoningSectionBreakEvent, ApplyPatchApprovalRequestEvent, BackgroundEventEvent,
        ErrorEvent, EventMsg, ExecApprovalRequestEvent, ExecCommandBeginEvent, ExecCommandEndEvent,
        ExecCommandOutputDeltaEvent, ExecOutputStream, ExitedReviewModeEvent,
        FileChange as CodexProtoFileChange, McpInvocation, McpToolCallBeginEvent,
        McpToolCallEndEvent, PatchApplyBeginEvent, PatchApplyEndEvent, ReviewRequest,
        StreamErrorEvent, TokenUsageInfo, TurnAbortReason, TurnAbortedEvent,
        ViewImageToolCallEvent, WarningEvent, WebSearchBeginEvent, WebSearchEndEvent,
    },
};
use json_patch::Patch;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use workspace_utils::{
    approvals::{ApprovalStatus, Question, QuestionOption},
    diff::{concatenate_diff_hunks, extract_unified_diff_hunks},
    msg_store::MsgStore,
    path::make_path_relative,
};

use crate::{
    approvals::ToolCallMetadata,
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
    DynamicToolLifecycle(DynamicToolLifecycle),
    /// Session ID extracted from various sources (without model params)
    SessionStart(String),
    /// Model parameters with optional session ID (from NewConversationResponse)
    ModelParamsWithSession {
        session_id: Option<String>,
        model: String,
        reasoning_effort: Option<ReasoningEffort>,
    },
    AgentMessageDelta(String),
    ReasoningDelta(String),
    CommandApprovalRequest {
        item_id: String,
        command: String,
    },
    UserInputRequest {
        item_id: String,
        questions: Vec<Question>,
    },
    CommandItem {
        item_id: String,
        command: String,
        output: Option<String>,
        exit_code: Option<i32>,
        status: ToolStatus,
    },
    PatchItem {
        item_id: String,
        changes: Vec<(String, Vec<FileChange>)>,
        status: ToolStatus,
        awaiting_approval: bool,
    },
    McpToolItem {
        item_id: String,
        invocation: McpInvocation,
        result: Option<ToolResult>,
        status: ToolStatus,
    },
    McpToolProgress {
        item_id: String,
        message: String,
    },
    DynamicToolCall {
        item_id: String,
        tool: String,
        arguments: Value,
    },
    PlanUpdate {
        plan: Vec<TodoItem>,
        explanation: Option<String>,
    },
    TokenUsage(TokenUsageInfo),
    ViewImage(PathBuf),
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
        if let Ok(dynamic_tool) = serde_json::from_str::<DynamicToolLifecycle>(line) {
            return Some(CodexEvent::DynamicToolLifecycle(dynamic_tool));
        }

        // Try to parse as JSONRPCResponse for session ID and model params
        if let Ok(response) = serde_json::from_str::<JSONRPCResponse>(line) {
            if let Ok(start_response) =
                serde_json::from_value::<ThreadStartResponse>(response.result.clone())
            {
                return Some(CodexEvent::ModelParamsWithSession {
                    session_id: Some(start_response.thread.id),
                    model: start_response.model,
                    reasoning_effort: start_response.reasoning_effort,
                });
            }
            if let Ok(fork_response) =
                serde_json::from_value::<ThreadForkResponse>(response.result.clone())
            {
                return Some(CodexEvent::ModelParamsWithSession {
                    session_id: Some(fork_response.thread.id),
                    model: fork_response.model,
                    reasoning_effort: fork_response.reasoning_effort,
                });
            }
            return None;
        }

        // Try to parse as ServerNotification for v2 session and turn events first.
        if let Ok(server_notification) = serde_json::from_str::<ServerNotification>(line) {
            match server_notification {
                ServerNotification::ThreadStarted(payload) => {
                    return Some(CodexEvent::SessionStart(payload.thread.id));
                }
                ServerNotification::AgentMessageDelta(AgentMessageDeltaNotification {
                    delta,
                    ..
                }) => return Some(CodexEvent::AgentMessageDelta(delta)),
                ServerNotification::ReasoningTextDelta(ReasoningTextDeltaNotification {
                    delta,
                    ..
                })
                | ServerNotification::ReasoningSummaryTextDelta(
                    ReasoningSummaryTextDeltaNotification { delta, .. },
                ) => return Some(CodexEvent::ReasoningDelta(delta)),
                ServerNotification::ItemStarted(ItemStartedNotification { item, .. }) => {
                    return parse_v2_thread_item(item, true, &self.worktree_path);
                }
                ServerNotification::ItemCompleted(ItemCompletedNotification { item, .. }) => {
                    return parse_v2_thread_item(item, false, &self.worktree_path);
                }
                ServerNotification::McpToolCallProgress(McpToolCallProgressNotification {
                    item_id,
                    message,
                    ..
                }) => {
                    return Some(CodexEvent::McpToolProgress { item_id, message });
                }
                ServerNotification::TurnPlanUpdated(TurnPlanUpdatedNotification {
                    plan,
                    explanation,
                    ..
                }) => {
                    return Some(CodexEvent::PlanUpdate {
                        plan: plan.into_iter().map(todo_item_from_plan_step).collect(),
                        explanation,
                    });
                }
                ServerNotification::ThreadTokenUsageUpdated(payload) => {
                    return Some(CodexEvent::TokenUsage(token_usage_info_from_v2(payload)));
                }
                ServerNotification::SessionConfigured(session_configured) => {
                    return Some(CodexEvent::SessionStart(
                        session_configured.session_id.to_string(),
                    ));
                }
                _ => return None,
            }
        }

        if let Ok(request) = serde_json::from_str::<JSONRPCRequest>(line)
            && request.method == "item/commandExecution/requestApproval"
            && let Ok(params) = serde_json::from_value::<CommandExecutionRequestApprovalParams>(
                request.params.unwrap_or(Value::Null),
            )
        {
            return Some(CodexEvent::CommandApprovalRequest {
                item_id: params.item_id,
                command: params
                    .command
                    .or(params.reason)
                    .unwrap_or_else(|| "command execution".to_string()),
            });
        }

        if let Ok(request) = serde_json::from_str::<JSONRPCRequest>(line)
            && request.method == "item/tool/requestUserInput"
            && let Ok(params) = serde_json::from_value::<ToolRequestUserInputParams>(
                request.params.unwrap_or(Value::Null),
            )
        {
            return Some(CodexEvent::UserInputRequest {
                item_id: params.item_id,
                questions: map_user_input_questions(params.questions),
            });
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
            CodexEvent::CommandApprovalRequest { item_id, .. }
            | CodexEvent::UserInputRequest { item_id, .. }
            | CodexEvent::CommandItem { item_id, .. }
            | CodexEvent::PatchItem { item_id, .. }
            | CodexEvent::McpToolItem { item_id, .. }
            | CodexEvent::McpToolProgress { item_id, .. }
            | CodexEvent::DynamicToolCall { item_id, .. } => Some(item_id.clone()),
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
            CodexEvent::DynamicToolLifecycle(lifecycle) => {
                lifecycle.process(&mut self.state, entry_index)
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
            CodexEvent::AgentMessageDelta(delta) => {
                self.process_v2_agent_message_delta(delta, entry_index)
            }
            CodexEvent::ReasoningDelta(delta) => {
                self.process_v2_reasoning_delta(delta, entry_index)
            }
            CodexEvent::CommandApprovalRequest { item_id, command } => {
                self.process_v2_command_approval(item_id, command, entry_index)
            }
            CodexEvent::UserInputRequest { item_id, questions } => {
                self.process_v2_user_input_request(item_id, questions, entry_index)
            }
            CodexEvent::CommandItem {
                item_id,
                command,
                output,
                exit_code,
                status,
            } => self.process_v2_command_item(
                item_id,
                command,
                output,
                exit_code,
                status,
                entry_index,
            ),
            CodexEvent::PatchItem {
                item_id,
                changes,
                status,
                awaiting_approval,
            } => {
                self.process_v2_patch_item(item_id, changes, status, awaiting_approval, entry_index)
            }
            CodexEvent::McpToolItem {
                item_id,
                invocation,
                result,
                status,
            } => self.process_v2_mcp_tool_item(item_id, invocation, result, status, entry_index),
            CodexEvent::McpToolProgress { item_id, message } => {
                self.process_v2_mcp_tool_progress(item_id, message, entry_index)
            }
            CodexEvent::DynamicToolCall {
                item_id,
                tool,
                arguments,
            } => self.process_v2_dynamic_tool_call(item_id, tool, arguments, entry_index),
            CodexEvent::PlanUpdate { plan, explanation } => {
                self.process_v2_plan_update(plan, explanation, entry_index)
            }
            CodexEvent::TokenUsage(info) => self.process_event_msg(
                EventMsg::TokenCount(codex_protocol::protocol::TokenCountEvent {
                    info: Some(info),
                    rate_limits: None,
                }),
                msg_store,
                entry_index,
            ),
            CodexEvent::ViewImage(path) => self.process_v2_view_image(path, entry_index),
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
                tracing::debug!(
                    event = "SessionConfigured",
                    entry_index = idx,
                    "normalizer: assigned entry"
                );
                vec![ConversationPatch::add_normalized_entry(idx, entry)]
            }
            EventMsg::AgentMessageDelta(AgentMessageDeltaEvent { delta }) => {
                let thinking_was_some = self.state.thinking.is_some();
                let assistant_was_some = self.state.assistant.is_some();
                self.state.thinking = None;
                let (entry, index, is_new) = self.state.assistant_message_append(delta);
                tracing::debug!(
                    event = "AgentMessageDelta",
                    entry_index = index,
                    is_new_entry = is_new,
                    thinking_cleared = thinking_was_some,
                    assistant_preexisted = assistant_was_some,
                    next_counter = entry_index.current(),
                    "normalizer: streaming assistant delta"
                );
                vec![upsert_patch(index, entry, is_new)]
            }
            EventMsg::AgentReasoningDelta(AgentReasoningDeltaEvent { delta }) => {
                let assistant_was_some = self.state.assistant.is_some();
                let thinking_was_some = self.state.thinking.is_some();
                self.state.assistant = None;
                let (entry, index, is_new) = self.state.thinking_append(delta);
                tracing::debug!(
                    event = "AgentReasoningDelta",
                    entry_index = index,
                    is_new_entry = is_new,
                    assistant_cleared = assistant_was_some,
                    thinking_preexisted = thinking_was_some,
                    next_counter = entry_index.current(),
                    "normalizer: streaming reasoning delta"
                );
                vec![upsert_patch(index, entry, is_new)]
            }
            EventMsg::AgentMessage(AgentMessageEvent { message }) => {
                let thinking_was_some = self.state.thinking.is_some();
                let assistant_was_some = self.state.assistant.is_some();
                self.state.thinking = None;
                let (entry, index, is_new) = self.state.assistant_message(message);
                let patch = upsert_patch(index, entry, is_new);
                self.state.assistant = None;
                tracing::debug!(
                    event = "AgentMessage",
                    entry_index = index,
                    is_new_entry = is_new,
                    thinking_cleared = thinking_was_some,
                    assistant_preexisted = assistant_was_some,
                    next_counter = entry_index.current(),
                    "normalizer: complete assistant message — ORDER MARKER"
                );
                vec![patch]
            }
            EventMsg::AgentReasoning(AgentReasoningEvent { text }) => {
                let assistant_was_some = self.state.assistant.is_some();
                let thinking_was_some = self.state.thinking.is_some();
                self.state.assistant = None;
                let (entry, index, is_new) = self.state.thinking(text);
                let patch = upsert_patch(index, entry, is_new);
                self.state.thinking = None;
                tracing::debug!(
                    event = "AgentReasoning",
                    entry_index = index,
                    is_new_entry = is_new,
                    assistant_cleared = assistant_was_some,
                    thinking_preexisted = thinking_was_some,
                    next_counter = entry_index.current(),
                    "normalizer: complete reasoning block — ORDER MARKER"
                );
                vec![patch]
            }
            EventMsg::AgentReasoningSectionBreak(AgentReasoningSectionBreakEvent { .. }) => {
                tracing::debug!(
                    event = "AgentReasoningSectionBreak",
                    assistant_was_some = self.state.assistant.is_some(),
                    thinking_was_some = self.state.thinking.is_some(),
                    "normalizer: section break — clearing both states"
                );
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
                tracing::debug!(
                    event = "ExecCommandBegin",
                    call_id = %call_id,
                    entry_index = index,
                    command = %command_text,
                    "normalizer: tool-use start"
                );
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
                    tracing::debug!(
                        event = "ExecCommandEnd",
                        call_id = %call_id,
                        entry_index = index,
                        exit_code = exit_code,
                        "normalizer: tool-use finish"
                    );
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
                // Reconnect attempts are non-fatal retries — show as system messages, not errors
                let entry_type = if message.contains("Reconnecting") {
                    NormalizedEntryType::SystemMessage
                } else {
                    NormalizedEntryType::ErrorMessage {
                        error_type: NormalizedEntryError::Other,
                    }
                };
                let entry = NormalizedEntry {
                    timestamp: None,
                    entry_type,
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
                let Some(info) = payload.info else {
                    return vec![];
                };
                let entry = NormalizedEntry {
                    timestamp: Some(chrono::Utc::now().to_rfc3339()),
                    entry_type: NormalizedEntryType::TokenUsage {
                        input_tokens: info.total_token_usage.input_tokens,
                        cached_input_tokens: info.total_token_usage.cached_input_tokens,
                        output_tokens: info.total_token_usage.output_tokens,
                        reasoning_tokens: info.total_token_usage.reasoning_output_tokens,
                        last_total_tokens: info.last_token_usage.total_tokens,
                        context_window: info.model_context_window,
                    },
                    content: String::new(),
                    metadata: None,
                };
                // Retain for potential future use (e.g. per-turn delta calculations).
                self.state.token_usage_info = Some(info);
                if let Some(index) = self.state.token_usage_index {
                    tracing::debug!(
                        event = "TokenCount",
                        entry_index = index,
                        "normalizer: updated token usage entry in-place"
                    );
                    vec![ConversationPatch::replace(index, entry)]
                } else {
                    let index = entry_index.next();
                    self.state.token_usage_index = Some(index);
                    tracing::debug!(
                        event = "TokenCount",
                        entry_index = index,
                        "normalizer: added initial token usage entry"
                    );
                    vec![ConversationPatch::add_normalized_entry(index, entry)]
                }
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
            | EventMsg::ShutdownComplete
            | EventMsg::TurnComplete(..) => vec![],
            EventMsg::TurnAborted(event) => self.process_turn_aborted(event, entry_index),
            EventMsg::EnteredReviewMode(review) => {
                self.process_review_mode_started(review, entry_index)
            }
            EventMsg::ExitedReviewMode(event) => {
                self.process_review_mode_exited(event, entry_index)
            }
            other => {
                tracing::debug!(event = ?other, "ignoring unhandled codex event");
                vec![]
            }
        }
    }

    fn process_v2_agent_message_delta(
        &mut self,
        delta: String,
        entry_index: &EntryIndexProvider,
    ) -> Vec<Patch> {
        let thinking_was_some = self.state.thinking.is_some();
        let assistant_was_some = self.state.assistant.is_some();
        self.state.thinking = None;
        let (entry, index, is_new) = self.state.assistant_message_append(delta);
        tracing::debug!(
            event = "AgentMessageDeltaV2",
            entry_index = index,
            is_new_entry = is_new,
            thinking_cleared = thinking_was_some,
            assistant_preexisted = assistant_was_some,
            next_counter = entry_index.current(),
            "normalizer: streaming assistant delta"
        );
        vec![upsert_patch(index, entry, is_new)]
    }

    fn process_v2_reasoning_delta(
        &mut self,
        delta: String,
        entry_index: &EntryIndexProvider,
    ) -> Vec<Patch> {
        let assistant_was_some = self.state.assistant.is_some();
        let thinking_was_some = self.state.thinking.is_some();
        self.state.assistant = None;
        let (entry, index, is_new) = self.state.thinking_append(delta);
        tracing::debug!(
            event = "ReasoningDeltaV2",
            entry_index = index,
            is_new_entry = is_new,
            assistant_cleared = assistant_was_some,
            thinking_preexisted = thinking_was_some,
            next_counter = entry_index.current(),
            "normalizer: streaming reasoning delta"
        );
        vec![upsert_patch(index, entry, is_new)]
    }

    fn process_v2_command_approval(
        &mut self,
        item_id: String,
        command: String,
        entry_index: &EntryIndexProvider,
    ) -> Vec<Patch> {
        self.state.assistant = None;
        self.state.thinking = None;
        let command_state = self.state.commands.entry(item_id.clone()).or_default();
        if command_state.command.is_empty() {
            command_state.command = command;
        }
        command_state.awaiting_approval = true;
        command_state.call_id = item_id;

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

    fn process_v2_user_input_request(
        &mut self,
        item_id: String,
        questions: Vec<Question>,
        entry_index: &EntryIndexProvider,
    ) -> Vec<Patch> {
        self.state.assistant = None;
        self.state.thinking = None;

        let content = match questions.as_slice() {
            [question] => question.question.clone(),
            questions => format!("{} questions", questions.len()),
        };
        let index = entry_index.next();
        let entry = NormalizedEntry {
            timestamp: None,
            entry_type: NormalizedEntryType::ToolUse {
                tool_name: "AskUserQuestion".to_string(),
                action_type: ActionType::Tool {
                    tool_name: "AskUserQuestion".to_string(),
                    arguments: Some(serde_json::json!({ "questions": questions })),
                    result: None,
                },
                status: ToolStatus::Created,
            },
            content,
            metadata: serde_json::to_value(ToolCallMetadata {
                tool_call_id: item_id,
            })
            .ok(),
        };
        vec![ConversationPatch::add_normalized_entry(index, entry)]
    }

    fn process_v2_command_item(
        &mut self,
        item_id: String,
        command: String,
        output: Option<String>,
        exit_code: Option<i32>,
        status: ToolStatus,
        entry_index: &EntryIndexProvider,
    ) -> Vec<Patch> {
        self.state.assistant = None;
        self.state.thinking = None;
        let command_state = self.state.commands.entry(item_id.clone()).or_default();
        if command_state.index.is_none() {
            command_state.index = Some(entry_index.next());
        }
        if command_state.command.is_empty() {
            command_state.command = command;
        }
        command_state.formatted_output = output;
        command_state.exit_code = exit_code;
        command_state.awaiting_approval = false;
        command_state.status = status;
        command_state.call_id = item_id;

        let Some(index) = command_state.index else {
            return vec![];
        };
        vec![ConversationPatch::replace(
            index,
            command_state.to_normalized_entry(),
        )]
    }

    fn process_v2_patch_item(
        &mut self,
        item_id: String,
        changes: Vec<(String, Vec<FileChange>)>,
        status: ToolStatus,
        awaiting_approval: bool,
        entry_index: &EntryIndexProvider,
    ) -> Vec<Patch> {
        self.state.assistant = None;
        self.state.thinking = None;

        let patch_state = self.state.patches.entry(item_id.clone()).or_default();
        let mut patches = Vec::new();
        let mut iter = changes.into_iter();

        for entry in &mut patch_state.entries {
            if let Some((path, file_changes)) = iter.next() {
                entry.path = path;
                entry.changes = file_changes;
            }
            entry.status = status.clone();
            entry.awaiting_approval = awaiting_approval;
            entry.call_id = item_id.clone();
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
                status: status.clone(),
                awaiting_approval,
                call_id: item_id.clone(),
            };
            patches.push(ConversationPatch::add_normalized_entry(
                index,
                entry.to_normalized_entry(),
            ));
            patch_state.entries.push(entry);
        }

        patches
    }

    fn process_v2_mcp_tool_item(
        &mut self,
        item_id: String,
        invocation: McpInvocation,
        result: Option<ToolResult>,
        status: ToolStatus,
        entry_index: &EntryIndexProvider,
    ) -> Vec<Patch> {
        self.state.assistant = None;
        self.state.thinking = None;
        let mcp_tool_state = self
            .state
            .mcp_tools
            .entry(item_id.clone())
            .or_insert_with(|| McpToolState {
                index: Some(entry_index.next()),
                invocation: invocation.clone(),
                result: None,
                status: ToolStatus::Created,
            });
        mcp_tool_state.invocation = invocation;
        mcp_tool_state.result = result;
        mcp_tool_state.status = status;
        let Some(index) = mcp_tool_state.index else {
            return vec![];
        };
        vec![ConversationPatch::replace(
            index,
            mcp_tool_state.to_normalized_entry(),
        )]
    }

    fn process_v2_mcp_tool_progress(
        &mut self,
        item_id: String,
        message: String,
        entry_index: &EntryIndexProvider,
    ) -> Vec<Patch> {
        let mcp_tool_state = self
            .state
            .mcp_tools
            .entry(item_id.clone())
            .or_insert_with(|| McpToolState {
                index: Some(entry_index.next()),
                invocation: McpInvocation {
                    server: "mcp".to_string(),
                    tool: message.clone(),
                    arguments: Some(Value::Null),
                },
                result: None,
                status: ToolStatus::Created,
            });
        let Some(index) = mcp_tool_state.index else {
            return vec![];
        };
        vec![ConversationPatch::replace(
            index,
            mcp_tool_state.to_normalized_entry(),
        )]
    }

    fn process_v2_dynamic_tool_call(
        &mut self,
        item_id: String,
        tool: String,
        arguments: Value,
        entry_index: &EntryIndexProvider,
    ) -> Vec<Patch> {
        self.state.assistant = None;
        self.state.thinking = None;

        let tool_name = format!("dynamic:{tool}");
        let entry = self
            .state
            .dynamic_tools
            .entry(item_id.clone())
            .or_insert_with(|| GenericToolState {
                index: Some(entry_index.next()),
                tool_name: tool_name.clone(),
                arguments: Some(arguments.clone()),
                result: None,
                status: ToolStatus::Created,
                call_id: item_id.clone(),
            });
        entry.tool_name = tool_name;
        entry.arguments = Some(arguments);
        entry.status = ToolStatus::Created;
        let Some(index) = entry.index else {
            return vec![];
        };
        vec![ConversationPatch::replace(
            index,
            entry.to_normalized_entry(),
        )]
    }

    fn process_turn_aborted(
        &mut self,
        event: TurnAbortedEvent,
        entry_index: &EntryIndexProvider,
    ) -> Vec<Patch> {
        self.state.assistant = None;
        self.state.thinking = None;

        let content = match event.reason {
            TurnAbortReason::Interrupted => "Codex turn interrupted.".to_string(),
            TurnAbortReason::Replaced => "Codex turn replaced by a newer request.".to_string(),
            TurnAbortReason::ReviewEnded => "Codex review turn ended.".to_string(),
        };

        vec![ConversationPatch::add_normalized_entry(
            entry_index.next(),
            NormalizedEntry {
                timestamp: None,
                entry_type: NormalizedEntryType::SystemMessage,
                content,
                metadata: None,
            },
        )]
    }

    fn process_review_mode_started(
        &mut self,
        review: ReviewRequest,
        entry_index: &EntryIndexProvider,
    ) -> Vec<Patch> {
        self.state.assistant = None;
        self.state.thinking = None;

        let hint = review
            .user_facing_hint
            .as_deref()
            .map(str::trim)
            .filter(|hint| !hint.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| describe_review_target(&review.target));

        vec![ConversationPatch::add_normalized_entry(
            entry_index.next(),
            NormalizedEntry {
                timestamp: None,
                entry_type: NormalizedEntryType::SystemMessage,
                content: format!("Codex review started: {hint}"),
                metadata: None,
            },
        )]
    }

    fn process_review_mode_exited(
        &mut self,
        event: ExitedReviewModeEvent,
        entry_index: &EntryIndexProvider,
    ) -> Vec<Patch> {
        self.state.assistant = None;
        self.state.thinking = None;

        let content = match event.review_output {
            Some(output) => format!(
                "Codex review completed with {} finding{}.",
                output.findings.len(),
                if output.findings.len() == 1 { "" } else { "s" }
            ),
            None => "Codex review completed.".to_string(),
        };

        vec![ConversationPatch::add_normalized_entry(
            entry_index.next(),
            NormalizedEntry {
                timestamp: None,
                entry_type: NormalizedEntryType::SystemMessage,
                content,
                metadata: None,
            },
        )]
    }

    fn process_v2_plan_update(
        &mut self,
        plan: Vec<TodoItem>,
        explanation: Option<String>,
        entry_index: &EntryIndexProvider,
    ) -> Vec<Patch> {
        let explanation = explanation
            .as_ref()
            .map(|text| text.trim())
            .filter(|text| !text.is_empty())
            .map(|text| text.to_string());
        let content = explanation.clone().unwrap_or_else(|| {
            if plan.is_empty() {
                "Plan updated".to_string()
            } else {
                format!("Plan updated ({} steps)", plan.len())
            }
        });

        let idx = entry_index.next();
        let entry = NormalizedEntry {
            timestamp: None,
            entry_type: NormalizedEntryType::ToolUse {
                tool_name: "plan".to_string(),
                action_type: ActionType::TodoManagement {
                    todos: plan,
                    operation: "update".to_string(),
                },
                status: ToolStatus::Success,
            },
            content,
            metadata: None,
        };
        vec![ConversationPatch::add_normalized_entry(idx, entry)]
    }

    fn process_v2_view_image(
        &mut self,
        path: PathBuf,
        entry_index: &EntryIndexProvider,
    ) -> Vec<Patch> {
        self.state.assistant = None;
        self.state.thinking = None;
        let path_str = path.to_string_lossy().to_string();
        let worktree_path_str = self.worktree_path.to_string_lossy().to_string();
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
}

/// Helper to create an upsert patch (add or replace depending on is_new)
fn upsert_patch(index: usize, entry: NormalizedEntry, is_new: bool) -> Patch {
    if is_new {
        ConversationPatch::add_normalized_entry(index, entry)
    } else {
        ConversationPatch::replace(index, entry)
    }
}

fn parse_v2_thread_item(
    item: ThreadItem,
    is_started: bool,
    worktree_path: &Path,
) -> Option<CodexEvent> {
    match item {
        ThreadItem::CommandExecution {
            id,
            command,
            aggregated_output,
            exit_code,
            status,
            ..
        } => {
            let status = match status {
                V2CommandExecutionStatus::InProgress => ToolStatus::Created,
                V2CommandExecutionStatus::Completed => ToolStatus::Success,
                V2CommandExecutionStatus::Failed | V2CommandExecutionStatus::Declined => {
                    ToolStatus::Failed
                }
            };
            Some(CodexEvent::CommandItem {
                item_id: id,
                command,
                output: aggregated_output,
                exit_code,
                status,
            })
        }
        ThreadItem::FileChange {
            id,
            changes,
            status,
        } => Some(CodexEvent::PatchItem {
            item_id: id,
            changes: normalize_v2_file_changes(worktree_path, &changes),
            status: match status {
                V2PatchApplyStatus::InProgress => ToolStatus::Created,
                V2PatchApplyStatus::Completed => ToolStatus::Success,
                V2PatchApplyStatus::Failed | V2PatchApplyStatus::Declined => ToolStatus::Failed,
            },
            awaiting_approval: is_started && matches!(status, V2PatchApplyStatus::Declined),
        }),
        ThreadItem::McpToolCall {
            id,
            server,
            tool,
            arguments,
            result,
            error,
            status,
            ..
        } => {
            let invocation = McpInvocation {
                server,
                tool,
                arguments: Some(arguments),
            };
            let result = result.map(tool_result_from_v2_mcp_result).or_else(|| {
                error.map(|err| ToolResult {
                    r#type: ToolResultValueType::Markdown,
                    value: Value::String(err.message),
                })
            });
            Some(CodexEvent::McpToolItem {
                item_id: id,
                invocation,
                result,
                status: match status {
                    V2McpToolCallStatus::InProgress => ToolStatus::Created,
                    V2McpToolCallStatus::Completed => ToolStatus::Success,
                    V2McpToolCallStatus::Failed => ToolStatus::Failed,
                },
            })
        }
        ThreadItem::ImageView { path, .. } => Some(CodexEvent::ViewImage(PathBuf::from(path))),
        _ => None,
    }
}

fn todo_item_from_plan_step(step: TurnPlanStep) -> TodoItem {
    TodoItem {
        content: step.step,
        status: match step.status {
            codex_app_server_protocol::TurnPlanStepStatus::Pending => "pending".to_string(),
            codex_app_server_protocol::TurnPlanStepStatus::InProgress => "in_progress".to_string(),
            codex_app_server_protocol::TurnPlanStepStatus::Completed => "completed".to_string(),
        },
        priority: None,
    }
}

fn describe_review_target(target: &codex_protocol::protocol::ReviewTarget) -> String {
    match target {
        codex_protocol::protocol::ReviewTarget::UncommittedChanges => {
            "reviewing uncommitted changes".to_string()
        }
        codex_protocol::protocol::ReviewTarget::BaseBranch { branch } => {
            format!("reviewing changes against `{branch}`")
        }
        codex_protocol::protocol::ReviewTarget::Commit { sha, title } => title
            .as_ref()
            .map(|title| format!("reviewing commit `{sha}` ({title})"))
            .unwrap_or_else(|| format!("reviewing commit `{sha}`")),
        codex_protocol::protocol::ReviewTarget::Custom { instructions } => {
            instructions.trim().to_string()
        }
    }
}

fn tool_result_from_v2_mcp_result(value: V2McpToolCallResult) -> ToolResult {
    if value
        .content
        .iter()
        .all(|block| matches!(block, ContentBlock::TextContent(_)))
    {
        ToolResult {
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
        }
    } else {
        ToolResult {
            r#type: ToolResultValueType::Json,
            value: value
                .structured_content
                .unwrap_or_else(|| serde_json::to_value(value.content).unwrap_or_default()),
        }
    }
}

fn normalize_v2_file_changes(
    worktree_path: &Path,
    changes: &[V2FileUpdateChange],
) -> Vec<(String, Vec<FileChange>)> {
    let worktree_path = worktree_path.to_string_lossy();
    changes
        .iter()
        .map(|change| {
            let relative = make_path_relative(&change.path, worktree_path.as_ref());
            let file_changes = match &change.kind {
                codex_app_server_protocol::PatchChangeKind::Add => vec![FileChange::Write {
                    content: String::new(),
                }],
                codex_app_server_protocol::PatchChangeKind::Delete => vec![FileChange::Delete],
                codex_app_server_protocol::PatchChangeKind::Update { move_path } => {
                    let mut edits = Vec::new();
                    if let Some(dest) = move_path {
                        let dest_rel = make_path_relative(
                            dest.to_string_lossy().as_ref(),
                            worktree_path.as_ref(),
                        );
                        edits.push(FileChange::Rename { new_path: dest_rel });
                    }
                    let hunks = extract_unified_diff_hunks(&change.diff);
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

fn token_usage_info_from_v2(payload: ThreadTokenUsageUpdatedNotification) -> TokenUsageInfo {
    TokenUsageInfo {
        total_token_usage: codex_protocol::protocol::TokenUsage {
            total_tokens: payload.token_usage.total.total_tokens,
            input_tokens: payload.token_usage.total.input_tokens,
            cached_input_tokens: payload.token_usage.total.cached_input_tokens,
            output_tokens: payload.token_usage.total.output_tokens,
            reasoning_output_tokens: payload.token_usage.total.reasoning_output_tokens,
        },
        last_token_usage: codex_protocol::protocol::TokenUsage {
            total_tokens: payload.token_usage.last.total_tokens,
            input_tokens: payload.token_usage.last.input_tokens,
            cached_input_tokens: payload.token_usage.last.cached_input_tokens,
            output_tokens: payload.token_usage.last.output_tokens,
            reasoning_output_tokens: payload.token_usage.last.reasoning_output_tokens,
        },
        model_context_window: payload.token_usage.model_context_window,
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

fn map_user_input_questions(questions: Vec<ToolRequestUserInputQuestion>) -> Vec<Question> {
    questions
        .into_iter()
        .map(|question| Question {
            question: question.question,
            header: question.header,
            multi_select: false,
            options: question
                .options
                .unwrap_or_default()
                .into_iter()
                .map(|option| QuestionOption {
                    label: option.label,
                    description: option.description,
                })
                .collect(),
        })
        .collect()
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

struct GenericToolState {
    index: Option<usize>,
    tool_name: String,
    arguments: Option<Value>,
    result: Option<ToolResult>,
    status: ToolStatus,
    call_id: String,
}

impl ToNormalizedEntry for GenericToolState {
    fn to_normalized_entry(&self) -> NormalizedEntry {
        NormalizedEntry {
            timestamp: None,
            entry_type: NormalizedEntryType::ToolUse {
                tool_name: self.tool_name.clone(),
                action_type: ActionType::Tool {
                    tool_name: self.tool_name.clone(),
                    arguments: self.arguments.clone(),
                    result: self.result.clone(),
                },
                status: self.status.clone(),
            },
            content: self.tool_name.clone(),
            metadata: serde_json::to_value(ToolCallMetadata {
                tool_call_id: self.call_id.clone(),
            })
            .ok(),
        }
    }
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
    dynamic_tools: HashMap<String, GenericToolState>,
    token_usage_info: Option<TokenUsageInfo>,
    /// Entry index for the token usage display entry (replaced in-place each turn)
    token_usage_index: Option<usize>,
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
            dynamic_tools: HashMap::new(),
            token_usage_info: None,
            token_usage_index: None,
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::logs::utils::EntryIndexProvider;
    use json_patch::PatchOperation;
    use serde_json::json;

    fn normalizer() -> CodexNormalizer {
        CodexNormalizer::new(
            PathBuf::from("/tmp/worktree"),
            EntryIndexProvider::default(),
        )
    }

    #[test]
    fn parses_thread_start_response_into_model_params() {
        let event = normalizer()
            .parse_line(
                &json!({
                    "id": 1,
                    "result": {
                        "thread": {
                            "id": "11111111-1111-1111-1111-111111111111",
                            "preview": "",
                            "modelProvider": "openai",
                            "createdAt": 0,
                            "updatedAt": 0,
                            "path": null,
                            "cwd": "/tmp/worktree",
                            "cliVersion": "0.1.0",
                            "source": "app-server",
                            "gitInfo": null,
                            "turns": []
                        },
                        "model": "gpt-5.1-codex",
                        "modelProvider": "openai",
                        "cwd": "/tmp/worktree",
                        "approvalPolicy": "never",
                        "sandbox": { "type": "workspaceWrite" },
                        "reasoningEffort": "medium"
                    }
                })
                .to_string(),
            )
            .expect("thread/start response should parse");

        match event {
            CodexEvent::ModelParamsWithSession {
                session_id,
                model,
                reasoning_effort,
            } => {
                assert_eq!(
                    session_id.as_deref(),
                    Some("11111111-1111-1111-1111-111111111111")
                );
                assert_eq!(model, "gpt-5.1-codex");
                assert_eq!(reasoning_effort, Some(ReasoningEffort::Medium));
            }
            other => panic!("unexpected event: {other:?}"),
        }
    }

    #[test]
    fn parses_v2_command_approval_request() {
        let event = normalizer()
            .parse_line(
                &json!({
                    "id": 2,
                    "method": "item/commandExecution/requestApproval",
                    "params": {
                        "threadId": "11111111-1111-1111-1111-111111111111",
                        "turnId": "turn-1",
                        "itemId": "item-1",
                        "command": "cargo test",
                        "cwd": "/tmp/worktree"
                    }
                })
                .to_string(),
            )
            .expect("approval request should parse");

        match event {
            CodexEvent::CommandApprovalRequest { item_id, command } => {
                assert_eq!(item_id, "item-1");
                assert_eq!(command, "cargo test");
            }
            other => panic!("unexpected event: {other:?}"),
        }
    }

    #[test]
    fn parses_v2_user_input_request() {
        let event = normalizer()
            .parse_line(
                &json!({
                    "id": 3,
                    "method": "item/tool/requestUserInput",
                    "params": {
                        "threadId": "11111111-1111-1111-1111-111111111111",
                        "turnId": "turn-1",
                        "itemId": "item-question-1",
                        "questions": [{
                            "id": "confirm_path",
                            "header": "Path",
                            "question": "Which path should I use?",
                            "options": [{
                                "label": "src",
                                "description": "Use the source directory"
                            }]
                        }]
                    }
                })
                .to_string(),
            )
            .expect("user input request should parse");

        match event {
            CodexEvent::UserInputRequest { item_id, questions } => {
                assert_eq!(item_id, "item-question-1");
                assert_eq!(questions.len(), 1);
                assert_eq!(questions[0].header, "Path");
                assert_eq!(questions[0].question, "Which path should I use?");
                assert_eq!(questions[0].options[0].label, "src");
            }
            other => panic!("unexpected event: {other:?}"),
        }
    }

    #[test]
    fn parses_v2_dynamic_tool_call_request() {
        let event = normalizer()
            .parse_line(
                &json!({
                    "id": 4,
                    "method": "item/tool/call",
                    "params": {
                        "threadId": "11111111-1111-1111-1111-111111111111",
                        "turnId": "turn-1",
                        "callId": "call-dynamic-1",
                        "tool": "request_user_input",
                        "arguments": {
                            "prompt": "Continue?"
                        }
                    }
                })
                .to_string(),
            )
            .expect("dynamic tool request should parse");

        match event {
            CodexEvent::DynamicToolCall {
                item_id,
                tool,
                arguments,
            } => {
                assert_eq!(item_id, "call-dynamic-1");
                assert_eq!(tool, "request_user_input");
                assert_eq!(arguments["prompt"], "Continue?");
            }
            other => panic!("unexpected event: {other:?}"),
        }
    }

    #[test]
    fn dynamic_tool_lifecycle_reuses_single_entry_index() {
        let mut normalizer = normalizer();
        let msg_store = Arc::new(MsgStore::default());
        let entry_index = EntryIndexProvider::default();

        let request_patches = normalizer.process_event(
            CodexEvent::DynamicToolCall {
                item_id: "call-1".to_string(),
                tool: "vk.read_file".to_string(),
                arguments: json!({ "path": "src/main.rs" }),
            },
            &msg_store,
            &entry_index,
        );
        let lifecycle_patches = normalizer.process_event(
            CodexEvent::DynamicToolLifecycle(DynamicToolLifecycle::Request {
                call_id: "call-1".to_string(),
                tool_name: "dynamic:vk.read_file".to_string(),
                arguments: json!({ "path": "src/main.rs" }),
            }),
            &msg_store,
            &entry_index,
        );
        let response_patches = normalizer.process_event(
            CodexEvent::DynamicToolLifecycle(DynamicToolLifecycle::response(
                "call-1".to_string(),
                "dynamic:vk.read_file".to_string(),
                json!({ "path": "src/main.rs" }),
                "fn main() {}".to_string(),
                true,
                ApprovalStatus::Approved,
            )),
            &msg_store,
            &entry_index,
        );

        assert_eq!(request_patches.len(), 1);
        assert_eq!(lifecycle_patches.len(), 1);
        assert_eq!(response_patches.len(), 1);

        let PatchOperation::Replace(request_patch) = &request_patches[0].0[0] else {
            panic!("expected replace patch for raw dynamic tool request");
        };
        let PatchOperation::Replace(lifecycle_patch) = &lifecycle_patches[0].0[0] else {
            panic!("expected replace patch for lifecycle request");
        };
        let PatchOperation::Replace(response_patch) = &response_patches[0].0[0] else {
            panic!("expected replace patch for lifecycle response");
        };

        assert_eq!(request_patch.path, lifecycle_patch.path);
        assert_eq!(request_patch.path, response_patch.path);
    }

    #[test]
    fn turn_aborted_event_becomes_system_message() {
        let mut normalizer = normalizer();
        let msg_store = Arc::new(MsgStore::default());
        let entry_index = EntryIndexProvider::default();

        let patches = normalizer.process_event(
            CodexEvent::Event(EventMsg::TurnAborted(TurnAbortedEvent {
                reason: TurnAbortReason::Interrupted,
            })),
            &msg_store,
            &entry_index,
        );

        assert_eq!(patches.len(), 1);
        let PatchOperation::Add(patch) = &patches[0].0[0] else {
            panic!("expected add patch for turn aborted");
        };
        let rendered = patch.value.to_string();
        assert!(rendered.contains("system_message"));
        assert!(rendered.contains("Codex turn interrupted."));
    }

    #[test]
    fn review_lifecycle_events_become_system_messages() {
        let mut normalizer = normalizer();
        let msg_store = Arc::new(MsgStore::default());
        let entry_index = EntryIndexProvider::default();

        let started = normalizer.process_event(
            CodexEvent::Event(EventMsg::EnteredReviewMode(ReviewRequest {
                target: codex_protocol::protocol::ReviewTarget::BaseBranch {
                    branch: "main".to_string(),
                },
                user_facing_hint: None,
            })),
            &msg_store,
            &entry_index,
        );
        let finished = normalizer.process_event(
            CodexEvent::Event(EventMsg::ExitedReviewMode(ExitedReviewModeEvent {
                review_output: Some(codex_protocol::protocol::ReviewOutputEvent {
                    findings: vec![],
                    overall_correctness: "correct".to_string(),
                    overall_explanation: "Looks good".to_string(),
                    overall_confidence_score: 0.9,
                }),
            })),
            &msg_store,
            &entry_index,
        );

        let PatchOperation::Add(started_patch) = &started[0].0[0] else {
            panic!("expected add patch for review start");
        };
        let PatchOperation::Add(finished_patch) = &finished[0].0[0] else {
            panic!("expected add patch for review finish");
        };
        let started_rendered = started_patch.value.to_string();
        let finished_rendered = finished_patch.value.to_string();

        assert!(
            started_rendered.contains("Codex review started: reviewing changes against `main`")
        );
        assert!(finished_rendered.contains("Codex review completed with 0 findings."));
    }

    #[test]
    fn parses_v2_command_item_completion() {
        let event = normalizer()
            .parse_line(
                &json!({
                    "method": "item/completed",
                    "params": {
                        "threadId": "11111111-1111-1111-1111-111111111111",
                        "turnId": "turn-1",
                        "item": {
                            "type": "commandExecution",
                            "id": "item-2",
                            "command": "cargo test",
                            "cwd": "/tmp/worktree",
                            "processId": "proc-1",
                            "status": "completed",
                            "commandActions": [],
                            "aggregatedOutput": "ok",
                            "exitCode": 0,
                            "durationMs": 12
                        }
                    }
                })
                .to_string(),
            )
            .expect("item/completed should parse");

        match event {
            CodexEvent::CommandItem {
                item_id,
                command,
                output,
                exit_code,
                status,
            } => {
                assert_eq!(item_id, "item-2");
                assert_eq!(command, "cargo test");
                assert_eq!(output.as_deref(), Some("ok"));
                assert_eq!(exit_code, Some(0));
                assert_eq!(status, ToolStatus::Success);
            }
            other => panic!("unexpected event: {other:?}"),
        }
    }
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

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum DynamicToolLifecycle {
    Request {
        call_id: String,
        tool_name: String,
        arguments: Value,
    },
    Response {
        call_id: String,
        tool_name: String,
        arguments: Value,
        output: String,
        success: bool,
        approval_status: ApprovalStatus,
    },
}

impl DynamicToolLifecycle {
    pub fn response(
        call_id: String,
        tool_name: String,
        arguments: Value,
        output: String,
        success: bool,
        approval_status: ApprovalStatus,
    ) -> Self {
        Self::Response {
            call_id,
            tool_name,
            arguments,
            output,
            success,
            approval_status,
        }
    }

    pub fn raw(&self) -> String {
        serde_json::to_string(self).unwrap_or_default()
    }

    fn process(&self, state: &mut LogState, entry_index: &EntryIndexProvider) -> Vec<Patch> {
        match self {
            Self::Request {
                call_id,
                tool_name,
                arguments,
            } => {
                let is_new = !state.dynamic_tools.contains_key(call_id);
                let entry = state
                    .dynamic_tools
                    .entry(call_id.clone())
                    .or_insert_with(|| GenericToolState {
                        index: Some(entry_index.next()),
                        tool_name: tool_name.clone(),
                        arguments: Some(arguments.clone()),
                        result: None,
                        status: ToolStatus::Created,
                        call_id: call_id.clone(),
                    });
                entry.tool_name = tool_name.clone();
                entry.arguments = Some(arguments.clone());
                entry.status = ToolStatus::Created;
                let index = entry.index.unwrap_or_else(|| entry_index.next());
                vec![upsert_patch(index, entry.to_normalized_entry(), is_new)]
            }
            Self::Response {
                call_id,
                tool_name,
                arguments,
                output,
                success,
                approval_status: _,
            } => {
                let is_new = !state.dynamic_tools.contains_key(call_id);
                let entry = state
                    .dynamic_tools
                    .entry(call_id.clone())
                    .or_insert_with(|| GenericToolState {
                        index: Some(entry_index.next()),
                        tool_name: tool_name.clone(),
                        arguments: Some(arguments.clone()),
                        result: None,
                        status: ToolStatus::Created,
                        call_id: call_id.clone(),
                    });
                entry.tool_name = tool_name.clone();
                entry.arguments = Some(arguments.clone());
                entry.result = Some(ToolResult::markdown(output.clone()));
                entry.status = if *success {
                    ToolStatus::Success
                } else {
                    ToolStatus::Failed
                };
                let index = entry.index.unwrap_or_else(|| entry_index.next());
                vec![upsert_patch(index, entry.to_normalized_entry(), is_new)]
            }
        }
    }
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
            "AskUserQuestion" => "Ask User Question".to_string(),
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
