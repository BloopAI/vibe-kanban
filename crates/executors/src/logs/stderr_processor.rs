//! Standard stderr log processor for executors
//!
//! Uses `PlainTextLogProcessor` with a 2-second `latency_threshold` to split stderr streams into entries.
//! Each entry is normalized as `ErrorMessage` and emitted as JSON patches to the message store.
//!
//! Example:
//! ```rust,ignore
//! normalize_stderr_logs(msg_store.clone(), EntryIndexProvider::new());
//! ```
//!
use std::{sync::Arc, time::Duration};

use futures::StreamExt;
use workspace_utils::msg_store::MsgStore;

use super::{
    NormalizedEntry, NormalizedEntryError, NormalizedEntryType,
    plain_text_processor::PlainTextLogProcessor,
};
use crate::logs::utils::EntryIndexProvider;

/// Patterns to filter out from stderr output.
/// These are harmless warnings that shouldn't be shown to users.
const IGNORED_STDERR_PATTERNS: &[&str] = &[
    // npm warnings about unknown env config variables (e.g., from Deno/JSR)
    "npm warn Unknown env config",
];

fn should_filter_line(line: &str) -> bool {
    let trimmed = line.trim();
    IGNORED_STDERR_PATTERNS
        .iter()
        .any(|pattern| trimmed.starts_with(pattern))
}

/// Standard stderr log normalizer that uses PlainTextLogProcessor to stream error logs.
///
/// Splits stderr output into discrete entries based on a latency threshold (2s) to group
/// related lines into a single error entry. Each entry is normalized as an `ErrorMessage`
/// and emitted as JSON patches for downstream consumption (e.g., UI or log aggregation).
///
/// # Options
/// - `latency_threshold`: 2 seconds to separate error messages based on time gaps.
/// - `normalized_entry_producer`: maps each chunk into an `ErrorMessage` entry.
///
/// # Use case
/// Intended for executor stderr streams, grouping multi-line errors into cohesive entries
/// instead of emitting each line separately.
///
/// # Arguments
/// * `msg_store` - the message store providing a stream of stderr chunks and accepting patches.
/// * `entry_index_provider` - provider of incremental entry indices for patch ordering.
pub fn normalize_stderr_logs(msg_store: Arc<MsgStore>, entry_index_provider: EntryIndexProvider) {
    tokio::spawn(async move {
        let mut stderr = msg_store.stderr_chunked_stream();

        // Create a processor with time-based emission for stderr
        let mut processor = PlainTextLogProcessor::builder()
            .normalized_entry_producer(Box::new(|content: String| NormalizedEntry {
                timestamp: None,
                entry_type: NormalizedEntryType::ErrorMessage {
                    error_type: NormalizedEntryError::Other,
                },
                content: strip_ansi_escapes::strip_str(&content),
                metadata: None,
            }))
            .transform_lines(Box::new(|lines: &mut Vec<String>| {
                lines.retain(|line| !should_filter_line(line));
            }))
            .time_gap(Duration::from_secs(2)) // Break messages if they are 2 seconds apart
            .index_provider(entry_index_provider)
            .build();

        while let Some(Ok(chunk)) = stderr.next().await {
            for patch in processor.process(chunk) {
                msg_store.push_patch(patch);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_should_filter_npm_warn_unknown_env_config() {
        assert!(should_filter_line(
            "npm warn Unknown env config \"_jsr-registry\". This will stop working..."
        ));
        assert!(should_filter_line(
            "npm warn Unknown env config \"verify-deps-before-run\". This will stop working..."
        ));
        // With leading whitespace
        assert!(should_filter_line(
            "  npm warn Unknown env config \"_jsr-registry\"."
        ));
    }

    #[test]
    fn test_should_not_filter_other_npm_warnings() {
        // Other npm warnings should NOT be filtered
        assert!(!should_filter_line("npm warn deprecated somepackage@1.0.0"));
        assert!(!should_filter_line("npm ERR! something went wrong"));
        assert!(!should_filter_line("Some random error message"));
    }
}
