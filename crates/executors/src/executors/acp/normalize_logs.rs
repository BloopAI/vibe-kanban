use std::{
    collections::HashMap,
    io::Write as IoWrite,
    path::{Path, PathBuf},
    sync::{Arc, LazyLock},
    time::{Duration, Instant},
};

use agent_client_protocol::{self as acp, SessionNotification};
use futures::StreamExt;
use regex::Regex;
use serde::{Deserialize, Serialize};
use workspace_utils::{approvals::ApprovalStatus, msg_store::MsgStore};

pub use super::AcpAgentHarness;
use super::AcpEvent;
use crate::{
    approvals::ToolCallMetadata,
    logs::{
        ActionType, FileChange, NormalizedEntry, NormalizedEntryError, NormalizedEntryType,
        TodoItem, ToolResult, ToolResultValueType, ToolStatus as LogToolStatus,
        stderr_processor::normalize_stderr_logs,
        utils::{ConversationPatch, EntryIndexProvider},
    },
};

pub fn normalize_logs(msg_store: Arc<MsgStore>, worktree_path: &Path) {
    // stderr normalization
    let entry_index = EntryIndexProvider::start_from(&msg_store);
    normalize_stderr_logs(msg_store.clone(), entry_index.clone());

    // stdout normalization (main loop)
    let worktree_path = worktree_path.to_path_buf();
    // Type aliases to simplify complex state types and appease clippy
    tokio::spawn(async move {
        type ToolStates = std::collections::HashMap<String, PartialToolCallData>;

        let mut stored_session_id = false;
        let mut streaming: StreamingState = StreamingState::default();
        let mut tool_states: ToolStates = HashMap::new();

        let mut profiler = PipelineProfiler::new();
        let mut wait_start = Instant::now();

        let mut stdout_lines = msg_store.stdout_lines_stream();
        while let Some(Ok(line)) = stdout_lines.next().await {
            let wait_elapsed = wait_start.elapsed();
            profiler.time_waiting_for_line += wait_elapsed;

            let line_len = line.len();
            profiler.total_line_bytes += line_len as u64;
            if line_len as u64 > profiler.max_line_bytes {
                profiler.max_line_bytes = line_len as u64;
            }

            let parse_start = Instant::now();
            if let Some(parsed) = AcpEventParser::parse_line(&line) {
                let parse_elapsed = parse_start.elapsed();
                profiler.time_in_parse += parse_elapsed;
                profiler.total_events += 1;

                let event_type = event_variant_name(&parsed);
                *profiler.event_counts.entry(event_type).or_insert(0) += 1;

                let match_start = Instant::now();

                tracing::trace!("Parsed ACP line: {:?}", parsed);
                match parsed {
                    AcpEvent::SessionStart(id) => {
                        if !stored_session_id {
                            msg_store.push_session_id(id);
                            stored_session_id = true;
                        }
                        profiler.record_event(
                            event_type,
                            line_len,
                            parse_elapsed,
                            match_start.elapsed(),
                            Duration::ZERO,
                            Duration::ZERO,
                            None,
                        );
                    }
                    AcpEvent::Error(msg) => {
                        let idx = entry_index.next();
                        let entry = NormalizedEntry {
                            timestamp: None,
                            entry_type: NormalizedEntryType::ErrorMessage {
                                error_type: NormalizedEntryError::Other,
                            },
                            content: msg,
                            metadata: None,
                        };
                        let patch_start = Instant::now();
                        let patch = ConversationPatch::add_normalized_entry(idx, entry);
                        let patch_elapsed = patch_start.elapsed();
                        profiler.time_in_patch_creation += patch_elapsed;

                        let push_start = Instant::now();
                        msg_store.push_patch(patch);
                        let push_elapsed = push_start.elapsed();
                        profiler.time_in_push_patch += push_elapsed;
                        profiler.total_patches += 1;

                        profiler.record_event(
                            event_type,
                            line_len,
                            parse_elapsed,
                            match_start.elapsed(),
                            patch_elapsed,
                            push_elapsed,
                            None,
                        );
                    }
                    AcpEvent::Done(_) => {
                        streaming.assistant_text = None;
                        streaming.thinking_text = None;
                        profiler.record_event(
                            event_type,
                            line_len,
                            parse_elapsed,
                            match_start.elapsed(),
                            Duration::ZERO,
                            Duration::ZERO,
                            None,
                        );
                    }
                    AcpEvent::Message(content) => {
                        streaming.thinking_text = None;
                        if let agent_client_protocol::ContentBlock::Text(text) = content {
                            let is_new = streaming.assistant_text.is_none();
                            if is_new {
                                if text.text == "\n" {
                                    profiler.record_event(
                                        event_type,
                                        line_len,
                                        parse_elapsed,
                                        match_start.elapsed(),
                                        Duration::ZERO,
                                        Duration::ZERO,
                                        None,
                                    );
                                    wait_start = Instant::now();
                                    continue;
                                }
                                let idx = entry_index.next();
                                streaming.assistant_text = Some(StreamingText {
                                    index: idx,
                                    content: String::new(),
                                });
                            }
                            if let Some(ref mut s) = streaming.assistant_text {
                                s.content.push_str(&text.text);
                                let clone_bytes = s.content.len();

                                profiler.assistant_clone_count += 1;
                                profiler.assistant_clone_total_bytes += clone_bytes as u64;
                                if clone_bytes as u64 > profiler.assistant_max_clone_bytes {
                                    profiler.assistant_max_clone_bytes = clone_bytes as u64;
                                }

                                let entry = NormalizedEntry {
                                    timestamp: None,
                                    entry_type: NormalizedEntryType::AssistantMessage,
                                    content: s.content.clone(),
                                    metadata: None,
                                };
                                let patch_start = Instant::now();
                                let patch = if is_new {
                                    ConversationPatch::add_normalized_entry(s.index, entry)
                                } else {
                                    ConversationPatch::replace(s.index, entry)
                                };
                                let patch_elapsed = patch_start.elapsed();
                                profiler.time_in_patch_creation += patch_elapsed;

                                let push_start = Instant::now();
                                msg_store.push_patch(patch);
                                let push_elapsed = push_start.elapsed();
                                profiler.time_in_push_patch += push_elapsed;
                                profiler.total_patches += 1;

                                profiler.record_event(
                                    event_type,
                                    line_len,
                                    parse_elapsed,
                                    match_start.elapsed(),
                                    patch_elapsed,
                                    push_elapsed,
                                    Some(clone_bytes as u64),
                                );
                            }
                        } else {
                            profiler.record_event(
                                event_type,
                                line_len,
                                parse_elapsed,
                                match_start.elapsed(),
                                Duration::ZERO,
                                Duration::ZERO,
                                None,
                            );
                        }
                    }
                    AcpEvent::Thought(content) => {
                        streaming.assistant_text = None;
                        if let agent_client_protocol::ContentBlock::Text(text) = content {
                            let is_new = streaming.thinking_text.is_none();
                            if is_new {
                                let idx = entry_index.next();
                                streaming.thinking_text = Some(StreamingText {
                                    index: idx,
                                    content: String::new(),
                                });
                            }
                            if let Some(ref mut s) = streaming.thinking_text {
                                s.content.push_str(&text.text);
                                let clone_bytes = s.content.len();

                                profiler.thinking_clone_count += 1;
                                profiler.thinking_clone_total_bytes += clone_bytes as u64;
                                if clone_bytes as u64 > profiler.thinking_max_clone_bytes {
                                    profiler.thinking_max_clone_bytes = clone_bytes as u64;
                                }

                                let entry = NormalizedEntry {
                                    timestamp: None,
                                    entry_type: NormalizedEntryType::Thinking,
                                    content: s.content.clone(),
                                    metadata: None,
                                };
                                let patch_start = Instant::now();
                                let patch = if is_new {
                                    ConversationPatch::add_normalized_entry(s.index, entry)
                                } else {
                                    ConversationPatch::replace(s.index, entry)
                                };
                                let patch_elapsed = patch_start.elapsed();
                                profiler.time_in_patch_creation += patch_elapsed;

                                let push_start = Instant::now();
                                msg_store.push_patch(patch);
                                let push_elapsed = push_start.elapsed();
                                profiler.time_in_push_patch += push_elapsed;
                                profiler.total_patches += 1;

                                profiler.record_event(
                                    event_type,
                                    line_len,
                                    parse_elapsed,
                                    match_start.elapsed(),
                                    patch_elapsed,
                                    push_elapsed,
                                    Some(clone_bytes as u64),
                                );
                            }
                        } else {
                            profiler.record_event(
                                event_type,
                                line_len,
                                parse_elapsed,
                                match_start.elapsed(),
                                Duration::ZERO,
                                Duration::ZERO,
                                None,
                            );
                        }
                    }
                    AcpEvent::Plan(plan) => {
                        streaming.assistant_text = None;
                        streaming.thinking_text = None;
                        let todos: Vec<TodoItem> = plan
                            .entries
                            .iter()
                            .map(|e| TodoItem {
                                content: e.content.clone(),
                                status: serde_json::to_value(&e.status)
                                    .ok()
                                    .and_then(|v| v.as_str().map(|s| s.to_string()))
                                    .unwrap_or_else(|| "unknown".to_string()),
                                priority: serde_json::to_value(&e.priority)
                                    .ok()
                                    .and_then(|v| v.as_str().map(|s| s.to_string())),
                            })
                            .collect();

                        let idx = entry_index.next();
                        let entry = NormalizedEntry {
                            timestamp: None,
                            entry_type: NormalizedEntryType::ToolUse {
                                tool_name: "plan".to_string(),
                                action_type: ActionType::TodoManagement {
                                    todos,
                                    operation: "update".to_string(),
                                },
                                status: LogToolStatus::Success,
                            },
                            content: "Plan updated".to_string(),
                            metadata: None,
                        };
                        let patch_start = Instant::now();
                        let patch = ConversationPatch::add_normalized_entry(idx, entry);
                        let patch_elapsed = patch_start.elapsed();
                        profiler.time_in_patch_creation += patch_elapsed;

                        let push_start = Instant::now();
                        msg_store.push_patch(patch);
                        let push_elapsed = push_start.elapsed();
                        profiler.time_in_push_patch += push_elapsed;
                        profiler.total_patches += 1;

                        profiler.record_event(
                            event_type,
                            line_len,
                            parse_elapsed,
                            match_start.elapsed(),
                            patch_elapsed,
                            push_elapsed,
                            None,
                        );
                    }
                    AcpEvent::AvailableCommands(cmds) => {
                        let mut body = String::from("Available commands:\n");
                        for c in &cmds {
                            body.push_str(&format!("- {}\n", c.name));
                        }
                        let idx = entry_index.next();
                        let entry = NormalizedEntry {
                            timestamp: None,
                            entry_type: NormalizedEntryType::SystemMessage,
                            content: body,
                            metadata: None,
                        };
                        let patch_start = Instant::now();
                        let patch = ConversationPatch::add_normalized_entry(idx, entry);
                        let patch_elapsed = patch_start.elapsed();
                        profiler.time_in_patch_creation += patch_elapsed;

                        let push_start = Instant::now();
                        msg_store.push_patch(patch);
                        let push_elapsed = push_start.elapsed();
                        profiler.time_in_push_patch += push_elapsed;
                        profiler.total_patches += 1;

                        profiler.record_event(
                            event_type,
                            line_len,
                            parse_elapsed,
                            match_start.elapsed(),
                            patch_elapsed,
                            push_elapsed,
                            None,
                        );
                    }
                    AcpEvent::CurrentMode(mode_id) => {
                        let idx = entry_index.next();
                        let entry = NormalizedEntry {
                            timestamp: None,
                            entry_type: NormalizedEntryType::SystemMessage,
                            content: format!("Current mode: {}", mode_id.0),
                            metadata: None,
                        };
                        let patch_start = Instant::now();
                        let patch = ConversationPatch::add_normalized_entry(idx, entry);
                        let patch_elapsed = patch_start.elapsed();
                        profiler.time_in_patch_creation += patch_elapsed;

                        let push_start = Instant::now();
                        msg_store.push_patch(patch);
                        let push_elapsed = push_start.elapsed();
                        profiler.time_in_push_patch += push_elapsed;
                        profiler.total_patches += 1;

                        profiler.record_event(
                            event_type,
                            line_len,
                            parse_elapsed,
                            match_start.elapsed(),
                            patch_elapsed,
                            push_elapsed,
                            None,
                        );
                    }
                    AcpEvent::RequestPermission(perm) => {
                        if let Ok(tc) = agent_client_protocol::ToolCall::try_from(perm.tool_call) {
                            handle_tool_call(
                                &tc,
                                &worktree_path,
                                &mut streaming,
                                &mut tool_states,
                                &entry_index,
                                &msg_store,
                                &mut profiler,
                            );
                        }
                        profiler.record_event(
                            event_type,
                            line_len,
                            parse_elapsed,
                            match_start.elapsed(),
                            Duration::ZERO,
                            Duration::ZERO,
                            None,
                        );
                    }
                    AcpEvent::ToolCall(tc) => {
                        handle_tool_call(
                            &tc,
                            &worktree_path,
                            &mut streaming,
                            &mut tool_states,
                            &entry_index,
                            &msg_store,
                            &mut profiler,
                        );
                        profiler.record_event(
                            event_type,
                            line_len,
                            parse_elapsed,
                            match_start.elapsed(),
                            Duration::ZERO,
                            Duration::ZERO,
                            None,
                        );
                    }
                    AcpEvent::ToolUpdate(update) => {
                        let mut update = update;
                        if update.fields.title.is_none() {
                            update.fields.title = tool_states
                                .get(&update.tool_call_id.0.to_string())
                                .map(|s| s.title.clone())
                                .or_else(|| Some("".to_string()));
                        }
                        tracing::trace!("Got tool call update: {:?}", update);
                        if let Ok(tc) = agent_client_protocol::ToolCall::try_from(update.clone()) {
                            handle_tool_call(
                                &tc,
                                &worktree_path,
                                &mut streaming,
                                &mut tool_states,
                                &entry_index,
                                &msg_store,
                                &mut profiler,
                            );
                        } else {
                            tracing::debug!("Failed to convert tool call update to ToolCall");
                        }
                        profiler.record_event(
                            event_type,
                            line_len,
                            parse_elapsed,
                            match_start.elapsed(),
                            Duration::ZERO,
                            Duration::ZERO,
                            None,
                        );
                    }
                    AcpEvent::ApprovalResponse(resp) => {
                        tracing::trace!("Received approval response: {:?}", resp);
                        if let ApprovalStatus::Denied { reason } = resp.status {
                            let tool_name = tool_states
                                .get(&resp.tool_call_id)
                                .map(|t| {
                                    extract_tool_name_from_id(t.id.0.as_ref())
                                        .unwrap_or_else(|| t.title.clone())
                                })
                                .unwrap_or_default();
                            let idx = entry_index.next();
                            let entry = NormalizedEntry {
                                timestamp: None,
                                entry_type: NormalizedEntryType::UserFeedback {
                                    denied_tool: tool_name,
                                },
                                content: reason
                                    .clone()
                                    .unwrap_or_else(|| {
                                        "User denied this tool use request".to_string()
                                    })
                                    .trim()
                                    .to_string(),
                                metadata: None,
                            };
                            let patch_start = Instant::now();
                            let patch = ConversationPatch::add_normalized_entry(idx, entry);
                            let patch_elapsed = patch_start.elapsed();
                            profiler.time_in_patch_creation += patch_elapsed;

                            let push_start = Instant::now();
                            msg_store.push_patch(patch);
                            let push_elapsed = push_start.elapsed();
                            profiler.time_in_push_patch += push_elapsed;
                            profiler.total_patches += 1;

                            profiler.record_event(
                                event_type,
                                line_len,
                                parse_elapsed,
                                match_start.elapsed(),
                                patch_elapsed,
                                push_elapsed,
                                None,
                            );
                        } else {
                            profiler.record_event(
                                event_type,
                                line_len,
                                parse_elapsed,
                                match_start.elapsed(),
                                Duration::ZERO,
                                Duration::ZERO,
                                None,
                            );
                        }
                    }
                    AcpEvent::User(_) | AcpEvent::Other(_) => {
                        profiler.record_event(
                            event_type,
                            line_len,
                            parse_elapsed,
                            match_start.elapsed(),
                            Duration::ZERO,
                            Duration::ZERO,
                            None,
                        );
                    }
                }
            } else {
                let parse_elapsed = parse_start.elapsed();
                profiler.time_in_parse += parse_elapsed;
                profiler.parse_fail_count += 1;
            }

            profiler.maybe_flush();
            wait_start = Instant::now();
        }

        // Stream ended — write final summary
        profiler.write_summary();

        fn handle_tool_call(
            tc: &agent_client_protocol::ToolCall,
            worktree_path: &Path,
            streaming: &mut StreamingState,
            tool_states: &mut ToolStates,
            entry_index: &EntryIndexProvider,
            msg_store: &Arc<MsgStore>,
            profiler: &mut PipelineProfiler,
        ) {
            streaming.assistant_text = None;
            streaming.thinking_text = None;
            let id = tc.tool_call_id.0.to_string();
            let is_new = !tool_states.contains_key(&id);
            let tool_data = tool_states.entry(id).or_default();
            tool_data.extend(tc, worktree_path);
            if is_new {
                tool_data.index = entry_index.next();
            }
            let action = map_to_action_type(tool_data);
            let entry = NormalizedEntry {
                timestamp: None,
                entry_type: NormalizedEntryType::ToolUse {
                    tool_name: tool_data.title.clone(),
                    action_type: action,
                    status: convert_tool_status(&tool_data.status),
                },
                content: get_tool_content(tool_data),
                metadata: serde_json::to_value(ToolCallMetadata {
                    tool_call_id: tool_data.id.0.to_string(),
                })
                .ok(),
            };

            let patch_start = Instant::now();
            let patch = if is_new {
                ConversationPatch::add_normalized_entry(tool_data.index, entry)
            } else {
                ConversationPatch::replace(tool_data.index, entry)
            };
            let patch_elapsed = patch_start.elapsed();
            profiler.time_in_patch_creation += patch_elapsed;

            let push_start = Instant::now();
            msg_store.push_patch(patch);
            let push_elapsed = push_start.elapsed();
            profiler.time_in_push_patch += push_elapsed;
            profiler.total_patches += 1;

            if is_new {
                profiler.tool_call_count += 1;
            } else {
                profiler.tool_update_count += 1;
            }
        }

        fn map_to_action_type(tc: &PartialToolCallData) -> ActionType {
            match tc.kind {
                agent_client_protocol::ToolKind::Read => {
                    // Special-case: read_many_files style titles parsed via helper
                    if tc.id.0.starts_with("read_many_files") {
                        let result = collect_text_content(&tc.content).map(|text| ToolResult {
                            r#type: ToolResultValueType::Markdown,
                            value: serde_json::Value::String(text),
                        });
                        return ActionType::Tool {
                            tool_name: "read_many_files".to_string(),
                            arguments: Some(serde_json::Value::String(tc.title.clone())),
                            result,
                        };
                    }
                    ActionType::FileRead {
                        path: tc
                            .path
                            .clone()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .to_string(),
                    }
                }
                agent_client_protocol::ToolKind::Edit => {
                    let changes = extract_file_changes(tc);
                    ActionType::FileEdit {
                        path: tc
                            .path
                            .clone()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .to_string(),
                        changes,
                    }
                }
                agent_client_protocol::ToolKind::Execute => {
                    let command = AcpEventParser::parse_execute_command(tc);
                    // Prefer structured raw_output, else fallback to aggregated text content
                    let completed =
                        matches!(tc.status, agent_client_protocol::ToolCallStatus::Completed);
                    tracing::trace!(
                        "Mapping execute tool call, completed: {}, command: {}",
                        completed,
                        command
                    );
                    let tc_exit_status = match tc.status {
                        agent_client_protocol::ToolCallStatus::Completed => {
                            Some(crate::logs::CommandExitStatus::Success { success: true })
                        }
                        agent_client_protocol::ToolCallStatus::Failed => {
                            Some(crate::logs::CommandExitStatus::Success { success: false })
                        }
                        _ => None,
                    };

                    let result = if let Some(text) = collect_text_content(&tc.content) {
                        Some(crate::logs::CommandRunResult {
                            exit_status: tc_exit_status,
                            output: Some(text),
                        })
                    } else {
                        Some(crate::logs::CommandRunResult {
                            exit_status: tc_exit_status,
                            output: None,
                        })
                    };
                    ActionType::CommandRun { command, result }
                }
                agent_client_protocol::ToolKind::Delete => ActionType::FileEdit {
                    path: tc
                        .path
                        .clone()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string(),
                    changes: vec![FileChange::Delete],
                },
                agent_client_protocol::ToolKind::Search => {
                    let query = tc
                        .raw_input
                        .as_ref()
                        .and_then(|v| serde_json::from_value::<SearchArgs>(v.clone()).ok())
                        .map(|a| a.query)
                        .unwrap_or_else(|| tc.title.clone());
                    ActionType::Search { query }
                }
                agent_client_protocol::ToolKind::Fetch => {
                    let mut url = tc
                        .raw_input
                        .as_ref()
                        .and_then(|v| serde_json::from_value::<FetchArgs>(v.clone()).ok())
                        .map(|a| a.url)
                        .unwrap_or_default();
                    if url.is_empty() {
                        // Fallback: try to extract first URL from the title
                        if let Some(extracted) = extract_url_from_text(&tc.title) {
                            url = extracted;
                        }
                    }
                    ActionType::WebFetch { url }
                }
                agent_client_protocol::ToolKind::Think => {
                    let tool_name = extract_tool_name_from_id(tc.id.0.as_ref())
                        .unwrap_or_else(|| tc.title.clone());
                    // For think/save_memory, surface both title and aggregated text content as arguments
                    let text = collect_text_content(&tc.content);
                    let arguments = Some(match &text {
                        Some(t) => serde_json::json!({ "title": tc.title, "content": t }),
                        None => serde_json::json!({ "title": tc.title }),
                    });
                    let result = if let Some(output) = &tc.raw_output {
                        Some(ToolResult {
                            r#type: ToolResultValueType::Json,
                            value: output.clone(),
                        })
                    } else {
                        collect_text_content(&tc.content).map(|text| ToolResult {
                            r#type: ToolResultValueType::Markdown,
                            value: serde_json::Value::String(text),
                        })
                    };
                    ActionType::Tool {
                        tool_name,
                        arguments,
                        result,
                    }
                }
                agent_client_protocol::ToolKind::SwitchMode => ActionType::Other {
                    description: "switch_mode".to_string(),
                },
                agent_client_protocol::ToolKind::Other
                | agent_client_protocol::ToolKind::Move
                | _ => {
                    // Derive a friendlier tool name from the id if it looks like name-<digits>
                    let tool_name = extract_tool_name_from_id(tc.id.0.as_ref())
                        .unwrap_or_else(|| tc.title.clone());

                    // Some tools embed JSON args into the title instead of raw_input
                    let arguments = if let Some(raw) = &tc.raw_input {
                        Some(raw.clone())
                    } else if tc.title.trim_start().starts_with('{') {
                        // Title contains JSON arguments for the tool
                        serde_json::from_str::<serde_json::Value>(&tc.title).ok()
                    } else {
                        None
                    };
                    // Extract result: prefer raw_output (structured), else text content as Markdown
                    let result = if let Some(output) = &tc.raw_output {
                        Some(ToolResult {
                            r#type: ToolResultValueType::Json,
                            value: output.clone(),
                        })
                    } else {
                        collect_text_content(&tc.content).map(|text| ToolResult {
                            r#type: ToolResultValueType::Markdown,
                            value: serde_json::Value::String(text),
                        })
                    };
                    ActionType::Tool {
                        tool_name,
                        arguments,
                        result,
                    }
                }
            }
        }

        fn extract_file_changes(tc: &PartialToolCallData) -> Vec<FileChange> {
            let mut changes = Vec::new();
            for c in &tc.content {
                if let agent_client_protocol::ToolCallContent::Diff(diff) = c {
                    let path = diff.path.to_string_lossy().to_string();
                    let rel = if !path.is_empty() {
                        path
                    } else {
                        tc.path
                            .clone()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .to_string()
                    };
                    let old_text = diff.old_text.as_deref().unwrap_or("");
                    if old_text.is_empty() {
                        changes.push(FileChange::Write {
                            content: diff.new_text.clone(),
                        });
                    } else {
                        let unified = workspace_utils::diff::create_unified_diff(
                            &rel,
                            old_text,
                            &diff.new_text,
                        );
                        changes.push(FileChange::Edit {
                            unified_diff: unified,
                            has_line_numbers: false,
                        });
                    }
                }
            }
            if changes.is_empty()
                && let Some(raw) = &tc.raw_input
                && let Ok(edit_input) = serde_json::from_value::<EditInput>(raw.clone())
            {
                if let Some(diff) = edit_input.diff {
                    changes.push(FileChange::Edit {
                        unified_diff: workspace_utils::diff::normalize_unified_diff(
                            &edit_input.file_path,
                            &diff,
                        ),
                        has_line_numbers: true,
                    });
                } else if let Some(old) = edit_input.old_string
                    && let Some(new) = edit_input.new_string
                {
                    changes.push(FileChange::Edit {
                        unified_diff: workspace_utils::diff::create_unified_diff(
                            &edit_input.file_path,
                            &old,
                            &new,
                        ),
                        has_line_numbers: false,
                    });
                }
            }
            changes
        }

        fn get_tool_content(tc: &PartialToolCallData) -> String {
            match tc.kind {
                agent_client_protocol::ToolKind::Execute => {
                    AcpEventParser::parse_execute_command(tc)
                }
                agent_client_protocol::ToolKind::Think => "Saving memory".to_string(),
                agent_client_protocol::ToolKind::Other => {
                    let tool_name = extract_tool_name_from_id(tc.id.0.as_ref())
                        .unwrap_or_else(|| "tool".to_string());
                    if tc.title.is_empty() {
                        tool_name
                    } else {
                        format!("{}: {}", tool_name, tc.title)
                    }
                }
                agent_client_protocol::ToolKind::Read => {
                    if tc.id.0.starts_with("read_many_files") {
                        "Read files".to_string()
                    } else {
                        tc.path
                            .as_ref()
                            .map(|p| p.display().to_string())
                            .unwrap_or_else(|| tc.title.clone())
                    }
                }
                _ => tc.title.clone(),
            }
        }

        fn extract_tool_name_from_id(id: &str) -> Option<String> {
            if let Some(idx) = id.rfind('-') {
                let (head, tail) = id.split_at(idx);
                if tail
                    .trim_start_matches('-')
                    .chars()
                    .all(|c| c.is_ascii_digit())
                {
                    return Some(head.to_string());
                }
            }
            None
        }

        fn extract_url_from_text(text: &str) -> Option<String> {
            // Simple URL extractor
            static URL_RE: LazyLock<Regex> =
                LazyLock::new(|| Regex::new(r#"https?://[^\s"')]+"#).expect("valid regex"));
            URL_RE.find(text).map(|m| m.as_str().to_string())
        }

        fn collect_text_content(
            content: &[agent_client_protocol::ToolCallContent],
        ) -> Option<String> {
            let mut out = String::new();
            for c in content {
                if let agent_client_protocol::ToolCallContent::Content(inner) = c
                    && let agent_client_protocol::ContentBlock::Text(t) = &inner.content
                {
                    out.push_str(&t.text);
                    if !out.ends_with('\n') {
                        out.push('\n');
                    }
                }
            }
            if out.is_empty() { None } else { Some(out) }
        }

        fn convert_tool_status(status: &agent_client_protocol::ToolCallStatus) -> LogToolStatus {
            match status {
                agent_client_protocol::ToolCallStatus::Pending
                | agent_client_protocol::ToolCallStatus::InProgress => LogToolStatus::Created,
                agent_client_protocol::ToolCallStatus::Completed => LogToolStatus::Success,
                agent_client_protocol::ToolCallStatus::Failed => LogToolStatus::Failed,
                _ => {
                    tracing::debug!("Unknown tool call status: {:?}", status);
                    LogToolStatus::Created
                }
            }
        }
    });
}

fn event_variant_name(event: &AcpEvent) -> &'static str {
    match event {
        AcpEvent::User(_) => "User",
        AcpEvent::SessionStart(_) => "SessionStart",
        AcpEvent::Message(_) => "Message",
        AcpEvent::Thought(_) => "Thought",
        AcpEvent::ToolCall(_) => "ToolCall",
        AcpEvent::ToolUpdate(_) => "ToolUpdate",
        AcpEvent::Plan(_) => "Plan",
        AcpEvent::AvailableCommands(_) => "AvailableCommands",
        AcpEvent::CurrentMode(_) => "CurrentMode",
        AcpEvent::RequestPermission(_) => "RequestPermission",
        AcpEvent::ApprovalResponse(_) => "ApprovalResponse",
        AcpEvent::Error(_) => "Error",
        AcpEvent::Done(_) => "Done",
        AcpEvent::Other(_) => "Other",
    }
}

struct PartialToolCallData {
    index: usize,
    id: agent_client_protocol::ToolCallId,
    kind: agent_client_protocol::ToolKind,
    title: String,
    status: agent_client_protocol::ToolCallStatus,
    path: Option<PathBuf>,
    content: Vec<agent_client_protocol::ToolCallContent>,
    raw_input: Option<serde_json::Value>,
    raw_output: Option<serde_json::Value>,
}

impl PartialToolCallData {
    fn extend(&mut self, tc: &agent_client_protocol::ToolCall, worktree_path: &Path) {
        self.id = tc.tool_call_id.clone();
        if tc.kind != Default::default() {
            self.kind = tc.kind;
        }
        if !tc.title.is_empty() {
            self.title = tc.title.clone();
        }
        if tc.status != Default::default() {
            self.status = tc.status;
        }
        if !tc.locations.is_empty() {
            self.path = tc.locations.first().map(|l| {
                PathBuf::from(workspace_utils::path::make_path_relative(
                    &l.path.to_string_lossy(),
                    &worktree_path.to_string_lossy(),
                ))
            });
        }
        if !tc.content.is_empty() {
            self.content = tc.content.clone();
        }
        if tc.raw_input.is_some() {
            self.raw_input = tc.raw_input.clone();
        }
        if tc.raw_output.is_some() {
            self.raw_output = tc.raw_output.clone();
        }
    }
}

impl Default for PartialToolCallData {
    fn default() -> Self {
        Self {
            id: agent_client_protocol::ToolCallId::new(""),
            index: 0,
            kind: agent_client_protocol::ToolKind::default(),
            title: String::new(),
            status: Default::default(),
            path: None,
            content: Vec::new(),
            raw_input: None,
            raw_output: None,
        }
    }
}

struct AcpEventParser;

impl AcpEventParser {
    /// Parse a line that may contain an ACP event
    pub fn parse_line(line: &str) -> Option<AcpEvent> {
        let trimmed = line.trim();

        if let Ok(acp_event) = serde_json::from_str::<AcpEvent>(trimmed) {
            return Some(acp_event);
        }

        tracing::debug!("Failed to parse ACP raw log {trimmed}");

        None
    }

    /// Parse command from tool title (for execute tools)
    pub fn parse_execute_command(tc: &PartialToolCallData) -> String {
        if let Some(command) = tc.raw_input.as_ref().and_then(|value| {
            value
                .as_object()
                .and_then(|o| o.get("command").and_then(|v| v.as_str()))
        }) {
            return command.to_string();
        }
        let title = &tc.title;
        if let Some(command) = title.split(" [current working directory ").next() {
            command.trim().to_string()
        } else if let Some(command) = title.split(" (").next() {
            command.trim().to_string()
        } else {
            title.trim().to_string()
        }
    }
}

/// Result of parsing a line
#[derive(Debug, Clone)]
#[allow(clippy::large_enum_variant)]
pub enum ParsedLine {
    SessionId(String),
    Event(AcpEvent),
    Error(String),
    Done,
}

impl TryFrom<SessionNotification> for AcpEvent {
    type Error = ();

    fn try_from(notification: SessionNotification) -> Result<Self, ()> {
        let event = match notification.update {
            acp::SessionUpdate::AgentMessageChunk(chunk) => AcpEvent::Message(chunk.content),
            acp::SessionUpdate::AgentThoughtChunk(chunk) => AcpEvent::Thought(chunk.content),
            acp::SessionUpdate::ToolCall(tc) => AcpEvent::ToolCall(tc),
            acp::SessionUpdate::ToolCallUpdate(update) => AcpEvent::ToolUpdate(update),
            acp::SessionUpdate::Plan(plan) => AcpEvent::Plan(plan),
            acp::SessionUpdate::AvailableCommandsUpdate(update) => {
                AcpEvent::AvailableCommands(update.available_commands)
            }
            acp::SessionUpdate::CurrentModeUpdate(update) => {
                AcpEvent::CurrentMode(update.current_mode_id)
            }
            _ => return Err(()),
        };
        Ok(event)
    }
}

#[derive(Debug, Clone, Deserialize)]
struct SearchArgs {
    query: String,
}

#[derive(Debug, Clone, Deserialize)]
struct FetchArgs {
    url: String,
}

#[derive(Debug, Clone, Default)]
struct StreamingState {
    assistant_text: Option<StreamingText>,
    thinking_text: Option<StreamingText>,
}

#[derive(Debug, Clone)]
struct StreamingText {
    index: usize,
    content: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EditInput {
    file_path: String,
    #[serde(default)]
    diff: Option<String>,
    #[serde(default)]
    old_string: Option<String>,
    #[serde(default)]
    new_string: Option<String>,
}

// ============================================================================
// Profiling instrumentation (temporary diagnostic code)
// ============================================================================

#[derive(Serialize)]
struct EventRecord {
    ts_us: u64,
    event_type: &'static str,
    line_bytes: usize,
    parse_us: u64,
    match_us: u64,
    patch_create_us: u64,
    push_patch_us: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    clone_bytes: Option<u64>,
}

struct PipelineProfiler {
    pipeline_start: Instant,

    // Phase-level aggregates
    time_waiting_for_line: Duration,
    time_in_parse: Duration,
    time_in_patch_creation: Duration,
    time_in_push_patch: Duration,

    // Per-event-type breakdown
    event_counts: HashMap<&'static str, u64>,

    // Streaming text clone tracking (suspected O(n^2))
    assistant_clone_count: u64,
    assistant_clone_total_bytes: u64,
    assistant_max_clone_bytes: u64,
    thinking_clone_count: u64,
    thinking_clone_total_bytes: u64,
    thinking_max_clone_bytes: u64,

    // Volume metrics
    total_line_bytes: u64,
    max_line_bytes: u64,
    total_events: u64,
    total_patches: u64,
    parse_fail_count: u64,
    tool_call_count: u64,
    tool_update_count: u64,

    // Per-event records
    event_log: Vec<EventRecord>,

    // Output
    output_path: PathBuf,
    last_flush: Instant,
}

impl PipelineProfiler {
    fn new() -> Self {
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        // Write into <repo_root>/profiling/ directory (CARGO_MANIFEST_DIR is crates/executors)
        let profiling_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../profiling");
        let _ = std::fs::create_dir_all(&profiling_dir);
        let output_path = profiling_dir.join(format!("acp_normalize_profile_{}.jsonl", timestamp));
        tracing::info!(
            "ACP normalize profiler writing to: {}",
            output_path.display()
        );

        let now = Instant::now();
        Self {
            pipeline_start: now,
            time_waiting_for_line: Duration::ZERO,
            time_in_parse: Duration::ZERO,
            time_in_patch_creation: Duration::ZERO,
            time_in_push_patch: Duration::ZERO,
            event_counts: HashMap::new(),
            assistant_clone_count: 0,
            assistant_clone_total_bytes: 0,
            assistant_max_clone_bytes: 0,
            thinking_clone_count: 0,
            thinking_clone_total_bytes: 0,
            thinking_max_clone_bytes: 0,
            total_line_bytes: 0,
            max_line_bytes: 0,
            total_events: 0,
            total_patches: 0,
            parse_fail_count: 0,
            tool_call_count: 0,
            tool_update_count: 0,
            event_log: Vec::with_capacity(1024),
            output_path,
            last_flush: now,
        }
    }

    fn record_event(
        &mut self,
        event_type: &'static str,
        line_bytes: usize,
        parse_elapsed: Duration,
        match_elapsed: Duration,
        patch_create_elapsed: Duration,
        push_patch_elapsed: Duration,
        clone_bytes: Option<u64>,
    ) {
        self.event_log.push(EventRecord {
            ts_us: self.pipeline_start.elapsed().as_micros() as u64,
            event_type,
            line_bytes,
            parse_us: parse_elapsed.as_micros() as u64,
            match_us: match_elapsed.as_micros() as u64,
            patch_create_us: patch_create_elapsed.as_micros() as u64,
            push_patch_us: push_patch_elapsed.as_micros() as u64,
            clone_bytes,
        });
    }

    fn maybe_flush(&mut self) {
        if self.event_log.len() >= 1000 || self.last_flush.elapsed() > Duration::from_secs(5) {
            self.flush_events();
            self.last_flush = Instant::now();
        }
    }

    fn flush_events(&mut self) {
        if self.event_log.is_empty() {
            return;
        }
        let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.output_path)
        else {
            tracing::warn!(
                "Failed to open profiler output file: {}",
                self.output_path.display()
            );
            self.event_log.clear();
            return;
        };

        for record in self.event_log.drain(..) {
            if let Ok(json) = serde_json::to_string(&record) {
                let _ = writeln!(file, "{}", json);
            }
        }
    }

    fn write_summary(&mut self) {
        self.flush_events();

        let wall_clock = self.pipeline_start.elapsed();
        let processing_time =
            self.time_in_parse + self.time_in_patch_creation + self.time_in_push_patch;

        let summary = serde_json::json!({
            "type": "SUMMARY",
            "total_wall_clock_ms": wall_clock.as_millis() as u64,
            "time_waiting_for_line_ms": self.time_waiting_for_line.as_millis() as u64,
            "time_waiting_for_line_pct": if wall_clock.as_micros() > 0 {
                (self.time_waiting_for_line.as_micros() as f64 / wall_clock.as_micros() as f64 * 100.0) as u64
            } else { 0 },
            "time_in_parse_ms": self.time_in_parse.as_millis() as u64,
            "time_in_patch_creation_ms": self.time_in_patch_creation.as_millis() as u64,
            "time_in_push_patch_ms": self.time_in_push_patch.as_millis() as u64,
            "total_processing_ms": processing_time.as_millis() as u64,
            "total_events": self.total_events,
            "total_patches": self.total_patches,
            "parse_fail_count": self.parse_fail_count,
            "total_line_bytes": self.total_line_bytes,
            "max_line_bytes": self.max_line_bytes,
            "avg_line_bytes": if self.total_events > 0 { self.total_line_bytes / self.total_events } else { 0 },
            "assistant_streaming": {
                "clone_count": self.assistant_clone_count,
                "clone_total_bytes": self.assistant_clone_total_bytes,
                "max_clone_bytes": self.assistant_max_clone_bytes,
                "avg_clone_bytes": if self.assistant_clone_count > 0 { self.assistant_clone_total_bytes / self.assistant_clone_count } else { 0 },
            },
            "thinking_streaming": {
                "clone_count": self.thinking_clone_count,
                "clone_total_bytes": self.thinking_clone_total_bytes,
                "max_clone_bytes": self.thinking_max_clone_bytes,
            },
            "tool_call_count": self.tool_call_count,
            "tool_update_count": self.tool_update_count,
            "event_type_counts": self.event_counts,
            "per_event_avg_us": {
                "parse": if self.total_events > 0 { self.time_in_parse.as_micros() as u64 / self.total_events } else { 0 },
                "patch_creation": if self.total_patches > 0 { self.time_in_patch_creation.as_micros() as u64 / self.total_patches } else { 0 },
                "push_patch": if self.total_patches > 0 { self.time_in_push_patch.as_micros() as u64 / self.total_patches } else { 0 },
            },
        });

        let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.output_path)
        else {
            tracing::warn!("Failed to open profiler output file for summary");
            return;
        };

        if let Ok(json) = serde_json::to_string_pretty(&summary) {
            let _ = writeln!(file, "{}", json);
        }

        tracing::info!(
            "ACP normalize profiler summary: {} events, {} patches, {:.1}s wall clock, {:.1}% waiting for input. Output: {}",
            self.total_events,
            self.total_patches,
            wall_clock.as_secs_f64(),
            if wall_clock.as_micros() > 0 {
                self.time_waiting_for_line.as_micros() as f64 / wall_clock.as_micros() as f64
                    * 100.0
            } else {
                0.0
            },
            self.output_path.display(),
        );
    }
}
