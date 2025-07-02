use std::{collections::VecDeque, process::Stdio};

use async_trait::async_trait;
use command_group::{AsyncCommandGroup, AsyncGroupChild};
use tokio::{io::AsyncWriteExt, process::Command};
use uuid::Uuid;

use crate::{
    executor::{Executor, ExecutorError},
    models::{execution_process::ExecutionProcess, task::Task},
    utils::shell::get_shell_command,
};

/// An executor that uses Gemini CLI to process tasks
pub struct GeminiExecutor;

/// An executor that resumes a Gemini session
pub struct GeminiFollowupExecutor {
    pub session_id: String,
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

        let prompt = format!(
            "Task title: {}\nTask description: {}",
            task.title,
            task.description
                .as_deref()
                .unwrap_or("No description provided")
        );

        // Use shell command for cross-platform compatibility
        let (shell_cmd, shell_arg) = get_shell_command();
        let gemini_command = "npx @google/gemini-cli --yolo";

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
        let mut child = self.spawn(pool, task_id, worktree_path).await?;

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
        tokio::spawn(Self::stream_gemini_with_lines(
            stderr,
            pool_clone2,
            attempt_id,
            execution_process_id,
            false,
        ));

        Ok(child)
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
        let mut message_index = 0;
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
                    Self::emit_jsonl_message(
                        &pool,
                        execution_process_id,
                        message_index,
                        &segment_content,
                    )
                    .await;
                    message_index += 1;
                }
            }

            // Then read new content from the reader
            match reader.read(&mut buffer).await {
                Ok(0) => {
                    // EOF - process any remaining content
                    break;
                }
                Ok(n) => {
                    let chunk_str = String::from_utf8_lossy(&buffer[..n]);
                    full_raw_output.push_str(&chunk_str);

                    // Process the chunk and add segments to queue
                    Self::process_chunk_to_queue(
                        &chunk_str,
                        &mut segment_queue,
                        &mut incomplete_line_buffer,
                    );
                }
                Err(_) => {
                    // Error - break and let queue drain on next iteration
                    break;
                }
            }
        }

        // Process any remaining incomplete line at EOF
        if !incomplete_line_buffer.is_empty() {
            let segments = Self::split_by_pattern_breaks(&incomplete_line_buffer);
            for segment in segments.iter() {
                if !segment.trim().is_empty() {
                    segment_queue.push_back(segment.to_string());
                }
            }
        }

        // Final drain of any remaining segments
        while let Some(segment_content) = segment_queue.pop_front() {
            if !segment_content.trim().is_empty() {
                Self::emit_jsonl_message(
                    &pool,
                    execution_process_id,
                    message_index,
                    &segment_content,
                )
                .await;
                message_index += 1;
            }
        }

        // After the loop, store the full raw output in stderr for the "raw" view
        if !full_raw_output.is_empty() {
            if let Err(e) =
                ExecutionProcess::append_stderr(&pool, execution_process_id, &full_raw_output).await
            {
                tracing::error!(
                    "Failed to store full raw output for attempt {}: {}",
                    attempt_id,
                    e
                );
            }
        }

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
                    let segments = Self::split_by_pattern_breaks(line);

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
    fn split_by_pattern_breaks(text: &str) -> Vec<String> {
        let mut segments = Vec::new();
        let mut current_segment = String::new();
        let mut chars = text.chars().peekable();

        while let Some(ch) = chars.next() {
            current_segment.push(ch);

            // Check for pattern break: period followed by capital letter
            if ch == '.' {
                if let Some(&next_ch) = chars.peek() {
                    if next_ch.is_uppercase() && next_ch.is_alphabetic() {
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

    /// Emits a JSONL message to the database stdout stream.
    async fn emit_jsonl_message(
        pool: &sqlx::SqlitePool,
        execution_process_id: Uuid,
        message_index: u32,
        content: &str,
    ) {
        if content.is_empty() {
            return;
        }

        // Create AMP-like format with streaming extensions for Gemini
        let jsonl_message = serde_json::json!({
            "type": "messages",
            "messages": [
                [
                    message_index,
                    {
                        "role": "assistant",
                        "content": [
                            {
                                "type": "text",
                                "text": content
                            }
                        ],
                        "meta": {
                            "sentAt": chrono::Utc::now().timestamp_millis()
                        }
                    }
                ]
            ],
            "messageKey": message_index,
            "isStreaming": true
        });

        if let Ok(jsonl_line) = serde_json::to_string(&jsonl_message) {
            let formatted_line = format!("{}\n", jsonl_line);

            // Store as stdout to make it available to conversation viewer
            if let Err(e) =
                ExecutionProcess::append_stdout(pool, execution_process_id, &formatted_line).await
            {
                tracing::error!("Failed to emit JSONL message: {}", e);
            }
        }
    }
}

#[async_trait]
impl Executor for GeminiFollowupExecutor {
    async fn spawn(
        &self,
        _pool: &sqlx::SqlitePool,
        _task_id: Uuid,
        worktree_path: &str,
    ) -> Result<AsyncGroupChild, ExecutorError> {
        // --resume is currently not supported by the gemini-cli. This will error!
        // TODO: Check again when this issue has been addressed: https://github.com/google-gemini/gemini-cli/issues/2222

        // Use shell command for cross-platform compatibility
        let (shell_cmd, shell_arg) = get_shell_command();
        let gemini_command = format!("npx @google/gemini-cli --yolo --resume={}", self.session_id);

        let mut command = Command::new(shell_cmd);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(worktree_path)
            .arg(shell_arg)
            .arg(&gemini_command)
            .env("NODE_NO_WARNINGS", "1");

        let mut child = command
            .group_spawn() // Create new process group so we can kill entire tree
            .map_err(|e| {
                crate::executor::SpawnContext::from_command(&command, "Gemini")
                    .with_context(format!(
                        "Gemini CLI followup execution for session {}",
                        self.session_id
                    ))
                    .spawn_error(e)
            })?;

        // Send the prompt via stdin instead of command line arguments
        // This avoids Windows command line parsing issues
        if let Some(mut stdin) = child.inner().stdin.take() {
            stdin.write_all(self.prompt.as_bytes()).await.map_err(|e| {
                let context = crate::executor::SpawnContext::from_command(&command, "Gemini")
                    .with_context(format!(
                        "Failed to write prompt to Gemini CLI stdin for session {}",
                        self.session_id
                    ));
                ExecutorError::spawn_failed(e, context)
            })?;
            stdin.shutdown().await.map_err(|e| {
                let context = crate::executor::SpawnContext::from_command(&command, "Gemini")
                    .with_context(format!(
                        "Failed to close Gemini CLI stdin for session {}",
                        self.session_id
                    ));
                ExecutorError::spawn_failed(e, context)
            })?;
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
        let mut child = self.spawn(pool, task_id, worktree_path).await?;

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
        tokio::spawn(GeminiExecutor::stream_gemini_with_lines(
            stderr,
            pool_clone2,
            attempt_id,
            execution_process_id,
            false,
        ));

        Ok(child)
    }
}
