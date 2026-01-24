use core::str;
use std::{path::Path, process::Stdio, sync::Arc, time::Duration};

use async_trait::async_trait;
use command_group::AsyncCommandGroup;
use futures::StreamExt;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use tokio::{io::AsyncWriteExt, process::Command};
use ts_rs::TS;
use workspace_utils::{
    diff::create_unified_diff,
    msg_store::MsgStore,
    path::make_path_relative,
    shell::resolve_executable_path_blocking,
};

use crate::{
    command::{CmdOverrides, CommandBuildError, CommandBuilder, apply_overrides},
    env::ExecutionEnv,
    executors::{
        AppendPrompt, AvailabilityInfo, ExecutorError, SpawnedChild, StandardCodingAgentExecutor,
    },
    logs::{
        ActionType, FileChange, NormalizedEntry, NormalizedEntryType, TodoItem, ToolStatus,
        plain_text_processor::PlainTextLogProcessor,
        utils::{ConversationPatch, EntryIndexProvider},
    },
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema)]
pub struct Qoder {
    #[serde(default)]
    pub append_prompt: AppendPrompt,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(description = "Skip permission checks (--yolo)")]
    pub yolo: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(description = "Model selection: auto, efficient, lite, performance, ultimate")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(description = "Maximum agent loop cycles")]
    pub max_turns: Option<u32>,
    #[serde(flatten)]
    pub cmd: CmdOverrides,
}

impl Qoder {
    pub fn base_command() -> &'static str {
        "qodercli"
    }

    fn build_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        let mut builder = CommandBuilder::new(Self::base_command())
            .params(["-p", "-", "--output-format=stream-json"]);

        if self.yolo.unwrap_or(false) {
            builder = builder.extend_params(["--yolo"]);
        }

        if let Some(model) = &self.model {
            builder = builder.extend_params(["--model", model]);
        }

        if let Some(max_turns) = &self.max_turns {
            builder = builder.extend_params(["--max-turns", &max_turns.to_string()]);
        }

        apply_overrides(builder, &self.cmd)
    }
}

#[async_trait]
impl StandardCodingAgentExecutor for Qoder {
    async fn spawn(
        &self,
        current_dir: &Path,
        prompt: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let command_parts = self.build_command_builder()?.build_initial()?;
        let (executable_path, mut args) = command_parts.into_resolved().await?;

        // Add workspace argument for qodercli
        args.push("-w".to_string());
        args.push(current_dir.to_string_lossy().to_string());

        let combined_prompt = self.append_prompt.combine_prompt(prompt);

        let mut command = Command::new(executable_path);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .env("NPM_CONFIG_LOGLEVEL", "error")
            .args(&args);

        env.clone()
            .with_profile(&self.cmd)
            .apply_to_command(&mut command);

        let mut child = command.group_spawn()?;

        if let Some(mut stdin) = child.inner().stdin.take() {
            stdin.write_all(combined_prompt.as_bytes()).await?;
            stdin.shutdown().await?;
        }

        Ok(child.into())
    }

    async fn spawn_follow_up(
        &self,
        current_dir: &Path,
        prompt: &str,
        session_id: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let command_parts = self
            .build_command_builder()?
            .build_follow_up(&["--resume".to_string(), session_id.to_string()])?;
        let (executable_path, mut args) = command_parts.into_resolved().await?;

        // Add workspace argument for qodercli
        args.push("-w".to_string());
        args.push(current_dir.to_string_lossy().to_string());

        let combined_prompt = self.append_prompt.combine_prompt(prompt);

        let mut command = Command::new(executable_path);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .env("NPM_CONFIG_LOGLEVEL", "error")
            .args(&args);

        env.clone()
            .with_profile(&self.cmd)
            .apply_to_command(&mut command);

        let mut child = command.group_spawn()?;

        if let Some(mut stdin) = child.inner().stdin.take() {
            stdin.write_all(combined_prompt.as_bytes()).await?;
            stdin.shutdown().await?;
        }

        Ok(child.into())
    }

    fn normalize_logs(&self, msg_store: Arc<MsgStore>, worktree_path: &Path) {
        let entry_index_provider = EntryIndexProvider::start_from(&msg_store);

        // Process stderr
        let msg_store_stderr = msg_store.clone();
        let entry_index_provider_stderr = entry_index_provider.clone();
        tokio::spawn(async move {
            let mut stderr = msg_store_stderr.stderr_chunked_stream();
            let mut processor = PlainTextLogProcessor::builder()
                .normalized_entry_producer(Box::new(|content: String| {
                    let content = strip_ansi_escapes::strip_str(&content);
                    NormalizedEntry {
                        timestamp: None,
                        entry_type: NormalizedEntryType::ErrorMessage {
                            error_type: crate::logs::NormalizedEntryError::Other,
                        },
                        content,
                        metadata: None,
                    }
                }))
                .time_gap(Duration::from_secs(2))
                .index_provider(entry_index_provider_stderr.clone())
                .build();

            while let Some(Ok(chunk)) = stderr.next().await {
                for patch in processor.process(chunk) {
                    msg_store_stderr.push_patch(patch);
                }
            }
        });

        // Process Qoder stdout JSONL
        let current_dir = worktree_path.to_path_buf();
        tokio::spawn(async move {
            let mut lines = msg_store.stdout_lines_stream();

            let mut model_reported = false;
            let mut session_id_reported = false;

            let mut current_assistant_message_buffer = String::new();
            let mut current_assistant_message_index: Option<usize> = None;
            let mut current_thinking_message_buffer = String::new();
            let mut current_thinking_message_index: Option<usize> = None;

            let worktree_str = current_dir.to_string_lossy().to_string();

            use std::collections::HashMap;
            let mut call_index_map: HashMap<String, usize> = HashMap::new();

            while let Some(Ok(line)) = lines.next().await {
                let qoder_json: QoderJson = match serde_json::from_str(&line) {
                    Ok(json) => json,
                    Err(_) => {
                        if !line.is_empty() {
                            let entry = NormalizedEntry {
                                timestamp: None,
                                entry_type: NormalizedEntryType::SystemMessage,
                                content: line.to_string(),
                                metadata: None,
                            };
                            let patch_id = entry_index_provider.next();
                            let patch = ConversationPatch::add_normalized_entry(patch_id, entry);
                            msg_store.push_patch(patch);
                        }
                        continue;
                    }
                };

                // Push session_id if present
                if !session_id_reported {
                    if let Some(session_id) = qoder_json.extract_session_id() {
                        msg_store.push_session_id(session_id);
                        session_id_reported = true;
                    }
                }

                let is_assistant_message =
                    matches!(qoder_json, QoderJson::Assistant { .. });
                let is_thinking = qoder_json.is_thinking_content();

                if !is_assistant_message && current_assistant_message_index.is_some() {
                    current_assistant_message_index = None;
                    current_assistant_message_buffer.clear();
                }
                if !is_thinking && current_thinking_message_index.is_some() {
                    current_thinking_message_index = None;
                    current_thinking_message_buffer.clear();
                }

                match &qoder_json {
                    QoderJson::System { model, .. } => {
                        if !model_reported {
                            if let Some(model) = model.as_ref() {
                                let entry = NormalizedEntry {
                                    timestamp: None,
                                    entry_type: NormalizedEntryType::SystemMessage,
                                    content: format!("System initialized with model: {model}"),
                                    metadata: None,
                                };
                                let id = entry_index_provider.next();
                                msg_store.push_patch(ConversationPatch::add_normalized_entry(
                                    id, entry,
                                ));
                                model_reported = true;
                            }
                        }
                    }

                    QoderJson::Assistant { message, .. } => {
                        // Process content items
                        if let Some(content) = &message.content {
                            for item in content {
                                match item {
                                    QoderContentItem::Reasoning { thinking, .. } => {
                                        if let Some(text) = thinking {
                                            if !text.is_empty() {
                                                current_thinking_message_buffer.push_str(text);
                                                let entry = NormalizedEntry {
                                                    timestamp: None,
                                                    entry_type: NormalizedEntryType::Thinking,
                                                    content: current_thinking_message_buffer
                                                        .clone(),
                                                    metadata: None,
                                                };
                                                if let Some(id) = current_thinking_message_index {
                                                    msg_store.push_patch(
                                                        ConversationPatch::replace(id, entry),
                                                    );
                                                } else {
                                                    let id = entry_index_provider.next();
                                                    current_thinking_message_index = Some(id);
                                                    msg_store.push_patch(
                                                        ConversationPatch::add_normalized_entry(
                                                            id, entry,
                                                        ),
                                                    );
                                                }
                                            }
                                        }
                                    }
                                    QoderContentItem::Text { text } => {
                                        current_assistant_message_buffer.push_str(text);
                                        let entry = NormalizedEntry {
                                            timestamp: None,
                                            entry_type: NormalizedEntryType::AssistantMessage,
                                            content: current_assistant_message_buffer.clone(),
                                            metadata: None,
                                        };
                                        if let Some(id) = current_assistant_message_index {
                                            msg_store
                                                .push_patch(ConversationPatch::replace(id, entry));
                                        } else {
                                            let id = entry_index_provider.next();
                                            current_assistant_message_index = Some(id);
                                            msg_store.push_patch(
                                                ConversationPatch::add_normalized_entry(id, entry),
                                            );
                                        }
                                    }
                                    QoderContentItem::ToolUse {
                                        id: tool_id,
                                        name,
                                        input,
                                    } => {
                                        let (action_type, content) =
                                            tool_use_to_action_and_content(
                                                name,
                                                input,
                                                &worktree_str,
                                            );
                                        let entry = NormalizedEntry {
                                            timestamp: None,
                                            entry_type: NormalizedEntryType::ToolUse {
                                                tool_name: name.clone(),
                                                action_type,
                                                status: ToolStatus::Created,
                                            },
                                            content,
                                            metadata: None,
                                        };
                                        let id = entry_index_provider.next();
                                        if let Some(tid) = tool_id {
                                            call_index_map.insert(tid.clone(), id);
                                        }
                                        msg_store.push_patch(
                                            ConversationPatch::add_normalized_entry(id, entry),
                                        );
                                    }
                                    QoderContentItem::ToolResult {
                                        tool_use_id,
                                        content: result_content,
                                        ..
                                    } => {
                                        if let Some(tid) = tool_use_id {
                                            if let Some(&idx) = call_index_map.get(tid) {
                                                // Extract result text - content can be string or array
                                                let result_text = result_content
                                                    .as_ref()
                                                    .map(|v| extract_tool_result_text(v))
                                                    .unwrap_or_default();

                                                let entry = NormalizedEntry {
                                                    timestamp: None,
                                                    entry_type: NormalizedEntryType::ToolUse {
                                                        tool_name: "tool".to_string(),
                                                        action_type: ActionType::Other {
                                                            description: "Tool completed"
                                                                .to_string(),
                                                        },
                                                        status: ToolStatus::Success,
                                                    },
                                                    content: result_text,
                                                    metadata: None,
                                                };
                                                msg_store
                                                    .push_patch(ConversationPatch::replace(idx, entry));
                                            }
                                        }
                                    }
                                    QoderContentItem::Finish { .. } => {
                                        // End of message, no action needed
                                    }
                                    QoderContentItem::Function {
                                        id: tool_id,
                                        name,
                                        input,
                                        ..
                                    } => {
                                        // Handle function calls the same as tool_use
                                        let (action_type, content) =
                                            tool_use_to_action_and_content(
                                                name,
                                                input,
                                                &worktree_str,
                                            );
                                        let entry = NormalizedEntry {
                                            timestamp: None,
                                            entry_type: NormalizedEntryType::ToolUse {
                                                tool_name: name.clone(),
                                                action_type,
                                                status: ToolStatus::Created,
                                            },
                                            content,
                                            metadata: None,
                                        };
                                        let id = entry_index_provider.next();
                                        if let Some(tid) = tool_id {
                                            call_index_map.insert(tid.clone(), id);
                                        }
                                        msg_store.push_patch(
                                            ConversationPatch::add_normalized_entry(id, entry),
                                        );
                                    }
                                    QoderContentItem::Unknown => {
                                        // Skip unknown content item types
                                    }
                                }
                            }
                        }
                    }

                    QoderJson::Result { .. } => {
                        // Result messages are metadata, typically no action needed
                    }

                    QoderJson::User { message, .. } => {
                        // User messages contain tool results - process them to update tool status
                        if let Some(msg) = message {
                            if let Some(content) = &msg.content {
                                for item in content {
                                    if let QoderContentItem::ToolResult {
                                        tool_use_id,
                                        content: result_content,
                                        is_error,
                                        ..
                                    } = item
                                    {
                                        if let Some(tid) = tool_use_id {
                                            if let Some(&idx) = call_index_map.get(tid) {
                                                // Extract result text - content can be string or array
                                                let result_text = result_content
                                                    .as_ref()
                                                    .map(|v| extract_tool_result_text(v))
                                                    .unwrap_or_default();

                                                let status = if is_error.unwrap_or(false) {
                                                    ToolStatus::Failed
                                                } else {
                                                    ToolStatus::Success
                                                };

                                                let entry = NormalizedEntry {
                                                    timestamp: None,
                                                    entry_type: NormalizedEntryType::ToolUse {
                                                        tool_name: "tool".to_string(),
                                                        action_type: ActionType::Other {
                                                            description: "Tool completed"
                                                                .to_string(),
                                                        },
                                                        status,
                                                    },
                                                    content: result_text,
                                                    metadata: None,
                                                };
                                                msg_store
                                                    .push_patch(ConversationPatch::replace(idx, entry));
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    QoderJson::Unknown => {
                        let entry = NormalizedEntry {
                            timestamp: None,
                            entry_type: NormalizedEntryType::SystemMessage,
                            content: line,
                            metadata: None,
                        };
                        let id = entry_index_provider.next();
                        msg_store.push_patch(ConversationPatch::add_normalized_entry(id, entry));
                    }
                }
            }
        });
    }

    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        dirs::home_dir().map(|home| home.join(".qoder.json"))
    }

    fn get_availability_info(&self) -> AvailabilityInfo {
        let binary_found = resolve_executable_path_blocking(Self::base_command()).is_some();
        if !binary_found {
            return AvailabilityInfo::NotFound;
        }

        let config_files_found = self
            .default_mcp_config_path()
            .map(|p| p.exists())
            .unwrap_or(false);

        if config_files_found {
            AvailabilityInfo::InstallationFound
        } else {
            // Binary found but no config - still consider it available
            AvailabilityInfo::InstallationFound
        }
    }
}

/* ===========================
   Typed Qoder JSON structures
   =========================== */

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(tag = "type")]
pub enum QoderJson {
    #[serde(rename = "system")]
    System {
        #[serde(default)]
        subtype: Option<String>,
        #[serde(default)]
        session_id: Option<String>,
        #[serde(default)]
        model: Option<String>,
        #[serde(default)]
        provider: Option<String>,
        #[serde(default)]
        permission_mode: Option<String>,
        #[serde(default)]
        working_dir: Option<String>,
        #[serde(default)]
        tools: Option<Vec<String>>,
        #[serde(default)]
        done: Option<bool>,
    },
    #[serde(rename = "assistant")]
    Assistant {
        #[serde(default)]
        subtype: Option<String>,
        message: QoderMessage,
        #[serde(default)]
        session_id: Option<String>,
        #[serde(default)]
        done: Option<bool>,
    },
    #[serde(rename = "result")]
    Result {
        #[serde(default)]
        subtype: Option<String>,
        #[serde(default)]
        message: Option<QoderMessage>,
        #[serde(default)]
        session_id: Option<String>,
        #[serde(default)]
        done: Option<bool>,
    },
    /// User messages containing tool results
    #[serde(rename = "user")]
    User {
        #[serde(default)]
        subtype: Option<String>,
        #[serde(default)]
        message: Option<QoderMessage>,
        #[serde(default)]
        session_id: Option<String>,
        #[serde(default)]
        done: Option<bool>,
    },
    #[serde(other)]
    Unknown,
}

impl QoderJson {
    pub fn extract_session_id(&self) -> Option<String> {
        match self {
            QoderJson::System { session_id, .. } => session_id.clone(),
            QoderJson::Assistant { session_id, .. } => session_id.clone(),
            QoderJson::Result { session_id, .. } => session_id.clone(),
            QoderJson::User { session_id, .. } => session_id.clone(),
            QoderJson::Unknown => None,
        }
    }

    pub fn is_thinking_content(&self) -> bool {
        if let QoderJson::Assistant { message, .. } = self {
            if let Some(content) = &message.content {
                return content
                    .iter()
                    .any(|item| matches!(item, QoderContentItem::Reasoning { .. }));
            }
        }
        false
    }
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, Default)]
pub struct QoderMessage {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub role: Option<String>,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub content: Option<Vec<QoderContentItem>>,
    #[serde(default)]
    pub created_at: Option<i64>,
    #[serde(default)]
    pub updated_at: Option<i64>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub provider: Option<String>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(tag = "type")]
pub enum QoderContentItem {
    #[serde(rename = "reasoning")]
    Reasoning {
        #[serde(default)]
        thinking: Option<String>,
        #[serde(default)]
        signature: Option<String>,
    },
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "tool_use")]
    ToolUse {
        #[serde(default)]
        id: Option<String>,
        name: String,
        #[serde(default)]
        input: Option<serde_json::Value>,
    },
    /// Function call - alternative format for tool use
    #[serde(rename = "function")]
    Function {
        #[serde(default)]
        id: Option<String>,
        name: String,
        #[serde(default)]
        input: Option<serde_json::Value>,
        #[serde(default)]
        finished: Option<bool>,
    },
    #[serde(rename = "tool_result")]
    ToolResult {
        #[serde(default)]
        tool_use_id: Option<String>,
        /// Content can be either a string (in user messages) or an array of items (in assistant messages)
        #[serde(default)]
        content: Option<serde_json::Value>,
        #[serde(default)]
        is_error: Option<bool>,
        /// Tool name (present in user messages)
        #[serde(default)]
        name: Option<String>,
        /// Metadata JSON string (present in user messages)
        #[serde(default)]
        metadata: Option<String>,
        /// Whether the tool was canceled (present in user messages)
        #[serde(default)]
        canceled: Option<bool>,
    },
    #[serde(rename = "finish")]
    Finish {
        #[serde(default)]
        reason: Option<String>,
        #[serde(default)]
        time: Option<i64>,
    },
    /// Fallback for unknown content item types
    #[serde(other)]
    Unknown,
}

// Fallback for unknown content items - we just skip them
impl Default for QoderContentItem {
    fn default() -> Self {
        QoderContentItem::Text {
            text: String::new(),
        }
    }
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(tag = "type")]
pub enum QoderToolResultItem {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(other)]
    Unknown,
}

/* ===========================
   Tool use helpers
   =========================== */

/// Extract text from tool result content which can be either a string or an array of items
fn extract_tool_result_text(value: &serde_json::Value) -> String {
    // If it's a string, return it directly
    if let Some(s) = value.as_str() {
        return s.to_string();
    }

    // If it's an array, extract text from each item
    if let Some(arr) = value.as_array() {
        return arr
            .iter()
            .filter_map(|item| {
                // Try to get the "text" field from items like {"type": "text", "text": "..."}
                item.get("text").and_then(|t| t.as_str())
            })
            .collect::<Vec<_>>()
            .join("\n");
    }

    // Fallback: convert to string
    value.to_string()
}

fn tool_use_to_action_and_content(
    tool_name: &str,
    input: &Option<serde_json::Value>,
    worktree_path: &str,
) -> (ActionType, String) {
    let input_val = input.as_ref();

    match tool_name {
        "Read" => {
            let path = input_val
                .and_then(|v| v.get("file_path"))
                .and_then(|v| v.as_str())
                .map(|p| make_path_relative(p, worktree_path))
                .unwrap_or_default();
            (ActionType::FileRead { path: path.clone() }, path)
        }
        "Write" => {
            let path = input_val
                .and_then(|v| v.get("file_path"))
                .and_then(|v| v.as_str())
                .map(|p| make_path_relative(p, worktree_path))
                .unwrap_or_default();
            (
                ActionType::FileEdit {
                    path: path.clone(),
                    changes: vec![],
                },
                path,
            )
        }
        "Edit" => {
            let path = input_val
                .and_then(|v| v.get("file_path"))
                .and_then(|v| v.as_str())
                .map(|p| make_path_relative(p, worktree_path))
                .unwrap_or_default();

            let old_string = input_val
                .and_then(|v| v.get("old_string"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let new_string = input_val
                .and_then(|v| v.get("new_string"))
                .and_then(|v| v.as_str())
                .unwrap_or("");

            let changes = if !old_string.is_empty() || !new_string.is_empty() {
                vec![FileChange::Edit {
                    unified_diff: create_unified_diff(&path, old_string, new_string),
                    has_line_numbers: false,
                }]
            } else {
                vec![]
            };

            (
                ActionType::FileEdit {
                    path: path.clone(),
                    changes,
                },
                path,
            )
        }
        "Bash" => {
            let cmd = input_val
                .and_then(|v| v.get("command"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            (
                ActionType::CommandRun {
                    command: cmd.clone(),
                    result: None,
                },
                cmd,
            )
        }
        "Grep" => {
            let pattern = input_val
                .and_then(|v| v.get("pattern"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            (
                ActionType::Search {
                    query: pattern.clone(),
                },
                pattern,
            )
        }
        "Glob" => {
            let pattern = input_val
                .and_then(|v| v.get("pattern"))
                .and_then(|v| v.as_str())
                .unwrap_or("*")
                .to_string();
            (
                ActionType::Search {
                    query: pattern.clone(),
                },
                format!("Find files: `{pattern}`"),
            )
        }
        "TodoWrite" => {
            let todos = input_val
                .and_then(|v| v.get("todos"))
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|item| {
                            let content = item.get("content")?.as_str()?.to_string();
                            let status = item
                                .get("status")
                                .and_then(|s| s.as_str())
                                .unwrap_or("pending")
                                .to_string();
                            Some(TodoItem {
                                content,
                                status,
                                priority: None,
                            })
                        })
                        .collect()
                })
                .unwrap_or_default();
            (
                ActionType::TodoManagement {
                    todos,
                    operation: "write".to_string(),
                },
                "TODO list updated".to_string(),
            )
        }
        "WebSearch" => {
            let query = input_val
                .and_then(|v| v.get("query"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            (
                ActionType::Search {
                    query: query.clone(),
                },
                format!("Web search: {query}"),
            )
        }
        "WebFetch" => {
            let url = input_val
                .and_then(|v| v.get("url"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            (
                ActionType::Other {
                    description: "Fetch URL".to_string(),
                },
                format!("Fetch: {url}"),
            )
        }
        _ => {
            let description = format!("Tool: {tool_name}");
            let content = input_val
                .map(|v| serde_json::to_string_pretty(v).unwrap_or_default())
                .unwrap_or_else(|| tool_name.to_string());
            (ActionType::Other { description }, content)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_qoder_system_json_parsing() {
        let system_line = r#"{"tools":["Bash","Read","Write"],"provider":"qoder","permission_mode":"yolo","working_dir":"/tmp/test","model":"Ultimate","type":"system","subtype":"init","session_id":"test-session-123","done":false}"#;
        let parsed: QoderJson = serde_json::from_str(system_line).unwrap();

        match parsed {
            QoderJson::System {
                session_id,
                model,
                provider,
                ..
            } => {
                assert_eq!(session_id, Some("test-session-123".to_string()));
                assert_eq!(model, Some("Ultimate".to_string()));
                assert_eq!(provider, Some("qoder".to_string()));
            }
            _ => panic!("Expected System variant"),
        }
    }

    #[test]
    fn test_qoder_assistant_json_parsing() {
        let assistant_line = r#"{"type":"assistant","subtype":"message","message":{"id":"msg-1","role":"assistant","content":[{"type":"text","text":"Hello world"}]},"session_id":"test-session","done":false}"#;
        let parsed: QoderJson = serde_json::from_str(assistant_line).unwrap();

        match parsed {
            QoderJson::Assistant { message, .. } => {
                assert!(message.content.is_some());
                let content = message.content.unwrap();
                assert_eq!(content.len(), 1);
                match &content[0] {
                    QoderContentItem::Text { text } => {
                        assert_eq!(text, "Hello world");
                    }
                    _ => panic!("Expected Text content item"),
                }
            }
            _ => panic!("Expected Assistant variant"),
        }
    }

    #[test]
    fn test_qoder_reasoning_content_parsing() {
        let reasoning_line = r#"{"type":"assistant","subtype":"message","message":{"content":[{"type":"reasoning","thinking":"Let me think about this...","signature":"abc"}]},"session_id":"test"}"#;
        let parsed: QoderJson = serde_json::from_str(reasoning_line).unwrap();

        assert!(parsed.is_thinking_content());

        match parsed {
            QoderJson::Assistant { message, .. } => {
                let content = message.content.unwrap();
                match &content[0] {
                    QoderContentItem::Reasoning { thinking, .. } => {
                        assert_eq!(thinking.as_deref(), Some("Let me think about this..."));
                    }
                    _ => panic!("Expected Reasoning content item"),
                }
            }
            _ => panic!("Expected Assistant variant"),
        }
    }

    #[test]
    fn test_session_id_extraction() {
        let system_json: QoderJson = serde_json::from_str(
            r#"{"type":"system","session_id":"sys-123","model":"auto"}"#,
        )
        .unwrap();
        assert_eq!(
            system_json.extract_session_id(),
            Some("sys-123".to_string())
        );

        let assistant_json: QoderJson = serde_json::from_str(
            r#"{"type":"assistant","message":{},"session_id":"ast-456"}"#,
        )
        .unwrap();
        assert_eq!(
            assistant_json.extract_session_id(),
            Some("ast-456".to_string())
        );
    }
}
