use std::{path::PathBuf, process::Stdio, sync::Arc};

use async_trait::async_trait;
use command_group::{AsyncCommandGroup, AsyncGroupChild};
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use tokio::{io::AsyncWriteExt, process::Command};
use ts_rs::TS;
use utils::{msg_store::MsgStore, shell::get_shell_command};

use crate::{
    executors::{ExecutorError, StandardCodingAgentExecutor},
    logs::{
        NormalizedEntry, NormalizedEntryType, plain_text_processor::PlainTextLogProcessor,
        stderr_processor::normalize_stderr_logs, utils::EntryIndexProvider,
    },
};

/// An executor that uses Gemini to process tasks
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, Default)]
#[ts(export)]
pub struct Gemini {}

#[async_trait]
impl StandardCodingAgentExecutor for Gemini {
    async fn spawn(
        &self,
        current_dir: &PathBuf,
        prompt: &str,
    ) -> Result<AsyncGroupChild, ExecutorError> {
        let (shell_cmd, shell_arg) = get_shell_command();
        let gemini_command = "npx @google/gemini-cli@latest --yolo";

        let mut command = Command::new(shell_cmd);

        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .arg(shell_arg)
            .arg(gemini_command)
            .env("NODE_NO_WARNINGS", "1");

        let mut child = command.group_spawn()?;

        // Write prompt to stdin
        if let Some(mut stdin) = child.inner().stdin.take() {
            stdin.write_all(prompt.as_bytes()).await?;
            stdin.shutdown().await?;
        }

        Ok(child)
    }

    async fn spawn_follow_up(
        &self,
        _current_dir: &PathBuf,
        _prompt: &str,
        _session_id: &str,
    ) -> Result<AsyncGroupChild, ExecutorError> {
        // TODO:
        Err(ExecutorError::FollowUpNotSupported)
    }

    /// Parses both stderr and stdout logs for Gemini executor using PlainTextLogProcessor.
    ///
    /// - Stderr: uses the standard stderr log processor, which formats stderr output as ErrorMessage entries.
    /// - Stdout: applies custom `format_chunk` to insert line breaks on period-to-capital transitions,
    ///   then create assitant messages from the output.
    ///
    /// Each entry is converted into an `AssistantMessage` or `ErrorMessage` and emitted as patches.
    ///
    /// # Example
    ///
    /// ```no_run
    /// gemini.normalize_logs(msg_store.clone(), &worktree_path);
    /// ```
    ///
    /// Subsequent queries to `msg_store` will receive JSON patches representing parsed log entries.
    /// Sets up log normalization for the Gemini executor:
    /// - stderr via [`normalize_stderr_logs`]
    /// - stdout via [`PlainTextLogProcessor`] with Gemini-specific formatting and default heuristics
    fn normalize_logs(&self, msg_store: Arc<MsgStore>, _worktree_path: &PathBuf) {
        let entry_index_counter = EntryIndexProvider::new();
        normalize_stderr_logs(msg_store.clone(), entry_index_counter.clone());
        tokio::spawn(async move {
            let mut stdout = msg_store.stdout_chunked_stream().await;

            // Create a processor with Gemini-specific formatting
            let mut processor = PlainTextLogProcessor::builder()
                .normalized_entry_producer(Box::new(|content: String| NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::AssistantMessage,
                    content,
                    metadata: None,
                }))
                .format_chunk(Box::new(|partial_line: Option<&str>, chunk: String| {
                    Self::format_stdout_chunk(&chunk, partial_line.unwrap_or(""))
                }))
                .index_provider(entry_index_counter)
                .build();

            while let Some(Ok(chunk)) = stdout.next().await {
                for patch in processor.process(chunk) {
                    msg_store.push_patch(patch);
                }
            }
        });
    }
}

impl Gemini {
    /// Make Gemini output more readable by inserting line breaks where periods are directly
    /// followed by capital letters (common Gemini CLI formatting issue).
    /// Handles both intra-chunk and cross-chunk period-to-capital transitions.
    fn format_stdout_chunk(content: &str, accumulated_message: &str) -> String {
        let mut result = String::with_capacity(content.len() + 100);
        let chars: Vec<char> = content.chars().collect();

        // Check for cross-chunk boundary: previous chunk ended with period, current starts with capital
        if !accumulated_message.is_empty() && !content.is_empty() {
            let ends_with_period = accumulated_message.ends_with('.');
            let starts_with_capital = chars
                .first()
                .map(|&c| c.is_uppercase() && c.is_alphabetic())
                .unwrap_or(false);

            if ends_with_period && starts_with_capital {
                result.push('\n');
            }
        }

        // Handle intra-chunk period-to-capital transitions
        for i in 0..chars.len() {
            result.push(chars[i]);

            // Check if current char is '.' and next char is uppercase letter (no space between)
            if chars[i] == '.' && i + 1 < chars.len() {
                let next_char = chars[i + 1];
                if next_char.is_uppercase() && next_char.is_alphabetic() {
                    result.push('\n');
                }
            }
        }

        result
    }
}
