use std::path::Path;

use async_trait::async_trait;
use uuid::Uuid;

use crate::{
    command_runner::{CommandProcess, CommandRunner},
    executor::{
        ActionType, Executor, ExecutorError, NormalizedConversation, NormalizedEntry,
        NormalizedEntryType,
    },
    models::task::Task,
    utils::shell::get_shell_command,
};

fn create_watchkill_script(command: &str) -> String {
    let claude_plan_stop_indicator = "Exit plan mode?";
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

/// An executor that uses Claude CLI to process tasks
pub struct ClaudeExecutor {
    executor_type: String,
    command: String,
}

impl Default for ClaudeExecutor {
    fn default() -> Self {
        Self::new()
    }
}

impl ClaudeExecutor {
    /// Create a new ClaudeExecutor with default settings
    pub fn new() -> Self {
        Self {
            executor_type: "Claude Code".to_string(),
            command: "npx -y @anthropic-ai/claude-code@latest -p --dangerously-skip-permissions --verbose --output-format=stream-json".to_string(),
        }
    }

    pub fn new_plan_mode() -> Self {
        let command = "npx -y @anthropic-ai/claude-code@latest -p --permission-mode=plan --verbose --output-format=stream-json";
        let script = create_watchkill_script(command);
        Self {
            executor_type: "ClaudePlan".to_string(),
            command: script,
        }
    }

    /// Create a new ClaudeExecutor with custom settings
    pub fn with_command(executor_type: String, command: String) -> Self {
        Self {
            executor_type,
            command,
        }
    }
}

#[async_trait]
impl Executor for ClaudeExecutor {
    async fn spawn(
        &self,
        pool: &sqlx::SqlitePool,
        task_id: Uuid,
        worktree_path: &str,
    ) -> Result<CommandProcess, ExecutorError> {
        // Get the task to fetch its description
        let task = Task::find_by_id(pool, task_id)
            .await?
            .ok_or(ExecutorError::TaskNotFound)?;

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
        // Pass prompt via stdin instead of command line to avoid shell escaping issues
        let claude_command = &self.command;

        let mut command = CommandRunner::new();
        command
            .command(shell_cmd)
            .arg(shell_arg)
            .arg(claude_command)
            .stdin(&prompt)
            .working_dir(worktree_path)
            .env("NODE_NO_WARNINGS", "1");

        let proc = command.start().await.map_err(|e| {
            crate::executor::SpawnContext::from_command(&command, &self.executor_type)
                .with_task(task_id, Some(task.title.clone()))
                .with_context(format!("{} CLI execution for new task", self.executor_type))
                .spawn_error(e)
        })?;
        Ok(proc)
    }

    async fn spawn_followup(
        &self,
        _pool: &sqlx::SqlitePool,
        _task_id: Uuid,
        session_id: &str,
        prompt: &str,
        worktree_path: &str,
    ) -> Result<CommandProcess, ExecutorError> {
        // Use shell command for cross-platform compatibility
        let (shell_cmd, shell_arg) = get_shell_command();

        // Determine the command based on whether this is plan mode or not
        let claude_command = if self.executor_type == "ClaudePlan" {
            let command = format!(
                "npx -y @anthropic-ai/claude-code@latest -p --permission-mode=plan --verbose --output-format=stream-json --resume={}",
                session_id
            );
            create_watchkill_script(&command)
        } else {
            format!("{} --resume={}", self.command, session_id)
        };

        let mut command = CommandRunner::new();
        command
            .command(shell_cmd)
            .arg(shell_arg)
            .arg(&claude_command)
            .stdin(prompt)
            .working_dir(worktree_path)
            .env("NODE_NO_WARNINGS", "1");

        let proc = command.start().await.map_err(|e| {
            crate::executor::SpawnContext::from_command(&command, &self.executor_type)
                .with_context(format!(
                    "{} CLI followup execution for session {}",
                    self.executor_type, session_id
                ))
                .spawn_error(e)
        })?;

        Ok(proc)
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

            // Extract session ID
            if session_id.is_none() {
                if let Some(sess_id) = json.get("session_id").and_then(|v| v.as_str()) {
                    session_id = Some(sess_id.to_string());
                }
            }

            // Process different message types
            let processed = if let Some(msg_type) = json.get("type").and_then(|t| t.as_str()) {
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
                                                    let action_type = self.extract_action_type(
                                                        tool_name,
                                                        input,
                                                        worktree_path,
                                                    );
                                                    let content = self.generate_concise_content(
                                                        tool_name,
                                                        input,
                                                        &action_type,
                                                        worktree_path,
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
                        true
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
                        true
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
                        true
                    }
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
            executor_type: self.executor_type.clone(),
            prompt: None,
            summary: None,
        })
    }
}

impl ClaudeExecutor {
    /// Convert absolute paths to relative paths based on worktree path
    fn make_path_relative(&self, path: &str, worktree_path: &str) -> String {
        let path_obj = Path::new(path);
        let worktree_path_obj = Path::new(worktree_path);

        tracing::debug!("Making path relative: {} -> {}", path, worktree_path);

        // If path is already relative, return as is
        if path_obj.is_relative() {
            return path.to_string();
        }

        // Try to make path relative to the worktree path
        match path_obj.strip_prefix(worktree_path_obj) {
            Ok(relative_path) => {
                let result = relative_path.to_string_lossy().to_string();
                tracing::debug!("Successfully made relative: '{}' -> '{}'", path, result);
                result
            }
            Err(_) => {
                // Handle symlinks by resolving canonical paths
                let canonical_path = std::fs::canonicalize(path);
                let canonical_worktree = std::fs::canonicalize(worktree_path);

                match (canonical_path, canonical_worktree) {
                    (Ok(canon_path), Ok(canon_worktree)) => {
                        tracing::debug!(
                            "Trying canonical path resolution: '{}' -> '{}', '{}' -> '{}'",
                            path,
                            canon_path.display(),
                            worktree_path,
                            canon_worktree.display()
                        );

                        match canon_path.strip_prefix(&canon_worktree) {
                            Ok(relative_path) => {
                                let result = relative_path.to_string_lossy().to_string();
                                tracing::debug!(
                                    "Successfully made relative with canonical paths: '{}' -> '{}'",
                                    path,
                                    result
                                );
                                result
                            }
                            Err(e) => {
                                tracing::warn!(
                                    "Failed to make canonical path relative: '{}' relative to '{}', error: {}, returning original",
                                    canon_path.display(),
                                    canon_worktree.display(),
                                    e
                                );
                                path.to_string()
                            }
                        }
                    }
                    _ => {
                        tracing::debug!(
                            "Could not canonicalize paths (paths may not exist): '{}', '{}', returning original",
                            path,
                            worktree_path
                        );
                        path.to_string()
                    }
                }
            }
        }
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
            ActionType::PlanPresentation { plan } => plan.clone(),
            ActionType::Other { description: _ } => {
                // For other tools, try to extract key information or fall back to tool name
                match tool_name.to_lowercase().as_str() {
                    "todoread" | "todowrite" => {
                        // Extract todo list from input to show actual todos
                        if let Some(todos) = input.get("todos").and_then(|t| t.as_array()) {
                            let mut todo_items = Vec::new();
                            for todo in todos {
                                if let Some(content) = todo.get("content").and_then(|c| c.as_str())
                                {
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
                                    todo_items.push(format!(
                                        "{} {} ({})",
                                        status_emoji, content, priority
                                    ));
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

                        if let Some(search_path) = path {
                            format!(
                                "Find files: `{}` in `{}`",
                                pattern,
                                self.make_path_relative(search_path, worktree_path)
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
            "read" => {
                if let Some(file_path) = input.get("file_path").and_then(|p| p.as_str()) {
                    ActionType::FileRead {
                        path: self.make_path_relative(file_path, worktree_path),
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
                        path: self.make_path_relative(file_path, worktree_path),
                    }
                } else if let Some(path) = input.get("path").and_then(|p| p.as_str()) {
                    ActionType::FileWrite {
                        path: self.make_path_relative(path, worktree_path),
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
                if let Some(pattern) = input.get("pattern").and_then(|p| p.as_str()) {
                    ActionType::Other {
                        description: format!("Find files: {}", pattern),
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
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_logs_ignores_result_type() {
        let executor = ClaudeExecutor::new();
        let logs = r#"{"type":"system","subtype":"init","cwd":"/private/tmp","session_id":"e988eeea-3712-46a1-82d4-84fbfaa69114","tools":[],"model":"claude-sonnet-4-20250514"}
{"type":"assistant","message":{"id":"msg_123","type":"message","role":"assistant","model":"claude-sonnet-4-20250514","content":[{"type":"text","text":"Hello world"}],"stop_reason":null},"session_id":"e988eeea-3712-46a1-82d4-84fbfaa69114"}
{"type":"result","subtype":"success","is_error":false,"duration_ms":6059,"result":"Final result"}
{"type":"unknown","data":"some data"}"#;

        let result = executor.normalize_logs(logs, "/tmp/test-worktree").unwrap();

        // Should have system message, assistant message, and unknown message
        // but NOT the result message
        assert_eq!(result.entries.len(), 3);

        // Check that no entry contains "result"
        for entry in &result.entries {
            assert!(!entry.content.contains("result"));
        }

        // Check that unknown JSON is still processed
        assert!(result
            .entries
            .iter()
            .any(|e| e.content.contains("Unrecognized JSON")));
    }

    #[test]
    fn test_make_path_relative() {
        let executor = ClaudeExecutor::new();

        // Test with relative path (should remain unchanged)
        assert_eq!(
            executor.make_path_relative("src/main.rs", "/tmp/test-worktree"),
            "src/main.rs"
        );

        // Test with absolute path (should become relative if possible)
        let test_worktree = "/tmp/test-worktree";
        let absolute_path = format!("{}/src/main.rs", test_worktree);
        let result = executor.make_path_relative(&absolute_path, test_worktree);
        assert_eq!(result, "src/main.rs");
    }

    #[test]
    fn test_todo_tool_content_extraction() {
        let executor = ClaudeExecutor::new();

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

        let result = executor.generate_concise_content(
            "TodoWrite",
            &todo_input,
            &ActionType::Other {
                description: "Tool: TodoWrite".to_string(),
            },
            "/tmp/test-worktree",
        );

        assert!(result.contains("TODO List:"));
        assert!(result.contains("✅ Fix the navigation bug (high)"));
        assert!(result.contains("🔄 Add user authentication (medium)"));
        assert!(result.contains("⏳ Write documentation (low)"));
    }

    #[test]
    fn test_todo_tool_empty_list() {
        let executor = ClaudeExecutor::new();

        // Test TodoWrite with empty todo list
        let empty_input = serde_json::json!({
            "todos": []
        });

        let result = executor.generate_concise_content(
            "TodoWrite",
            &empty_input,
            &ActionType::Other {
                description: "Tool: TodoWrite".to_string(),
            },
            "/tmp/test-worktree",
        );

        assert_eq!(result, "Managing TODO list");
    }

    #[test]
    fn test_todo_tool_no_todos_field() {
        let executor = ClaudeExecutor::new();

        // Test TodoWrite with no todos field
        let no_todos_input = serde_json::json!({
            "other_field": "value"
        });

        let result = executor.generate_concise_content(
            "TodoWrite",
            &no_todos_input,
            &ActionType::Other {
                description: "Tool: TodoWrite".to_string(),
            },
            "/tmp/test-worktree",
        );

        assert_eq!(result, "Managing TODO list");
    }

    #[test]
    fn test_glob_tool_content_extraction() {
        let executor = ClaudeExecutor::new();

        // Test Glob with pattern and path
        let glob_input = serde_json::json!({
            "pattern": "**/*.ts",
            "path": "/tmp/test-worktree/src"
        });

        let result = executor.generate_concise_content(
            "Glob",
            &glob_input,
            &ActionType::Other {
                description: "Find files: **/*.ts".to_string(),
            },
            "/tmp/test-worktree",
        );

        assert_eq!(result, "Find files: `**/*.ts` in `src`");
    }

    #[test]
    fn test_glob_tool_pattern_only() {
        let executor = ClaudeExecutor::new();

        // Test Glob with pattern only
        let glob_input = serde_json::json!({
            "pattern": "*.js"
        });

        let result = executor.generate_concise_content(
            "Glob",
            &glob_input,
            &ActionType::Other {
                description: "Find files: *.js".to_string(),
            },
            "/tmp/test-worktree",
        );

        assert_eq!(result, "Find files: `*.js`");
    }

    #[test]
    fn test_ls_tool_content_extraction() {
        let executor = ClaudeExecutor::new();

        // Test LS with path
        let ls_input = serde_json::json!({
            "path": "/tmp/test-worktree/components"
        });

        let result = executor.generate_concise_content(
            "LS",
            &ls_input,
            &ActionType::Other {
                description: "Tool: LS".to_string(),
            },
            "/tmp/test-worktree",
        );

        assert_eq!(result, "List directory: `components`");
    }
}
