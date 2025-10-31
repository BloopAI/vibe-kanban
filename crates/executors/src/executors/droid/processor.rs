use std::{path::Path, sync::Arc};

use futures::{Stream, StreamExt, future};
use workspace_utils::msg_store::MsgStore;

use super::{
    log_event_converter::LogEventConverter, patch_converter::PatchConverter, types::DroidJson,
};
use crate::logs::{
    NormalizedEntry, NormalizedEntryType,
    utils::{EntryIndexProvider, patch::ConversationPatch},
};

/// Parse lines into structured data
fn parse_lines(lines: impl Stream<Item = String>) -> impl Stream<Item = Result<DroidJson, String>> {
    async_stream::stream! {
        let mut lines = std::pin::pin!(lines);
        while let Some(line) = lines.next().await {
            let trimmed = line.trim();
            match serde_json::from_str::<DroidJson>(trimmed) {
                Ok(droid_json) => yield Ok(droid_json),
                Err(e) => {
                    tracing::error!("Failed to parse DroidJson from line '{}': {}", trimmed, e);
                    yield Err(trimmed.to_string());
                }
            }
        }
    }
}

/// Process parsed items and emit patches
async fn process_parsed_items(
    parsed_items: impl Stream<Item = Result<DroidJson, String>>,
    msg_store: Arc<MsgStore>,
    worktree_path: &Path,
    entry_index_provider: &EntryIndexProvider,
) {
    let mut parsed_items = std::pin::pin!(parsed_items);
    let mut session_id_extracted = false;
    let mut log_event_converter = LogEventConverter::default();
    let mut patch_converter = PatchConverter::default();

    while let Some(item) = parsed_items.next().await {
        match item {
            Ok(droid_json) => {
                if !session_id_extracted && let Some(session_id) = droid_json.session_id() {
                    msg_store.push_session_id(session_id.to_string());
                    session_id_extracted = true;
                }
                if let Some(patch) = log_event_converter
                    .to_log_event(&droid_json, worktree_path)
                    .and_then(|event| patch_converter.process_event(event, entry_index_provider))
                {
                    msg_store.push_patch(patch);
                }
            }
            Err(content) => {
                let entry = NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::ErrorMessage,
                    content,
                    metadata: None,
                };

                let patch_id = entry_index_provider.next();
                let patch = ConversationPatch::add_normalized_entry(patch_id, entry);
                msg_store.push_patch(patch);
            }
        }
    }
}

/// Async processor for streaming droid JSON output
pub struct DroidLogProcessor;

impl DroidLogProcessor {
    pub fn process_logs(
        msg_store: Arc<MsgStore>,
        worktree_path: &Path,
        entry_index_provider: EntryIndexProvider,
    ) {
        let worktree_path = worktree_path.to_path_buf();
        tokio::spawn(async move {
            let stream = msg_store.stdout_lines_stream();
            let lines = stream.filter_map(|l| future::ready(l.ok()));
            let parsed_items = parse_lines(lines);

            process_parsed_items(
                parsed_items,
                msg_store,
                &worktree_path,
                &entry_index_provider,
            )
            .await;
        });
    }
}
