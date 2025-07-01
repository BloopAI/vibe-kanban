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

        let prompt = format!(
            r#"project_id: {}
            
            Task title: {}
            Task description: {}
            "#,
            task.project_id,
            task.title,
            task.description
                .as_deref()
                .unwrap_or("No description provided")
        );

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

    fn normalize_logs(&self, logs: &str) -> Result<NormalizedConversation, String> {
        use serde_json::Value;

        let mut entries = Vec::new();
        let mut session_id = None;

        for line in logs.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            // Try to parse as JSON
            let json: Value = serde_json::from_str(trimmed)
                .map_err(|e| format!("Failed to parse JSON: {}", e))?;

            // Extract session ID (threadID in AMP)
            if session_id.is_none() {
                if let Some(thread_id) = json.get("threadID").and_then(|v| v.as_str()) {
                    session_id = Some(thread_id.to_string());
                }
            }

            // Process different message types
            if let Some(msg_type) = json.get("type").and_then(|t| t.as_str()) {
                if msg_type == "messages" {
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
                                            if let Some(content_type) =
                                                content_item.get("type").and_then(|t| t.as_str())
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
                                                                    .and_then(|m| m.get("sentAt"))
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
                                                                    tool_name, input,
                                                                );
                                                            let content = self
                                                                .generate_concise_content(
                                                                    tool_name,
                                                                    input,
                                                                    &action_type,
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
                }
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
    fn generate_concise_content(
        &self,
        tool_name: &str,
        input: &serde_json::Value,
        action_type: &ActionType,
    ) -> String {
        match action_type {
            ActionType::FileRead { path } => path.clone(),
            ActionType::FileWrite { path } => path.clone(),
            ActionType::CommandRun { command } => command.clone(),
            ActionType::Search { query } => query.clone(),
            ActionType::WebFetch { url } => url.clone(),
            ActionType::TaskCreate { description } => description.clone(),
            ActionType::Other { description: _ } => {
                // For other tools, try to extract key information or fall back to tool name
                match tool_name.to_lowercase().as_str() {
                    "todo_write" | "todo_read" => "Managing TODO list".to_string(),
                    "list_directory" | "ls" => {
                        if let Some(path) = input.get("path").and_then(|p| p.as_str()) {
                            format!("List directory: {}", path)
                        } else {
                            "List directory".to_string()
                        }
                    }
                    "codebase_search_agent" => {
                        if let Some(query) = input.get("query").and_then(|q| q.as_str()) {
                            format!("Search: {}", query)
                        } else {
                            "Codebase search".to_string()
                        }
                    }
                    "glob" => {
                        if let Some(pattern) = input.get("filePattern").and_then(|p| p.as_str()) {
                            format!("File pattern: {}", pattern)
                        } else {
                            "File pattern search".to_string()
                        }
                    }
                    _ => tool_name.to_string(),
                }
            }
        }
    }

    fn extract_action_type(&self, tool_name: &str, input: &serde_json::Value) -> ActionType {
        match tool_name.to_lowercase().as_str() {
            "read_file" | "read" => {
                if let Some(path) = input.get("path").and_then(|p| p.as_str()) {
                    ActionType::FileRead {
                        path: path.to_string(),
                    }
                } else if let Some(file_path) = input.get("file_path").and_then(|p| p.as_str()) {
                    ActionType::FileRead {
                        path: file_path.to_string(),
                    }
                } else {
                    ActionType::Other {
                        description: "File read operation".to_string(),
                    }
                }
            }
            "edit_file" | "write" | "create_file" => {
                if let Some(path) = input.get("path").and_then(|p| p.as_str()) {
                    ActionType::FileWrite {
                        path: path.to_string(),
                    }
                } else if let Some(file_path) = input.get("file_path").and_then(|p| p.as_str()) {
                    ActionType::FileWrite {
                        path: file_path.to_string(),
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

    fn normalize_logs(&self, logs: &str) -> Result<NormalizedConversation, String> {
        // Reuse the same logic as the main AmpExecutor
        let main_executor = AmpExecutor;
        main_executor.normalize_logs(logs)
    }
}
