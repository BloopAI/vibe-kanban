use std::path::Path;

use async_trait::async_trait;
use command_group::{AsyncCommandGroup, AsyncGroupChild};
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

/// An executor that continues an Amp thread
pub struct AmpFollowupExecutor {
    pub thread_id: String,
    pub prompt: String,
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
        let amp_command = "npx @sourcegraph/amp --format=jsonl";

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

    fn normalize_logs(
        &self,
        logs: &str,
        worktree_path: &str,
    ) -> Result<NormalizedConversation, String> {
        use serde_json::Value;

        let mut entries = Vec::new();
        let mut session_id = None;

        for line in logs.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            // Try to parse as JSON
            let json: Value = match serde_json::from_str(trimmed) {
                Ok(json) => json,
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

            // Extract session ID (threadID in AMP)
            if session_id.is_none() {
                if let Some(thread_id) = json.get("threadID").and_then(|v| v.as_str()) {
                    session_id = Some(thread_id.to_string());
                }
            }

            // Process different message types
            let processed = if let Some(msg_type) = json.get("type").and_then(|t| t.as_str()) {
                match msg_type {
                    "messages" => {
                        if let Some(messages) = json.get("messages").and_then(|m| m.as_array()) {
                            for message_entry in messages {
                                if let Some(message_data) =
                                    message_entry.as_array().and_then(|arr| arr.get(1))
                                {
                                    if let Some(role) =
                                        message_data.get("role").and_then(|r| r.as_str())
                                    {
                                        if let Some(content) =
                                            message_data.get("content").and_then(|c| c.as_array())
                                        {
                                            for content_item in content {
                                                if let Some(content_type) = content_item
                                                    .get("type")
                                                    .and_then(|t| t.as_str())
                                                {
                                                    match content_type {
                                                        "text" => {
                                                            if let Some(text) = content_item
                                                                .get("text")
                                                                .and_then(|t| t.as_str())
                                                            {
                                                                let entry_type = match role {
                                                                    "user" => NormalizedEntryType::UserMessage,
                                                                    "assistant" => NormalizedEntryType::AssistantMessage,
                                                                    _ => continue,
                                                                };
                                                                entries.push(NormalizedEntry {
                                                                    timestamp: message_data
                                                                        .get("meta")
                                                                        .and_then(|m| {
                                                                            m.get("sentAt")
                                                                        })
                                                                        .and_then(|s| s.as_u64())
                                                                        .map(|ts| ts.to_string()),
                                                                    entry_type,
                                                                    content: text.to_string(),
                                                                    metadata: Some(
                                                                        content_item.clone(),
                                                                    ),
                                                                });
                                                            }
                                                        }
                                                        "thinking" => {
                                                            if let Some(thinking) = content_item
                                                                .get("thinking")
                                                                .and_then(|t| t.as_str())
                                                            {
                                                                entries.push(NormalizedEntry {
                                                                    timestamp: None,
                                                                    entry_type:
                                                                        NormalizedEntryType::Thinking,
                                                                    content: thinking.to_string(),
                                                                    metadata: Some(
                                                                        content_item.clone(),
                                                                    ),
                                                                });
                                                            }
                                                        }
                                                        "tool_use" => {
                                                            if let Some(tool_name) = content_item
                                                                .get("name")
                                                                .and_then(|n| n.as_str())
                                                            {
                                                                let input = content_item
                                                                    .get("input")
                                                                    .unwrap_or(&Value::Null);
                                                                let action_type = self
                                                                    .extract_action_type(
                                                                        tool_name,
                                                                        input,
                                                                        worktree_path,
                                                                    );
                                                                let content = self
                                                                    .generate_concise_content(
                                                                        tool_name,
                                                                        input,
                                                                        &action_type,
                                                                        worktree_path,
                                                                    );

                                                                entries.push(NormalizedEntry {
                                                                    timestamp: None,
                                                                    entry_type:
                                                                        NormalizedEntryType::ToolUse {
                                                                            tool_name: tool_name
                                                                                .to_string(),
                                                                            action_type,
                                                                        },
                                                                    content,
                                                                    metadata: Some(
                                                                        content_item.clone(),
                                                                    ),
                                                                });
                                                            }
                                                        }
                                                        _ => {}
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        true
                    }
                    // Ignore these JSON types - they're not relevant for task execution logs
                    "initial" | "token-usage" | "state" | "shutdown" => true,
                    _ => false,
                }
            } else {
                false
            };

            // If JSON didn't match expected patterns, add it as unrecognized JSON
            // Skip JSON with type "result" as requested
            if !processed {
                if let Some(msg_type) = json.get("type").and_then(|t| t.as_str()) {
                    if msg_type == "result" {
                        // Skip result entries
                        continue;
                    }
                }
                entries.push(NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::SystemMessage,
                    content: format!("Unrecognized JSON: {}", trimmed),
                    metadata: Some(json),
                });
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

#[async_trait]
impl Executor for AmpFollowupExecutor {
    async fn spawn(
        &self,
        _pool: &sqlx::SqlitePool,
        _task_id: Uuid,
        worktree_path: &str,
    ) -> Result<AsyncGroupChild, ExecutorError> {
        use std::process::Stdio;

        use tokio::{io::AsyncWriteExt, process::Command};

        // Use shell command for cross-platform compatibility
        let (shell_cmd, shell_arg) = get_shell_command();
        let amp_command = format!(
            "npx @sourcegraph/amp threads continue {} --format=jsonl",
            self.thread_id
        );

        let mut command = Command::new(shell_cmd);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped()) // <-- open a pipe
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(worktree_path)
            .arg(shell_arg)
            .arg(&amp_command);

        let mut child = command
            .group_spawn() // Create new process group so we can kill entire tree
            .map_err(|e| {
                crate::executor::SpawnContext::from_command(&command, "Amp")
                    .with_context(format!(
                        "Amp CLI followup execution for thread {}",
                        self.thread_id
                    ))
                    .spawn_error(e)
            })?;

        // feed the prompt in, then close the pipe so `amp` sees EOF
        if let Some(mut stdin) = child.inner().stdin.take() {
            stdin.write_all(self.prompt.as_bytes()).await.unwrap();
            stdin.shutdown().await.unwrap(); // or `drop(stdin);`
        }

        Ok(child)
    }

    fn normalize_logs(
        &self,
        logs: &str,
        worktree_path: &str,
    ) -> Result<NormalizedConversation, String> {
        // Reuse the same logic as the main AmpExecutor
        let main_executor = AmpExecutor;
        main_executor.normalize_logs(logs, worktree_path)
    }
}
