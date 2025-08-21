//! Reusable log processor for plain-text streams with flexible clustering and formatting.
//!
//! Clusters messages into entries based on configurable size and time-gap heuristics, and supports
//! pluggable formatters for transforming or annotating chunks (e.g., inserting line breaks or parsing tool calls).
//!
//! Capable of handling mixed-format streams, including interleaved tool calls and assistant messages,
//! with custom split predicates to detect embedded markers and emit separate entries.
//!
//! ## Use cases
//! - **stderr_processor**: Cluster stderr lines by time gap and format as `ErrorMessage` log entries.
//!   See [`stderr_processor::normalize_stderr_logs`].
//! - **Gemini executor**: Post-process Gemini CLI output to make it prettier, then format it as assistant messages clustered by size.
//!   See [`crate::executors::gemini::Gemini::format_stdout_chunk`].
//! - **Tool call support**: detect lines starting with a distinct marker via `message_boundary_predicate` to separate tool invocations.
use std::{
    time::{Duration, Instant},
    vec,
};

use bon::bon;
use json_patch::Patch;

use super::{
    NormalizedEntry,
    utils::{ConversationPatch, EntryIndexProvider},
};

/// Controls message boundary for advanced executors.
/// The main use-case is to support mixed-content log streams where tool calls and assistant messages are interleaved.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MessageBoundary {
    /// Conclude the current message entry at the given line.
    /// Useful when we detect a message of a different kind than the current one, e.g., when a tool call starts we need to close the current assistant message.
    Split(usize),
    /// Request more content. Signals that the current entry is incomplete and should not be emitted yet.
    /// This should only be the case in tool calls, as assistant messages can be partially emitted.
    IncompleteContent,
}

/// Internal buffer for collecting streaming text into individual lines.
/// Maintains line and size information for heuristics and processing.
#[derive(Debug)]
struct PlainTextBuffer {
    /// All lines including last partial line. Complete lines have trailing \n, partial line doesn't
    lines: Vec<String>,
    /// Current buffered length
    total_len: usize,
}

impl PlainTextBuffer {
    /// Create a new empty buffer
    pub fn new() -> Self {
        Self {
            lines: Vec::new(),
            total_len: 0,
        }
    }

    /// Ingest a new text chunk into the buffer.
    pub fn ingest(&mut self, text_chunk: String) {
        debug_assert!(!text_chunk.is_empty());

        // Add a new lines or grow the current partial line
        let current_partial = if self.lines.last().is_some_and(|l| !l.ends_with('\n')) {
            let partial = self.lines.pop().unwrap();
            self.total_len = self.total_len.saturating_sub(partial.len());
            partial
        } else {
            String::new()
        };

        // Process chunk
        let combined_text = current_partial + &text_chunk;
        let size = combined_text.len();

        // Append new lines
        let parts: Vec<String> = combined_text
            .split_inclusive('\n')
            .map(ToString::to_string)
            .collect();
        self.lines.extend(parts);
        self.total_len += size;
    }

    /// Remove and return the first `n` buffered lines,
    pub fn drain_lines(&mut self, n: usize) -> Vec<String> {
        let n = n.min(self.lines.len());
        let drained: Vec<String> = self.lines.drain(..n).collect();

        // Update total_bytes
        for line in &drained {
            self.total_len = self.total_len.saturating_sub(line.len());
        }

        drained
    }

    /// Remove and return lines until the content length is at least `len`.
    /// Useful for size-based splitting of content.
    pub fn drain_size(&mut self, len: usize) -> Vec<String> {
        let mut drained_len = 0;
        let mut lines_to_drain = 0;

        for line in &self.lines {
            if drained_len >= len && lines_to_drain > 0 {
                break;
            }
            drained_len += line.len();
            lines_to_drain += 1;
        }

        self.drain_lines(lines_to_drain)
    }

    /// Empty the buffer, removing and returning all content,
    pub fn flush(&mut self) -> Vec<String> {
        let result = self.lines.drain(..).collect();
        self.total_len = 0;
        result
    }

    /// Return the total number of lines.
    pub fn line_count(&self) -> usize {
        self.lines.len()
    }

    /// Return the total length of content.
    pub fn total_len(&self) -> usize {
        self.total_len
    }

    /// View lines.
    pub fn lines(&self) -> &[String] {
        &self.lines
    }

    /// Mutably view lines for in-place transformations.
    pub fn lines_mut(&mut self) -> &mut Vec<String> {
        &mut self.lines
    }

    /// Recompute cached total length from current lines.
    pub fn recompute_len(&mut self) {
        self.total_len = self.lines.iter().map(|s| s.len()).sum();
    }

    /// Get the current parial line.
    pub fn partial_line(&self) -> Option<&str> {
        if let Some(last) = self.lines.last()
            && !last.ends_with('\n')
        {
            return Some(last);
        }
        None
    }

    /// Check if the buffer is empty.
    pub fn is_empty(&self) -> bool {
        debug_assert!(self.lines.len() == 0 || self.total_len > 0);
        self.total_len == 0
    }
}

impl Default for PlainTextBuffer {
    fn default() -> Self {
        Self::new()
    }
}

/// Optional content formatting function. Can be used post-process raw output before creating normalized entries.
pub type FormatChunkFn = Box<dyn Fn(Option<&str>, String) -> String + Send + 'static>;

/// Optional predicate function to determine message boundaries. This enables detecting tool calls interleaved with assistant messages.
pub type MessageBoundaryPredicateFn =
    Box<dyn Fn(&[String]) -> Option<MessageBoundary> + Send + 'static>;

/// Function to create a `NormalizedEntry` from content.
pub type NormalizedEntryProducerFn = Box<dyn Fn(String) -> NormalizedEntry + Send + 'static>;

/// Optional function to transform buffered lines in-place before boundary checks.
pub type LinesTransformFn = Box<dyn FnMut(&mut Vec<String>) + Send + 'static>;

/// High-level plain text log processor with configurable formatting and splitting
pub struct PlainTextLogProcessor {
    buffer: PlainTextBuffer,
    index_provider: EntryIndexProvider,
    entry_size_threshold: Option<usize>,
    time_gap: Option<Duration>,
    format_chunk: Option<FormatChunkFn>,
    transform_lines: Option<LinesTransformFn>,
    message_boundary_predicate: Option<MessageBoundaryPredicateFn>,
    normalized_entry_producer: NormalizedEntryProducerFn,
    last_chunk_arrival_time: Instant, // time since last chunk arrived
    current_entry_index: Option<usize>,
}

impl PlainTextLogProcessor {
    /// Process incoming text and return JSON patches for any complete entries
    pub fn process(&mut self, text_chunk: String) -> Vec<Patch> {
        if text_chunk.is_empty() {
            return vec![];
        }

        if !self.buffer.is_empty() {
            // If the new content arrived after the (**Optional**) time threshold between messages, we consider it a new entry.
            // Useful for stderr streams where we want to group related lines into a single entry.
            if self
                .time_gap
                .is_some_and(|time_gap| self.last_chunk_arrival_time.elapsed() >= time_gap)
            {
                let lines = self.buffer.flush();
                if !lines.is_empty() {
                    return vec![self.create_patch(lines)];
                }
                self.current_entry_index = None;
            }
        }

        self.last_chunk_arrival_time = Instant::now();

        let formatted_chunk = if let Some(format_chunk) = self.format_chunk.as_ref() {
            format_chunk(self.buffer.partial_line(), text_chunk)
        } else {
            text_chunk
        };

        if formatted_chunk.is_empty() {
            return vec![];
        }

        // Let the buffer handle text buffering
        self.buffer.ingest(formatted_chunk);

        if let Some(transform_lines) = self.transform_lines.as_mut() {
            transform_lines(self.buffer.lines_mut());
            self.buffer.recompute_len();
            if self.buffer.is_empty() {
                // Nothing left to process after transformation
                return vec![];
            }
        }

        let mut patches = Vec::new();

        // Check if we have a custom message boundary predicate
        loop {
            let message_boundary_predicate = self
                .message_boundary_predicate
                .as_ref()
                .and_then(|predicate| predicate(self.buffer.lines()));

            match message_boundary_predicate {
                // Predicate decided to conclude the current entry at `line_idx`
                Some(MessageBoundary::Split(line_idx)) => {
                    let lines = self.buffer.drain_lines(line_idx);
                    if !lines.is_empty() {
                        patches.push(self.create_patch(lines));
                        // Move to next entry after split
                        self.current_entry_index = None;
                    }
                }
                // Predicate decided that current content cannot be sent yet.
                Some(MessageBoundary::IncompleteContent) => {
                    // Stop processing, wait for more content.
                    // Partial updates will be disabled.
                    return patches;
                }
                None => {
                    // No more splits, break and continue to size/latency heuristics
                    break;
                }
            }
        }

        // Check message size. If entry is large enough, break it into smaller entries.
        if let Some(size_threshold) = self.entry_size_threshold {
            // Check message size. If entry is large enough, create a new entry.
            while self.buffer.total_len() >= size_threshold {
                let lines = self.buffer.drain_size(size_threshold);
                if lines.is_empty() {
                    break;
                }
                patches.push(self.create_patch(lines));
                // Move to next entry after size split
                self.current_entry_index = None;
            }
        }

        // Send partial udpdates
        if !self.buffer.is_empty() {
            // Stream updates without consuming buffer
            patches.push(self.create_patch(self.buffer.lines().to_vec()));
        }
        patches
    }

    /// Create patch
    fn create_patch(&mut self, lines: Vec<String>) -> Patch {
        let content = lines.concat();
        let entry = (self.normalized_entry_producer)(content);

        let added = self.current_entry_index.is_some();
        let index = if let Some(idx) = self.current_entry_index {
            idx
        } else {
            // If no current index, get next from provider
            let idx = self.index_provider.next();
            self.current_entry_index = Some(idx);
            idx
        };

        if !added {
            ConversationPatch::add_normalized_entry(index, entry)
        } else {
            ConversationPatch::replace(index, entry)
        }
    }
}

#[bon]
impl PlainTextLogProcessor {
    /// Create a builder for configuring PlainTextLogProcessor.
    ///
    /// # Parameters
    /// * `normalized_entry_producer` - Required function to convert text content into a `NormalizedEntry`.
    /// * `size_threshold` - Optional size threshold for individual entries. Once an entry content exceeds this size, a new entry is created.
    /// * `time_gap` - Optional time gap between individual entries. When new content arrives after this duration, it is considered a new entry.
    /// * `format_chunk` - Optional function to fix raw output before creating normalized entries.
    /// * `message_boundary_predicate` - Optional function to determine custom message boundaries. Useful when content is heterogeneous (e.g., tool calls interleaved with assistant messages).
    /// * `index_provider` - Required sharable atomic counter for tracking entry indices.
    ///
    /// When both `size_threshold` and `time_gap` are `None`, a default size threshold of 8 KiB is used.
    #[builder]
    pub fn new(
        normalized_entry_producer: impl Fn(String) -> NormalizedEntry + 'static + Send,
        size_threshold: Option<usize>,
        time_gap: Option<Duration>,
        format_chunk: Option<Box<dyn Fn(Option<&str>, String) -> String + 'static + Send>>,
        transform_lines: Option<Box<dyn FnMut(&mut Vec<String>) + 'static + Send>>,
        message_boundary_predicate: Option<
            Box<dyn Fn(&[String]) -> Option<MessageBoundary> + 'static + Send>,
        >,
        index_provider: EntryIndexProvider,
    ) -> Self {
        Self {
            buffer: PlainTextBuffer::new(),
            index_provider,
            entry_size_threshold: if size_threshold.is_none() && time_gap.is_none() {
                Some(8 * 1024) // Default 8KiB when neither is set
            } else {
                size_threshold
            },
            time_gap,
            format_chunk: format_chunk.map(|f| {
                Box::new(f) as Box<dyn Fn(Option<&str>, String) -> String + Send + 'static>
            }),
            transform_lines: transform_lines
                .map(|f| Box::new(f) as Box<dyn FnMut(&mut Vec<String>) + Send + 'static>),
            message_boundary_predicate: message_boundary_predicate.map(|p| {
                Box::new(p) as Box<dyn Fn(&[String]) -> Option<MessageBoundary> + Send + 'static>
            }),
            normalized_entry_producer: Box::new(normalized_entry_producer),
            last_chunk_arrival_time: Instant::now(),
            current_entry_index: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::logs::NormalizedEntryType;

    #[test]
    fn test_plain_buffer_flush() {
        let mut buffer = PlainTextBuffer::new();

        buffer.ingest("line1\npartial".to_string());
        assert_eq!(buffer.line_count(), 2);

        let lines = buffer.flush();
        assert_eq!(lines, vec!["line1\n", "partial"]);
        assert_eq!(buffer.line_count(), 0);
    }

    #[test]
    fn test_plain_buffer_len() {
        let mut buffer = PlainTextBuffer::new();

        buffer.ingest("abc\ndef\n".to_string());
        assert_eq!(buffer.total_len(), 8); // "abc\n" + "def\n"

        buffer.drain_lines(1);
        assert_eq!(buffer.total_len(), 4); // "def\n"
    }

    #[test]
    fn test_drain_until_size() {
        let mut buffer = PlainTextBuffer::new();

        buffer.ingest("short\nlonger line\nvery long line here\n".to_string());

        // Drain until we have at least 10 bytes
        let drained = buffer.drain_size(10);
        assert_eq!(drained.len(), 2); // "short\n" (6) + "longer line\n" (12) = 18 bytes total
        assert_eq!(drained, vec!["short\n", "longer line\n"]);
    }

    #[test]
    fn test_processor_simple() {
        let producer = |content: String| -> NormalizedEntry {
            NormalizedEntry {
                timestamp: None, // Avoid creating artificial timestamps during normalization
                entry_type: NormalizedEntryType::SystemMessage,
                content: content.to_string(),
                metadata: None,
            }
        };

        let mut processor = PlainTextLogProcessor::builder()
            .normalized_entry_producer(producer)
            .index_provider(EntryIndexProvider::test_new())
            .build();

        let patches = processor.process("hello world\n".to_string());
        assert_eq!(patches.len(), 1);
    }

    #[test]
    fn test_processor_custom_log_formatter() {
        // Example Level 1 producer that parses tool calls
        let tool_producer = |content: String| -> NormalizedEntry {
            if content.starts_with("TOOL:") {
                let tool_name = content.strip_prefix("TOOL:").unwrap_or("unknown").trim();
                NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::ToolUse {
                        tool_name: tool_name.to_string(),
                        action_type: super::super::ActionType::Other {
                            description: tool_name.to_string(),
                        },
                    },
                    content,
                    metadata: None,
                }
            } else {
                NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::SystemMessage,
                    content: content.to_string(),
                    metadata: None,
                }
            }
        };

        let mut processor = PlainTextLogProcessor::builder()
            .normalized_entry_producer(tool_producer)
            .index_provider(EntryIndexProvider::test_new())
            .build();

        let patches = processor.process("TOOL: file_read\n".to_string());
        assert_eq!(patches.len(), 1);
    }

    #[test]
    fn test_processor_transform_lines_clears_first_line() {
        let producer = |content: String| -> NormalizedEntry {
            NormalizedEntry {
                timestamp: None,
                entry_type: NormalizedEntryType::SystemMessage,
                content,
                metadata: None,
            }
        };

        let mut processor = PlainTextLogProcessor::builder()
            .normalized_entry_producer(producer)
            .transform_lines(Box::new(|lines: &mut Vec<String>| {
                // Drop a specific leading banner line if present
                if !lines.is_empty()
                    && lines.first().map(|s| s.as_str()) == Some("BANNER LINE TO DROP\n")
                {
                    lines.remove(0);
                }
            }))
            .index_provider(EntryIndexProvider::test_new())
            .build();

        // Provide a single-line chunk. The transform removes it, leaving nothing to emit.
        let patches = processor.process("BANNER LINE TO DROP\n".to_string());
        assert_eq!(patches.len(), 0);

        // Next, add actual content; should emit one patch with the content
        let patches = processor.process("real content\n".to_string());
        assert_eq!(patches.len(), 1);
    }
}
