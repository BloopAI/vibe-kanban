use std::{path::PathBuf, sync::Arc};

use futures::StreamExt;
use json_patch::Patch;
use utils::msg_store::MsgStore;

use super::{LogNormalizer, NormalizedEntry, NormalizedEntryType, patch::ConversationPatch};

#[derive(Clone)]
pub struct GeminiLogNormalizer {}

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

impl GeminiLogNormalizer {
    pub fn new() -> Self {
        Self {}
    }
}

impl LogNormalizer for GeminiLogNormalizer {
    fn normalize_logs(&self, msg_store: Arc<MsgStore>, _current_dir: &PathBuf) {
        tokio::spawn(async move {
            let mut stdout = msg_store.stdout_chunked_stream().await;
            let mut processor = NormalizedLogProcessor::new();

            while let Some(Ok(chunk)) = stdout.next().await {
                for patch in processor.process(&chunk) {
                    msg_store.push_patch(patch);
                }
            }
        });
    }
}
