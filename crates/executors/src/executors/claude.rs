use std::{path::PathBuf, process::Stdio, sync::Arc};

use async_trait::async_trait;
use command_group::{AsyncCommandGroup, AsyncGroupChild};
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use tokio::{io::AsyncWriteExt, process::Command};
use ts_rs::TS;
use utils::{
    log_msg::LogMsg, msg_store::MsgStore, path::make_path_relative, shell::get_shell_command,
};

use crate::{
    command::{AgentProfiles, CommandBuilder},
    executors::{ExecutorError, StandardCodingAgentExecutor},
    logs::{
        ActionType, EditDiff, NormalizedEntry, NormalizedEntryType,
        stderr_processor::normalize_stderr_logs,
        utils::{EntryIndexProvider, patch::ConversationPatch},
    },
};

/// An executor that uses Claude CLI to process tasks
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct ClaudeCode {
    executor_type: String,
    command_builder: CommandBuilder,
}

impl Default for ClaudeCode {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl StandardCodingAgentExecutor for ClaudeCode {
    async fn spawn(
        &self,
        current_dir: &PathBuf,
        prompt: &str,
    ) -> Result<AsyncGroupChild, ExecutorError> {
        let (shell_cmd, shell_arg) = get_shell_command();
        let claude_command = self.command_builder.build_initial();

        let mut command = Command::new(shell_cmd);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .arg(shell_arg)
            .arg(&claude_command);

        let mut child = command.group_spawn()?;

        // Feed the prompt in, then close the pipe so Claude sees EOF
        if let Some(mut stdin) = child.inner().stdin.take() {
            stdin.write_all(prompt.as_bytes()).await?;
            stdin.shutdown().await?;
        }

        Ok(child)
    }

    async fn spawn_follow_up(
        &self,
        current_dir: &PathBuf,
        prompt: &str,
        session_id: &str,
    ) -> Result<AsyncGroupChild, ExecutorError> {
        let (shell_cmd, shell_arg) = get_shell_command();
        // Build follow-up command with --resume {session_id}
        let claude_command = self
            .command_builder
            .build_follow_up(&["--resume".to_string(), session_id.to_string()]);

        let mut command = Command::new(shell_cmd);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .arg(shell_arg)
            .arg(&claude_command);

        let mut child = command.group_spawn()?;

        // Feed the followup prompt in, then close the pipe
        if let Some(mut stdin) = child.inner().stdin.take() {
            stdin.write_all(prompt.as_bytes()).await?;
            stdin.shutdown().await?;
        }

        Ok(child)
    }

    fn normalize_logs(&self, msg_store: Arc<MsgStore>, current_dir: &PathBuf) {
        let entry_index_provider = EntryIndexProvider::new();

        // Process stdout logs (Claude's JSON output)
        ClaudeLogProcessor::process_logs(
            self,
            msg_store.clone(),
            current_dir,
            entry_index_provider.clone(),
        );

        // Process stderr logs using the standard stderr processor
        normalize_stderr_logs(msg_store, entry_index_provider);
    }
}

impl ClaudeCode {
    /// Create a new Claude executor with default settings
    pub fn new() -> Self {
        let profile = AgentProfiles::get_cached()
            .get_profile("claude-code")
            .expect("Default claude-code profile should exist");

        Self::with_command_builder(profile.label.clone(), profile.command.clone())
    }

    /// Create a new Claude executor in plan mode with watchkill script
    pub fn new_plan_mode() -> Self {
        let profile = AgentProfiles::get_cached()
            .get_profile("claude-code-plan")
            .expect("Default claude-code-plan profile should exist");

        let base_command = profile.command.build_initial();
        // Note: We'll need to update this to handle watchkill script properly
        // For now, we'll create a custom command builder
        let watchkill_command = create_watchkill_script(&base_command);
        Self {
            executor_type: "ClaudePlan".to_string(),
            command_builder: CommandBuilder::new(watchkill_command),
        }
    }

    /// Create a new Claude executor using claude-code-router
    pub fn new_claude_code_router() -> Self {
        let profile = AgentProfiles::get_cached()
            .get_profile("claude-code-router")
            .expect("Default claude-code-router profile should exist");

        Self::with_command_builder(profile.label.clone(), profile.command.clone())
    }

    /// Create a new Claude executor with custom command builder
    pub fn with_command_builder(executor_type: String, command_builder: CommandBuilder) -> Self {
        Self {
            executor_type,
            command_builder,
        }
    }
}

fn create_watchkill_script(command: &str) -> String {
    let claude_plan_stop_indicator = concat!("Exit ", "plan mode?"); // Use concat!() as a workaround to avoid killing plan mode when this file is read.
    format!(
        r#"#!/usr/bin/env bash
set -euo pipefail

word="{claude_plan_stop_indicator}"
command="{command}"

exit_code=0
while IFS= read -r line; do
    printf '%s\n' "$line"
    if [[ $line == *"$word"* ]]; then
        exit 0
    fi
done < <($command <&0 2>&1)

exit_code=${{PIPESTATUS[0]}}
exit "$exit_code"
"#
    )
}

/// Handles log processing and interpretation for Claude executor
struct ClaudeLogProcessor {
    model_name: Option<String>,
}

impl ClaudeLogProcessor {
    fn new() -> Self {
        Self { model_name: None }
    }

    /// Process raw logs and convert them to normalized entries with patches
    fn process_logs(
        _executor: &ClaudeCode,
        msg_store: Arc<MsgStore>,
        current_dir: &PathBuf,
        entry_index_provider: EntryIndexProvider,
    ) {
        let current_dir_clone = current_dir.clone();
        tokio::spawn(async move {
            let mut stream = msg_store.history_plus_stream();
            let mut buffer = String::new();
            let worktree_path = current_dir_clone.to_string_lossy().to_string();
            let mut session_id_extracted = false;
            let mut processor = Self::new();

            while let Some(Ok(msg)) = stream.next().await {
                let chunk = match msg {
                    LogMsg::Stdout(x) => x,
                    LogMsg::JsonPatch(_) | LogMsg::SessionId(_) | LogMsg::Stderr(_) => continue,
                    LogMsg::Finished => break,
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

                    // Filter out claude-code-router service messages
                    if trimmed.starts_with("Service not running, starting service")
                        || trimmed
                            .contains("claude code router service has been successfully stopped")
                    {
                        continue;
                    }

                    match serde_json::from_str::<ClaudeJson>(trimmed) {
                        Ok(claude_json) => {
                            // Extract session ID if present
                            if !session_id_extracted
                                && let Some(session_id) = Self::extract_session_id(&claude_json)
                            {
                                msg_store.push_session_id(session_id);
                                session_id_extracted = true;
                            }

                            // Convert to normalized entries and create patches
                            for entry in
                                processor.to_normalized_entries(&claude_json, &worktree_path)
                            {
                                let patch_id = entry_index_provider.next();
                                let patch =
                                    ConversationPatch::add_normalized_entry(patch_id, entry);
                                msg_store.push_patch(patch);
                            }
                        }
                        Err(_) => {
                            // Handle non-JSON output as raw system message
                            if !trimmed.is_empty() {
                                let entry = NormalizedEntry {
                                    timestamp: None,
                                    entry_type: NormalizedEntryType::SystemMessage,
                                    content: format!("Raw output: {trimmed}"),
                                    metadata: None,
                                };

                                let patch_id = entry_index_provider.next();
                                let patch =
                                    ConversationPatch::add_normalized_entry(patch_id, entry);
                                msg_store.push_patch(patch);
                            }
                        }
                    }
                }

                // Keep the partial line in the buffer
                buffer = buffer.rsplit('\n').next().unwrap_or("").to_owned();
            }

            // Handle any remaining content in buffer
            if !buffer.trim().is_empty() {
                let entry = NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::SystemMessage,
                    content: format!("Raw output: {}", buffer.trim()),
                    metadata: None,
                };

                let patch_id = entry_index_provider.next();
                let patch = ConversationPatch::add_normalized_entry(patch_id, entry);
                msg_store.push_patch(patch);
            }
        });
    }

    /// Extract session ID from Claude JSON
    fn extract_session_id(claude_json: &ClaudeJson) -> Option<String> {
        match claude_json {
            ClaudeJson::System { session_id, .. } => session_id.clone(),
            ClaudeJson::Assistant { session_id, .. } => session_id.clone(),
            ClaudeJson::User { session_id, .. } => session_id.clone(),
            ClaudeJson::ToolUse { session_id, .. } => session_id.clone(),
            ClaudeJson::ToolResult { session_id, .. } => session_id.clone(),
            ClaudeJson::Result { .. } => None,
            ClaudeJson::Unknown => None,
        }
    }

    /// Convert Claude JSON to normalized entries
    fn to_normalized_entries(
        &mut self,
        claude_json: &ClaudeJson,
        worktree_path: &str,
    ) -> Vec<NormalizedEntry> {
        match claude_json {
            ClaudeJson::System { subtype, .. } => {
                let content = match subtype.as_deref() {
                    Some("init") => {
                        // Skip system init messages because it doesn't contain the actual model that will be used in assistant messages in case of claude-code-router.
                        // We'll send system initialized message with first assistant message that has a model field.
                        return vec![];
                    }
                    Some(subtype) => format!("System: {subtype}"),
                    None => "System message".to_string(),
                };

                vec![NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::SystemMessage,
                    content,
                    metadata: Some(
                        serde_json::to_value(claude_json).unwrap_or(serde_json::Value::Null),
                    ),
                }]
            }
            ClaudeJson::Assistant { message, .. } => {
                let mut entries = Vec::new();

                if self.model_name.is_none()
                    && let Some(model) = message.model.as_ref()
                {
                    self.model_name = Some(model.clone());
                    entries.push(NormalizedEntry {
                        timestamp: None,
                        entry_type: NormalizedEntryType::SystemMessage,
                        content: format!("System initialized with model: {model}"),
                        metadata: None,
                    });
                }

                for content_item in &message.content {
                    if let Some(entry) = Self::content_item_to_normalized_entry(
                        content_item,
                        "assistant",
                        worktree_path,
                    ) {
                        entries.push(entry);
                    }
                }
                entries
            }
            ClaudeJson::User { message, .. } => {
                let mut entries = Vec::new();
                for content_item in &message.content {
                    if let Some(entry) =
                        Self::content_item_to_normalized_entry(content_item, "user", worktree_path)
                    {
                        entries.push(entry);
                    }
                }
                entries
            }
            ClaudeJson::ToolUse { tool_data, .. } => {
                let tool_name = tool_data.get_name();
                let action_type = Self::extract_action_type(tool_data, worktree_path);
                let content =
                    Self::generate_concise_content(tool_data, &action_type, worktree_path);

                vec![NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::ToolUse {
                        tool_name: tool_name.to_string(),
                        action_type,
                    },
                    content,
                    metadata: Some(
                        serde_json::to_value(claude_json).unwrap_or(serde_json::Value::Null),
                    ),
                }]
            }
            ClaudeJson::ToolResult { .. } => {
                // TODO: Add proper ToolResult support to NormalizedEntry when the type system supports it
                vec![]
            }
            ClaudeJson::Result { .. } => {
                // Skip result messages
                vec![]
            }
            ClaudeJson::Unknown => {
                vec![NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::SystemMessage,
                    content: "Unrecognized JSON message from Claude".to_string(),
                    metadata: None,
                }]
            }
        }
    }

    /// Convert Claude content item to normalized entry
    fn content_item_to_normalized_entry(
        content_item: &ClaudeContentItem,
        role: &str,
        worktree_path: &str,
    ) -> Option<NormalizedEntry> {
        match content_item {
            ClaudeContentItem::Text { text } => {
                let entry_type = match role {
                    "user" => NormalizedEntryType::UserMessage,
                    "assistant" => NormalizedEntryType::AssistantMessage,
                    _ => return None,
                };
                Some(NormalizedEntry {
                    timestamp: None,
                    entry_type,
                    content: text.clone(),
                    metadata: Some(
                        serde_json::to_value(content_item).unwrap_or(serde_json::Value::Null),
                    ),
                })
            }
            ClaudeContentItem::Thinking { thinking } => Some(NormalizedEntry {
                timestamp: None,
                entry_type: NormalizedEntryType::Thinking,
                content: thinking.clone(),
                metadata: Some(
                    serde_json::to_value(content_item).unwrap_or(serde_json::Value::Null),
                ),
            }),
            ClaudeContentItem::ToolUse { tool_data, .. } => {
                let name = tool_data.get_name();
                let action_type = Self::extract_action_type(tool_data, worktree_path);
                let content =
                    Self::generate_concise_content(tool_data, &action_type, worktree_path);

                Some(NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::ToolUse {
                        tool_name: name.to_string(),
                        action_type,
                    },
                    content,
                    metadata: Some(
                        serde_json::to_value(content_item).unwrap_or(serde_json::Value::Null),
                    ),
                })
            }
            ClaudeContentItem::ToolResult { .. } => {
                // TODO: Add proper ToolResult support to NormalizedEntry when the type system supports it
                None
            }
        }
    }

    /// Extract action type from structured tool data
    fn extract_action_type(tool_data: &ClaudeToolData, worktree_path: &str) -> ActionType {
        match tool_data {
            ClaudeToolData::Read { file_path } => ActionType::FileRead {
                path: make_path_relative(file_path, worktree_path),
            },
            ClaudeToolData::Edit {
                file_path,
                old_string,
                new_string,
            } => {
                let diffs = if old_string.is_some() || new_string.is_some() {
                    vec![EditDiff::Replace {
                        old: old_string.clone().unwrap_or_default(),
                        new: new_string.clone().unwrap_or_default(),
                    }]
                } else {
                    vec![]
                };
                ActionType::FileEdit {
                    path: make_path_relative(file_path, worktree_path),
                    diffs,
                }
            }
            ClaudeToolData::MultiEdit { file_path, edits } => {
                let diffs = edits
                    .iter()
                    .filter_map(|edit| {
                        if edit.old_string.is_some() || edit.new_string.is_some() {
                            Some(EditDiff::Replace {
                                old: edit.old_string.clone().unwrap_or_default(),
                                new: edit.new_string.clone().unwrap_or_default(),
                            })
                        } else {
                            None
                        }
                    })
                    .collect();
                ActionType::FileEdit {
                    path: make_path_relative(file_path, worktree_path),
                    diffs,
                }
            }
            ClaudeToolData::Write { file_path, content } => {
                let diffs = vec![EditDiff::Replace {
                    old: String::new(),
                    new: content.clone(),
                }];
                ActionType::FileEdit {
                    path: make_path_relative(file_path, worktree_path),
                    diffs,
                }
            }
            ClaudeToolData::Bash { command, .. } => ActionType::CommandRun {
                command: command.clone(),
            },
            ClaudeToolData::Grep { pattern, .. } => ActionType::Search {
                query: pattern.clone(),
            },
            ClaudeToolData::WebFetch { url, .. } => ActionType::WebFetch { url: url.clone() },
            ClaudeToolData::WebSearch { query } => ActionType::WebFetch { url: query.clone() },
            ClaudeToolData::Task {
                description,
                prompt,
                ..
            } => {
                let task_description = if let Some(desc) = description {
                    desc.clone()
                } else {
                    prompt.clone()
                };
                ActionType::TaskCreate {
                    description: task_description,
                }
            }
            ClaudeToolData::ExitPlanMode { plan } => {
                ActionType::PlanPresentation { plan: plan.clone() }
            }
            ClaudeToolData::NotebookEdit { notebook_path, .. } => ActionType::FileEdit {
                path: make_path_relative(notebook_path, worktree_path),
                diffs: vec![],
            },
            ClaudeToolData::TodoWrite { .. } => ActionType::Other {
                description: "Manage TODO list".to_string(),
            },
            ClaudeToolData::Glob { pattern, path: _ } => ActionType::Search {
                query: pattern.clone(),
            },
            ClaudeToolData::LS { .. } => ActionType::Other {
                description: "List directory".to_string(),
            },
            ClaudeToolData::Unknown { .. } => ActionType::Other {
                description: format!("Tool: {}", tool_data.get_name()),
            },
        }
    }

    /// Generate concise, readable content for tool usage using structured data
    fn generate_concise_content(
        tool_data: &ClaudeToolData,
        action_type: &ActionType,
        worktree_path: &str,
    ) -> String {
        match action_type {
            ActionType::FileRead { path } => format!("`{path}`"),
            ActionType::FileEdit { path, .. } => format!("`{path}`"),
            ActionType::CommandRun { command } => format!("`{command}`"),
            ActionType::Search { query } => format!("`{query}`"),
            ActionType::WebFetch { url } => format!("`{url}`"),
            ActionType::TaskCreate { description } => description.clone(),
            ActionType::PlanPresentation { plan } => plan.clone(),
            ActionType::Other { description: _ } => match tool_data {
                ClaudeToolData::TodoWrite { todos } => {
                    let mut todo_items = Vec::new();
                    for todo in todos {
                        let status_emoji = match todo.status.as_str() {
                            "completed" => "✅",
                            "in_progress" => "🔄",
                            "pending" | "todo" => "⏳",
                            _ => "📝",
                        };
                        let priority = todo.priority.as_deref().unwrap_or("medium");
                        todo_items
                            .push(format!("{} {} ({})", status_emoji, todo.content, priority));
                    }
                    if !todo_items.is_empty() {
                        format!("TODO List:\n{}", todo_items.join("\n"))
                    } else {
                        "Managing TODO list".to_string()
                    }
                }
                ClaudeToolData::LS { path } => {
                    let relative_path = make_path_relative(path, worktree_path);
                    if relative_path.is_empty() {
                        "List directory".to_string()
                    } else {
                        format!("List directory: `{relative_path}`")
                    }
                }
                ClaudeToolData::Glob { pattern, path } => {
                    if let Some(search_path) = path {
                        format!(
                            "Find files: `{}` in `{}`",
                            pattern,
                            make_path_relative(search_path, worktree_path)
                        )
                    } else {
                        format!("Find files: `{pattern}`")
                    }
                }
                _ => tool_data.get_name().to_string(),
            },
        }
    }
}

// Data structures for parsing Claude's JSON output format
#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(tag = "type")]
pub enum ClaudeJson {
    #[serde(rename = "system")]
    System {
        subtype: Option<String>,
        session_id: Option<String>,
        cwd: Option<String>,
        tools: Option<Vec<serde_json::Value>>,
        model: Option<String>,
    },
    #[serde(rename = "assistant")]
    Assistant {
        message: ClaudeMessage,
        session_id: Option<String>,
    },
    #[serde(rename = "user")]
    User {
        message: ClaudeMessage,
        session_id: Option<String>,
    },
    #[serde(rename = "tool_use")]
    ToolUse {
        tool_name: String,
        #[serde(flatten)]
        tool_data: ClaudeToolData,
        session_id: Option<String>,
    },
    #[serde(rename = "tool_result")]
    ToolResult {
        result: serde_json::Value,
        is_error: Option<bool>,
        session_id: Option<String>,
    },
    #[serde(rename = "result")]
    Result {
        subtype: Option<String>,
        is_error: Option<bool>,
        duration_ms: Option<u64>,
        result: Option<serde_json::Value>,
    },
    // Catch-all for unknown message types
    #[serde(other)]
    Unknown,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
pub struct ClaudeMessage {
    pub id: Option<String>,
    #[serde(rename = "type")]
    pub message_type: Option<String>,
    pub role: String,
    pub model: Option<String>,
    pub content: Vec<ClaudeContentItem>,
    pub stop_reason: Option<String>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(tag = "type")]
pub enum ClaudeContentItem {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "thinking")]
    Thinking { thinking: String },
    #[serde(rename = "tool_use")]
    ToolUse {
        id: String,
        #[serde(flatten)]
        tool_data: ClaudeToolData,
    },
    #[serde(rename = "tool_result")]
    ToolResult {
        tool_use_id: String,
        content: serde_json::Value,
        is_error: Option<bool>,
    },
}

/// Structured tool data for Claude tools based on real samples
#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(tag = "name", content = "input")]
pub enum ClaudeToolData {
    TodoWrite {
        todos: Vec<ClaudeTodoItem>,
    },
    Task {
        subagent_type: String,
        description: Option<String>,
        prompt: String,
    },
    Glob {
        pattern: String,
        #[serde(default)]
        path: Option<String>,
    },
    LS {
        path: String,
    },
    Read {
        file_path: String,
    },
    Bash {
        command: String,
        #[serde(default)]
        description: Option<String>,
    },
    Grep {
        pattern: String,
        #[serde(default)]
        output_mode: Option<String>,
        #[serde(default)]
        path: Option<String>,
    },
    ExitPlanMode {
        plan: String,
    },
    Edit {
        file_path: String,
        old_string: Option<String>,
        new_string: Option<String>,
    },
    MultiEdit {
        file_path: String,
        edits: Vec<ClaudeEditItem>,
    },
    Write {
        file_path: String,
        content: String,
    },
    NotebookEdit {
        notebook_path: String,
        new_source: String,
        edit_mode: String,
        #[serde(default)]
        cell_id: Option<String>,
    },
    WebFetch {
        url: String,
        #[serde(default)]
        prompt: Option<String>,
    },
    WebSearch {
        query: String,
    },
    #[serde(untagged)]
    Unknown {
        #[serde(flatten)]
        data: std::collections::HashMap<String, serde_json::Value>,
    },
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
pub struct ClaudeTodoItem {
    #[serde(default)]
    pub id: Option<String>,
    pub content: String,
    pub status: String,
    #[serde(default)]
    pub priority: Option<String>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
pub struct ClaudeEditItem {
    pub old_string: Option<String>,
    pub new_string: Option<String>,
}

impl ClaudeToolData {
    pub fn get_name(&self) -> &str {
        match self {
            ClaudeToolData::TodoWrite { .. } => "TodoWrite",
            ClaudeToolData::Task { .. } => "Task",
            ClaudeToolData::Glob { .. } => "Glob",
            ClaudeToolData::LS { .. } => "LS",
            ClaudeToolData::Read { .. } => "Read",
            ClaudeToolData::Bash { .. } => "Bash",
            ClaudeToolData::Grep { .. } => "Grep",
            ClaudeToolData::ExitPlanMode { .. } => "ExitPlanMode",
            ClaudeToolData::Edit { .. } => "Edit",
            ClaudeToolData::MultiEdit { .. } => "MultiEdit",
            ClaudeToolData::Write { .. } => "Write",
            ClaudeToolData::NotebookEdit { .. } => "NotebookEdit",
            ClaudeToolData::WebFetch { .. } => "WebFetch",
            ClaudeToolData::WebSearch { .. } => "WebSearch",
            ClaudeToolData::Unknown { data } => data
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_claude_json_parsing() {
        let system_json =
            r#"{"type":"system","subtype":"init","session_id":"abc123","model":"claude-sonnet-4"}"#;
        let parsed: ClaudeJson = serde_json::from_str(system_json).unwrap();

        assert_eq!(
            ClaudeLogProcessor::extract_session_id(&parsed),
            Some("abc123".to_string())
        );

        let entries = ClaudeLogProcessor::new().to_normalized_entries(&parsed, "");
        assert_eq!(entries.len(), 0);

        let assistant_json = r#"
        {"type":"assistant","message":{"type":"message","role":"assistant","model":"claude-sonnet-4-20250514","content":[{"type":"text","text":"Hi! I'm Claude Code."}]}}"#;
        let parsed: ClaudeJson = serde_json::from_str(assistant_json).unwrap();
        let entries = ClaudeLogProcessor::new().to_normalized_entries(&parsed, "");

        assert_eq!(entries.len(), 2);
        assert!(matches!(
            entries[0].entry_type,
            NormalizedEntryType::SystemMessage
        ));
        assert_eq!(
            entries[0].content,
            "System initialized with model: claude-sonnet-4-20250514"
        );
    }

    #[test]
    fn test_assistant_message_parsing() {
        let assistant_json = r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Hello world"}]},"session_id":"abc123"}"#;
        let parsed: ClaudeJson = serde_json::from_str(assistant_json).unwrap();

        let entries = ClaudeLogProcessor::new().to_normalized_entries(&parsed, "");
        assert_eq!(entries.len(), 1);
        assert!(matches!(
            entries[0].entry_type,
            NormalizedEntryType::AssistantMessage
        ));
        assert_eq!(entries[0].content, "Hello world");
    }

    #[test]
    fn test_result_message_ignored() {
        let result_json = r#"{"type":"result","subtype":"success","is_error":false,"duration_ms":6059,"result":"Final result"}"#;
        let parsed: ClaudeJson = serde_json::from_str(result_json).unwrap();

        let entries = ClaudeLogProcessor::new().to_normalized_entries(&parsed, "");
        assert_eq!(entries.len(), 0); // Should be ignored like in old implementation
    }

    #[test]
    fn test_thinking_content() {
        let thinking_json = r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"thinking","thinking":"Let me think about this..."}]}}"#;
        let parsed: ClaudeJson = serde_json::from_str(thinking_json).unwrap();

        let entries = ClaudeLogProcessor::new().to_normalized_entries(&parsed, "");
        assert_eq!(entries.len(), 1);
        assert!(matches!(
            entries[0].entry_type,
            NormalizedEntryType::Thinking
        ));
        assert_eq!(entries[0].content, "Let me think about this...");
    }

    #[test]
    fn test_todo_tool_content_extraction() {
        // Test TodoWrite with actual todo list
        let todo_data = ClaudeToolData::TodoWrite {
            todos: vec![
                ClaudeTodoItem {
                    id: Some("1".to_string()),
                    content: "Fix the navigation bug".to_string(),
                    status: "completed".to_string(),
                    priority: Some("high".to_string()),
                },
                ClaudeTodoItem {
                    id: Some("2".to_string()),
                    content: "Add user authentication".to_string(),
                    status: "in_progress".to_string(),
                    priority: Some("medium".to_string()),
                },
                ClaudeTodoItem {
                    id: Some("3".to_string()),
                    content: "Write documentation".to_string(),
                    status: "pending".to_string(),
                    priority: Some("low".to_string()),
                },
            ],
        };

        let action_type = ClaudeLogProcessor::extract_action_type(&todo_data, "/tmp/test-worktree");
        let result = ClaudeLogProcessor::generate_concise_content(
            &todo_data,
            &action_type,
            "/tmp/test-worktree",
        );

        assert!(result.contains("TODO List:"));
        assert!(result.contains("✅ Fix the navigation bug (high)"));
        assert!(result.contains("🔄 Add user authentication (medium)"));
        assert!(result.contains("⏳ Write documentation (low)"));
    }

    #[test]
    fn test_todo_tool_empty_list() {
        // Test TodoWrite with empty todo list
        let empty_data = ClaudeToolData::TodoWrite { todos: vec![] };

        let action_type =
            ClaudeLogProcessor::extract_action_type(&empty_data, "/tmp/test-worktree");
        let result = ClaudeLogProcessor::generate_concise_content(
            &empty_data,
            &action_type,
            "/tmp/test-worktree",
        );

        assert_eq!(result, "Managing TODO list");
    }

    #[test]
    fn test_glob_tool_content_extraction() {
        // Test Glob with pattern and path
        let glob_data = ClaudeToolData::Glob {
            pattern: "**/*.ts".to_string(),
            path: Some("/tmp/test-worktree/src".to_string()),
        };

        let action_type = ClaudeLogProcessor::extract_action_type(&glob_data, "/tmp/test-worktree");
        let result = ClaudeLogProcessor::generate_concise_content(
            &glob_data,
            &action_type,
            "/tmp/test-worktree",
        );

        assert_eq!(result, "`**/*.ts`");
    }

    #[test]
    fn test_glob_tool_pattern_only() {
        // Test Glob with pattern only
        let glob_data = ClaudeToolData::Glob {
            pattern: "*.js".to_string(),
            path: None,
        };

        let action_type = ClaudeLogProcessor::extract_action_type(&glob_data, "/tmp/test-worktree");
        let result = ClaudeLogProcessor::generate_concise_content(
            &glob_data,
            &action_type,
            "/tmp/test-worktree",
        );

        assert_eq!(result, "`*.js`");
    }

    #[test]
    fn test_ls_tool_content_extraction() {
        // Test LS with path
        let ls_data = ClaudeToolData::LS {
            path: "/tmp/test-worktree/components".to_string(),
        };

        let action_type = ClaudeLogProcessor::extract_action_type(&ls_data, "/tmp/test-worktree");
        let result = ClaudeLogProcessor::generate_concise_content(
            &ls_data,
            &action_type,
            "/tmp/test-worktree",
        );

        assert_eq!(result, "List directory: `components`");
    }

    #[test]
    fn test_path_relative_conversion() {
        // Test with relative path (should remain unchanged)
        let relative_result = make_path_relative("src/main.rs", "/tmp/test-worktree");
        assert_eq!(relative_result, "src/main.rs");

        // Test with absolute path (should become relative if possible)
        let test_worktree = "/tmp/test-worktree";
        let absolute_path = format!("{test_worktree}/src/main.rs");
        let absolute_result = make_path_relative(&absolute_path, test_worktree);
        assert_eq!(absolute_result, "src/main.rs");
    }

    #[tokio::test]
    async fn test_streaming_patch_generation() {
        use std::sync::Arc;

        use utils::msg_store::MsgStore;

        let executor = ClaudeCode::new();
        let msg_store = Arc::new(MsgStore::new());
        let current_dir = std::path::PathBuf::from("/tmp/test-worktree");

        // Push some test messages
        msg_store.push_stdout(
            r#"{"type":"system","subtype":"init","session_id":"test123"}"#.to_string(),
        );
        msg_store.push_stdout(r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Hello"}]}}"#.to_string());
        msg_store.push_finished();

        // Start normalization (this spawns async task)
        executor.normalize_logs(msg_store.clone(), &current_dir);

        // Give some time for async processing
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        // Check that the history now contains patch messages
        let history = msg_store.get_history();
        let patch_count = history
            .iter()
            .filter(|msg| matches!(msg, utils::log_msg::LogMsg::JsonPatch(_)))
            .count();
        assert!(
            patch_count > 0,
            "Expected JsonPatch messages to be generated from streaming processing"
        );
    }

    #[test]
    fn test_session_id_extraction() {
        let system_json = r#"{"type":"system","session_id":"test-session-123"}"#;
        let parsed: ClaudeJson = serde_json::from_str(system_json).unwrap();

        assert_eq!(
            ClaudeLogProcessor::extract_session_id(&parsed),
            Some("test-session-123".to_string())
        );

        let tool_use_json =
            r#"{"type":"tool_use","tool_name":"read","input":{},"session_id":"another-session"}"#;
        let parsed_tool: ClaudeJson = serde_json::from_str(tool_use_json).unwrap();

        assert_eq!(
            ClaudeLogProcessor::extract_session_id(&parsed_tool),
            Some("another-session".to_string())
        );
    }

    #[test]
    fn test_tool_result_parsing_ignored() {
        let tool_result_json = r#"{"type":"tool_result","result":"File content here","is_error":false,"session_id":"test123"}"#;
        let parsed: ClaudeJson = serde_json::from_str(tool_result_json).unwrap();

        // Test session ID extraction from ToolResult still works
        assert_eq!(
            ClaudeLogProcessor::extract_session_id(&parsed),
            Some("test123".to_string())
        );

        // ToolResult messages should be ignored (produce no entries) until proper support is added
        let entries = ClaudeLogProcessor::new().to_normalized_entries(&parsed, "");
        assert_eq!(entries.len(), 0);
    }

    #[test]
    fn test_content_item_tool_result_ignored() {
        let assistant_with_tool_result = r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_result","tool_use_id":"tool_123","content":"Operation completed","is_error":false}]}}"#;
        let parsed: ClaudeJson = serde_json::from_str(assistant_with_tool_result).unwrap();

        // ToolResult content items should be ignored (produce no entries) until proper support is added
        let entries = ClaudeLogProcessor::new().to_normalized_entries(&parsed, "");
        assert_eq!(entries.len(), 0);
    }

    #[test]
    fn test_mixed_content_with_thinking_ignores_tool_result() {
        let complex_assistant_json = r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"thinking","thinking":"I need to read the file first"},{"type":"text","text":"I'll help you with that"},{"type":"tool_result","tool_use_id":"tool_789","content":"Success","is_error":false}]}}"#;
        let parsed: ClaudeJson = serde_json::from_str(complex_assistant_json).unwrap();

        let entries = ClaudeLogProcessor::new().to_normalized_entries(&parsed, "");
        // Only thinking and text entries should be processed, tool_result ignored
        assert_eq!(entries.len(), 2);

        // Check thinking entry
        assert!(matches!(
            entries[0].entry_type,
            NormalizedEntryType::Thinking
        ));
        assert_eq!(entries[0].content, "I need to read the file first");

        // Check assistant message
        assert!(matches!(
            entries[1].entry_type,
            NormalizedEntryType::AssistantMessage
        ));
        assert_eq!(entries[1].content, "I'll help you with that");

        // ToolResult entry is ignored - no third entry
    }

    #[test]
    fn test_claude_executor_command_building() {
        // Test default executor produces correct command
        let executor = ClaudeCode::new();
        let command = executor.command_builder.build_initial();
        assert!(command.contains("npx -y @anthropic-ai/claude-code@latest"));
        assert!(command.contains("-p"));
        assert!(command.contains("--dangerously-skip-permissions"));
        assert!(command.contains("--verbose"));
        assert!(command.contains("--output-format=stream-json"));

        // Test follow-up command
        let follow_up = executor
            .command_builder
            .build_follow_up(&["--resume".to_string(), "test-session-123".to_string()]);
        assert!(follow_up.contains("--resume test-session-123"));
        assert!(follow_up.contains("-p")); // Still contains base params
    }
}
