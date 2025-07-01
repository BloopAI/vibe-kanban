use async_trait::async_trait;
use command_group::{AsyncCommandGroup, AsyncGroupChild};
use tokio::process::Command;
use uuid::Uuid;

use crate::{
    executor::{
        ActionType, Executor, ExecutorError, NormalizedConversation, NormalizedEntry,
        NormalizedEntryType,
    },
    models::task::Task,
    utils::shell::get_shell_command,
};

/// An executor that uses Claude CLI to process tasks
pub struct ClaudeExecutor;

/// An executor that resumes a Claude session
pub struct ClaudeFollowupExecutor {
    pub session_id: String,
    pub prompt: String,
}

#[async_trait]
impl Executor for ClaudeExecutor {
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
        let claude_command = format!(
            "claude \"{}\" -p --dangerously-skip-permissions --verbose --output-format=stream-json",
            prompt.replace("\"", "\\\"")
        );

        let mut command = Command::new(shell_cmd);
        command
            .kill_on_drop(true)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .current_dir(worktree_path)
            .arg(shell_arg)
            .arg(&claude_command);

        let child = command
            .group_spawn() // Create new process group so we can kill entire tree
            .map_err(|e| {
                crate::executor::SpawnContext::from_command(&command, "Claude")
                    .with_task(task_id, Some(task.title.clone()))
                    .with_context("Claude CLI execution for new task")
                    .spawn_error(e)
            })?;

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

            // Extract session ID
            if session_id.is_none() {
                if let Some(sess_id) = json.get("session_id").and_then(|v| v.as_str()) {
                    session_id = Some(sess_id.to_string());
                }
            }

            // Process different message types
            if let Some(msg_type) = json.get("type").and_then(|t| t.as_str()) {
                match msg_type {
                    "assistant" => {
                        if let Some(message) = json.get("message") {
                            if let Some(content) = message.get("content").and_then(|c| c.as_array())
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
                                                    entries.push(NormalizedEntry {
                                                        timestamp: None,
                                                        entry_type:
                                                            NormalizedEntryType::AssistantMessage,
                                                        content: text.to_string(),
                                                        metadata: Some(content_item.clone()),
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
                                                    let action_type =
                                                        self.extract_action_type(tool_name, input);
                                                    let content = self.generate_concise_content(
                                                        tool_name,
                                                        input,
                                                        &action_type,
                                                    );

                                                    entries.push(NormalizedEntry {
                                                        timestamp: None,
                                                        entry_type: NormalizedEntryType::ToolUse {
                                                            tool_name: tool_name.to_string(),
                                                            action_type,
                                                        },
                                                        content,
                                                        metadata: Some(content_item.clone()),
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
                    "user" => {
                        if let Some(message) = json.get("message") {
                            if let Some(content) = message.get("content").and_then(|c| c.as_array())
                            {
                                for content_item in content {
                                    if let Some(content_type) =
                                        content_item.get("type").and_then(|t| t.as_str())
                                    {
                                        if content_type == "text" {
                                            if let Some(text) =
                                                content_item.get("text").and_then(|t| t.as_str())
                                            {
                                                entries.push(NormalizedEntry {
                                                    timestamp: None,
                                                    entry_type: NormalizedEntryType::UserMessage,
                                                    content: text.to_string(),
                                                    metadata: Some(content_item.clone()),
                                                });
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    "system" => {
                        if let Some(subtype) = json.get("subtype").and_then(|s| s.as_str()) {
                            if subtype == "init" {
                                entries.push(NormalizedEntry {
                                    timestamp: None,
                                    entry_type: NormalizedEntryType::SystemMessage,
                                    content: format!(
                                        "System initialized with model: {}",
                                        json.get("model")
                                            .and_then(|m| m.as_str())
                                            .unwrap_or("unknown")
                                    ),
                                    metadata: Some(json.clone()),
                                });
                            }
                        }
                    }
                    _ => {}
                }
            }
        }

        Ok(NormalizedConversation {
            entries,
            session_id,
            executor_type: "claude".to_string(),
            prompt: None,
            summary: None,
        })
    }
}

impl ClaudeExecutor {
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
                    "todoread" | "todowrite" => "Managing TODO list".to_string(),
                    "ls" => {
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
                    _ => tool_name.to_string(),
                }
            }
        }
    }

    fn extract_action_type(&self, tool_name: &str, input: &serde_json::Value) -> ActionType {
        match tool_name.to_lowercase().as_str() {
            "read" => {
                if let Some(file_path) = input.get("file_path").and_then(|p| p.as_str()) {
                    ActionType::FileRead {
                        path: file_path.to_string(),
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
                        path: file_path.to_string(),
                    }
                } else if let Some(path) = input.get("path").and_then(|p| p.as_str()) {
                    ActionType::FileWrite {
                        path: path.to_string(),
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
            "glob" => {
                if let Some(file_pattern) = input.get("filePattern").and_then(|p| p.as_str()) {
                    ActionType::Search {
                        query: file_pattern.to_string(),
                    }
                } else {
                    ActionType::Other {
                        description: "File pattern search".to_string(),
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
            _ => ActionType::Other {
                description: format!("Tool: {}", tool_name),
            },
        }
    }
}

#[async_trait]
impl Executor for ClaudeFollowupExecutor {
    async fn spawn(
        &self,
        _pool: &sqlx::SqlitePool,
        _task_id: Uuid,
        worktree_path: &str,
    ) -> Result<AsyncGroupChild, ExecutorError> {
        // Use shell command for cross-platform compatibility
        let (shell_cmd, shell_arg) = get_shell_command();
        let claude_command = format!(
            "claude \"{}\" -p --dangerously-skip-permissions --verbose --output-format=stream-json --resume={}",
            self.prompt.replace("\"", "\\\""),
            self.session_id
        );

        let mut command = Command::new(shell_cmd);
        command
            .kill_on_drop(true)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .current_dir(worktree_path)
            .arg(shell_arg)
            .arg(&claude_command);

        let child = command
            .group_spawn() // Create new process group so we can kill entire tree
            .map_err(|e| {
                crate::executor::SpawnContext::from_command(&command, "Claude")
                    .with_context(format!(
                        "Claude CLI followup execution for session {}",
                        self.session_id
                    ))
                    .spawn_error(e)
            })?;

        Ok(child)
    }

    fn normalize_logs(&self, logs: &str) -> Result<NormalizedConversation, String> {
        // Reuse the same logic as the main ClaudeExecutor
        let main_executor = ClaudeExecutor;
        main_executor.normalize_logs(logs)
    }
}
