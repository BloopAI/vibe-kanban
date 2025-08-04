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
    executors::{ExecutorError, StandardCodingAgentExecutor},
    logs::{
        ActionType, NormalizedEntry, NormalizedEntryType,
        stderr_processor::normalize_stderr_logs,
        utils::{EntryIndexProvider, patch::ConversationPatch},
    },
};

/// Command builder for Claude CLI with configurable slots
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ClaudeCommandBuilder {
    /// Base executable (e.g., "npx -y @anthropic-ai/claude-code@latest", "claude", etc.)
    pub executable: String,
    /// Permission mode (e.g., "--dangerously-skip-permissions", "--permission-mode=plan")
    pub permissions: Option<String>,
    /// Additional custom parameters
    pub extra_params: Vec<String>,
}

impl Default for ClaudeCommandBuilder {
    fn default() -> Self {
        Self {
            executable: "npx -y @anthropic-ai/claude-code@latest".to_string(),
            permissions: Some("--dangerously-skip-permissions".to_string()),
            extra_params: vec![],
        }
    }
}

impl ClaudeCommandBuilder {
    /// Create a new builder with default values
    pub fn new() -> Self {
        Self::default()
    }

    /// Set the executable
    pub fn executable<S: Into<String>>(mut self, executable: S) -> Self {
        self.executable = executable.into();
        self
    }

    /// Set permission mode
    pub fn permissions<S: Into<String>>(mut self, permissions: Option<S>) -> Self {
        self.permissions = permissions.map(|p| p.into());
        self
    }

    /// Add extra parameters
    pub fn extra_params<I>(mut self, params: I) -> Self
    where
        I: IntoIterator,
        I::Item: Into<String>,
    {
        self.extra_params = params.into_iter().map(|p| p.into()).collect();
        self
    }

    /// Build the base command
    pub fn build(&self) -> String {
        let mut parts = vec![self.executable.clone(), "-p".to_string()];

        if let Some(ref permissions) = self.permissions {
            parts.push(permissions.clone());
        }

        // Always add verbose and output format
        parts.push("--verbose".to_string());
        parts.push("--output-format=stream-json".to_string());

        parts.extend(self.extra_params.clone());
        parts.join(" ")
    }
}

/// An executor that uses Claude CLI to process tasks
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export)]
pub struct ClaudeCode {
    executor_type: String,
    base_command: String,
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
        let claude_command = self.base_command.clone();

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
        // Append --resume {session_id} to the base command
        let claude_command = format!("{} --resume {}", self.base_command, session_id);

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
        let builder = ClaudeCommandBuilder::default();
        Self {
            executor_type: "Claude Code".to_string(),
            base_command: builder.build(),
        }
    }

    /// Create a new Claude executor in plan mode with watchkill script
    pub fn new_plan_mode() -> Self {
        let builder = ClaudeCommandBuilder::new().permissions(Some("--permission-mode=plan"));
        let base_command = builder.build();
        let command = create_watchkill_script(&base_command);
        Self {
            executor_type: "ClaudePlan".to_string(),
            base_command: command,
        }
    }

    /// Create a new Claude executor with custom base command
    pub fn with_command(executor_type: String, base_command: String) -> Self {
        Self {
            executor_type,
            base_command,
        }
    }
}

fn create_watchkill_script(command: &str) -> String {
    let claude_plan_stop_indicator = concat!("Exit ", "plan mode?"); // Use concat!() as a workaround to avoid killing plan mode when this file is read.
    format!(
        r#"#!/usr/bin/env bash
set -euo pipefail

word="{}"
command="{}"

exit_code=0
while IFS= read -r line; do
    printf '%s\n' "$line"
    if [[ $line == *"$word"* ]]; then
        exit 0
    fi
done < <($command <&0 2>&1)

exit_code=${{PIPESTATUS[0]}}
exit "$exit_code"
"#,
        claude_plan_stop_indicator, command
    )
}

/// Handles log processing and interpretation for Claude executor
struct ClaudeLogProcessor;

impl ClaudeLogProcessor {
    /// Process raw logs and convert them to normalized entries with patches
    fn process_logs(
        _executor: &ClaudeCode,
        msg_store: Arc<MsgStore>,
        current_dir: &PathBuf,
        entry_index_provider: EntryIndexProvider,
    ) {
        let current_dir_clone = current_dir.clone();
        tokio::spawn(async move {
            let mut stream = msg_store.history_plus_stream().await;
            let mut buffer = String::new();
            let worktree_path = current_dir_clone.to_string_lossy().to_string();
            let mut session_id_extracted = false;

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

                    match serde_json::from_str::<ClaudeJson>(trimmed) {
                        Ok(claude_json) => {
                            // Extract session ID if present
                            if !session_id_extracted {
                                if let Some(session_id) = Self::extract_session_id(&claude_json) {
                                    msg_store.push_session_id(session_id);
                                    session_id_extracted = true;
                                }
                            }

                            // Convert to normalized entries and create patches
                            for entry in Self::to_normalized_entries(&claude_json, &worktree_path) {
                                let patch_id = entry_index_provider.next();
                                let patch = ConversationPatch::add(patch_id, entry);
                                msg_store.push_patch(patch);
                            }
                        }
                        Err(_) => {
                            // Handle non-JSON output as raw system message
                            if !trimmed.is_empty() {
                                let entry = NormalizedEntry {
                                    timestamp: None,
                                    entry_type: NormalizedEntryType::SystemMessage,
                                    content: format!("Raw output: {}", trimmed),
                                    metadata: None,
                                };

                                let patch_id = entry_index_provider.next();
                                let patch = ConversationPatch::add(patch_id, entry);
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
                let patch = ConversationPatch::add(patch_id, entry);
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
        claude_json: &ClaudeJson,
        worktree_path: &str,
    ) -> Vec<NormalizedEntry> {
        match claude_json {
            ClaudeJson::System { subtype, model, .. } => {
                let content = match (subtype.as_deref(), model.as_deref()) {
                    (Some("init"), Some(model)) => {
                        format!("System initialized with model: {}", model)
                    }
                    (Some(subtype), _) => format!("System: {}", subtype),
                    (None, Some(model)) => format!("System using model: {}", model),
                    _ => "System message".to_string(),
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
            ClaudeJson::ToolUse {
                tool_name, input, ..
            } => {
                let action_type = Self::extract_action_type(tool_name, input, worktree_path);
                let content =
                    Self::generate_concise_content(tool_name, input, &action_type, worktree_path);

                vec![NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::ToolUse {
                        tool_name: tool_name.clone(),
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
            ClaudeContentItem::ToolUse { name, input, .. } => {
                let action_type = Self::extract_action_type(name, input, worktree_path);
                let content =
                    Self::generate_concise_content(name, input, &action_type, worktree_path);

                Some(NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::ToolUse {
                        tool_name: name.clone(),
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

    /// Extract action type from tool usage for better categorization
    fn extract_action_type(
        tool_name: &str,
        input: &serde_json::Value,
        worktree_path: &str,
    ) -> ActionType {
        match tool_name.to_lowercase().as_str() {
            "read" => {
                if let Some(file_path) = input.get("file_path").and_then(|p| p.as_str()) {
                    ActionType::FileRead {
                        path: make_path_relative(file_path, worktree_path),
                    }
                } else {
                    ActionType::Other {
                        description: "File read operation".to_string(),
                    }
                }
            }
            "edit" | "write" | "multiedit" => {
                if let Some(file_path) = input.get("file_path").and_then(|p| p.as_str()) {
                    ActionType::FileWrite {
                        path: make_path_relative(file_path, worktree_path),
                    }
                } else if let Some(path) = input.get("path").and_then(|p| p.as_str()) {
                    ActionType::FileWrite {
                        path: make_path_relative(path, worktree_path),
                    }
                } else {
                    ActionType::Other {
                        description: "File write operation".to_string(),
                    }
                }
            }
            "bash" => {
                if let Some(command) = input.get("command").and_then(|c| c.as_str()) {
                    ActionType::CommandRun {
                        command: command.to_string(),
                    }
                } else {
                    ActionType::Other {
                        description: "Command execution".to_string(),
                    }
                }
            }
            "grep" => {
                if let Some(pattern) = input.get("pattern").and_then(|p| p.as_str()) {
                    ActionType::Search {
                        query: pattern.to_string(),
                    }
                } else {
                    ActionType::Other {
                        description: "Search operation".to_string(),
                    }
                }
            }
            "webfetch" => {
                if let Some(url) = input.get("url").and_then(|u| u.as_str()) {
                    ActionType::WebFetch {
                        url: url.to_string(),
                    }
                } else {
                    ActionType::Other {
                        description: "Web fetch operation".to_string(),
                    }
                }
            }
            "task" => {
                if let Some(description) = input.get("description").and_then(|d| d.as_str()) {
                    ActionType::TaskCreate {
                        description: description.to_string(),
                    }
                } else if let Some(prompt) = input.get("prompt").and_then(|p| p.as_str()) {
                    ActionType::TaskCreate {
                        description: prompt.to_string(),
                    }
                } else {
                    ActionType::Other {
                        description: "Task creation".to_string(),
                    }
                }
            }
            "exit_plan_mode" | "exitplanmode" | "exit-plan-mode" => {
                if let Some(plan) = input.get("plan").and_then(|p| p.as_str()) {
                    ActionType::PlanPresentation {
                        plan: plan.to_string(),
                    }
                } else {
                    ActionType::Other {
                        description: "Plan presentation".to_string(),
                    }
                }
            }
            _ => ActionType::Other {
                description: format!("Tool: {}", tool_name),
            },
        }
    }

    /// Generate concise, readable content for tool usage
    fn generate_concise_content(
        tool_name: &str,
        input: &serde_json::Value,
        action_type: &ActionType,
        worktree_path: &str,
    ) -> String {
        match action_type {
            ActionType::FileRead { path } => format!("`{}`", path),
            ActionType::FileWrite { path } => format!("`{}`", path),
            ActionType::CommandRun { command } => format!("`{}`", command),
            ActionType::Search { query } => format!("`{}`", query),
            ActionType::WebFetch { url } => format!("`{}`", url),
            ActionType::TaskCreate { description } => description.clone(),
            ActionType::PlanPresentation { plan } => plan.clone(),
            ActionType::Other { description: _ } => match tool_name.to_lowercase().as_str() {
                "todoread" | "todowrite" => {
                    if let Some(todos) = input.get("todos").and_then(|t| t.as_array()) {
                        let mut todo_items = Vec::new();
                        for todo in todos {
                            if let Some(content) = todo.get("content").and_then(|c| c.as_str()) {
                                let status = todo
                                    .get("status")
                                    .and_then(|s| s.as_str())
                                    .unwrap_or("pending");
                                let status_emoji = match status {
                                    "completed" => "✅",
                                    "in_progress" => "🔄",
                                    "pending" | "todo" => "⏳",
                                    _ => "📝",
                                };
                                let priority = todo
                                    .get("priority")
                                    .and_then(|p| p.as_str())
                                    .unwrap_or("medium");
                                todo_items
                                    .push(format!("{} {} ({})", status_emoji, content, priority));
                            }
                        }
                        if !todo_items.is_empty() {
                            format!("TODO List:\n{}", todo_items.join("\n"))
                        } else {
                            "Managing TODO list".to_string()
                        }
                    } else {
                        "Managing TODO list".to_string()
                    }
                }
                "ls" => {
                    if let Some(path) = input.get("path").and_then(|p| p.as_str()) {
                        let relative_path = make_path_relative(path, worktree_path);
                        if relative_path.is_empty() {
                            "List directory".to_string()
                        } else {
                            format!("List directory: `{}`", relative_path)
                        }
                    } else {
                        "List directory".to_string()
                    }
                }
                "glob" => {
                    let pattern = input.get("pattern").and_then(|p| p.as_str()).unwrap_or("*");
                    let path = input.get("path").and_then(|p| p.as_str());

                    if let Some(search_path) = path {
                        format!(
                            "Find files: `{}` in `{}`",
                            pattern,
                            make_path_relative(search_path, worktree_path)
                        )
                    } else {
                        format!("Find files: `{}`", pattern)
                    }
                }
                "codebase_search_agent" => {
                    if let Some(query) = input.get("query").and_then(|q| q.as_str()) {
                        format!("Search: {}", query)
                    } else {
                        "Codebase search".to_string()
                    }
                }
                _ => tool_name.to_string(),
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
        input: serde_json::Value,
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
        name: String,
        input: serde_json::Value,
    },
    #[serde(rename = "tool_result")]
    ToolResult {
        tool_use_id: String,
        content: serde_json::Value,
        is_error: Option<bool>,
    },
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

        let entries = ClaudeLogProcessor::to_normalized_entries(&parsed, "");
        assert_eq!(entries.len(), 1);
        assert!(matches!(
            entries[0].entry_type,
            NormalizedEntryType::SystemMessage
        ));
    }

    #[test]
    fn test_assistant_message_parsing() {
        let assistant_json = r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Hello world"}]},"session_id":"abc123"}"#;
        let parsed: ClaudeJson = serde_json::from_str(assistant_json).unwrap();

        let entries = ClaudeLogProcessor::to_normalized_entries(&parsed, "");
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

        let entries = ClaudeLogProcessor::to_normalized_entries(&parsed, "");
        assert_eq!(entries.len(), 0); // Should be ignored like in old implementation
    }

    #[test]
    fn test_thinking_content() {
        let thinking_json = r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"thinking","thinking":"Let me think about this..."}]}}"#;
        let parsed: ClaudeJson = serde_json::from_str(thinking_json).unwrap();

        let entries = ClaudeLogProcessor::to_normalized_entries(&parsed, "");
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
        let todo_input = serde_json::json!({
            "todos": [
                {
                    "id": "1",
                    "content": "Fix the navigation bug",
                    "status": "completed",
                    "priority": "high"
                },
                {
                    "id": "2",
                    "content": "Add user authentication",
                    "status": "in_progress",
                    "priority": "medium"
                },
                {
                    "id": "3",
                    "content": "Write documentation",
                    "status": "pending",
                    "priority": "low"
                }
            ]
        });

        let action_type =
            ClaudeLogProcessor::extract_action_type("TodoWrite", &todo_input, "/tmp/test-worktree");
        let result = ClaudeLogProcessor::generate_concise_content(
            "TodoWrite",
            &todo_input,
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
        let empty_input = serde_json::json!({
            "todos": []
        });

        let action_type = ClaudeLogProcessor::extract_action_type(
            "TodoWrite",
            &empty_input,
            "/tmp/test-worktree",
        );
        let result = ClaudeLogProcessor::generate_concise_content(
            "TodoWrite",
            &empty_input,
            &action_type,
            "/tmp/test-worktree",
        );

        assert_eq!(result, "Managing TODO list");
    }

    #[test]
    fn test_todo_tool_no_todos_field() {
        // Test TodoWrite with no todos field
        let no_todos_input = serde_json::json!({
            "other_field": "value"
        });

        let action_type = ClaudeLogProcessor::extract_action_type(
            "TodoWrite",
            &no_todos_input,
            "/tmp/test-worktree",
        );
        let result = ClaudeLogProcessor::generate_concise_content(
            "TodoWrite",
            &no_todos_input,
            &action_type,
            "/tmp/test-worktree",
        );

        assert_eq!(result, "Managing TODO list");
    }

    #[test]
    fn test_glob_tool_content_extraction() {
        // Test Glob with pattern and path
        let glob_input = serde_json::json!({
            "pattern": "**/*.ts",
            "path": "/tmp/test-worktree/src"
        });

        let action_type =
            ClaudeLogProcessor::extract_action_type("Glob", &glob_input, "/tmp/test-worktree");
        let result = ClaudeLogProcessor::generate_concise_content(
            "Glob",
            &glob_input,
            &action_type,
            "/tmp/test-worktree",
        );

        assert_eq!(result, "Find files: `**/*.ts` in `src`");
    }

    #[test]
    fn test_glob_tool_pattern_only() {
        // Test Glob with pattern only
        let glob_input = serde_json::json!({
            "pattern": "*.js"
        });

        let action_type =
            ClaudeLogProcessor::extract_action_type("Glob", &glob_input, "/tmp/test-worktree");
        let result = ClaudeLogProcessor::generate_concise_content(
            "Glob",
            &glob_input,
            &action_type,
            "/tmp/test-worktree",
        );

        assert_eq!(result, "Find files: `*.js`");
    }

    #[test]
    fn test_ls_tool_content_extraction() {
        // Test LS with path
        let ls_input = serde_json::json!({
            "path": "/tmp/test-worktree/components"
        });

        let action_type =
            ClaudeLogProcessor::extract_action_type("LS", &ls_input, "/tmp/test-worktree");
        let result = ClaudeLogProcessor::generate_concise_content(
            "LS",
            &ls_input,
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
        let absolute_path = format!("{}/src/main.rs", test_worktree);
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
        let entries = ClaudeLogProcessor::to_normalized_entries(&parsed, "");
        assert_eq!(entries.len(), 0);
    }

    #[test]
    fn test_content_item_tool_result_ignored() {
        let assistant_with_tool_result = r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_result","tool_use_id":"tool_123","content":"Operation completed","is_error":false}]}}"#;
        let parsed: ClaudeJson = serde_json::from_str(assistant_with_tool_result).unwrap();

        // ToolResult content items should be ignored (produce no entries) until proper support is added
        let entries = ClaudeLogProcessor::to_normalized_entries(&parsed, "");
        assert_eq!(entries.len(), 0);
    }

    #[test]
    fn test_mixed_content_with_thinking_ignores_tool_result() {
        let complex_assistant_json = r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"thinking","thinking":"I need to read the file first"},{"type":"text","text":"I'll help you with that"},{"type":"tool_result","tool_use_id":"tool_789","content":"Success","is_error":false}]}}"#;
        let parsed: ClaudeJson = serde_json::from_str(complex_assistant_json).unwrap();

        let entries = ClaudeLogProcessor::to_normalized_entries(&parsed, "");
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
    fn test_command_builder() {
        // Test default builder produces correct command with crucial -p parameter
        let builder = ClaudeCommandBuilder::default();
        let command = builder.build();
        assert_eq!(
            command,
            "npx -y @anthropic-ai/claude-code@latest -p --dangerously-skip-permissions --verbose --output-format=stream-json"
        );

        // Verify -p parameter is always included
        assert!(command.contains("-p"));
        assert!(command.contains("--verbose"));
        assert!(command.contains("--output-format=stream-json"));
        assert!(command.contains("--dangerously-skip-permissions"));

        // Test plan mode builder produces correct command
        let plan_builder = ClaudeCommandBuilder::new().permissions(Some("--permission-mode=plan"));
        let plan_command = plan_builder.build();
        assert_eq!(
            plan_command,
            "npx -y @anthropic-ai/claude-code@latest -p --permission-mode=plan --verbose --output-format=stream-json"
        );
        assert!(plan_command.contains("-p"));

        // Test custom executable
        let custom_builder = ClaudeCommandBuilder::new()
            .executable("claude")
            .permissions(Some("--custom-permission"));
        let custom_command = custom_builder.build();
        assert_eq!(
            custom_command,
            "claude -p --custom-permission --verbose --output-format=stream-json"
        );
        assert!(custom_command.contains("-p"));
    }
}
