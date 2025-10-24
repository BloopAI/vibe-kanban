use std::{collections::HashMap, path::Path};

use super::{
    action_mapper,
    types::{DroidJson, ToolResultPayload},
};
use crate::logs::{
    ActionType, CommandExitStatus, CommandRunResult, NormalizedEntry, NormalizedEntryType,
    ToolStatus,
};

#[derive(Default, Debug, Clone, serde::Serialize)]
pub struct ProcessorState {
    pub tool_map: HashMap<String, PendingToolCall>,
    pub model_reported: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
#[allow(dead_code)]
pub struct PendingToolCall {
    pub tool_name: String,
    pub tool_call_id: String,
    pub message_id: String,
    pub action_type: ActionType,
    pub content: String,
    pub timestamp: u64,
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

pub fn process_event(
    state: ProcessorState,
    event: &DroidJson,
    worktree_path: &Path,
) -> (ProcessorState, Vec<LogEvent>) {
    let mut state = state;
    let mut events = Vec::new();

    match event {
        DroidJson::System { model, .. } => {
            if !state.model_reported
                && let Some(model) = model
            {
                state.model_reported = true;
                events.push(LogEvent::AddEntry(NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::SystemMessage,
                    content: format!("model: {model}"),
                    metadata: None,
                }));
            }
        }

        DroidJson::Message {
            role,
            text,
            timestamp,
            ..
        } => {
            let entry_type = match role.as_str() {
                "user" => NormalizedEntryType::UserMessage,
                "assistant" => NormalizedEntryType::AssistantMessage,
                _ => NormalizedEntryType::SystemMessage,
            };

            events.push(LogEvent::AddEntry(NormalizedEntry {
                timestamp: Some(timestamp.to_string()),
                entry_type,
                content: text.clone(),
                metadata: None,
            }));
        }

        DroidJson::ToolCall {
            id,
            message_id,
            tool_name,
            parameters,
            timestamp,
            ..
        } => {
            let action_type =
                action_mapper::map_tool_to_action(tool_name, parameters, worktree_path);
            let content = action_mapper::generate_concise_content(tool_name, &action_type);

            state.tool_map.insert(
                id.clone(),
                PendingToolCall {
                    tool_name: tool_name.clone(),
                    tool_call_id: id.clone(),
                    message_id: message_id.clone(),
                    action_type: action_type.clone(),
                    content: content.clone(),
                    timestamp: *timestamp,
                },
            );

            let mut metadata = parameters.clone();
            if let Some(obj) = metadata.as_object_mut() {
                obj.insert("toolCallId".to_string(), serde_json::json!(id));
            }

            events.push(LogEvent::AddToolCall {
                tool_call_id: id.clone(),
                entry: NormalizedEntry {
                    timestamp: Some(timestamp.to_string()),
                    entry_type: NormalizedEntryType::ToolUse {
                        tool_name: tool_name.clone(),
                        action_type,
                        status: ToolStatus::Created,
                    },
                    content,
                    metadata: Some(metadata),
                },
            });
        }

        DroidJson::ToolResult {
            id,
            is_error,
            payload,
            timestamp,
            ..
        } => {
            if let Some(call) = state.tool_map.remove(id) {
                let status = if *is_error {
                    ToolStatus::Failed
                } else {
                    ToolStatus::Success
                };

                let updated_action_type =
                    compute_updated_action_type(&call, payload, *is_error, worktree_path);

                events.push(LogEvent::UpdateToolCall {
                    tool_call_id: id.clone(),
                    entry: NormalizedEntry {
                        timestamp: Some(timestamp.to_string()),
                        entry_type: NormalizedEntryType::ToolUse {
                            tool_name: call.tool_name,
                            action_type: updated_action_type,
                            status,
                        },
                        content: call.content,
                        metadata: None,
                    },
                });
            }
        }

        DroidJson::Error {
            message, timestamp, ..
        } => {
            events.push(LogEvent::AddEntry(NormalizedEntry {
                timestamp: Some(timestamp.to_string()),
                entry_type: NormalizedEntryType::ErrorMessage,
                content: message.clone(),
                metadata: None,
            }));
        }
    }

    (state, events)
}

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

        if matches!(call.action_type, ActionType::CommandRun { .. }) {
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

            if let ActionType::CommandRun { command, .. } = &call.action_type {
                ActionType::CommandRun {
                    command: command.clone(),
                    result,
                }
            } else {
                call.action_type.clone()
            }
        } else if matches!(call.action_type, ActionType::FileEdit { .. })
            && call.tool_name == "ApplyPatch"
        {
            let worktree_path_str = worktree_path.to_string_lossy();
            action_mapper::parse_apply_patch_result(value, &worktree_path_str)
                .unwrap_or_else(|| call.action_type.clone())
        } else {
            call.action_type.clone()
        }
    } else {
        call.action_type.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::executors::droid::types::{DroidJson, ToolResultPayload};

    // Test helpers
    fn build_system_event(model: Option<String>) -> DroidJson {
        DroidJson::System {
            subtype: Some("init".to_string()),
            session_id: "test-session".to_string(),
            cwd: Some("/test/path".to_string()),
            tools: Some(vec!["Read".to_string()]),
            model,
        }
    }

    fn build_tool_call(id: &str, tool_name: &str, parameters: serde_json::Value) -> DroidJson {
        DroidJson::ToolCall {
            id: id.to_string(),
            message_id: "msg-id".to_string(),
            tool_id: tool_name.to_string(),
            tool_name: tool_name.to_string(),
            parameters,
            timestamp: 1000000,
            session_id: "test-session".to_string(),
        }
    }

    fn build_tool_result(id: &str, is_error: bool, payload: ToolResultPayload) -> DroidJson {
        DroidJson::ToolResult {
            id: id.to_string(),
            message_id: "msg-id".to_string(),
            tool_id: "".to_string(),
            is_error,
            payload,
            timestamp: 1000001,
            session_id: "test-session".to_string(),
        }
    }

    // Edge case tests - These test scenarios not fully covered by snapshot tests

    #[test]
    fn test_system_model_reported_once() {
        let state = ProcessorState::default();
        let worktree_path = Path::new("/tmp/test");

        // First system event with model
        let event = build_system_event(Some("gpt-5-codex".to_string()));
        let (state, events) = process_event(state, &event, worktree_path);

        assert_eq!(events.len(), 1);
        assert!(state.model_reported);

        // Second system event should produce no events
        let event2 = build_system_event(Some("different-model".to_string()));
        let (_state2, events2) = process_event(state, &event2, worktree_path);
        assert!(events2.is_empty());
    }

    #[test]
    fn test_system_without_model() {
        let state = ProcessorState::default();
        let worktree_path = Path::new("/tmp/test");

        let event = build_system_event(None);
        let (state, events) = process_event(state, &event, worktree_path);

        assert!(events.is_empty());
        assert!(!state.model_reported);
    }

    #[test]
    fn test_tool_call_metadata_non_object() {
        let state = ProcessorState::default();
        let worktree_path = Path::new("/tmp/test");

        let params = serde_json::json!("string-param");
        let event = build_tool_call("call-1", "Read", params);
        let (_state, events) = process_event(state, &event, worktree_path);

        match &events[0] {
            LogEvent::AddToolCall { entry, .. } => {
                let metadata = entry.metadata.as_ref().unwrap();
                // Should be string, not object with toolCallId
                assert_eq!(metadata, &serde_json::json!("string-param"));
            }
            _ => panic!("Expected AddToolCall"),
        }
    }

    #[test]
    fn test_tool_result_unknown_id() {
        let state = ProcessorState::default();
        let worktree_path = Path::new("/tmp/test");

        let result_event = build_tool_result(
            "unknown-id",
            false,
            ToolResultPayload::Value {
                value: serde_json::json!("data"),
            },
        );
        let (state, events) = process_event(state, &result_event, worktree_path);

        assert!(events.is_empty());
        assert!(state.tool_map.is_empty());
    }

    #[test]
    fn test_tool_result_double_result() {
        let state = ProcessorState::default();
        let worktree_path = Path::new("/tmp/test");

        let call_event = build_tool_call(
            "call-1",
            "Read",
            serde_json::json!({"file_path": "test.txt"}),
        );
        let (state, _) = process_event(state, &call_event, worktree_path);

        let result_event = build_tool_result(
            "call-1",
            false,
            ToolResultPayload::Value {
                value: serde_json::json!("data"),
            },
        );
        let (state, events1) = process_event(state, &result_event, worktree_path);
        assert_eq!(events1.len(), 1);

        // Second result should be ignored
        let (_state, events2) = process_event(state, &result_event, worktree_path);
        assert!(events2.is_empty());
    }

    #[test]
    fn test_execute_without_exit_code_success() {
        let state = ProcessorState::default();
        let worktree_path = Path::new("/tmp/test");

        let call_event = build_tool_call(
            "call-1",
            "Execute",
            serde_json::json!({"command": "echo test"}),
        );
        let (state, _) = process_event(state, &call_event, worktree_path);

        let result_event = build_tool_result(
            "call-1",
            false,
            ToolResultPayload::Value {
                value: serde_json::json!("output without exit code"),
            },
        );
        let (_state, events) = process_event(state, &result_event, worktree_path);

        match &events[0] {
            LogEvent::UpdateToolCall { entry, .. } => match &entry.entry_type {
                crate::logs::NormalizedEntryType::ToolUse {
                    action_type,
                    status,
                    ..
                } => {
                    assert!(matches!(status, crate::logs::ToolStatus::Success));
                    match action_type {
                        crate::logs::ActionType::CommandRun { result, .. } => {
                            let result = result.as_ref().unwrap();
                            assert!(matches!(
                                result.exit_status,
                                Some(crate::logs::CommandExitStatus::Success { success: true })
                            ));
                        }
                        _ => panic!("Expected CommandRun"),
                    }
                }
                _ => panic!("Expected ToolUse"),
            },
            _ => panic!("Expected UpdateToolCall"),
        }
    }

    #[test]
    fn test_execute_error_without_exit_code() {
        let state = ProcessorState::default();
        let worktree_path = Path::new("/tmp/test");

        let call_event =
            build_tool_call("call-1", "Execute", serde_json::json!({"command": "fail"}));
        let (state, _) = process_event(state, &call_event, worktree_path);

        let result_event = build_tool_result(
            "call-1",
            true,
            ToolResultPayload::Value {
                value: serde_json::json!("error output"),
            },
        );
        let (_state, events) = process_event(state, &result_event, worktree_path);

        match &events[0] {
            LogEvent::UpdateToolCall { entry, .. } => match &entry.entry_type {
                crate::logs::NormalizedEntryType::ToolUse {
                    action_type,
                    status,
                    ..
                } => {
                    assert!(matches!(status, crate::logs::ToolStatus::Failed));
                    match action_type {
                        crate::logs::ActionType::CommandRun { result, .. } => {
                            let result = result.as_ref().unwrap();
                            assert!(matches!(
                                result.exit_status,
                                Some(crate::logs::CommandExitStatus::Success { success: false })
                            ));
                        }
                        _ => panic!("Expected CommandRun"),
                    }
                }
                _ => panic!("Expected ToolUse"),
            },
            _ => panic!("Expected UpdateToolCall"),
        }
    }

    #[test]
    fn test_apply_patch_with_unparsable_result() {
        let state = ProcessorState::default();
        let worktree_path = Path::new("/tmp/test");

        let call_event = build_tool_call(
            "call-1",
            "ApplyPatch",
            serde_json::json!({"input": "*** Begin Patch\n..."}),
        );
        let (state, _) = process_event(state, &call_event, worktree_path);

        // Unparsable result (missing file_path)
        let result_event = build_tool_result(
            "call-1",
            false,
            ToolResultPayload::Value {
                value: serde_json::json!("unparsable string"),
            },
        );
        let (_state, events) = process_event(state, &result_event, worktree_path);

        // Should still produce UpdateToolCall with FileEdit (parse failed, so falls back)
        assert_eq!(events.len(), 1);
        match &events[0] {
            LogEvent::UpdateToolCall { entry, .. } => {
                assert!(matches!(
                    &entry.entry_type,
                    crate::logs::NormalizedEntryType::ToolUse {
                        action_type: crate::logs::ActionType::FileEdit { .. },
                        ..
                    }
                ));
            }
            _ => panic!("Expected UpdateToolCall"),
        }
    }

    #[test]
    fn test_out_of_order_result_before_call() {
        let state = ProcessorState::default();
        let worktree_path = Path::new("/tmp/test");

        // Result arrives first
        let result_event = build_tool_result(
            "call-1",
            false,
            ToolResultPayload::Value {
                value: serde_json::json!("data"),
            },
        );
        let (state, events) = process_event(state, &result_event, worktree_path);
        assert!(events.is_empty());

        // Then call arrives
        let call_event = build_tool_call(
            "call-1",
            "Read",
            serde_json::json!({"file_path": "test.txt"}),
        );
        let (state, events) = process_event(state, &call_event, worktree_path);
        assert_eq!(events.len(), 1);
        assert!(state.tool_map.contains_key("call-1"));
    }

    #[test]
    fn test_multiple_simultaneous_calls_partial_results() {
        let state = ProcessorState::default();
        let worktree_path = Path::new("/tmp/test");

        // Add two calls
        let call1 = build_tool_call("call-A", "Read", serde_json::json!({"file_path": "a.txt"}));
        let (state, _) = process_event(state, &call1, worktree_path);

        let call2 = build_tool_call("call-B", "Read", serde_json::json!({"file_path": "b.txt"}));
        let (state, _) = process_event(state, &call2, worktree_path);

        assert_eq!(state.tool_map.len(), 2);

        // Result for B only
        let result_b = build_tool_result(
            "call-B",
            false,
            ToolResultPayload::Value {
                value: serde_json::json!("b contents"),
            },
        );
        let (state, events) = process_event(state, &result_b, worktree_path);

        assert_eq!(events.len(), 1);
        assert_eq!(state.tool_map.len(), 1);
        assert!(state.tool_map.contains_key("call-A"));
        assert!(!state.tool_map.contains_key("call-B"));

        // Result for A
        let result_a = build_tool_result(
            "call-A",
            false,
            ToolResultPayload::Value {
                value: serde_json::json!("a contents"),
            },
        );
        let (state, events) = process_event(state, &result_a, worktree_path);

        assert_eq!(events.len(), 1);
        assert!(state.tool_map.is_empty());
    }
}
