use std::{
    collections::{HashMap, VecDeque},
    path::Path,
};

use serde_json::Value;
use workspace_utils::{
    diff::{concatenate_diff_hunks, extract_unified_diff_hunks},
    path::make_path_relative,
};

use super::types::{DroidJson, DroidToolData, ToolResultPayload};
use crate::logs::{
    ActionType, CommandExitStatus, CommandRunResult, FileChange, NormalizedEntry,
    NormalizedEntryType, TodoItem, ToolStatus,
};

#[derive(Default, Debug, Clone, serde::Serialize)]
pub struct LogEventConverter {
    pub tool_map: HashMap<String, PendingToolCall>,
    pub model_reported: bool,
    pub pending_fifo: VecDeque<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct PendingToolCall {
    pub tool_name: String,
    pub action_type: ActionType,
    pub content: String,
}

/// Lightweight wrapper around NormalizedEntry with correlation info
#[derive(Debug, Clone, serde::Serialize)]
pub enum LogEvent {
    /// Add a new entry
    AddEntry(NormalizedEntry),
    /// Add a new tool call (needs tool_call_id tracking for later update)
    AddToolCall {
        tool_call_id: String,
        entry: NormalizedEntry,
    },
    /// Update an existing tool call (needs tool_call_id to find it)
    UpdateToolCall {
        tool_call_id: String,
        entry: NormalizedEntry,
    },
}

impl LogEventConverter {
    pub fn to_log_event(&mut self, event: &DroidJson, worktree_path: &Path) -> Option<LogEvent> {
        match event {
            DroidJson::System { model, .. } => {
                if !self.model_reported
                    && let Some(model) = model
                {
                    self.model_reported = true;
                    Some(LogEvent::AddEntry(NormalizedEntry {
                        timestamp: None,
                        entry_type: NormalizedEntryType::SystemMessage,
                        content: format!("model: {model}"),
                        metadata: None,
                    }))
                } else {
                    None
                }
            }
            DroidJson::Message { role, text, .. } => {
                let entry_type = match role.as_str() {
                    "user" => NormalizedEntryType::UserMessage,
                    "assistant" => NormalizedEntryType::AssistantMessage,
                    _ => NormalizedEntryType::SystemMessage,
                };

                Some(LogEvent::AddEntry(NormalizedEntry {
                    timestamp: None,
                    entry_type,
                    content: text.clone(),
                    metadata: None,
                }))
            }
            DroidJson::ToolCall {
                id,
                tool_name,
                parameters,
                ..
            } => {
                let action_type = map_tool_to_action(tool_name, parameters, worktree_path);
                let content = generate_concise_content(tool_name, &action_type);

                self.tool_map.insert(
                    id.clone(),
                    PendingToolCall {
                        tool_name: tool_name.clone(),
                        action_type: action_type.clone(),
                        content: content.clone(),
                    },
                );
                self.pending_fifo.push_back(id.clone());

                Some(LogEvent::AddToolCall {
                    tool_call_id: id.clone(),
                    entry: NormalizedEntry {
                        timestamp: None,
                        entry_type: NormalizedEntryType::ToolUse {
                            tool_name: tool_name.clone(),
                            action_type,
                            status: ToolStatus::Created,
                        },
                        content,
                        metadata: None,
                    },
                })
            }
            DroidJson::ToolResult {
                id,
                is_error,
                payload,
                ..
            } => {
                // Resolve id: prefer explicit, else FIFO
                let resolved_id = if let Some(explicit) = id.as_ref() {
                    Some(explicit.clone())
                } else {
                    // FIFO fallback: pop until we find a key still pending
                    loop {
                        if let Some(next_id) = self.pending_fifo.pop_front() {
                            if self.tool_map.contains_key(&next_id) {
                                break Some(next_id);
                            }
                        } else {
                            break None;
                        }
                    }
                };

                if let Some(tool_call_id) = resolved_id {
                    // If explicit id was provided, remove it from the FIFO queue as cleanup
                    if id.is_some() {
                        if let Some(pos) = self.pending_fifo.iter().position(|x| x == &tool_call_id)
                        {
                            self.pending_fifo.remove(pos);
                        }
                    }

                    if let Some(call) = self.tool_map.remove(&tool_call_id) {
                        let status = if *is_error {
                            ToolStatus::Failed
                        } else {
                            ToolStatus::Success
                        };

                        let updated_action_type =
                            compute_updated_action_type(&call, payload, *is_error, worktree_path);

                        Some(LogEvent::UpdateToolCall {
                            tool_call_id: tool_call_id.clone(),
                            entry: NormalizedEntry {
                                timestamp: None,
                                entry_type: NormalizedEntryType::ToolUse {
                                    tool_name: call.tool_name,
                                    action_type: updated_action_type,
                                    status,
                                },
                                content: call.content,
                                metadata: None,
                            },
                        })
                    } else {
                        tracing::error!(
                            "Failed to match tool result with tool call for id: {}",
                            tool_call_id
                        );
                        None
                    }
                } else {
                    tracing::error!(
                        "Failed to match tool result: no id provided and no pending tool calls"
                    );
                    None
                }
            }
            DroidJson::Error { message, .. } => Some(LogEvent::AddEntry(NormalizedEntry {
                timestamp: None,
                entry_type: NormalizedEntryType::ErrorMessage,
                content: message.clone(),
                metadata: None,
            })),
        }
    }
}

// We have more data about a tool call after receiving a tool call result
// Here we normalise that data too
fn compute_updated_action_type(
    call: &PendingToolCall,
    payload: &ToolResultPayload,
    is_error: bool,
    worktree_path: &Path,
) -> ActionType {
    if let ToolResultPayload::Value { value } = payload {
        let result_str = if let Some(s) = value.as_str() {
            s.to_string()
        } else {
            serde_json::to_string_pretty(value).unwrap_or_default()
        };

        let res = match call.action_type {
            ActionType::FileEdit { .. } => {
                if call.tool_name == "ApplyPatch" {
                    let worktree_path_str = worktree_path.to_string_lossy();
                    Some(
                        parse_apply_patch_result(value, &worktree_path_str)
                            .unwrap_or_else(|| call.action_type.clone()),
                    )
                } else {
                    None
                }
            }
            ActionType::CommandRun { ref command, .. } => {
                let exit_code = result_str
                    .lines()
                    .find(|line| line.contains("[Process exited with code"))
                    .and_then(|line| {
                        line.strip_prefix("[Process exited with code ")?
                            .strip_suffix("]")?
                            .parse::<i32>()
                            .ok()
                    });

                let result = Some(CommandRunResult {
                    exit_status: exit_code
                        .map(|code| CommandExitStatus::ExitCode { code })
                        .or(Some(CommandExitStatus::Success { success: !is_error })),
                    output: Some(result_str),
                });

                Some(ActionType::CommandRun {
                    command: command.clone(),
                    result,
                })
            }
            _ => None,
        };

        res.unwrap_or(call.action_type.clone())
    } else {
        call.action_type.clone()
    }
}

pub fn generate_concise_content(tool_name: &str, action_type: &ActionType) -> String {
    match action_type {
        ActionType::FileRead { path } => format!("`{path}`"),
        ActionType::FileEdit { path, .. } => format!("`{path}`"),
        ActionType::CommandRun { command, .. } => format!("`{command}`"),
        ActionType::Search { query } => format!("`{query}`"),
        ActionType::WebFetch { url } => format!("`{url}`"),
        ActionType::TodoManagement { .. } => "TODO list updated".to_string(),
        ActionType::Other { description } => description.clone(),
        _ => tool_name.to_string(),
    }
}

pub fn map_tool_to_action(tool_name: &str, params: &Value, worktree_path: &Path) -> ActionType {
    let tool_json = serde_json::json!({
        "toolName": tool_name,
        "parameters": params
    });

    let tool_data: DroidToolData = match serde_json::from_value(tool_json) {
        Ok(data) => data,
        Err(e) => {
            tracing::warn!(
                tool_name = %tool_name,
                error = %e,
                "Failed to parse DroidToolData from tool parameters"
            );
            return ActionType::Other {
                description: tool_name.to_string(),
            };
        }
    };

    let worktree_path_str = worktree_path.to_string_lossy();

    match tool_data {
        DroidToolData::Read { file_path } => ActionType::FileRead {
            path: make_path_relative(&file_path, &worktree_path_str),
        },
        DroidToolData::LS { directory_path, .. } => ActionType::FileRead {
            path: make_path_relative(&directory_path, &worktree_path_str),
        },
        DroidToolData::Glob { patterns, .. } => ActionType::Search {
            query: patterns.join(", "),
        },
        DroidToolData::Grep { path, .. } => ActionType::FileRead {
            path: path
                .map(|p| make_path_relative(&p, &worktree_path_str))
                .unwrap_or_default(),
        },
        DroidToolData::Execute { command, .. } => ActionType::CommandRun {
            command,
            result: None,
        },
        DroidToolData::Edit {
            file_path,
            old_string,
            new_string,
        } => {
            let changes = vec![FileChange::Edit {
                unified_diff: workspace_utils::diff::create_unified_diff(
                    &file_path,
                    &old_string,
                    &new_string,
                ),
                has_line_numbers: false,
            }];
            ActionType::FileEdit {
                path: make_path_relative(&file_path, &worktree_path_str),
                changes,
            }
        }
        DroidToolData::MultiEdit { file_path, edits } => {
            let hunks: Vec<String> = edits
                .iter()
                .filter_map(|edit| {
                    if edit.old_string.is_some() || edit.new_string.is_some() {
                        Some(workspace_utils::diff::create_unified_diff_hunk(
                            &edit.old_string.clone().unwrap_or_default(),
                            &edit.new_string.clone().unwrap_or_default(),
                        ))
                    } else {
                        None
                    }
                })
                .collect();
            ActionType::FileEdit {
                path: make_path_relative(&file_path, &worktree_path_str),
                changes: vec![FileChange::Edit {
                    unified_diff: concatenate_diff_hunks(&file_path, &hunks),
                    has_line_numbers: false,
                }],
            }
        }
        DroidToolData::Create { file_path, content } => ActionType::FileEdit {
            path: make_path_relative(&file_path, &worktree_path_str),
            changes: vec![FileChange::Write {
                content: content.clone(),
            }],
        },
        DroidToolData::ApplyPatch { input } => ActionType::FileEdit {
            path: make_path_relative(&extract_path_from_patch(&input), &worktree_path_str),
            changes: vec![],
        },
        DroidToolData::TodoWrite { todos } => {
            let todo_items = todos
                .into_iter()
                .map(|item| TodoItem {
                    content: item.content,
                    status: item.status,
                    priority: item.priority,
                })
                .collect();
            ActionType::TodoManagement {
                todos: todo_items,
                operation: "update".to_string(),
            }
        }
        DroidToolData::WebSearch { query, .. } => ActionType::WebFetch { url: query },
        DroidToolData::FetchUrl { url, .. } => ActionType::WebFetch { url },
        DroidToolData::ExitSpecMode { .. } => ActionType::Other {
            description: "ExitSpecMode".to_string(),
        },
        DroidToolData::SlackPostMessage { .. } => ActionType::Other {
            description: "SlackPostMessage".to_string(),
        },
        DroidToolData::Unknown { .. } => ActionType::Other {
            description: tool_name.to_string(),
        },
    }
}

fn extract_path_from_patch(input: &str) -> String {
    for line in input.lines() {
        // 'The required format is '[ACTION] File: [path/to/file]' -> ACTION must be either Add or Update.'
        if line.starts_with("*** Update File:") || line.starts_with("*** Add File:") {
            return line
                .split(':')
                .nth(1)
                .map(|s| s.trim().to_string())
                .unwrap_or_default();
        }
    }
    String::new()
}

fn parse_apply_patch_result(value: &Value, worktree_path: &str) -> Option<ActionType> {
    let parsed_value;
    let result_obj = if value.is_object() {
        value
    } else if let Some(s) = value.as_str() {
        match serde_json::from_str::<Value>(s) {
            Ok(v) => {
                parsed_value = v;
                &parsed_value
            }
            Err(e) => {
                tracing::warn!(
                    error = %e,
                    input = %s,
                    "Failed to parse apply_patch result string as JSON"
                );
                return None;
            }
        }
    } else {
        tracing::warn!(
            value_type = ?value,
            "apply_patch result is neither object nor string"
        );
        return None;
    };

    let file_path = result_obj
        .get("file_path")
        .or_else(|| result_obj.get("value").and_then(|v| v.get("file_path")))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    if file_path.is_none() {
        tracing::warn!(
            result = ?result_obj,
            "apply_patch result missing file_path field"
        );
        return None;
    }

    let file_path = file_path?;

    let diff = result_obj
        .get("diff")
        .or_else(|| result_obj.get("value").and_then(|v| v.get("diff")))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let content = result_obj
        .get("content")
        .or_else(|| result_obj.get("value").and_then(|v| v.get("content")))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let relative_path = make_path_relative(&file_path, worktree_path);

    let changes = if let Some(diff_text) = diff {
        let hunks = extract_unified_diff_hunks(&diff_text);
        vec![FileChange::Edit {
            unified_diff: concatenate_diff_hunks(&relative_path, &hunks),
            has_line_numbers: true,
        }]
    } else if let Some(content_text) = content {
        vec![FileChange::Write {
            content: content_text,
        }]
    } else {
        vec![]
    };

    Some(ActionType::FileEdit {
        path: relative_path,
        changes,
    })
}
