use std::path::Path;

use async_trait::async_trait;
use command_group::{AsyncCommandGroup, AsyncGroupChild};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    executor::{
        ActionType, Executor, ExecutorError, NormalizedConversation, NormalizedEntry,
        NormalizedEntryType,
    },
    models::task::Task,
    utils::shell::get_shell_command,
};

/// An executor that uses Amp to process tasks
pub struct AmpExecutor;

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(tag = "type")]
pub enum AmpJson {
    #[serde(rename = "messages")]
    Messages {
        messages: Vec<(usize, AmpMessage)>,
        #[serde(rename = "toolResults")]
        tool_results: Vec<serde_json::Value>,
    },
    #[serde(rename = "initial")]
    Initial {
        #[serde(rename = "threadID")]
        thread_id: Option<String>,
    },
    #[serde(rename = "token-usage")]
    TokenUsage(serde_json::Value),
    #[serde(rename = "state")]
    State { state: String },
    #[serde(rename = "shutdown")]
    Shutdown,
    #[serde(rename = "tool-status")]
    ToolStatus(serde_json::Value),
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, Eq)]
pub struct AmpMessage {
    pub role: String,
    pub content: Vec<AmpContentItem>,
    pub state: Option<serde_json::Value>,
    pub meta: Option<AmpMeta>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, Eq)]
pub struct AmpMeta {
    #[serde(rename = "sentAt")]
    pub sent_at: u64,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(tag = "type")]
pub enum AmpContentItem {
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
        #[serde(rename = "toolUseID")]
        tool_use_id: String,
        run: serde_json::Value,
    },
}

impl AmpJson {
    pub fn should_process(&self) -> bool {
        matches!(self, AmpJson::Messages { .. })
    }

    pub fn extract_session_id(&self) -> Option<String> {
        match self {
            AmpJson::Initial { thread_id } => thread_id.clone(),
            _ => None,
        }
    }

    pub fn has_streaming_content(&self) -> bool {
        match self {
            AmpJson::Messages { messages, .. } => messages.iter().any(|(_index, message)| {
                if let Some(state) = &message.state {
                    if let Some(state_type) = state.get("type").and_then(|t| t.as_str()) {
                        state_type == "streaming"
                    } else {
                        false
                    }
                } else {
                    false
                }
            }),
            _ => false,
        }
    }

    pub fn to_normalized_entries(
        &self,
        executor: &AmpExecutor,
        worktree_path: &str,
    ) -> Vec<NormalizedEntry> {
        match self {
            AmpJson::Messages { messages, .. } => {
                if self.has_streaming_content() {
                    return vec![];
                }

                let mut entries = Vec::new();
                for (_index, message) in messages {
                    let role = &message.role;
                    for content_item in &message.content {
                        if let Some(entry) =
                            content_item.to_normalized_entry(role, message, executor, worktree_path)
                        {
                            entries.push(entry);
                        }
                    }
                }
                entries
            }
            _ => vec![],
        }
    }
}

impl AmpContentItem {
    pub fn to_normalized_entry(
        &self,
        role: &str,
        message: &AmpMessage,
        executor: &AmpExecutor,
        worktree_path: &str,
    ) -> Option<NormalizedEntry> {
        use serde_json::Value;

        let timestamp = message.meta.as_ref().map(|meta| meta.sent_at.to_string());

        match self {
            AmpContentItem::Text { text } => {
                let entry_type = match role {
                    "user" => NormalizedEntryType::UserMessage,
                    "assistant" => NormalizedEntryType::AssistantMessage,
                    _ => return None,
                };
                Some(NormalizedEntry {
                    timestamp,
                    entry_type,
                    content: text.clone(),
                    metadata: Some(serde_json::to_value(self).unwrap_or(Value::Null)),
                })
            }
            AmpContentItem::Thinking { thinking } => Some(NormalizedEntry {
                timestamp,
                entry_type: NormalizedEntryType::Thinking,
                content: thinking.clone(),
                metadata: Some(serde_json::to_value(self).unwrap_or(Value::Null)),
            }),
            AmpContentItem::ToolUse { name, input, .. } => {
                let action_type = executor.extract_action_type(name, input, worktree_path);
                let content =
                    executor.generate_concise_content(name, input, &action_type, worktree_path);

                Some(NormalizedEntry {
                    timestamp,
                    entry_type: NormalizedEntryType::ToolUse {
                        tool_name: name.clone(),
                        action_type,
                    },
                    content,
                    metadata: Some(serde_json::to_value(self).unwrap_or(Value::Null)),
                })
            }
            AmpContentItem::ToolResult { .. } => None,
        }
    }
}

#[async_trait]
impl Executor for AmpExecutor {
    async fn spawn(
        &self,
        pool: &sqlx::SqlitePool,
        task_id: Uuid,
        worktree_path: &str,
    ) -> Result<AsyncGroupChild, ExecutorError> {
        // Get the task to fetch its description
        let task = Task::find_by_id(pool, task_id)
            .await?
            .ok_or(ExecutorError::TaskNotFound)?;

        use std::process::Stdio;

        use tokio::{io::AsyncWriteExt, process::Command};

        let prompt = if let Some(task_description) = task.description {
            format!(
                r#"project_id: {}
            
Task title: {}
Task description: {}"#,
                task.project_id, task.title, task_description
            )
        } else {
            format!(
                r#"project_id: {}
            
Task title: {}"#,
                task.project_id, task.title
            )
        };

        // Use shell command for cross-platform compatibility
        let (shell_cmd, shell_arg) = get_shell_command();
        // --format=jsonl is deprecated in latest versions of Amp CLI
        let amp_command = "npx @sourcegraph/amp@0.0.1752148945-gd8844f --format=jsonl";

        let mut command = Command::new(shell_cmd);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped()) // <-- open a pipe
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(worktree_path)
            .arg(shell_arg)
            .arg(amp_command);

        let mut child = command
            .group_spawn() // Create new process group so we can kill entire tree
            .map_err(|e| {
                crate::executor::SpawnContext::from_command(&command, "Amp")
                    .with_task(task_id, Some(task.title.clone()))
                    .with_context("Amp CLI execution for new task")
                    .spawn_error(e)
            })?;

        // feed the prompt in, then close the pipe so `amp` sees EOF
        if let Some(mut stdin) = child.inner().stdin.take() {
            stdin.write_all(prompt.as_bytes()).await.unwrap();
            stdin.shutdown().await.unwrap(); // or `drop(stdin);`
        }

        Ok(child)
    }

    async fn spawn_followup(
        &self,
        _pool: &sqlx::SqlitePool,
        _task_id: Uuid,
        session_id: &str,
        prompt: &str,
        worktree_path: &str,
    ) -> Result<AsyncGroupChild, ExecutorError> {
        use std::process::Stdio;

        use tokio::{io::AsyncWriteExt, process::Command};

        // Use shell command for cross-platform compatibility
        let (shell_cmd, shell_arg) = get_shell_command();
        let amp_command = format!(
            "npx @sourcegraph/amp@0.0.1752148945-gd8844f threads continue {} --format=jsonl",
            session_id
        );

        let mut command = Command::new(shell_cmd);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(worktree_path)
            .arg(shell_arg)
            .arg(&amp_command);

        let mut child = command.group_spawn().map_err(|e| {
            crate::executor::SpawnContext::from_command(&command, "Amp")
                .with_context(format!(
                    "Amp CLI followup execution for thread {}",
                    session_id
                ))
                .spawn_error(e)
        })?;

        // Feed the prompt in, then close the pipe so amp sees EOF
        if let Some(mut stdin) = child.inner().stdin.take() {
            stdin.write_all(prompt.as_bytes()).await.map_err(|e| {
                crate::executor::SpawnContext::from_command(&command, "Amp")
                    .with_context(format!(
                        "Failed to write prompt to Amp CLI stdin for thread {}",
                        session_id
                    ))
                    .spawn_error(e)
            })?;
            stdin.shutdown().await.map_err(|e| {
                crate::executor::SpawnContext::from_command(&command, "Amp")
                    .with_context(format!(
                        "Failed to close Amp CLI stdin for thread {}",
                        session_id
                    ))
                    .spawn_error(e)
            })?;
        }

        Ok(child)
    }

    fn normalize_logs(
        &self,
        logs: &str,
        worktree_path: &str,
    ) -> Result<NormalizedConversation, String> {
        let mut entries = Vec::new();
        let mut session_id = None;

        for line in logs.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            // Try to parse as AmpMessage
            let amp_message: AmpJson = match serde_json::from_str(trimmed) {
                Ok(msg) => msg,
                Err(_) => {
                    // If line isn't valid JSON, add it as raw text
                    entries.push(NormalizedEntry {
                        timestamp: None,
                        entry_type: NormalizedEntryType::SystemMessage,
                        content: format!("Raw output: {}", trimmed),
                        metadata: None,
                    });
                    continue;
                }
            };

            // Extract session ID if available
            if session_id.is_none() {
                if let Some(id) = amp_message.extract_session_id() {
                    session_id = Some(id);
                }
            }

            // Process the message if it's a type we care about
            if amp_message.should_process() {
                let new_entries = amp_message.to_normalized_entries(self, worktree_path);
                entries.extend(new_entries);
            }
        }

        Ok(NormalizedConversation {
            entries,
            session_id,
            executor_type: "amp".to_string(),
            prompt: None,
            summary: None,
        })
    }
}

impl AmpExecutor {
    /// Convert absolute paths to relative paths based on worktree path
    fn make_path_relative(&self, path: &str, worktree_path: &str) -> String {
        let path_obj = Path::new(path);
        let worktree_obj = Path::new(worktree_path);

        // If path is already relative, return as is
        if path_obj.is_relative() {
            return path.to_string();
        }

        // Try to make path relative to worktree path
        if let Ok(relative_path) = path_obj.strip_prefix(worktree_obj) {
            return relative_path.to_string_lossy().to_string();
        }

        // If we can't make it relative, return the original path
        path.to_string()
    }

    fn generate_concise_content(
        &self,
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
            ActionType::PlanPresentation { plan } => format!("Plan Presentation: `{}`", plan),
            ActionType::TaskCreate { description } => description.clone(),
            ActionType::Other { description: _ } => {
                // For other tools, try to extract key information or fall back to tool name
                match tool_name.to_lowercase().as_str() {
                    "todowrite" | "todoread" | "todo_write" | "todo_read" => {
                        if let Some(todos) = input.get("todos").and_then(|t| t.as_array()) {
                            let mut todo_items = Vec::new();
                            for todo in todos {
                                if let (Some(content), Some(status)) = (
                                    todo.get("content").and_then(|c| c.as_str()),
                                    todo.get("status").and_then(|s| s.as_str()),
                                ) {
                                    let emoji = match status {
                                        "completed" => "✅",
                                        "in_progress" | "in-progress" => "🔄",
                                        "pending" | "todo" => "⏳",
                                        _ => "📝",
                                    };
                                    let priority = todo
                                        .get("priority")
                                        .and_then(|p| p.as_str())
                                        .unwrap_or("medium");
                                    todo_items
                                        .push(format!("{} {} ({})", emoji, content, priority));
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
                            let relative_path = self.make_path_relative(path, worktree_path);
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

                        if let Some(path) = path {
                            let relative_path = self.make_path_relative(path, worktree_path);
                            format!("Find files: `{}` in `{}`", pattern, relative_path)
                        } else {
                            format!("Find files: `{}`", pattern)
                        }
                    }
                    "grep" => {
                        let pattern = input.get("pattern").and_then(|p| p.as_str()).unwrap_or("");
                        let include = input.get("include").and_then(|i| i.as_str());
                        let path = input.get("path").and_then(|p| p.as_str());

                        let mut parts = vec![format!("Search: `{}`", pattern)];
                        if let Some(include) = include {
                            parts.push(format!("in `{}`", include));
                        }
                        if let Some(path) = path {
                            let relative_path = self.make_path_relative(path, worktree_path);
                            parts.push(format!("at `{}`", relative_path));
                        }
                        parts.join(" ")
                    }
                    "read" => {
                        if let Some(file_path) = input.get("file_path").and_then(|p| p.as_str()) {
                            let relative_path = self.make_path_relative(file_path, worktree_path);
                            format!("Read file: `{}`", relative_path)
                        } else {
                            "Read file".to_string()
                        }
                    }
                    "write" => {
                        if let Some(file_path) = input.get("file_path").and_then(|p| p.as_str()) {
                            let relative_path = self.make_path_relative(file_path, worktree_path);
                            format!("Write file: `{}`", relative_path)
                        } else {
                            "Write file".to_string()
                        }
                    }
                    "edit" => {
                        if let Some(file_path) = input.get("file_path").and_then(|p| p.as_str()) {
                            let relative_path = self.make_path_relative(file_path, worktree_path);
                            format!("Edit file: `{}`", relative_path)
                        } else {
                            "Edit file".to_string()
                        }
                    }
                    "multiedit" => {
                        if let Some(file_path) = input.get("file_path").and_then(|p| p.as_str()) {
                            let relative_path = self.make_path_relative(file_path, worktree_path);
                            format!("Multi-edit file: `{}`", relative_path)
                        } else {
                            "Multi-edit file".to_string()
                        }
                    }
                    "bash" => {
                        if let Some(command) = input.get("command").and_then(|c| c.as_str()) {
                            format!("Run command: `{}`", command)
                        } else {
                            "Run command".to_string()
                        }
                    }
                    "webfetch" => {
                        if let Some(url) = input.get("url").and_then(|u| u.as_str()) {
                            format!("Fetch URL: `{}`", url)
                        } else {
                            "Fetch URL".to_string()
                        }
                    }
                    "task" => {
                        if let Some(description) = input.get("description").and_then(|d| d.as_str())
                        {
                            format!("Task: {}", description)
                        } else if let Some(prompt) = input.get("prompt").and_then(|p| p.as_str()) {
                            format!("Task: {}", prompt)
                        } else {
                            "Task".to_string()
                        }
                    }
                    _ => tool_name.to_string(),
                }
            }
        }
    }

    fn extract_action_type(
        &self,
        tool_name: &str,
        input: &serde_json::Value,
        worktree_path: &str,
    ) -> ActionType {
        match tool_name.to_lowercase().as_str() {
            "read_file" | "read" => {
                if let Some(path) = input.get("path").and_then(|p| p.as_str()) {
                    ActionType::FileRead {
                        path: self.make_path_relative(path, worktree_path),
                    }
                } else if let Some(file_path) = input.get("file_path").and_then(|p| p.as_str()) {
                    ActionType::FileRead {
                        path: self.make_path_relative(file_path, worktree_path),
                    }
                } else {
                    ActionType::Other {
                        description: "File read operation".to_string(),
                    }
                }
            }
            "edit_file" | "write" | "create_file" | "edit" | "multiedit" => {
                if let Some(path) = input.get("path").and_then(|p| p.as_str()) {
                    ActionType::FileWrite {
                        path: self.make_path_relative(path, worktree_path),
                    }
                } else if let Some(file_path) = input.get("file_path").and_then(|p| p.as_str()) {
                    ActionType::FileWrite {
                        path: self.make_path_relative(file_path, worktree_path),
                    }
                } else {
                    ActionType::Other {
                        description: "File write operation".to_string(),
                    }
                }
            }
            "bash" | "run_command" => {
                if let Some(cmd) = input.get("cmd").and_then(|c| c.as_str()) {
                    ActionType::CommandRun {
                        command: cmd.to_string(),
                    }
                } else if let Some(command) = input.get("command").and_then(|c| c.as_str()) {
                    ActionType::CommandRun {
                        command: command.to_string(),
                    }
                } else {
                    ActionType::Other {
                        description: "Command execution".to_string(),
                    }
                }
            }
            "grep" | "search" => {
                if let Some(pattern) = input.get("pattern").and_then(|p| p.as_str()) {
                    ActionType::Search {
                        query: pattern.to_string(),
                    }
                } else if let Some(query) = input.get("query").and_then(|q| q.as_str()) {
                    ActionType::Search {
                        query: query.to_string(),
                    }
                } else {
                    ActionType::Other {
                        description: "Search operation".to_string(),
                    }
                }
            }
            "web_fetch" | "webfetch" => {
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
            "glob" => ActionType::Other {
                description: "File pattern search".to_string(),
            },
            "ls" => ActionType::Other {
                description: "List directory".to_string(),
            },
            "todowrite" | "todoread" | "todo_write" | "todo_read" => ActionType::Other {
                description: "Manage TODO list".to_string(),
            },
            _ => ActionType::Other {
                description: format!("Tool: {}", tool_name),
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_filter_streaming_messages() {
        // Test logs that simulate the actual normalize_logs behavior
        let amp_executor = AmpExecutor;
        let logs = r#"{"type":"messages","messages":[[7,{"role":"assistant","content":[{"type":"text","text":"Created all three files: test1.txt, test2.txt, and test3.txt"}],"state":{"type":"streaming"}}]],"toolResults":[]}
{"type":"messages","messages":[[7,{"role":"assistant","content":[{"type":"text","text":"Created all three files: test1.txt, test2.txt, and test3.txt, each with a line of text."}],"state":{"type":"streaming"}}]],"toolResults":[]}
{"type":"messages","messages":[[7,{"role":"assistant","content":[{"type":"text","text":"Created all three files: test1.txt, test2.txt, and test3.txt, each with a line of text."}],"state":{"type":"complete","stopReason":"end_turn"}}]],"toolResults":[]}"#;

        let result = amp_executor.normalize_logs(logs, "/tmp/test");
        assert!(result.is_ok());

        let conversation = result.unwrap();

        // Should only have 1 assistant message (the complete one)
        let assistant_messages: Vec<_> = conversation
            .entries
            .iter()
            .filter(|e| matches!(e.entry_type, NormalizedEntryType::AssistantMessage))
            .collect();

        assert_eq!(assistant_messages.len(), 1);
        assert_eq!(assistant_messages[0].content, "Created all three files: test1.txt, test2.txt, and test3.txt, each with a line of text.");
    }

    #[test]
    fn test_filter_preserves_messages_without_state() {
        // Test that messages without state metadata are preserved (for compatibility)
        let amp_executor = AmpExecutor;
        let logs = r#"{"type":"messages","messages":[[1,{"role":"assistant","content":[{"type":"text","text":"Regular message"}]}]],"toolResults":[]}"#;

        let result = amp_executor.normalize_logs(logs, "/tmp/test");
        assert!(result.is_ok());

        let conversation = result.unwrap();

        // Should have 1 assistant message
        let assistant_messages: Vec<_> = conversation
            .entries
            .iter()
            .filter(|e| matches!(e.entry_type, NormalizedEntryType::AssistantMessage))
            .collect();

        assert_eq!(assistant_messages.len(), 1);
        assert_eq!(assistant_messages[0].content, "Regular message");
    }
}
