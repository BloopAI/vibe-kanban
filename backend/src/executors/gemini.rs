use std::{collections::VecDeque, process::Stdio, time::Instant};

use async_trait::async_trait;
use command_group::{AsyncCommandGroup, AsyncGroupChild};
use tokio::{io::AsyncWriteExt, process::Command};
use uuid::Uuid;

use crate::{
    executor::{
        Executor, ExecutorError, NormalizedConversation, NormalizedEntry, NormalizedEntryType,
    },
    models::{execution_process::ExecutionProcess, task::Task},
    utils::shell::get_shell_command,
};

// Constants for configuration
const PATTERN_BREAK_TIMEOUT_SECS: u64 = 5;

/// An executor that uses Gemini CLI to process tasks
pub struct GeminiExecutor;

/// An executor that continues a Gemini task with context from previous execution
pub struct GeminiFollowupExecutor {
    pub attempt_id: Uuid,
    pub prompt: String,
}

#[async_trait]
impl Executor for GeminiExecutor {
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
        let gemini_command = "npx @google/gemini-cli@latest --yolo";

        let mut command = Command::new(shell_cmd);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(worktree_path)
            .arg(shell_arg)
            .arg(gemini_command)
            .env("NODE_NO_WARNINGS", "1");

        let mut child = command
            .group_spawn() // Create new process group so we can kill entire tree
            .map_err(|e| {
                crate::executor::SpawnContext::from_command(&command, "Gemini")
                    .with_task(task_id, Some(task.title.clone()))
                    .with_context("Gemini CLI execution for new task")
                    .spawn_error(e)
            })?;

        // Write prompt to stdin
        if let Some(mut stdin) = child.inner().stdin.take() {
            tracing::debug!(
                "Writing prompt to Gemini stdin for task {}: {:?}",
                task_id,
                prompt
            );
            stdin.write_all(prompt.as_bytes()).await.map_err(|e| {
                let context = crate::executor::SpawnContext::from_command(&command, "Gemini")
                    .with_task(task_id, Some(task.title.clone()))
                    .with_context("Failed to write prompt to Gemini CLI stdin");
                ExecutorError::spawn_failed(e, context)
            })?;
            stdin.shutdown().await.map_err(|e| {
                let context = crate::executor::SpawnContext::from_command(&command, "Gemini")
                    .with_task(task_id, Some(task.title.clone()))
                    .with_context("Failed to close Gemini CLI stdin");
                ExecutorError::spawn_failed(e, context)
            })?;
            tracing::info!(
                "Successfully sent prompt to Gemini stdin for task {}",
                task_id
            );
        }

        Ok(child)
    }

    async fn execute_streaming(
        &self,
        pool: &sqlx::SqlitePool,
        task_id: Uuid,
        attempt_id: Uuid,
        execution_process_id: Uuid,
        worktree_path: &str,
    ) -> Result<AsyncGroupChild, ExecutorError> {
        tracing::info!(
            "Starting Gemini execution for task {} attempt {}",
            task_id,
            attempt_id
        );

        // Update ExecutorSession with the session_id immediately
        if let Err(e) = crate::models::executor_session::ExecutorSession::update_session_id(
            pool,
            execution_process_id,
            &attempt_id.to_string(),
        )
        .await
        {
            tracing::error!(
                "Failed to update session ID for Gemini execution process {}: {}",
                execution_process_id,
                e
            );
        } else {
            tracing::info!(
                "Updated session ID {} for Gemini execution process {}",
                attempt_id,
                execution_process_id
            );
        }

        let mut child = self.spawn(pool, task_id, worktree_path).await?;

        tracing::info!(
            "Gemini process spawned successfully for attempt {}, PID: {:?}",
            attempt_id,
            child.inner().id()
        );

        // Take stdout and stderr pipes for streaming
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

        // Start streaming tasks with Gemini-specific line-based message updates
        let pool_clone1 = pool.clone();
        let pool_clone2 = pool.clone();

        tokio::spawn(Self::stream_gemini_with_lines(
            stdout,
            pool_clone1,
            attempt_id,
            execution_process_id,
            true,
        ));
        // Use default stderr streaming (no custom parsing)
        tokio::spawn(crate::executor::stream_output_to_db(
            stderr,
            pool_clone2,
            attempt_id,
            execution_process_id,
            false,
        ));

        Ok(child)
    }

    fn normalize_logs(
        &self,
        logs: &str,
        _worktree_path: &str,
    ) -> Result<NormalizedConversation, String> {
        let mut entries: Vec<NormalizedEntry> = Vec::new();
        let mut parse_errors = Vec::new();

        for (line_num, line) in logs.lines().enumerate() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            // Try to parse as JSON first (for NormalizedEntry format)
            if trimmed.starts_with('{') {
                match serde_json::from_str::<NormalizedEntry>(trimmed) {
                    Ok(entry) => {
                        entries.push(entry);
                    }
                    Err(e) => {
                        tracing::warn!(
                            "Failed to parse JSONL line {} in Gemini logs: {} - Line: {}",
                            line_num + 1,
                            e,
                            trimmed
                        );
                        parse_errors.push(format!("Line {}: {}", line_num + 1, e));

                        // Create a fallback entry for unrecognized JSON
                        let fallback_entry = NormalizedEntry {
                            timestamp: Some(chrono::Utc::now().to_rfc3339()),
                            entry_type: NormalizedEntryType::SystemMessage,
                            content: format!("Raw output: {}", trimmed),
                            metadata: None,
                        };
                        entries.push(fallback_entry);
                    }
                }
            } else {
                // For non-JSON lines, treat as plain text content
                let text_entry = NormalizedEntry {
                    timestamp: Some(chrono::Utc::now().to_rfc3339()),
                    entry_type: NormalizedEntryType::AssistantMessage,
                    content: trimmed.to_string(),
                    metadata: None,
                };
                entries.push(text_entry);
            }
        }

        if !parse_errors.is_empty() {
            tracing::warn!(
                "Gemini normalize_logs encountered {} parse errors: {}",
                parse_errors.len(),
                parse_errors.join("; ")
            );
        }

        tracing::debug!(
            "Gemini normalize_logs processed {} lines, created {} entries",
            logs.lines().count(),
            entries.len()
        );

        Ok(NormalizedConversation {
            entries,
            session_id: None, // Session ID is managed directly via database, not extracted from logs
            executor_type: "gemini".to_string(),
            prompt: None,
            summary: None,
        })
    }
}

impl GeminiExecutor {
    /// Stream Gemini output with real-time, line-by-line message updates using a queue-based approach.
    async fn stream_gemini_with_lines(
        output: impl tokio::io::AsyncRead + Unpin,
        pool: sqlx::SqlitePool,
        attempt_id: Uuid,
        execution_process_id: Uuid,
        is_stdout: bool,
    ) {
        use std::collections::VecDeque;

        use tokio::io::{AsyncReadExt, BufReader};

        if !is_stdout {
            // For stderr, use the default database streaming without special formatting
            crate::executor::stream_output_to_db(
                output,
                pool,
                attempt_id,
                execution_process_id,
                false,
            )
            .await;
            return;
        }

        let mut reader = BufReader::new(output);
        let mut last_emit_time = Instant::now();
        let mut full_raw_output = String::new();
        let mut segment_queue: VecDeque<String> = VecDeque::new();
        let mut incomplete_line_buffer = String::new();

        tracing::info!(
            "Starting Gemini line-based stdout streaming for attempt {}",
            attempt_id
        );

        let mut buffer = [0; 1024]; // Read in chunks for performance and UTF-8 safety
        loop {
            // First, drain any pending segments from the queue
            while let Some(segment_content) = segment_queue.pop_front() {
                if !segment_content.trim().is_empty() {
                    tracing::debug!(
                        "Emitting segment for attempt {}: {:?}",
                        attempt_id,
                        segment_content
                    );
                    Self::emit_normalized_message(
                        &pool,
                        execution_process_id,
                        &segment_content,
                        &mut last_emit_time,
                    )
                    .await;
                }
            }

            // Then read new content from the reader
            match reader.read(&mut buffer).await {
                Ok(0) => {
                    // EOF - process any remaining content
                    tracing::info!(
                        "Gemini stdout reached EOF for attempt {}, processing final content",
                        attempt_id
                    );
                    break;
                }
                Ok(n) => {
                    let chunk_str = String::from_utf8_lossy(&buffer[..n]);
                    tracing::debug!(
                        "Gemini stdout chunk received for attempt {} ({} bytes): {:?}",
                        attempt_id,
                        n,
                        chunk_str
                    );
                    full_raw_output.push_str(&chunk_str);

                    // Process the chunk and add segments to queue
                    Self::process_chunk_to_queue(
                        &chunk_str,
                        &mut segment_queue,
                        &mut incomplete_line_buffer,
                        &mut last_emit_time,
                    );
                }
                Err(e) => {
                    // Error - log the error and break
                    tracing::error!(
                        "Error reading stdout for Gemini attempt {}: {}",
                        attempt_id,
                        e
                    );
                    break;
                }
            }
        }

        // Process any remaining incomplete line at EOF
        if !incomplete_line_buffer.is_empty() {
            let segments =
                Self::split_by_pattern_breaks(&incomplete_line_buffer, &mut last_emit_time);
            for segment in segments.iter() {
                if !segment.trim().is_empty() {
                    segment_queue.push_back(segment.to_string());
                }
            }
        }

        // Final drain of any remaining segments
        tracing::info!(
            "Final drain - {} segments remaining for attempt {}",
            segment_queue.len(),
            attempt_id
        );
        while let Some(segment_content) = segment_queue.pop_front() {
            if !segment_content.trim().is_empty() {
                tracing::debug!(
                    "Final drain segment for attempt {}: {:?}",
                    attempt_id,
                    segment_content
                );
                Self::emit_normalized_message(
                    &pool,
                    execution_process_id,
                    &segment_content,
                    &mut last_emit_time,
                )
                .await;
            }
        }

        // Note: We don't store the full raw output in stderr anymore since we're already
        // processing it into normalized stdout messages. Storing it in stderr would cause
        // the normalization route to treat it as error messages.
        tracing::info!(
            "Gemini processing complete for attempt {} ({} bytes processed)",
            attempt_id,
            full_raw_output.len()
        );

        tracing::info!(
            "Gemini line-based stdout streaming ended for attempt {}",
            attempt_id
        );
    }

    /// Process a chunk of text and add segments to the queue based on break behavior
    fn process_chunk_to_queue(
        chunk: &str,
        queue: &mut VecDeque<String>,
        incomplete_line_buffer: &mut String,
        last_emit_time: &mut Instant,
    ) {
        // Combine any incomplete line from previous chunk with current chunk
        let text_to_process = incomplete_line_buffer.clone() + chunk;
        incomplete_line_buffer.clear();

        // Split by newlines
        let lines: Vec<&str> = text_to_process.split('\n').collect();

        for (i, line) in lines.iter().enumerate() {
            let is_last_line = i == lines.len() - 1;

            if is_last_line && !chunk.ends_with('\n') {
                // This is an incomplete line - store it in the buffer for next chunk
                incomplete_line_buffer.push_str(line);
            } else {
                // This is a complete line - process it
                if !line.is_empty() {
                    // Check for pattern breaks within the line
                    let segments = Self::split_by_pattern_breaks(line, last_emit_time);

                    for segment in segments.iter() {
                        if !segment.trim().is_empty() {
                            queue.push_back(segment.to_string());
                        }
                    }
                }

                // Add newline as separate segment (except for the last line if chunk doesn't end with newline)
                if !is_last_line || chunk.ends_with('\n') {
                    queue.push_back("\n".to_string());
                }
            }
        }
    }

    /// Split text by pattern breaks (period + capital letter)
    fn split_by_pattern_breaks(text: &str, last_emit_time: &mut Instant) -> Vec<String> {
        let mut segments = Vec::new();
        let mut current_segment = String::new();
        let mut chars = text.chars().peekable();

        while let Some(ch) = chars.next() {
            current_segment.push(ch);

            // Check for pattern break: period followed by capital letter or space
            if ch == '.' {
                if let Some(&next_ch) = chars.peek() {
                    let is_capital = next_ch.is_uppercase() && next_ch.is_alphabetic();
                    let is_space = next_ch.is_whitespace();
                    let should_force_break =
                        is_space && last_emit_time.elapsed().as_secs() > PATTERN_BREAK_TIMEOUT_SECS;

                    if is_capital || should_force_break {
                        // Pattern break detected - current segment ends here
                        segments.push(current_segment.clone());
                        current_segment.clear();
                    }
                }
            }
        }

        // Add the final segment if it's not empty
        if !current_segment.is_empty() {
            segments.push(current_segment);
        }

        // If no segments were created, return the original text
        if segments.is_empty() {
            segments.push(text.to_string());
        }

        segments
    }

    /// Emits a normalized message to the database stdout stream.
    async fn emit_normalized_message(
        pool: &sqlx::SqlitePool,
        execution_process_id: Uuid,
        content: &str,
        last_emit_time: &mut Instant,
    ) {
        if content.is_empty() {
            return;
        }

        let entry = NormalizedEntry {
            timestamp: Some(chrono::Utc::now().to_rfc3339()),
            entry_type: NormalizedEntryType::AssistantMessage,
            content: content.to_string(),
            metadata: None,
        };

        match serde_json::to_string(&entry) {
            Ok(jsonl_line) => {
                let formatted_line = format!("{}\n", jsonl_line);

                tracing::debug!(
                    "Storing normalized message to DB for execution {}: {}",
                    execution_process_id,
                    jsonl_line
                );

                // Store as stdout to make it available to conversation viewer
                if let Err(e) =
                    ExecutionProcess::append_stdout(pool, execution_process_id, &formatted_line)
                        .await
                {
                    tracing::error!("Failed to emit normalized message: {}", e);
                } else {
                    *last_emit_time = Instant::now();
                    tracing::debug!("Successfully stored normalized message to DB");
                }
            }
            Err(e) => {
                tracing::error!(
                    "Failed to serialize normalized entry for content: {:?} - Error: {}",
                    content,
                    e
                );
            }
        }
    }
}

impl GeminiFollowupExecutor {
    async fn load_task(
        &self,
        pool: &sqlx::SqlitePool,
        task_id: Uuid,
    ) -> Result<Task, ExecutorError> {
        Task::find_by_id(pool, task_id)
            .await?
            .ok_or(ExecutorError::TaskNotFound)
    }

    async fn collect_resume_context(
        &self,
        pool: &sqlx::SqlitePool,
        task: &Task,
    ) -> Result<crate::models::task_attempt::AttemptResumeContext, ExecutorError> {
        crate::models::task_attempt::TaskAttempt::get_attempt_resume_context(
            pool,
            self.attempt_id,
            task.id,
            task.project_id,
        )
        .await
        .map_err(ExecutorError::from)
    }

    fn build_comprehensive_prompt(
        &self,
        task: &Task,
        resume_context: &crate::models::task_attempt::AttemptResumeContext,
    ) -> String {
        format!(
            r#"RESUME CONTEXT FOR CONTINUING TASK

=== TASK INFORMATION ===
Project ID: {}
Task ID: {}
Task Title: {}
Task Description: {}

=== EXECUTION HISTORY ===
The following is the execution history from this task attempt:

{}

=== CURRENT CHANGES ===
The following git diff shows changes made from the base branch to the current state:

```diff
{}
```

=== CURRENT REQUEST ===
{}

=== INSTRUCTIONS ===
You are continuing work on the above task. The execution history shows what has been done previously, and the git diff shows the current state of all changes. Please continue from where the previous execution left off, taking into account all the context provided above.
"#,
            task.project_id,
            task.id,
            task.title,
            task.description
                .as_deref()
                .unwrap_or("No description provided"),
            if resume_context.execution_history.trim().is_empty() {
                "(No previous execution history)"
            } else {
                &resume_context.execution_history
            },
            if resume_context.cumulative_diffs.trim().is_empty() {
                "(No changes detected)"
            } else {
                &resume_context.cumulative_diffs
            },
            self.prompt
        )
    }

    async fn spawn_process(
        &self,
        worktree_path: &str,
        comprehensive_prompt: &str,
    ) -> Result<AsyncGroupChild, ExecutorError> {
        let (shell_cmd, shell_arg) = get_shell_command();
        let gemini_command = "npx @google/gemini-cli@latest --yolo";

        tracing::info!(
            "Spawning Gemini followup execution for attempt {} with resume context ({} chars)",
            self.attempt_id,
            comprehensive_prompt.len()
        );

        let mut command = Command::new(shell_cmd);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(worktree_path)
            .arg(shell_arg)
            .arg(gemini_command)
            .env("NODE_NO_WARNINGS", "1");

        let mut child = command.group_spawn().map_err(|e| {
            crate::executor::SpawnContext::from_command(&command, "Gemini")
                .with_context(format!(
                    "Gemini CLI followup execution with context for attempt {}",
                    self.attempt_id
                ))
                .spawn_error(e)
        })?;

        self.send_prompt_to_stdin(&mut child, &command, comprehensive_prompt)
            .await?;
        Ok(child)
    }

    async fn send_prompt_to_stdin(
        &self,
        child: &mut AsyncGroupChild,
        command: &Command,
        comprehensive_prompt: &str,
    ) -> Result<(), ExecutorError> {
        if let Some(mut stdin) = child.inner().stdin.take() {
            tracing::debug!(
                "Sending resume context to Gemini for attempt {}: {} characters",
                self.attempt_id,
                comprehensive_prompt.len()
            );

            stdin
                .write_all(comprehensive_prompt.as_bytes())
                .await
                .map_err(|e| {
                    let context = crate::executor::SpawnContext::from_command(command, "Gemini")
                        .with_context(format!(
                            "Failed to write resume prompt to Gemini CLI stdin for attempt {}",
                            self.attempt_id
                        ));
                    ExecutorError::spawn_failed(e, context)
                })?;

            stdin.shutdown().await.map_err(|e| {
                let context = crate::executor::SpawnContext::from_command(command, "Gemini")
                    .with_context(format!(
                        "Failed to close Gemini CLI stdin for attempt {}",
                        self.attempt_id
                    ));
                ExecutorError::spawn_failed(e, context)
            })?;

            tracing::info!(
                "Successfully sent resume context to Gemini for attempt {}",
                self.attempt_id
            );
        }

        Ok(())
    }
}

#[async_trait]
impl Executor for GeminiFollowupExecutor {
    async fn spawn(
        &self,
        pool: &sqlx::SqlitePool,
        task_id: Uuid,
        worktree_path: &str,
    ) -> Result<AsyncGroupChild, ExecutorError> {
        let task = self.load_task(pool, task_id).await?;
        let resume_context = self.collect_resume_context(pool, &task).await?;
        let comprehensive_prompt = self.build_comprehensive_prompt(&task, &resume_context);
        self.spawn_process(worktree_path, &comprehensive_prompt)
            .await
    }

    async fn execute_streaming(
        &self,
        pool: &sqlx::SqlitePool,
        task_id: Uuid,
        attempt_id: Uuid,
        execution_process_id: Uuid,
        worktree_path: &str,
    ) -> Result<AsyncGroupChild, ExecutorError> {
        tracing::info!(
            "Starting Gemini followup execution for task {} attempt {} with resume context",
            task_id,
            attempt_id
        );

        // Update ExecutorSession with the session_id immediately
        if let Err(e) = crate::models::executor_session::ExecutorSession::update_session_id(
            pool,
            execution_process_id,
            &self.attempt_id.to_string(),
        )
        .await
        {
            tracing::error!(
                "Failed to update session ID for Gemini followup execution process {}: {}",
                execution_process_id,
                e
            );
        } else {
            tracing::info!(
                "Updated session ID {} for Gemini followup execution process {}",
                self.attempt_id,
                execution_process_id
            );
        }

        let mut child = self.spawn(pool, task_id, worktree_path).await?;

        tracing::info!(
            "Gemini followup process spawned successfully for attempt {}, PID: {:?}",
            attempt_id,
            child.inner().id()
        );

        // Take stdout and stderr pipes for streaming
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

        // Start streaming tasks with Gemini-specific line-based message updates
        let pool_clone1 = pool.clone();
        let pool_clone2 = pool.clone();

        tokio::spawn(GeminiExecutor::stream_gemini_with_lines(
            stdout,
            pool_clone1,
            attempt_id,
            execution_process_id,
            true,
        ));
        // Use default stderr streaming (no custom parsing)
        tokio::spawn(crate::executor::stream_output_to_db(
            stderr,
            pool_clone2,
            attempt_id,
            execution_process_id,
            false,
        ));

        Ok(child)
    }

    fn normalize_logs(
        &self,
        logs: &str,
        worktree_path: &str,
    ) -> Result<NormalizedConversation, String> {
        // Reuse the same logic as the main GeminiExecutor
        let main_executor = GeminiExecutor;
        main_executor.normalize_logs(logs, worktree_path)
    }
}
