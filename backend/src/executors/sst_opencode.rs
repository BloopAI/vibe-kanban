use async_trait::async_trait;
use command_group::{AsyncCommandGroup, AsyncGroupChild};
use serde_json::{json, Value};
use tokio::{
    io::{AsyncBufReadExt, BufReader},
    process::Command,
};
use uuid::Uuid;

use crate::{
    executor::{Executor, ExecutorError, NormalizedConversation, NormalizedEntry},
    models::{execution_process::ExecutionProcess, executor_session::ExecutorSession, task::Task},
    utils::shell::get_shell_command,
};

// Sub-modules for utilities
pub mod filter;
pub mod tools;

use self::{
    filter::{parse_session_id_from_line, tool_usage_regex, OpenCodeFilter},
    tools::{determine_action_type, generate_tool_content, normalize_tool_name},
};

struct Content {
    pub stdout: Option<String>,
    pub stderr: Option<String>,
}

/// Process a single line for session extraction and content formatting
async fn process_line_for_content(
    line: &str,
    session_extracted: &mut bool,
    worktree_path: &str,
    pool: &sqlx::SqlitePool,
    execution_process_id: uuid::Uuid,
) -> Option<Content> {
    if !*session_extracted {
        if let Some(session_id) = parse_session_id_from_line(line) {
            if let Err(e) =
                ExecutorSession::update_session_id(pool, execution_process_id, &session_id).await
            {
                tracing::error!(
                    "Failed to update session ID for execution process {}: {}",
                    execution_process_id,
                    e
                );
            } else {
                tracing::info!(
                    "Updated session ID {} for execution process {}",
                    session_id,
                    execution_process_id
                );
                *session_extracted = true;
            }

            // Don't return any content for session lines
            return None;
        }
    }

    // Check if line is noise - if so, discard it
    if OpenCodeFilter::is_noise(line) {
        return None;
    }

    if OpenCodeFilter::is_stderr(line) {
        // If it's stderr, we don't need to process it further
        return Some(Content {
            stdout: None,
            stderr: Some(line.to_string()),
        });
    }

    // Format clean content as normalized JSON
    let formatted = format_opencode_content_as_normalized_json(line, worktree_path);
    Some(Content {
        stdout: Some(formatted),
        stderr: None,
    })
}

/// Stream stderr from OpenCode process with filtering to separate clean output from noise
pub async fn stream_opencode_stderr_to_db(
    output: impl tokio::io::AsyncRead + Unpin,
    pool: sqlx::SqlitePool,
    attempt_id: Uuid,
    execution_process_id: Uuid,
    worktree_path: String,
) {
    let mut reader = BufReader::new(output);
    let mut line = String::new();
    let mut session_extracted = false;

    loop {
        line.clear();

        match reader.read_line(&mut line).await {
            Ok(0) => break, // EOF
            Ok(_) => {
                line = line.trim_end_matches(['\r', '\n']).to_string();

                let content = process_line_for_content(
                    &line,
                    &mut session_extracted,
                    &worktree_path,
                    &pool,
                    execution_process_id,
                )
                .await;

                if let Some(Content { stdout, stderr }) = content {
                    tracing::debug!(
                        "Processed OpenCode content for attempt {}: stdout={:?} stderr={:?}",
                        attempt_id,
                        stdout,
                        stderr,
                    );
                    if let Err(e) = ExecutionProcess::append_output(
                        &pool,
                        execution_process_id,
                        stdout.as_deref(),
                        stderr.as_deref(),
                    )
                    .await
                    {
                        tracing::error!(
                            "Failed to write OpenCode line for attempt {}: {}",
                            attempt_id,
                            e
                        );
                    }
                }
            }
            Err(e) => {
                tracing::error!("Error reading stderr for attempt {}: {}", attempt_id, e);
                break;
            }
        }
    }
}

/// Format OpenCode clean content as normalized JSON entries for direct database storage
fn format_opencode_content_as_normalized_json(content: &str, worktree_path: &str) -> String {
    let mut results = Vec::new();
    let base_timestamp = chrono::Utc::now();
    let mut entry_counter = 0u32;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        // Generate unique timestamp for each entry by adding microseconds
        let unique_timestamp =
            base_timestamp + chrono::Duration::microseconds(entry_counter as i64);
        let timestamp_str = unique_timestamp.to_rfc3339_opts(chrono::SecondsFormat::Micros, true);
        entry_counter += 1;

        // Try to parse as existing JSON first
        if let Ok(parsed_json) = serde_json::from_str::<Value>(trimmed) {
            results.push(parsed_json.to_string());
            continue;
        }

        // Strip ANSI codes before processing
        let cleaned = OpenCodeFilter::strip_ansi_codes(trimmed);
        let cleaned_trim = cleaned.trim();

        if cleaned_trim.is_empty() {
            continue;
        }

        // Check for tool usage patterns after ANSI stripping: | ToolName {...}
        if let Some(captures) = tool_usage_regex().captures(cleaned_trim) {
            if let (Some(tool_name), Some(tool_input)) = (captures.get(1), captures.get(2)) {
                // Parse tool input
                let input: serde_json::Value =
                    serde_json::from_str(tool_input.as_str()).unwrap_or(serde_json::Value::Null);

                // Normalize tool name for frontend compatibility (e.g., "Todo" → "todowrite")
                let normalized_tool_name = normalize_tool_name(tool_name.as_str());

                let normalized_entry = json!({
                    "timestamp": timestamp_str,
                    "entry_type": {
                        "type": "tool_use",
                        "tool_name": normalized_tool_name,
                        "action_type": determine_action_type(&normalized_tool_name, &input, worktree_path)
                    },
                    "content": generate_tool_content(&normalized_tool_name, &input, worktree_path),
                    "metadata": input
                });
                results.push(normalized_entry.to_string());
                continue;
            }
        }

        // Regular assistant message
        let normalized_entry = json!({
            "timestamp": timestamp_str,
            "entry_type": {
                "type": "assistant_message"
            },
            "content": cleaned_trim,
            "metadata": null
        });
        results.push(normalized_entry.to_string());
    }

    // Ensure each JSON entry is on its own line
    results.join("\n") + "\n"
}

/// An executor that uses SST Opencode CLI to process tasks
pub struct SstOpencodeExecutor {
    executor_type: String,
    command: String,
}

impl Default for SstOpencodeExecutor {
    fn default() -> Self {
        Self::new()
    }
}

impl SstOpencodeExecutor {
    /// Create a new SstOpencodeExecutor with default settings
    pub fn new() -> Self {
        Self {
            executor_type: "SST Opencode".to_string(),
            command: "npx -y opencode-ai@latest run --print-logs".to_string(),
        }
    }
}

/// An executor that resumes an SST Opencode session
pub struct SstOpencodeFollowupExecutor {
    pub session_id: String,
    pub prompt: String,
    executor_type: String,
    command_base: String,
}

impl SstOpencodeFollowupExecutor {
    /// Create a new SstOpencodeFollowupExecutor with default settings
    pub fn new(session_id: String, prompt: String) -> Self {
        Self {
            session_id,
            prompt,
            executor_type: "SST Opencode".to_string(),
            command_base: "npx -y opencode-ai@latest run --print-logs".to_string(),
        }
    }
}

#[async_trait]
impl Executor for SstOpencodeExecutor {
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
        let opencode_command = &self.command;

        let mut command = Command::new(shell_cmd);
        command
            .kill_on_drop(true)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::null()) // Ignore stdout for OpenCode
            .stderr(std::process::Stdio::piped())
            .current_dir(worktree_path)
            .arg(shell_arg)
            .arg(opencode_command)
            .env("NODE_NO_WARNINGS", "1");

        let mut child = command
            .group_spawn() // Create new process group so we can kill entire tree
            .map_err(|e| {
                crate::executor::SpawnContext::from_command(&command, &self.executor_type)
                    .with_task(task_id, Some(task.title.clone()))
                    .with_context(format!("{} CLI execution for new task", self.executor_type))
                    .spawn_error(e)
            })?;

        // Write prompt to stdin safely
        if let Some(mut stdin) = child.inner().stdin.take() {
            use tokio::io::AsyncWriteExt;
            tracing::debug!(
                "Writing prompt to OpenCode stdin for task {}: {:?}",
                task_id,
                prompt
            );
            stdin.write_all(prompt.as_bytes()).await.map_err(|e| {
                let context =
                    crate::executor::SpawnContext::from_command(&command, &self.executor_type)
                        .with_task(task_id, Some(task.title.clone()))
                        .with_context(format!(
                            "Failed to write prompt to {} CLI stdin",
                            self.executor_type
                        ));
                ExecutorError::spawn_failed(e, context)
            })?;
            stdin.shutdown().await.map_err(|e| {
                let context =
                    crate::executor::SpawnContext::from_command(&command, &self.executor_type)
                        .with_task(task_id, Some(task.title.clone()))
                        .with_context(format!("Failed to close {} CLI stdin", self.executor_type));
                ExecutorError::spawn_failed(e, context)
            })?;
        }

        Ok(child)
    }

    /// Execute with OpenCode filtering for stderr
    async fn execute_streaming(
        &self,
        pool: &sqlx::SqlitePool,
        task_id: Uuid,
        attempt_id: Uuid,
        execution_process_id: Uuid,
        worktree_path: &str,
    ) -> Result<command_group::AsyncGroupChild, ExecutorError> {
        let mut child = self.spawn(pool, task_id, worktree_path).await?;

        // Take stderr pipe for OpenCode filtering
        let stderr = child
            .inner()
            .stderr
            .take()
            .expect("Failed to take stderr from child process");

        // Start OpenCode stderr filtering task
        let pool_clone = pool.clone();
        let worktree_path_clone = worktree_path.to_string();
        tokio::spawn(stream_opencode_stderr_to_db(
            stderr,
            pool_clone,
            attempt_id,
            execution_process_id,
            worktree_path_clone,
        ));

        Ok(child)
    }

    fn normalize_logs(
        &self,
        logs: &str,
        _worktree_path: &str,
    ) -> Result<NormalizedConversation, String> {
        let mut entries = Vec::new();

        for line in logs.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            // Simple passthrough: directly deserialize normalized JSON entries
            if let Ok(entry) = serde_json::from_str::<NormalizedEntry>(trimmed) {
                entries.push(entry);
            }
        }

        Ok(NormalizedConversation {
            entries,
            session_id: None, // Session ID is stored directly in the database
            executor_type: "sst-opencode".to_string(),
            prompt: None,
            summary: None,
        })
    }
}

#[async_trait]
impl Executor for SstOpencodeFollowupExecutor {
    async fn spawn(
        &self,
        _pool: &sqlx::SqlitePool,
        _task_id: Uuid,
        worktree_path: &str,
    ) -> Result<AsyncGroupChild, ExecutorError> {
        // Use shell command for cross-platform compatibility
        let (shell_cmd, shell_arg) = get_shell_command();
        let opencode_command = format!("{} --session {}", self.command_base, self.session_id);

        let mut command = Command::new(shell_cmd);
        command
            .kill_on_drop(true)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::null()) // Ignore stdout for OpenCode
            .stderr(std::process::Stdio::piped())
            .current_dir(worktree_path)
            .arg(shell_arg)
            .arg(&opencode_command)
            .env("NODE_NO_WARNINGS", "1");

        let mut child = command
            .group_spawn() // Create new process group so we can kill entire tree
            .map_err(|e| {
                crate::executor::SpawnContext::from_command(&command, &self.executor_type)
                    .with_context(format!(
                        "{} CLI followup execution for session {}",
                        self.executor_type, self.session_id
                    ))
                    .spawn_error(e)
            })?;

        // Write prompt to stdin safely
        if let Some(mut stdin) = child.inner().stdin.take() {
            use tokio::io::AsyncWriteExt;
            tracing::debug!(
                "Writing prompt to {} stdin for session {}: {:?}",
                self.executor_type,
                self.session_id,
                self.prompt
            );
            stdin.write_all(self.prompt.as_bytes()).await.map_err(|e| {
                let context =
                    crate::executor::SpawnContext::from_command(&command, &self.executor_type)
                        .with_context(format!(
                            "Failed to write prompt to {} CLI stdin for session {}",
                            self.executor_type, self.session_id
                        ));
                ExecutorError::spawn_failed(e, context)
            })?;
            stdin.shutdown().await.map_err(|e| {
                let context =
                    crate::executor::SpawnContext::from_command(&command, &self.executor_type)
                        .with_context(format!(
                            "Failed to close {} CLI stdin for session {}",
                            self.executor_type, self.session_id
                        ));
                ExecutorError::spawn_failed(e, context)
            })?;
        }

        Ok(child)
    }

    /// Execute with OpenCode filtering for stderr
    async fn execute_streaming(
        &self,
        pool: &sqlx::SqlitePool,
        task_id: Uuid,
        attempt_id: Uuid,
        execution_process_id: Uuid,
        worktree_path: &str,
    ) -> Result<command_group::AsyncGroupChild, ExecutorError> {
        let mut child = self.spawn(pool, task_id, worktree_path).await?;

        // Take stderr pipe for OpenCode filtering
        let stderr = child
            .inner()
            .stderr
            .take()
            .expect("Failed to take stderr from child process");

        // Start OpenCode stderr filtering task
        let pool_clone = pool.clone();
        let worktree_path_clone = worktree_path.to_string();
        tokio::spawn(stream_opencode_stderr_to_db(
            stderr,
            pool_clone,
            attempt_id,
            execution_process_id,
            worktree_path_clone,
        ));

        Ok(child)
    }

    fn normalize_logs(
        &self,
        logs: &str,
        worktree_path: &str,
    ) -> Result<NormalizedConversation, String> {
        // Reuse the same logic as the main SstOpencodeExecutor
        let main_executor = SstOpencodeExecutor::new();
        main_executor.normalize_logs(logs, worktree_path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        executor::ActionType,
        executors::sst_opencode::{
            format_opencode_content_as_normalized_json, SstOpencodeExecutor,
        },
    };

    // Test the actual format that comes from the database (normalized JSON entries)
    #[test]
    fn test_normalize_logs_with_database_format() {
        let executor = SstOpencodeExecutor::new();

        // This is what the database should contain after our streaming function processes it
        let logs = r#"{"timestamp":"2025-07-16T18:04:00Z","entry_type":{"type":"tool_use","tool_name":"Read","action_type":{"action":"file_read","path":"hello.js"}},"content":"`hello.js`","metadata":{"filePath":"/path/to/repo/hello.js"}}
{"timestamp":"2025-07-16T18:04:01Z","entry_type":{"type":"assistant_message"},"content":"I'll read the hello.js file to see its current contents.","metadata":null}
{"timestamp":"2025-07-16T18:04:02Z","entry_type":{"type":"tool_use","tool_name":"bash","action_type":{"action":"command_run","command":"ls -la"}},"content":"`ls -la`","metadata":{"command":"ls -la"}}
{"timestamp":"2025-07-16T18:04:03Z","entry_type":{"type":"assistant_message"},"content":"The file exists and contains a hello world function.","metadata":null}"#;

        let result = executor.normalize_logs(logs, "/path/to/repo").unwrap();

        assert_eq!(result.entries.len(), 4);

        // First entry: file read tool use
        assert!(matches!(
            result.entries[0].entry_type,
            crate::executor::NormalizedEntryType::ToolUse { .. }
        ));
        if let crate::executor::NormalizedEntryType::ToolUse {
            tool_name,
            action_type,
        } = &result.entries[0].entry_type
        {
            assert_eq!(tool_name, "Read");
            assert!(matches!(action_type, ActionType::FileRead { .. }));
        }
        assert_eq!(result.entries[0].content, "`hello.js`");
        assert!(result.entries[0].timestamp.is_some());

        // Second entry: assistant message
        assert!(matches!(
            result.entries[1].entry_type,
            crate::executor::NormalizedEntryType::AssistantMessage
        ));
        assert!(result.entries[1].content.contains("read the hello.js file"));

        // Third entry: bash tool use
        assert!(matches!(
            result.entries[2].entry_type,
            crate::executor::NormalizedEntryType::ToolUse { .. }
        ));
        if let crate::executor::NormalizedEntryType::ToolUse {
            tool_name,
            action_type,
        } = &result.entries[2].entry_type
        {
            assert_eq!(tool_name, "bash");
            assert!(matches!(action_type, ActionType::CommandRun { .. }));
        }

        // Fourth entry: assistant message
        assert!(matches!(
            result.entries[3].entry_type,
            crate::executor::NormalizedEntryType::AssistantMessage
        ));
        assert!(result.entries[3].content.contains("The file exists"));
    }

    #[test]
    fn test_normalize_logs_with_session_id() {
        let executor = SstOpencodeExecutor::new();

        // Test session ID in JSON metadata - current implementation always returns None for session_id
        let logs = r#"{"timestamp":"2025-07-16T18:04:00Z","entry_type":{"type":"assistant_message"},"content":"Session started","metadata":null,"session_id":"ses_abc123"}
{"timestamp":"2025-07-16T18:04:01Z","entry_type":{"type":"assistant_message"},"content":"Hello world","metadata":null}"#;

        let result = executor.normalize_logs(logs, "/tmp").unwrap();
        assert_eq!(result.session_id, None); // Session ID is stored directly in the database
        assert_eq!(result.entries.len(), 2);
    }

    #[test]
    fn test_normalize_logs_legacy_fallback() {
        let executor = SstOpencodeExecutor::new();

        // Current implementation doesn't handle legacy format - it only parses JSON entries
        let logs = r#"INFO session=ses_legacy123 starting
| Read {"filePath":"/path/to/file.js"}
This is a plain assistant message"#;

        let result = executor.normalize_logs(logs, "/tmp").unwrap();

        // Session ID is always None in current implementation
        assert_eq!(result.session_id, None);

        // Current implementation skips non-JSON lines, so no entries will be parsed
        assert_eq!(result.entries.len(), 0);
    }

    #[test]
    fn test_format_opencode_content_as_normalized_json() {
        let content = r#"| Read {"filePath":"/path/to/repo/hello.js"}
I'll read this file to understand its contents.
| bash {"command":"ls -la"}
The file listing shows several items."#;

        let result = format_opencode_content_as_normalized_json(content, "/path/to/repo");
        let lines: Vec<&str> = result
            .split('\n')
            .filter(|line| !line.trim().is_empty())
            .collect();

        // Should have 4 entries (2 tool uses + 2 assistant messages)
        assert_eq!(lines.len(), 4);

        // Parse all entries and verify unique timestamps
        let mut timestamps = Vec::new();
        for line in &lines {
            let json: serde_json::Value = serde_json::from_str(line).unwrap();
            let timestamp = json["timestamp"].as_str().unwrap().to_string();
            timestamps.push(timestamp);
        }

        // Verify all timestamps are unique (no duplicates)
        let mut unique_timestamps = timestamps.clone();
        unique_timestamps.sort();
        unique_timestamps.dedup();
        assert_eq!(
            timestamps.len(),
            unique_timestamps.len(),
            "All timestamps should be unique"
        );

        // Parse the first line (should be Read tool use)
        let first_json: serde_json::Value = serde_json::from_str(lines[0]).unwrap();
        assert_eq!(first_json["entry_type"]["type"], "tool_use");
        assert_eq!(first_json["entry_type"]["tool_name"], "Read");
        assert_eq!(first_json["content"], "`hello.js`");

        // Parse the second line (should be assistant message)
        let second_json: serde_json::Value = serde_json::from_str(lines[1]).unwrap();
        assert_eq!(second_json["entry_type"]["type"], "assistant_message");
        assert!(second_json["content"]
            .as_str()
            .unwrap()
            .contains("read this file"));

        // Parse the third line (should be bash tool use)
        let third_json: serde_json::Value = serde_json::from_str(lines[2]).unwrap();
        assert_eq!(third_json["entry_type"]["type"], "tool_use");
        assert_eq!(third_json["entry_type"]["tool_name"], "bash");
        assert_eq!(third_json["content"], "`ls -la`");

        // Verify timestamps include microseconds for uniqueness
        for timestamp in timestamps {
            assert!(
                timestamp.contains('.'),
                "Timestamp should include microseconds: {}",
                timestamp
            );
        }
    }

    #[test]
    fn test_format_opencode_content_todo_operations() {
        let content = r#"| TodoWrite {"todos":[{"id":"1","content":"Fix bug","status":"completed","priority":"high"},{"id":"2","content":"Add feature","status":"in_progress","priority":"medium"}]}"#;

        let result = format_opencode_content_as_normalized_json(content, "/tmp");
        let json: serde_json::Value = serde_json::from_str(&result).unwrap();

        assert_eq!(json["entry_type"]["type"], "tool_use");
        assert_eq!(json["entry_type"]["tool_name"], "todowrite"); // Normalized from "TodoWrite"
        assert_eq!(json["entry_type"]["action_type"]["action"], "other"); // Changed from task_create to other

        // Should contain formatted todo list
        let content_str = json["content"].as_str().unwrap();
        assert!(content_str.contains("TODO List:"));
        assert!(content_str.contains("✅ Fix bug (high)"));
        assert!(content_str.contains("🔄 Add feature (medium)"));
    }

    #[test]
    fn test_format_opencode_content_todo_tool() {
        // Test the "Todo" tool (case-sensitive, different from todowrite/todoread)
        let content = r#"| Todo {"todos":[{"id":"1","content":"Review code","status":"pending","priority":"high"},{"id":"2","content":"Write tests","status":"in_progress","priority":"low"}]}"#;

        let result = format_opencode_content_as_normalized_json(content, "/tmp");
        let json: serde_json::Value = serde_json::from_str(&result).unwrap();

        assert_eq!(json["entry_type"]["type"], "tool_use");
        assert_eq!(json["entry_type"]["tool_name"], "todowrite"); // Normalized from "Todo"
        assert_eq!(json["entry_type"]["action_type"]["action"], "other"); // Changed from task_create to other

        // Should contain formatted todo list with proper emojis
        let content_str = json["content"].as_str().unwrap();
        assert!(content_str.contains("TODO List:"));
        assert!(content_str.contains("⏳ Review code (high)"));
        assert!(content_str.contains("🔄 Write tests (low)"));
    }

    #[test]
    fn test_opencode_filter_noise_detection() {
        use crate::executors::sst_opencode::filter::OpenCodeFilter;

        // Test noise detection
        assert!(OpenCodeFilter::is_noise(""));
        assert!(OpenCodeFilter::is_noise("   "));
        assert!(OpenCodeFilter::is_noise("█▀▀█ █▀▀█ Banner"));
        assert!(OpenCodeFilter::is_noise("@ anthropic/claude-sonnet-4"));
        assert!(OpenCodeFilter::is_noise("~ https://opencode.ai/s/abc123"));
        assert!(OpenCodeFilter::is_noise("DEBUG some debug info"));
        assert!(OpenCodeFilter::is_noise("INFO  session info"));
        assert!(OpenCodeFilter::is_noise("┌─────────────────┐"));

        // Test clean content detection (not noise)
        assert!(!OpenCodeFilter::is_noise("| Read {\"file\":\"test.js\"}"));
        assert!(!OpenCodeFilter::is_noise("Assistant response text"));
        assert!(!OpenCodeFilter::is_noise("{\"type\":\"content\"}"));
        assert!(!OpenCodeFilter::is_noise("session=abc123 started"));
        assert!(!OpenCodeFilter::is_noise("Normal conversation text"));
    }

    #[test]
    fn test_normalize_logs_edge_cases() {
        let executor = SstOpencodeExecutor::new();

        // Empty content
        let result = executor.normalize_logs("", "/tmp").unwrap();
        assert_eq!(result.entries.len(), 0);

        // Only whitespace
        let result = executor.normalize_logs("   \n\t\n   ", "/tmp").unwrap();
        assert_eq!(result.entries.len(), 0);

        // Malformed JSON (current implementation skips invalid JSON)
        let malformed = r#"{"timestamp":"2025-01-16T18:04:00Z","content":"incomplete"#;
        let result = executor.normalize_logs(malformed, "/tmp").unwrap();
        assert_eq!(result.entries.len(), 0); // Current implementation skips invalid JSON

        // Mixed valid and invalid JSON
        let mixed = r#"{"timestamp":"2025-01-16T18:04:00Z","entry_type":{"type":"assistant_message"},"content":"Valid entry","metadata":null}
Invalid line that's not JSON
{"timestamp":"2025-01-16T18:04:01Z","entry_type":{"type":"assistant_message"},"content":"Another valid entry","metadata":null}"#;
        let result = executor.normalize_logs(mixed, "/tmp").unwrap();
        assert_eq!(result.entries.len(), 2); // Only valid JSON entries are parsed
    }

    #[test]
    fn test_ansi_code_stripping() {
        use crate::executors::sst_opencode::filter::OpenCodeFilter;

        // Test ANSI escape sequence removal
        let ansi_text = "\x1b[31mRed text\x1b[0m normal text";
        let cleaned = OpenCodeFilter::strip_ansi_codes(ansi_text);
        assert_eq!(cleaned, "Red text normal text");

        // Test unicode escape sequences
        let unicode_ansi = "Text with \\u001b[32mgreen\\u001b[0m color";
        let cleaned = OpenCodeFilter::strip_ansi_codes(unicode_ansi);
        assert_eq!(cleaned, "Text with green color");

        // Test text without ANSI codes (unchanged)
        let plain_text = "Regular text without codes";
        let cleaned = OpenCodeFilter::strip_ansi_codes(plain_text);
        assert_eq!(cleaned, plain_text);
    }
}
