use async_trait::async_trait;
use command_group::{AsyncCommandGroup, AsyncGroupChild};
use serde_json::Value;
use tokio::{
    io::{AsyncBufReadExt, BufReader},
    process::Command,
};
use uuid::Uuid;

use crate::{
    executor::{
        ActionType, Executor, ExecutorError, NormalizedConversation, NormalizedEntry,
        NormalizedEntryType,
    },
    models::{
        execution_process::ExecutionProcess, executor_session::ExecutorSession, task::Task,
        task_attempt::TaskAttempt,
    },
    utils::{path::make_path_relative, shell::get_shell_command},
};

// Sub-modules for utilities
pub mod filter;

use self::filter::{parse_session_id_from_line, AiderFilter};

/// State for tracking diff blocks (SEARCH/REPLACE patterns)
#[derive(Debug, Clone)]
struct DiffBlockState {
    /// Current mode: None, InSearch, InReplace
    mode: DiffMode,
    /// Accumulated content for the current diff block
    content: Vec<String>,
    /// Start timestamp for the diff block
    start_timestamp: Option<chrono::DateTime<chrono::Utc>>,
    /// Buffered line that might be a file name
    buffered_line: Option<String>,
    /// File name associated with current diff block
    current_file: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
enum DiffMode {
    None,
    InSearch,
    InReplace,
}

impl Default for DiffBlockState {
    fn default() -> Self {
        Self {
            mode: DiffMode::None,
            content: Vec::new(),
            start_timestamp: None,
            buffered_line: None,
            current_file: None,
        }
    }
}

struct Content {
    pub stdout: Option<String>,
    pub stderr: Option<String>,
}

/// Process a single line for session extraction and content formatting
async fn process_line_for_content(
    line: &str,
    session_extracted: &mut bool,
    diff_state: &mut DiffBlockState,
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

    // Filter out noise completely
    if AiderFilter::is_noise(line) {
        return None;
    }

    // Filter out user input echo
    if AiderFilter::is_user_input(line) {
        return None;
    }

    // Handle diff block markers (SEARCH/REPLACE patterns)
    if AiderFilter::is_diff_block_marker(line) {
        let trimmed = line.trim();

        match trimmed {
            "<<<<<<< SEARCH" => {
                // If we have a buffered line, it's the file name for this diff
                if let Some(buffered) = diff_state.buffered_line.take() {
                    diff_state.current_file = Some(buffered);
                }

                diff_state.mode = DiffMode::InSearch;
                diff_state.content.clear();
                diff_state.start_timestamp = Some(chrono::Utc::now());
                return None; // Don't output individual markers
            }
            "=======" => {
                if diff_state.mode == DiffMode::InSearch {
                    diff_state.mode = DiffMode::InReplace;
                    return None; // Don't output individual markers
                }
            }
            ">>>>>>> REPLACE" => {
                if diff_state.mode == DiffMode::InReplace {
                    // End of diff block - create atomic edit action
                    let diff_content = diff_state.content.join("\n");
                    let formatted = format_diff_as_normalized_json(
                        &diff_content,
                        diff_state.current_file.as_deref(),
                        diff_state.start_timestamp,
                        worktree_path,
                    );

                    // Reset state
                    diff_state.mode = DiffMode::None;
                    diff_state.content.clear();
                    diff_state.start_timestamp = None;
                    diff_state.current_file = None;

                    return Some(Content {
                        stdout: Some(formatted),
                        stderr: None,
                    });
                }
            }
            _ => {}
        }
        return None;
    }

    // If we're inside a diff block, accumulate content
    if diff_state.mode != DiffMode::None {
        diff_state.content.push(line.to_string());
        return None; // Don't output individual lines within diff blocks
    }

    // Check if we have a buffered line from previous call
    let mut result = None;
    if let Some(buffered) = diff_state.buffered_line.take() {
        // Output the buffered line as a normal message since current line is not a diff marker
        let formatted = format_aider_content_as_normalized_json(&buffered, worktree_path);
        result = Some(Content {
            stdout: Some(formatted),
            stderr: None,
        });
    }

    // Check if line is a system message
    if AiderFilter::is_system_message(line) {
        // Apply scanning repo progress simplification for system messages
        let processed_line = if AiderFilter::is_scanning_repo_progress(line) {
            AiderFilter::simplify_scanning_repo_message(line)
        } else {
            line.to_string()
        };

        let formatted = format_aider_content_as_normalized_json(&processed_line, worktree_path);

        // If we had a buffered line, we need to handle both outputs
        if result.is_some() {
            // For now, prioritize the current system message and drop the buffered one
            // TODO: In a real implementation, we might want to queue both
        }

        return Some(Content {
            stdout: Some(formatted),
            stderr: None,
        });
    }

    // Check if line is an error
    if AiderFilter::is_error(line) {
        let formatted = format_aider_content_as_normalized_json(line, worktree_path);

        // If we had a buffered line, prioritize the error
        return Some(Content {
            stdout: result.and_then(|r| r.stdout),
            stderr: Some(formatted),
        });
    }

    // Regular assistant message - buffer it in case next line is a diff marker
    let trimmed = line.trim();
    if !trimmed.is_empty() {
        diff_state.buffered_line = Some(line.to_string());
    }

    // Return any previously buffered content
    result
}

/// Stream stdout and stderr from Aider process with filtering
pub async fn stream_aider_stdout_stderr_to_db(
    stdout: impl tokio::io::AsyncRead + Unpin + Send + 'static,
    stderr: impl tokio::io::AsyncRead + Unpin + Send + 'static,
    pool: sqlx::SqlitePool,
    attempt_id: Uuid,
    execution_process_id: Uuid,
    worktree_path: String,
) {
    let stdout_task = {
        let pool = pool.clone();
        let worktree_path = worktree_path.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(stdout);
            let mut line = String::new();
            let mut session_extracted = false;
            let mut diff_state = DiffBlockState::default();

            loop {
                line.clear();

                match reader.read_line(&mut line).await {
                    Ok(0) => break, // EOF
                    Ok(_) => {
                        line = line.trim_end_matches(['\r', '\n']).to_string();

                        let content = process_line_for_content(
                            &line,
                            &mut session_extracted,
                            &mut diff_state,
                            &worktree_path,
                            &pool,
                            execution_process_id,
                        )
                        .await;

                        if let Some(Content { stdout, stderr }) = content {
                            if let Err(e) = ExecutionProcess::append_output(
                                &pool,
                                execution_process_id,
                                stdout.as_deref(),
                                stderr.as_deref(),
                            )
                            .await
                            {
                                tracing::error!(
                                    "Failed to write Aider stdout line for attempt {}: {}",
                                    attempt_id,
                                    e
                                );
                            }
                        }
                    }
                    Err(e) => {
                        tracing::error!("Error reading stdout for attempt {}: {}", attempt_id, e);
                        break;
                    }
                }
            }

            // Flush any remaining buffered content
            if let Some(Content { stdout, stderr }) =
                flush_buffered_content(&mut diff_state, &worktree_path)
            {
                if let Err(e) = ExecutionProcess::append_output(
                    &pool,
                    execution_process_id,
                    stdout.as_deref(),
                    stderr.as_deref(),
                )
                .await
                {
                    tracing::error!(
                        "Failed to write Aider buffered stdout line for attempt {}: {}",
                        attempt_id,
                        e
                    );
                }
            }
        })
    };

    let stderr_task = {
        let pool = pool.clone();
        let worktree_path = worktree_path.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(stderr);
            let mut line = String::new();

            loop {
                line.clear();

                match reader.read_line(&mut line).await {
                    Ok(0) => break, // EOF
                    Ok(_) => {
                        let trimmed = line.trim_end_matches(['\r', '\n']);

                        // Apply filtering to stderr - filter out noise like "Scanning repo" progress
                        if !trimmed.trim().is_empty() && !AiderFilter::is_noise(trimmed) {
                            let formatted =
                                format_aider_content_as_normalized_json(trimmed, &worktree_path);

                            if let Err(e) = ExecutionProcess::append_output(
                                &pool,
                                execution_process_id,
                                None, // No stdout content from stderr
                                Some(&formatted),
                            )
                            .await
                            {
                                tracing::error!(
                                    "Failed to write Aider stderr line for attempt {}: {}",
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
        })
    };

    // Wait for both tasks to complete
    let _ = tokio::join!(stdout_task, stderr_task);
}

/// Format diff content as a normalized JSON entry for atomic edit actions
fn format_diff_as_normalized_json(
    _content: &str,
    file_name: Option<&str>,
    start_timestamp: Option<chrono::DateTime<chrono::Utc>>,
    worktree_path: &str,
) -> String {
    let timestamp = start_timestamp.unwrap_or_else(chrono::Utc::now);
    let timestamp_str = timestamp.to_rfc3339_opts(chrono::SecondsFormat::Micros, true);

    let raw_path = file_name.unwrap_or("multiple_files").to_string();

    // Normalize the path to be relative to worktree root (matching git diff format)
    let path = make_path_relative(&raw_path, worktree_path);

    let normalized_entry = NormalizedEntry {
        timestamp: Some(timestamp_str),
        entry_type: NormalizedEntryType::ToolUse {
            tool_name: "edit".to_string(),
            action_type: ActionType::FileWrite { path: path.clone() },
        },
        content: format!("`{}`", path),
        metadata: None,
    };

    serde_json::to_string(&normalized_entry).unwrap() + "\n"
}

/// Flush any remaining buffered content when stream ends
fn flush_buffered_content(diff_state: &mut DiffBlockState, worktree_path: &str) -> Option<Content> {
    if let Some(buffered) = diff_state.buffered_line.take() {
        let formatted = format_aider_content_as_normalized_json(&buffered, worktree_path);
        Some(Content {
            stdout: Some(formatted),
            stderr: None,
        })
    } else {
        None
    }
}

/// Format Aider content as normalized JSON entries for direct database storage
pub fn format_aider_content_as_normalized_json(content: &str, _worktree_path: &str) -> String {
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

        if trimmed.is_empty() {
            continue;
        }

        // Check message type and create appropriate normalized entry
        let normalized_entry = if AiderFilter::is_system_message(trimmed) {
            NormalizedEntry {
                timestamp: Some(timestamp_str),
                entry_type: NormalizedEntryType::SystemMessage,
                content: trimmed.to_string(),
                metadata: None,
            }
        } else if AiderFilter::is_error(trimmed) {
            NormalizedEntry {
                timestamp: Some(timestamp_str),
                entry_type: NormalizedEntryType::ErrorMessage,
                content: trimmed.to_string(),
                metadata: None,
            }
        } else {
            // Regular assistant message
            NormalizedEntry {
                timestamp: Some(timestamp_str),
                entry_type: NormalizedEntryType::AssistantMessage,
                content: trimmed.to_string(),
                metadata: None,
            }
        };

        results.push(serde_json::to_string(&normalized_entry).unwrap());
    }

    // Ensure each JSON entry is on its own line
    results.join("\n") + "\n"
}

/// An executor that uses Aider CLI to process tasks
pub struct AiderExecutor {
    executor_type: String,
    command: String,
}

impl Default for AiderExecutor {
    fn default() -> Self {
        Self::new()
    }
}

impl AiderExecutor {
    /// Create a new AiderExecutor with default settings
    pub fn new() -> Self {
        Self {
            executor_type: "Aider".to_string(),
            command: "aider . --yes-always --no-show-model-warnings --skip-sanity-check-repo --no-stream --no-fancy-input".to_string(),
        }
    }
}

#[async_trait]
impl Executor for AiderExecutor {
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
            format!("{}\n{}", task.title, task_description)
        } else {
            task.title.to_string()
        };

        // Create temporary message file
        let base_dir = TaskAttempt::get_worktree_base_dir();
        let sessions_dir = base_dir.join("aider").join("aider-messages");
        if let Err(e) = tokio::fs::create_dir_all(&sessions_dir).await {
            tracing::warn!(
                "Failed to create temp message directory {}: {}",
                sessions_dir.display(),
                e
            );
        }

        let message_file = sessions_dir.join(format!("task_{}.md", task_id));

        // Generate our own session ID and store it in the database immediately
        let session_id = format!("aider_task_{}", task_id);

        // Create session directory and chat history file for session persistence
        let session_dir = base_dir.join("aider").join("aider-sessions");
        if let Err(e) = tokio::fs::create_dir_all(&session_dir).await {
            tracing::warn!(
                "Failed to create session directory {}: {}",
                session_dir.display(),
                e
            );
        }
        let chat_file = session_dir.join(format!("{}.md", session_id));

        // Use shell command for cross-platform compatibility
        let (shell_cmd, shell_arg) = get_shell_command();
        let aider_command = format!(
            "{} --chat-history-file {} --message-file {}",
            &self.command,
            chat_file.to_string_lossy(),
            message_file.to_string_lossy()
        );

        let mut command = Command::new(shell_cmd);
        command
            .kill_on_drop(true)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .current_dir(worktree_path)
            .env("COLUMNS", "1000") // Prevent line wrapping in aider output
            .arg(shell_arg)
            .arg(&aider_command);

        tracing::debug!("Spawning Aider command: {}", &aider_command);

        // Write message file after command is prepared for better error context
        tokio::fs::write(&message_file, prompt.as_bytes())
            .await
            .map_err(|e| {
                let context =
                    crate::executor::SpawnContext::from_command(&command, &self.executor_type)
                        .with_task(task_id, Some(task.title.clone()))
                        .with_context(format!(
                            "Failed to write message file {}",
                            message_file.display()
                        ));
                ExecutorError::spawn_failed(e, context)
            })?;

        let child = command
            .group_spawn() // Create new process group so we can kill entire tree
            .map_err(|e| {
                crate::executor::SpawnContext::from_command(&command, &self.executor_type)
                    .with_task(task_id, Some(task.title.clone()))
                    .with_context(format!("{} CLI execution for new task", self.executor_type))
                    .spawn_error(e)
            })?;

        tracing::debug!(
            "Started Aider with message file {} for task {}: {:?}",
            message_file.display(),
            task_id,
            prompt
        );

        Ok(child)
    }

    /// Execute with Aider filtering for stdout and stderr
    async fn execute_streaming(
        &self,
        pool: &sqlx::SqlitePool,
        task_id: Uuid,
        attempt_id: Uuid,
        execution_process_id: Uuid,
        worktree_path: &str,
    ) -> Result<command_group::AsyncGroupChild, ExecutorError> {
        // Generate our own session ID and store it in the database immediately
        let session_id = format!("aider_task_{}", task_id);
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
                "Set session ID {} for execution process {}",
                session_id,
                execution_process_id
            );
        }

        let mut child = self.spawn(pool, task_id, worktree_path).await?;

        // Take stdout and stderr pipes for Aider filtering
        let stdout = child
            .inner()
            .stdout
            .take()
            .expect("Failed to take stdout from child process");

        let stderr = child
            .inner()
            .stderr
            .take()
            .expect("Failed to take stderr from child process");

        // Start Aider filtering task
        let pool_clone = pool.clone();
        let worktree_path_clone = worktree_path.to_string();
        tokio::spawn(stream_aider_stdout_stderr_to_db(
            stdout,
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
            executor_type: "aider".to_string(),
            prompt: None,
            summary: None,
        })
    }

    /// Execute follow-up with Aider filtering for stdout and stderr
    async fn execute_followup_streaming(
        &self,
        pool: &sqlx::SqlitePool,
        task_id: Uuid,
        attempt_id: Uuid,
        execution_process_id: Uuid,
        session_id: &str,
        prompt: &str,
        worktree_path: &str,
    ) -> Result<command_group::AsyncGroupChild, ExecutorError> {
        // Update session ID for this execution process to ensure continuity
        if let Err(e) =
            ExecutorSession::update_session_id(pool, execution_process_id, session_id).await
        {
            tracing::error!(
                "Failed to update session ID for followup execution process {}: {}",
                execution_process_id,
                e
            );
        } else {
            tracing::info!(
                "Updated session ID {} for followup execution process {}",
                session_id,
                execution_process_id
            );
        }

        let mut child = self
            .spawn_followup(pool, task_id, session_id, prompt, worktree_path)
            .await?;

        // Take stdout and stderr pipes for Aider filtering
        let stdout = child
            .inner()
            .stdout
            .take()
            .expect("Failed to take stdout from child process");

        let stderr = child
            .inner()
            .stderr
            .take()
            .expect("Failed to take stderr from child process");

        // Start Aider filtering task
        let pool_clone = pool.clone();
        let worktree_path_clone = worktree_path.to_string();
        tokio::spawn(stream_aider_stdout_stderr_to_db(
            stdout,
            stderr,
            pool_clone,
            attempt_id,
            execution_process_id,
            worktree_path_clone,
        ));

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
        let base_dir = TaskAttempt::get_worktree_base_dir();

        // Create session directory if it doesn't exist
        let session_dir = base_dir.join("aider").join("aider-sessions");
        if let Err(e) = tokio::fs::create_dir_all(&session_dir).await {
            tracing::warn!(
                "Failed to create session directory {}: {}",
                session_dir.display(),
                e
            );
        }

        let chat_file = session_dir.join(format!("{}.md", session_id));

        // Create temporary message file for the followup prompt
        let sessions_dir = base_dir.join("aider").join("aider-messages");
        if let Err(e) = tokio::fs::create_dir_all(&sessions_dir).await {
            tracing::warn!(
                "Failed to create temp message directory {}: {}",
                sessions_dir.display(),
                e
            );
        }

        let message_file = sessions_dir.join(format!("followup_{}.md", session_id));

        // Use shell command for cross-platform compatibility
        let (shell_cmd, shell_arg) = get_shell_command();
        let aider_command = format!(
            "{} --restore-chat-history --chat-history-file {} --message-file {}",
            self.command,
            chat_file.to_string_lossy(),
            message_file.to_string_lossy()
        );

        let mut command = Command::new(shell_cmd);
        command
            .kill_on_drop(true)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .current_dir(worktree_path)
            .env("COLUMNS", "1000") // Prevent line wrapping in aider output
            .arg(shell_arg)
            .arg(&aider_command);

        tracing::debug!("Spawning Aider command: {}", &aider_command);

        // Write message file after command is prepared for better error context
        tokio::fs::write(&message_file, prompt.as_bytes())
            .await
            .map_err(|e| {
                let context =
                    crate::executor::SpawnContext::from_command(&command, &self.executor_type)
                        .with_context(format!(
                            "Failed to write followup message file {}",
                            message_file.display()
                        ));
                ExecutorError::spawn_failed(e, context)
            })?;

        let child = command.group_spawn().map_err(|e| {
            crate::executor::SpawnContext::from_command(&command, &self.executor_type)
                .with_context(format!(
                    "{} CLI followup execution for session {}",
                    self.executor_type, session_id
                ))
                .spawn_error(e)
        })?;

        tracing::debug!(
            "Started Aider followup with message file {} and chat history {} for session {}: {:?}",
            message_file.display(),
            chat_file.display(),
            session_id,
            prompt
        );

        Ok(child)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::executors::aider::{format_aider_content_as_normalized_json, AiderExecutor};

    #[test]
    fn test_normalize_logs_with_database_format() {
        let executor = AiderExecutor::new();

        // This is what the database should contain after our streaming function processes it
        let logs = r#"{"timestamp":"2025-07-21T18:04:00Z","entry_type":{"type":"system_message"},"content":"Main model: anthropic/claude-sonnet-4-20250514","metadata":null}
{"timestamp":"2025-07-21T18:04:01Z","entry_type":{"type":"assistant_message"},"content":"I'll help you with this task.","metadata":null}
{"timestamp":"2025-07-21T18:04:02Z","entry_type":{"type":"error_message"},"content":"Error: File not found","metadata":null}
{"timestamp":"2025-07-21T18:04:03Z","entry_type":{"type":"assistant_message"},"content":"Let me try a different approach.","metadata":null}"#;

        let result = executor.normalize_logs(logs, "/path/to/repo").unwrap();

        assert_eq!(result.entries.len(), 4);

        // First entry: system message
        assert!(matches!(
            result.entries[0].entry_type,
            crate::executor::NormalizedEntryType::SystemMessage
        ));
        assert!(result.entries[0].content.contains("Main model:"));
        assert!(result.entries[0].timestamp.is_some());

        // Second entry: assistant message
        assert!(matches!(
            result.entries[1].entry_type,
            crate::executor::NormalizedEntryType::AssistantMessage
        ));
        assert!(result.entries[1]
            .content
            .contains("help you with this task"));

        // Third entry: error message
        assert!(matches!(
            result.entries[2].entry_type,
            crate::executor::NormalizedEntryType::ErrorMessage
        ));
        assert!(result.entries[2].content.contains("File not found"));

        // Fourth entry: assistant message
        assert!(matches!(
            result.entries[3].entry_type,
            crate::executor::NormalizedEntryType::AssistantMessage
        ));
        assert!(result.entries[3].content.contains("different approach"));
    }

    #[test]
    fn test_format_aider_content_as_normalized_json() {
        let content = r#"Main model: anthropic/claude-sonnet-4-20250514
I'll help you implement this feature.
Error: Could not access file
Let me try a different approach."#;

        let result = format_aider_content_as_normalized_json(content, "/path/to/repo");
        let lines: Vec<&str> = result
            .split('\n')
            .filter(|line| !line.trim().is_empty())
            .collect();

        // Should have 4 entries (1 system + 2 assistant + 1 error)
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

        // Parse the first line (should be system message)
        let first_json: serde_json::Value = serde_json::from_str(lines[0]).unwrap();
        assert_eq!(first_json["entry_type"]["type"], "system_message");
        assert!(first_json["content"]
            .as_str()
            .unwrap()
            .contains("Main model:"));

        // Parse the second line (should be assistant message)
        let second_json: serde_json::Value = serde_json::from_str(lines[1]).unwrap();
        assert_eq!(second_json["entry_type"]["type"], "assistant_message");
        assert!(second_json["content"]
            .as_str()
            .unwrap()
            .contains("help you implement"));

        // Parse the third line (should be error message)
        let third_json: serde_json::Value = serde_json::from_str(lines[2]).unwrap();
        assert_eq!(third_json["entry_type"]["type"], "error_message");
        assert!(third_json["content"]
            .as_str()
            .unwrap()
            .contains("Could not access"));

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
    fn test_normalize_logs_edge_cases() {
        let executor = AiderExecutor::new();

        // Empty content
        let result = executor.normalize_logs("", "/tmp").unwrap();
        assert_eq!(result.entries.len(), 0);

        // Only whitespace
        let result = executor.normalize_logs("   \n\t\n   ", "/tmp").unwrap();
        assert_eq!(result.entries.len(), 0);

        // Malformed JSON (current implementation skips invalid JSON)
        let malformed = r#"{"timestamp":"2025-07-21T18:04:00Z","content":"incomplete"#;
        let result = executor.normalize_logs(malformed, "/tmp").unwrap();
        assert_eq!(result.entries.len(), 0); // Current implementation skips invalid JSON

        // Mixed valid and invalid JSON
        let mixed = r#"{"timestamp":"2025-07-21T18:04:00Z","entry_type":{"type":"assistant_message"},"content":"Valid entry","metadata":null}
Invalid line that's not JSON
{"timestamp":"2025-07-21T18:04:01Z","entry_type":{"type":"system_message"},"content":"Another valid entry","metadata":null}"#;
        let result = executor.normalize_logs(mixed, "/tmp").unwrap();
        assert_eq!(result.entries.len(), 2); // Only valid JSON entries are parsed
    }
}
