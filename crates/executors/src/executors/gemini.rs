// use std::{
//     path::{Path, PathBuf},
//     process::Stdio,
// };

// use async_trait::async_trait;
// use command_group::{AsyncCommandGroup, AsyncGroupChild};
// use serde::{Deserialize, Serialize};
// use tokio::{io::AsyncWriteExt, process::Command};

// use crate::utils::shell::get_shell_command;
use std::{path::PathBuf, process::Stdio, sync::Arc};

use async_trait::async_trait;
use command_group::{AsyncCommandGroup, AsyncGroupChild};
use futures::StreamExt;
use json_patch::Patch;
use serde::{Deserialize, Serialize};
use tokio::{io::AsyncWriteExt, process::Command};
use ts_rs::TS;
use utils::{msg_store::MsgStore, shell::get_shell_command};

use crate::{
    executors::{ExecutorError, StandardCodingAgentExecutor},
    logs::{NormalizedEntry, NormalizedEntryType},
    patch::ConversationPatch,
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

    fn normalize_logs(&self, msg_store: Arc<MsgStore>, _worktree_path: &PathBuf) {
        tokio::spawn(async move {
            let mut stdout = msg_store.stdout_chunked_stream().await;
            let mut processor = NormalizedLogProcessor::new();

            while let Some(Ok(chunk)) = stdout.next().await {
                for patch in processor.process(chunk.as_str()) {
                    msg_store.push_patch(patch);
                }
            }
        });
    }
}

const MESSAGE_SIZE: usize = 8192; // ~8KB for new message boundaries

/// Stateful processor for normalized log entries with message boundary detection
struct NormalizedLogProcessor {
    buffer: String, // text we are still building
    idx: usize,     // current entry index
    added: bool,    // have we already sent an ADD for this entry?
}

impl NormalizedLogProcessor {
    fn new() -> Self {
        Self {
            buffer: String::new(),
            idx: 0,
            added: false,
        }
    }

    /// Process a chunk of stdout and return patches to emit
    fn process(&mut self, chunk: &str) -> Vec<Patch> {
        let mut patches = Vec::new();

        // 1. Append formatted chunk to buffer
        let formatted_chunk = Self::format_chunk(chunk, &self.buffer);
        self.buffer.push_str(&formatted_chunk);

        // 2. Handle splitting FIRST - before creating any patch entries
        while self.buffer.len() >= MESSAGE_SIZE {
            let split_pos = Self::find_optimal_message_boundary(&self.buffer[..MESSAGE_SIZE]);
            let finished = self.buffer[..split_pos].to_string();
            self.buffer = self.buffer[split_pos..].to_string();

            // Create entry for the finished part
            let finished_entry = NormalizedEntry {
                timestamp: None,
                entry_type: NormalizedEntryType::AssistantMessage,
                content: finished,
                metadata: None,
            };

            if !self.added {
                patches.push(ConversationPatch::add(self.idx, finished_entry));
            } else {
                patches.push(ConversationPatch::replace(self.idx, finished_entry));
            }

            // Move to next entry
            self.idx += 1;
            self.added = false;
        }

        // 3. After all splitting, handle remaining buffer content
        if !self.buffer.is_empty() {
            let entry = NormalizedEntry {
                timestamp: None,
                entry_type: NormalizedEntryType::AssistantMessage,
                content: self.buffer.clone(),
                metadata: None,
            };

            if !self.added {
                patches.push(ConversationPatch::add(self.idx, entry));
                self.added = true;
            } else {
                patches.push(ConversationPatch::replace(self.idx, entry));
            }
        }

        patches
    }

    /// Make Gemini output more readable by inserting line breaks where periods are directly
    /// followed by capital letters (common Gemini CLI formatting issue).
    /// Handles both intra-chunk and cross-chunk period-to-capital transitions.
    fn format_chunk(content: &str, accumulated_message: &str) -> String {
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

    /// Find a good position to split a message (newline preferred, sentence fallback)
    fn find_optimal_message_boundary(buffer: &str) -> usize {
        // Look for newline within the max_size limit (prefer this)
        if let Some(pos) = buffer.rfind('\n') {
            return pos + 1; // Include the newline
        }

        // Fallback: look for sentence boundaries (period + space or period + end)
        if let Some(pos) = buffer.rfind(". ") {
            return pos + 2; // Include the period and space
        }

        buffer.len()
    }
}
