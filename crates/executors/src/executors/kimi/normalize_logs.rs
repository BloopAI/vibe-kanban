use std::{path::Path, sync::Arc};

use serde::{Deserialize, Serialize};
use workspace_utils::msg_store::MsgStore;

use crate::logs::{
    ActionType, FileChange, NormalizedEntry, NormalizedEntryType,
    ToolResult, ToolResultValueType, ToolStatus,
    utils::{ConversationPatch, EntryIndexProvider},
};

/// Kimi CLI stream-json event types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum KimiEvent {
    /// Turn begin
    TurnBegin {
        user_input: serde_json::Value,
    },
    
    /// Turn end
    TurnEnd,
    
    /// Step begin
    StepBegin {
        n: u32,
    },
    
    /// Step interrupted
    StepInterrupted,
    
    /// Agent message chunk
    AgentMessageChunk {
        content: String,
    },
    
    /// Agent thought chunk
    AgentThoughtChunk {
        content: String,
    },
    
    /// Tool call start
    ToolCallStart {
        tool_call: ToolCallInfo,
    },
    
    /// Tool call progress
    ToolCallProgress {
        tool_call_id: String,
        content: serde_json::Value,
    },
    
    /// Tool call complete
    ToolCallComplete {
        tool_call_id: String,
        result: serde_json::Value,
    },
    
    /// Subagent event
    SubagentEvent {
        task_tool_call_id: String,
        event: Box<KimiEvent>,
    },
    
    /// Approval request
    ApprovalRequest {
        id: String,
        tool_call_id: String,
        sender: String,
        action: String,
        description: String,
    },
    
    /// Approval response
    ApprovalResponse {
        request_id: String,
        response: String,
    },
    
    /// Status update
    StatusUpdate {
        context_usage: Option<f64>,
        token_usage: Option<TokenUsage>,
        message_id: Option<String>,
    },
    
    /// Compaction begin
    CompactionBegin,
    
    /// Compaction end
    CompactionEnd,
    
    /// Unknown event
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallInfo {
    pub id: String,
    pub name: String,
    pub arguments: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenUsage {
    pub input_tokens: u32,
    pub output_tokens: u32,
}

/// Kimi log processor
pub struct KimiLogProcessor;

impl KimiLogProcessor {
    pub fn process_logs(msg_store: Arc<MsgStore>, _worktree_path: &Path) {
        let entry_index_provider = EntryIndexProvider::start_from(&msg_store);

        tokio::spawn(async move {
            let mut stream = msg_store.history_plus_stream();
            let mut buffer = String::new();
            let mut processor = KimiEventProcessor::new(entry_index_provider);

            while let Some(Ok(msg)) = stream.next().await {
                let chunk = match msg {
                    workspace_utils::log_msg::LogMsg::Stdout(x) => x,
                    workspace_utils::log_msg::LogMsg::JsonPatch(_)
                    | workspace_utils::log_msg::LogMsg::SessionId(_)
                    | workspace_utils::log_msg::LogMsg::MessageId(_)
                    | workspace_utils::log_msg::LogMsg::Stderr(_)
                    | workspace_utils::log_msg::LogMsg::Ready => continue,
                    workspace_utils::log_msg::LogMsg::Finished => break,
                };

                buffer.push_str(&chunk);

                // Process complete JSON lines
                for line in buffer
                    .split_inclusive('\n')
                    .filter(|l| l.ends_with('\n'))
                    .map(str::to_owned)
                    .collect::<Vec<_>>()
                {
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }

                    match serde_json::from_str::<KimiEvent>(trimmed) {
                        Ok(event) => {
                            let patches = processor.process_event(event);
                            for patch in patches {
                                msg_store.push_patch(patch);
                            }
                        }
                        Err(e) => {
                            tracing::debug!("Failed to parse Kimi event: {} | line: {}", e, trimmed);
                            // Treat as raw output
                            let entry = NormalizedEntry {
                                timestamp: None,
                                entry_type: NormalizedEntryType::SystemMessage,
                                content: trimmed.to_string(),
                                metadata: None,
                            };
                            let patch_id = processor.next_index();
                            let patch = ConversationPatch::add_normalized_entry(patch_id, entry);
                            msg_store.push_patch(patch);
                        }
                    }
                }

                // Keep the partial line in the buffer
                buffer = buffer.rsplit('\n').next().unwrap_or("").to_owned();
            }

            // Handle any remaining content
            if !buffer.trim().is_empty() {
                let entry = NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::SystemMessage,
                    content: buffer.trim().to_string(),
                    metadata: None,
                };
                let patch_id = processor.next_index();
                let patch = ConversationPatch::add_normalized_entry(patch_id, entry);
                msg_store.push_patch(patch);
            }
        });
    }
}

/// Event processor that maintains state across events
struct KimiEventProcessor {
    entry_index_provider: EntryIndexProvider,
    current_message: Option<String>,
    current_thinking: Option<String>,
    tool_calls: std::collections::HashMap<String, ToolCallInfo>,
}

impl KimiEventProcessor {
    fn new(entry_index_provider: EntryIndexProvider) -> Self {
        Self {
            entry_index_provider,
            current_message: None,
            current_thinking: None,
            tool_calls: std::collections::HashMap::new(),
        }
    }

    fn next_index(&mut self) -> usize {
        self.entry_index_provider.next()
    }

    fn process_event(&mut self, event: KimiEvent) -> Vec<json_patch::Patch> {
        let mut patches = Vec::new();

        match event {
            KimiEvent::TurnBegin { .. } => {
                // Reset state for new turn
                self.current_message = None;
                self.current_thinking = None;
            }
            
            KimiEvent::TurnEnd => {
                // Flush any pending message
                if let Some(content) = self.current_message.take() {
                    if !content.is_empty() {
                        let entry = NormalizedEntry {
                            timestamp: None,
                            entry_type: NormalizedEntryType::AssistantMessage,
                            content,
                            metadata: None,
                        };
                        let patch_id = self.next_index();
                        patches.push(ConversationPatch::add_normalized_entry(patch_id, entry));
                    }
                }
            }
            
            KimiEvent::AgentMessageChunk { content } => {
                self.current_message.get_or_insert_with(String::new).push_str(&content);
            }
            
            KimiEvent::AgentThoughtChunk { content } => {
                // Accumulate thinking
                self.current_thinking.get_or_insert_with(String::new).push_str(&content);
            }
            
            KimiEvent::StepBegin { n } => {
                // Flush thinking from previous step
                if let Some(thinking) = self.current_thinking.take() {
                    if !thinking.is_empty() {
                        let entry = NormalizedEntry {
                            timestamp: None,
                            entry_type: NormalizedEntryType::Thinking,
                            content: thinking,
                            metadata: Some(serde_json::json!({ "step": n })),
                        };
                        let patch_id = self.next_index();
                        patches.push(ConversationPatch::add_normalized_entry(patch_id, entry));
                    }
                }
            }
            
            KimiEvent::ToolCallStart { tool_call } => {
                // Store tool call info
                self.tool_calls.insert(tool_call.id.clone(), tool_call.clone());
                
                // Create ToolUse entry
                let action_type = Self::infer_action_type(&tool_call.name, &tool_call.arguments);
                
                let entry = NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::ToolUse {
                        tool_name: tool_call.name.clone(),
                        action_type,
                        status: ToolStatus::Created,
                    },
                    content: serde_json::to_string_pretty(&tool_call.arguments).unwrap_or_default(),
                    metadata: Some(serde_json::json!({
                        "tool_call_id": tool_call.id,
                        "tool_name": tool_call.name,
                        "arguments": tool_call.arguments,
                    })),
                };
                let patch_id = self.next_index();
                patches.push(ConversationPatch::add_normalized_entry(patch_id, entry));
            }
            
            KimiEvent::ToolCallComplete { tool_call_id, result } => {
                // Update tool call status to success
                if let Some(tool_call) = self.tool_calls.get(&tool_call_id) {
                    let tool_result = ToolResult {
                        r#type: ToolResultValueType::Json,
                        value: result.clone(),
                    };
                    
                    let arguments = serde_json::json!({}); // Simplified, should store from ToolCallStart
                    let entry = NormalizedEntry {
                        timestamp: None,
                        entry_type: NormalizedEntryType::ToolUse {
                            tool_name: tool_call.name.clone(),
                            action_type: Self::infer_action_type(&tool_call.name, &arguments),
                            status: ToolStatus::Success,
                        },
                        content: serde_json::to_string_pretty(&result).unwrap_or_default(),
                        metadata: Some(serde_json::json!({
                            "tool_call_id": tool_call_id,
                            "tool_name": tool_call.name,
                            "result": tool_result,
                        })),
                    };
                    let patch_id = self.next_index();
                    patches.push(ConversationPatch::add_normalized_entry(patch_id, entry));
                }
            }
            
            KimiEvent::ApprovalRequest { id, tool_call_id, sender, action, description } => {
                // Create pending approval entry
                let entry = NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::ToolUse {
                        tool_name: sender.clone(),
                        action_type: ActionType::CommandRun {
                            command: action.clone(),
                            result: None,
                            category: crate::logs::utils::shell_command_parsing::CommandCategory::Unknown,
                        },
                        status: ToolStatus::PendingApproval {
                            approval_id: id.clone(),
                            requested_at: chrono::Utc::now(),
                            timeout_at: chrono::Utc::now() + chrono::Duration::minutes(5),
                        },
                    },
                    content: description.clone(),
                    metadata: Some(serde_json::json!({
                        "approval_request": {
                            "id": id,
                            "tool_call_id": tool_call_id,
                            "sender": sender,
                            "action": action,
                        },
                    })),
                };
                let patch_id = self.next_index();
                patches.push(ConversationPatch::add_normalized_entry(patch_id, entry));
            }
            
            KimiEvent::StatusUpdate { context_usage, token_usage, message_id } => {
                // Create token usage entry
                if let Some(usage) = token_usage {
                    let entry = NormalizedEntry {
                        timestamp: None,
                        entry_type: NormalizedEntryType::TokenUsageInfo(crate::logs::TokenUsageInfo {
                            total_tokens: usage.input_tokens + usage.output_tokens,
                            model_context_window: 200_000, // Default for kimi-k2
                        }),
                        content: format!("Tokens: {} input, {} output", usage.input_tokens, usage.output_tokens),
                        metadata: Some(serde_json::json!({
                            "context_usage": context_usage,
                            "message_id": message_id,
                        })),
                    };
                    let patch_id = self.next_index();
                    patches.push(ConversationPatch::add_normalized_entry(patch_id, entry));
                }
            }
            
            KimiEvent::SubagentEvent { task_tool_call_id, event } => {
                // Process subagent event recursively
                let sub_patches = self.process_event(*event);
                
                // Wrap subagent patches with parent context
                for patch in sub_patches {
                    // TODO: Add subagent context to patch metadata
                    patches.push(patch);
                }
            }
            
            KimiEvent::CompactionBegin => {
                // Log compaction start
                let entry = NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::SystemMessage,
                    content: "Context compaction started...".to_string(),
                    metadata: Some(serde_json::json!({ "compaction": "begin" })),
                };
                let patch_id = self.next_index();
                patches.push(ConversationPatch::add_normalized_entry(patch_id, entry));
            }
            
            KimiEvent::CompactionEnd => {
                // Log compaction end
                let entry = NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::SystemMessage,
                    content: "Context compaction completed".to_string(),
                    metadata: Some(serde_json::json!({ "compaction": "end" })),
                };
                let patch_id = self.next_index();
                patches.push(ConversationPatch::add_normalized_entry(patch_id, entry));
            }
            
            _ => {
                // Unknown event, ignore or log
                tracing::debug!("Unhandled Kimi event: {:?}", event);
            }
        }

        patches
    }

    fn infer_action_type(name: &str, arguments: &serde_json::Value) -> ActionType {
        match name {
            "ReadFile" | "read_file" => {
                if let Some(path) = arguments.get("path").and_then(|p| p.as_str()) {
                    ActionType::FileRead {
                        path: path.to_string(),
                    }
                } else {
                    ActionType::Search {
                        query: "file read".to_string(),
                    }
                }
            }
            
            "WriteFile" | "write_file" | "StrReplaceFile" | "str_replace_file" => {
                if let Some(path) = arguments.get("path").and_then(|p| p.as_str()) {
                    ActionType::FileEdit {
                        path: path.to_string(),
                        changes: vec![FileChange::Edit {
                            unified_diff: "File modified".to_string(),
                            has_line_numbers: false,
                        }],
                    }
                } else {
                    ActionType::FileEdit {
                        path: "unknown".to_string(),
                        changes: vec![],
                    }
                }
            }
            
            "Shell" | "shell" | "Bash" | "bash" => {
                let command = arguments
                    .get("command")
                    .and_then(|c| c.as_str())
                    .unwrap_or("")
                    .to_string();
                ActionType::CommandRun {
                    command: command.clone(),
                    result: None,
                    category: crate::logs::utils::shell_command_parsing::CommandCategory::Unknown,
                }
            }
            
            "Glob" | "glob" => ActionType::Search {
                query: arguments
                    .get("pattern")
                    .and_then(|p| p.as_str())
                    .unwrap_or("")
                    .to_string(),
            },
            
            "Grep" | "grep" => ActionType::Search {
                query: arguments
                    .get("pattern")
                    .and_then(|p| p.as_str())
                    .unwrap_or("")
                    .to_string(),
            },
            
            "SearchWeb" | "search_web" => ActionType::WebFetch {
                url: arguments
                    .get("query")
                    .and_then(|q| q.as_str())
                    .unwrap_or("")
                    .to_string(),
            },
            
            "FetchURL" | "fetch_url" => ActionType::WebFetch {
                url: arguments
                    .get("url")
                    .and_then(|u| u.as_str())
                    .unwrap_or("")
                    .to_string(),
            },
            
            "Task" | "task" => ActionType::Tool {
                name: "Task".to_string(),
                description: "Spawn subagent".to_string(),
            },
            
            _ => ActionType::Tool {
                name: name.to_string(),
                description: format!("Tool: {}", name),
            },
        }
    }
}
