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
use utils::msg_store::MsgStore;

use super::{NormalizedEntry, NormalizedEntryType, plain_text_processor::PlainTextLogProcessor};
use crate::logs::utils::EntryIndexProvider;

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
                entry_type: NormalizedEntryType::ErrorMessage,
                content,
                metadata: None,
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
