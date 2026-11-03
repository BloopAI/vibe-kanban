use std::{sync::Arc, time::Duration};

use futures::StreamExt;
use workspace_utils::msg_store::MsgStore;

use crate::logs::{
    NormalizedEntry, NormalizedEntryError, NormalizedEntryType,
    plain_text_processor::PlainTextLogProcessor, utils::EntryIndexProvider,
};

pub fn normalize_logs(
    msg_store: Arc<MsgStore>,
    _worktree_path: &std::path::Path,
    entry_index_provider: EntryIndexProvider,
) -> Vec<tokio::task::JoinHandle<()>> {
    let h1 = normalize_stdout_logs(msg_store.clone(), entry_index_provider.clone());
    let h2 = normalize_stderr_logs(msg_store, entry_index_provider);
    vec![h1, h2]
}

/// Normalize Devin CLI stdout output as assistant messages.
///
/// Devin CLI in print mode (`-p`) outputs its response as plain text to stdout.
fn normalize_stdout_logs(
    msg_store: Arc<MsgStore>,
    entry_index_provider: EntryIndexProvider,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let mut stdout = msg_store.stdout_chunked_stream();

        let mut processor = PlainTextLogProcessor::builder()
            .normalized_entry_producer(Box::new(|content: String| NormalizedEntry {
                timestamp: None,
                entry_type: NormalizedEntryType::AssistantMessage,
                content: strip_ansi_escapes::strip_str(&content),
                metadata: None,
            }))
            .time_gap(Duration::from_secs(3))
            .index_provider(entry_index_provider)
            .build();

        while let Some(Ok(chunk)) = stdout.next().await {
            for patch in processor.process(chunk) {
                msg_store.push_patch(patch);
            }
        }
    })
}

/// Normalize Devin CLI stderr output as error messages.
fn normalize_stderr_logs(
    msg_store: Arc<MsgStore>,
    entry_index_provider: EntryIndexProvider,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let mut stderr = msg_store.stderr_chunked_stream();

        let mut processor = PlainTextLogProcessor::builder()
            .normalized_entry_producer(Box::new(|content: String| NormalizedEntry {
                timestamp: None,
                entry_type: NormalizedEntryType::ErrorMessage {
                    error_type: NormalizedEntryError::Other,
                },
                content: strip_ansi_escapes::strip_str(&content),
                metadata: None,
            }))
            .time_gap(Duration::from_secs(2))
            .index_provider(entry_index_provider)
            .build();

        while let Some(Ok(chunk)) = stderr.next().await {
            for patch in processor.process(chunk) {
                msg_store.push_patch(patch);
            }
        }
    })
}
