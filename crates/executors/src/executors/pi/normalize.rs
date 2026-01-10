use std::{
    collections::{HashMap, VecDeque},
    path::Path,
    sync::Arc,
};

use futures::{StreamExt, future::ready};
use serde_json::Value;
use workspace_utils::{msg_store::MsgStore, path::make_path_relative};

use crate::logs::{
    ActionType, CommandExitStatus, CommandRunResult, FileChange, NormalizedEntry,
    NormalizedEntryError, NormalizedEntryType, ToolResult, ToolStatus,
    plain_text_processor::PlainTextLogProcessor,
    utils::{
        EntryIndexProvider,
        patch::{add_normalized_entry, replace_normalized_entry},
    },
};

use super::events::{AssistantMessageEvent, PiRpcEvent, PiStateData, PiToolResult};

// ============================================================================
// Tool Call State Types
// ============================================================================

trait ToNormalizedEntry {
    fn to_normalized_entry(&self) -> NormalizedEntry;
}

#[derive(Debug, Clone)]
struct FileReadState {
    index: Option<usize>,
    path: String,
    status: ToolStatus,
}

impl ToNormalizedEntry for FileReadState {
    fn to_normalized_entry(&self) -> NormalizedEntry {
        NormalizedEntry {
            timestamp: None,
            entry_type: NormalizedEntryType::ToolUse {
                tool_name: "read".to_string(),
                action_type: ActionType::FileRead {
                    path: self.path.clone(),
                },
                status: self.status.clone(),
            },
            content: self.path.clone(),
            metadata: None,
        }
    }
}

#[derive(Debug, Clone)]
struct FileEditState {
    index: Option<usize>,
    path: String,
    changes: Vec<FileChange>,
    status: ToolStatus,
}

impl ToNormalizedEntry for FileEditState {
    fn to_normalized_entry(&self) -> NormalizedEntry {
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
            content: self.path.clone(),
            metadata: None,
        }
    }
}

#[derive(Debug, Clone)]
struct CommandRunState {
    index: Option<usize>,
    command: String,
    output: String,
    status: ToolStatus,
    exit_code: Option<i32>,
}

impl ToNormalizedEntry for CommandRunState {
    fn to_normalized_entry(&self) -> NormalizedEntry {
        let result = if self.output.is_empty() && self.exit_code.is_none() {
            None
        } else {
            Some(CommandRunResult {
                exit_status: self
                    .exit_code
                    .map(|code| CommandExitStatus::ExitCode { code }),
                output: if self.output.is_empty() {
                    None
                } else {
                    Some(self.output.clone())
                },
            })
        };

        NormalizedEntry {
            timestamp: None,
            entry_type: NormalizedEntryType::ToolUse {
                tool_name: "bash".to_string(),
                action_type: ActionType::CommandRun {
                    command: self.command.clone(),
                    result,
                },
                status: self.status.clone(),
            },
            content: self.command.clone(),
            metadata: None,
        }
    }
}

#[derive(Debug, Clone)]
struct GenericToolState {
    index: Option<usize>,
    name: String,
    arguments: Option<Value>,
    status: ToolStatus,
    result: Option<Value>,
}

impl ToNormalizedEntry for GenericToolState {
    fn to_normalized_entry(&self) -> NormalizedEntry {
        NormalizedEntry {
            timestamp: None,
            entry_type: NormalizedEntryType::ToolUse {
                tool_name: self.name.clone(),
                action_type: ActionType::Tool {
                    tool_name: self.name.clone(),
                    arguments: self.arguments.clone(),
                    result: self.result.clone().map(|value| {
                        if let Some(str) = value.as_str() {
                            ToolResult::markdown(str)
                        } else {
                            ToolResult::json(value)
                        }
                    }),
                },
                status: self.status.clone(),
            },
            content: self.name.clone(),
            metadata: None,
        }
    }
}

type ToolCallId = String;

#[allow(dead_code)]
#[derive(Debug, Clone)]
enum PendingToolCall {
    Read { tool_call_id: ToolCallId },
    FileEdit { tool_call_id: ToolCallId },
    CommandRun { tool_call_id: ToolCallId },
    Generic { tool_call_id: ToolCallId },
}

#[derive(Debug, Clone)]
struct ToolCallStates {
    #[allow(dead_code)]
    entry_index: EntryIndexProvider,
    file_reads: HashMap<String, FileReadState>,
    file_edits: HashMap<String, FileEditState>,
    command_runs: HashMap<String, CommandRunState>,
    generic_tools: HashMap<String, GenericToolState>,
    pending_fifo: VecDeque<PendingToolCall>,
    // Streaming text accumulation
    current_thinking: String,
    thinking_entry_index: Option<usize>,
    current_text: String,
    text_entry_index: Option<usize>,
}

impl ToolCallStates {
    fn new(entry_index: EntryIndexProvider) -> Self {
        Self {
            entry_index,
            file_reads: HashMap::new(),
            file_edits: HashMap::new(),
            command_runs: HashMap::new(),
            generic_tools: HashMap::new(),
            pending_fifo: VecDeque::new(),
            current_thinking: String::new(),
            thinking_entry_index: None,
            current_text: String::new(),
            text_entry_index: None,
        }
    }

    #[allow(dead_code)]
    fn has_tool_call(&self, id: &str) -> bool {
        self.file_reads.contains_key(id)
            || self.file_edits.contains_key(id)
            || self.command_runs.contains_key(id)
            || self.generic_tools.contains_key(id)
    }

    fn accumulate_thinking(&mut self, delta: &str) {
        self.current_thinking.push_str(delta);
    }

    fn accumulate_text(&mut self, delta: &str) {
        self.current_text.push_str(delta);
    }

    fn reset_for_new_turn(&mut self) {
        self.current_thinking.clear();
        self.thinking_entry_index = None;
        self.current_text.clear();
        self.text_entry_index = None;
    }
}

// ============================================================================
// Log Normalization
// ============================================================================

pub fn normalize_logs(
    msg_store: Arc<MsgStore>,
    worktree_path: &Path,
    entry_index_provider: EntryIndexProvider,
) {
    normalize_stderr_logs(msg_store.clone(), entry_index_provider.clone());

    let worktree_path = worktree_path.to_path_buf();
    tokio::spawn(async move {
        let mut state = ToolCallStates::new(entry_index_provider.clone());
        let mut session_id_extracted = false;

        let worktree_path_str = worktree_path.to_string_lossy();

        let mut lines_stream = msg_store
            .stdout_lines_stream()
            .filter_map(|res| ready(res.ok()));

        while let Some(line) = lines_stream.next().await {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            let event = match serde_json::from_str::<PiRpcEvent>(trimmed) {
                Ok(event) => event,
                Err(_) => {
                    // Handle non-JSON output as raw system message
                    let entry = NormalizedEntry {
                        timestamp: None,
                        entry_type: NormalizedEntryType::SystemMessage,
                        content: strip_ansi_escapes::strip_str(trimmed).to_string(),
                        metadata: None,
                    };
                    add_normalized_entry(&msg_store, &entry_index_provider, entry);
                    continue;
                }
            };

            match event {
                PiRpcEvent::Response {
                    command,
                    success,
                    data,
                    error,
                    ..
                } => {
                    // Extract session ID from get_state response
                    if command == "get_state" && success && !session_id_extracted {
                        if let Some(data) = data {
                            if let Ok(state_data) = serde_json::from_value::<PiStateData>(data) {
                                if let Some(session_id) = state_data.session_id {
                                    msg_store.push_session_id(session_id);
                                    session_id_extracted = true;
                                }
                            }
                        }
                    }

                    // Handle errors
                    if !success {
                        if let Some(err) = error {
                            let entry = NormalizedEntry {
                                timestamp: None,
                                entry_type: NormalizedEntryType::ErrorMessage {
                                    error_type: NormalizedEntryError::Other,
                                },
                                content: err,
                                metadata: None,
                            };
                            add_normalized_entry(&msg_store, &entry_index_provider, entry);
                        }
                    }
                }

                PiRpcEvent::MessageUpdate {
                    assistant_message_event,
                    ..
                } => {
                    if let Some(ame) = assistant_message_event {
                        match ame {
                            AssistantMessageEvent::TextDelta { delta, .. } => {
                                if !delta.is_empty() {
                                    state.accumulate_text(&delta);
                                    let entry = NormalizedEntry {
                                        timestamp: None,
                                        entry_type: NormalizedEntryType::AssistantMessage,
                                        content: state.current_text.clone(),
                                        metadata: None,
                                    };

                                    if let Some(idx) = state.text_entry_index {
                                        replace_normalized_entry(&msg_store, idx, entry);
                                    } else {
                                        let idx = add_normalized_entry(
                                            &msg_store,
                                            &entry_index_provider,
                                            entry,
                                        );
                                        state.text_entry_index = Some(idx);
                                    }
                                }
                            }
                            AssistantMessageEvent::ThinkingDelta { delta, .. } => {
                                if !delta.is_empty() {
                                    state.accumulate_thinking(&delta);
                                    let entry = NormalizedEntry {
                                        timestamp: None,
                                        entry_type: NormalizedEntryType::Thinking,
                                        content: state.current_thinking.clone(),
                                        metadata: None,
                                    };

                                    if let Some(idx) = state.thinking_entry_index {
                                        replace_normalized_entry(&msg_store, idx, entry);
                                    } else {
                                        let idx = add_normalized_entry(
                                            &msg_store,
                                            &entry_index_provider,
                                            entry,
                                        );
                                        state.thinking_entry_index = Some(idx);
                                    }
                                }
                            }
                            AssistantMessageEvent::ToolcallEnd { tool_call, .. } => {
                                // Tool call declaration is complete, create the tool state
                                create_tool_call_state(
                                    &msg_store,
                                    &entry_index_provider,
                                    &mut state,
                                    &tool_call.id,
                                    &tool_call.name,
                                    tool_call.arguments.as_ref(),
                                    &worktree_path_str,
                                );
                            }
                            _ => {
                                // Ignore other assistant message events
                            }
                        }
                    }
                }

                PiRpcEvent::ToolExecutionStart { .. } => {
                    // Tool execution started - status remains Created until completion
                    // (ToolStatus doesn't have a Running variant)
                }

                PiRpcEvent::ToolExecutionUpdate {
                    tool_call_id,
                    partial_result,
                    ..
                } => {
                    if let Some(result) = partial_result {
                        if let Some(text) = result.get_text() {
                            update_tool_output(&msg_store, &mut state, &tool_call_id, &text);
                        }
                    }
                }

                PiRpcEvent::ToolExecutionEnd {
                    tool_call_id,
                    result,
                    is_error,
                    ..
                } => {
                    let status = if is_error {
                        ToolStatus::Failed
                    } else {
                        ToolStatus::Success
                    };
                    finalize_tool_call(&msg_store, &mut state, &tool_call_id, Some(result), status);
                }

                PiRpcEvent::TurnEnd { .. } => {
                    state.reset_for_new_turn();
                }

                PiRpcEvent::AgentEnd { .. } => {
                    // Agent finished
                }

                _ => {
                    // Ignore other event types (agent_start, turn_start, message_start, etc.)
                }
            }
        }
    });
}

fn normalize_stderr_logs(msg_store: Arc<MsgStore>, entry_index_provider: EntryIndexProvider) {
    tokio::spawn(async move {
        let mut stderr = msg_store.stderr_chunked_stream();

        let mut processor = PlainTextLogProcessor::builder()
            .normalized_entry_producer(Box::new(|content: String| NormalizedEntry {
                timestamp: None,
                entry_type: NormalizedEntryType::ErrorMessage {
                    error_type: NormalizedEntryError::Other,
                },
                content,
                metadata: None,
            }))
            .transform_lines(Box::new(|lines| {
                lines.iter_mut().for_each(|line| {
                    *line = strip_ansi_escapes::strip_str(&line);
                });
            }))
            .time_gap(std::time::Duration::from_secs(2))
            .index_provider(entry_index_provider)
            .build();

        while let Some(Ok(chunk)) = stderr.next().await {
            for patch in processor.process(chunk) {
                msg_store.push_patch(patch);
            }
        }
    });
}

fn create_tool_call_state(
    msg_store: &Arc<MsgStore>,
    entry_index_provider: &EntryIndexProvider,
    state: &mut ToolCallStates,
    tool_call_id: &str,
    tool_name: &str,
    arguments: Option<&Value>,
    worktree_path_str: &str,
) {
    match tool_name {
        "read" => {
            let path = arguments
                .and_then(|a| a.get("path"))
                .and_then(|p| p.as_str())
                .map(|p| make_path_relative(p, worktree_path_str))
                .unwrap_or_default();

            let tool_state = FileReadState {
                index: None,
                path: path.clone(),
                status: ToolStatus::Created,
            };
            state
                .file_reads
                .insert(tool_call_id.to_string(), tool_state);
            state.pending_fifo.push_back(PendingToolCall::Read {
                tool_call_id: tool_call_id.to_string(),
            });

            let tool_state = state.file_reads.get_mut(tool_call_id).unwrap();
            let index = add_normalized_entry(
                msg_store,
                entry_index_provider,
                tool_state.to_normalized_entry(),
            );
            tool_state.index = Some(index);
        }

        "bash" => {
            let command = arguments
                .and_then(|a| a.get("command"))
                .and_then(|c| c.as_str())
                .unwrap_or_default()
                .to_string();

            let tool_state = CommandRunState {
                index: None,
                command: command.clone(),
                output: String::new(),
                status: ToolStatus::Created,
                exit_code: None,
            };
            state
                .command_runs
                .insert(tool_call_id.to_string(), tool_state);
            state.pending_fifo.push_back(PendingToolCall::CommandRun {
                tool_call_id: tool_call_id.to_string(),
            });

            let tool_state = state.command_runs.get_mut(tool_call_id).unwrap();
            let index = add_normalized_entry(
                msg_store,
                entry_index_provider,
                tool_state.to_normalized_entry(),
            );
            tool_state.index = Some(index);
        }

        "edit" => {
            let path = arguments
                .and_then(|a| a.get("path"))
                .and_then(|p| p.as_str())
                .map(|p| make_path_relative(p, worktree_path_str))
                .unwrap_or_default();

            let old_text = arguments
                .and_then(|a| a.get("oldText"))
                .and_then(|t| t.as_str())
                .unwrap_or_default();
            let new_text = arguments
                .and_then(|a| a.get("newText"))
                .and_then(|t| t.as_str())
                .unwrap_or_default();

            let diff = workspace_utils::diff::create_unified_diff(&path, old_text, new_text);
            let changes = vec![FileChange::Edit {
                unified_diff: diff,
                has_line_numbers: false,
            }];

            let tool_state = FileEditState {
                index: None,
                path: path.clone(),
                changes,
                status: ToolStatus::Created,
            };
            state
                .file_edits
                .insert(tool_call_id.to_string(), tool_state);
            state.pending_fifo.push_back(PendingToolCall::FileEdit {
                tool_call_id: tool_call_id.to_string(),
            });

            let tool_state = state.file_edits.get_mut(tool_call_id).unwrap();
            let index = add_normalized_entry(
                msg_store,
                entry_index_provider,
                tool_state.to_normalized_entry(),
            );
            tool_state.index = Some(index);
        }

        "write" => {
            let path = arguments
                .and_then(|a| a.get("path"))
                .and_then(|p| p.as_str())
                .map(|p| make_path_relative(p, worktree_path_str))
                .unwrap_or_default();

            let content = arguments
                .and_then(|a| a.get("content"))
                .and_then(|c| c.as_str())
                .unwrap_or_default()
                .to_string();

            let changes = vec![FileChange::Write { content }];

            let tool_state = FileEditState {
                index: None,
                path: path.clone(),
                changes,
                status: ToolStatus::Created,
            };
            state
                .file_edits
                .insert(tool_call_id.to_string(), tool_state);
            state.pending_fifo.push_back(PendingToolCall::FileEdit {
                tool_call_id: tool_call_id.to_string(),
            });

            let tool_state = state.file_edits.get_mut(tool_call_id).unwrap();
            let index = add_normalized_entry(
                msg_store,
                entry_index_provider,
                tool_state.to_normalized_entry(),
            );
            tool_state.index = Some(index);
        }

        _ => {
            // Generic tool handling
            let tool_state = GenericToolState {
                index: None,
                name: tool_name.to_string(),
                arguments: arguments.cloned(),
                result: None,
                status: ToolStatus::Created,
            };
            state
                .generic_tools
                .insert(tool_call_id.to_string(), tool_state);
            state.pending_fifo.push_back(PendingToolCall::Generic {
                tool_call_id: tool_call_id.to_string(),
            });

            let tool_state = state.generic_tools.get_mut(tool_call_id).unwrap();
            let index = add_normalized_entry(
                msg_store,
                entry_index_provider,
                tool_state.to_normalized_entry(),
            );
            tool_state.index = Some(index);
        }
    }
}

#[allow(dead_code)]
fn update_tool_status(
    msg_store: &Arc<MsgStore>,
    state: &mut ToolCallStates,
    tool_call_id: &str,
    status: ToolStatus,
) {
    if let Some(tool_state) = state.file_reads.get_mut(tool_call_id) {
        tool_state.status = status;
        if let Some(idx) = tool_state.index {
            replace_normalized_entry(msg_store, idx, tool_state.to_normalized_entry());
        }
        return;
    }

    if let Some(tool_state) = state.command_runs.get_mut(tool_call_id) {
        tool_state.status = status;
        if let Some(idx) = tool_state.index {
            replace_normalized_entry(msg_store, idx, tool_state.to_normalized_entry());
        }
        return;
    }

    if let Some(tool_state) = state.file_edits.get_mut(tool_call_id) {
        tool_state.status = status;
        if let Some(idx) = tool_state.index {
            replace_normalized_entry(msg_store, idx, tool_state.to_normalized_entry());
        }
        return;
    }

    if let Some(tool_state) = state.generic_tools.get_mut(tool_call_id) {
        tool_state.status = status;
        if let Some(idx) = tool_state.index {
            replace_normalized_entry(msg_store, idx, tool_state.to_normalized_entry());
        }
    }
}

fn update_tool_output(
    msg_store: &Arc<MsgStore>,
    state: &mut ToolCallStates,
    tool_call_id: &str,
    output: &str,
) {
    if let Some(tool_state) = state.command_runs.get_mut(tool_call_id) {
        tool_state.output.push_str(output);
        if let Some(idx) = tool_state.index {
            replace_normalized_entry(msg_store, idx, tool_state.to_normalized_entry());
        }
    }
}

fn finalize_tool_call(
    msg_store: &Arc<MsgStore>,
    state: &mut ToolCallStates,
    tool_call_id: &str,
    result: Option<PiToolResult>,
    status: ToolStatus,
) {
    // Try to finalize each type of tool call
    if let Some(mut tool_state) = state.file_reads.remove(tool_call_id) {
        tool_state.status = status;
        if let Some(idx) = tool_state.index {
            replace_normalized_entry(msg_store, idx, tool_state.to_normalized_entry());
        }
        return;
    }

    if let Some(mut tool_state) = state.command_runs.remove(tool_call_id) {
        tool_state.status = status.clone();
        if let Some(res) = &result {
            if let Some(text) = res.get_text() {
                tool_state.output = text;
            }
        }
        // Set exit code based on status
        match status {
            ToolStatus::Success => tool_state.exit_code = Some(0),
            ToolStatus::Failed => tool_state.exit_code = Some(1),
            _ => {}
        }
        if let Some(idx) = tool_state.index {
            replace_normalized_entry(msg_store, idx, tool_state.to_normalized_entry());
        }
        return;
    }

    if let Some(mut tool_state) = state.file_edits.remove(tool_call_id) {
        tool_state.status = status;
        if let Some(idx) = tool_state.index {
            replace_normalized_entry(msg_store, idx, tool_state.to_normalized_entry());
        }
        return;
    }

    if let Some(mut tool_state) = state.generic_tools.remove(tool_call_id) {
        tool_state.status = status;
        if let Some(res) = result {
            if let Some(text) = res.get_text() {
                tool_state.result = Some(Value::String(text));
            }
        }
        if let Some(idx) = tool_state.index {
            replace_normalized_entry(msg_store, idx, tool_state.to_normalized_entry());
        }
    }
}
