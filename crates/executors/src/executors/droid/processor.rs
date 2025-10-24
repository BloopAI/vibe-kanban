use std::{path::Path, sync::Arc};

use futures::{Stream, StreamExt};
use workspace_utils::{log_msg::LogMsg, msg_store::MsgStore};

use super::{
    events::{ProcessorState, process_event},
    patch_emitter::{IndexProviderLike, PatchEmitter},
    types::DroidJson,
};
use crate::logs::{
    NormalizedEntry, NormalizedEntryType,
    utils::{EntryIndexProvider, patch::ConversationPatch},
};

impl IndexProviderLike for EntryIndexProvider {
    fn next(&self) -> usize {
        EntryIndexProvider::next(self)
    }
}

/// Represents the result of attempting to parse a line
enum ParsedLine {
    DroidJson(DroidJson),
    UnparsedContent(String),
}

/// Layer 1: Extract lines from a stream of chunks
fn lines_from_stream(
    stream: impl Stream<Item = Result<LogMsg, std::io::Error>>,
) -> impl Stream<Item = String> {
    async_stream::stream! {
        let mut buffer = String::new();
        let mut stream = std::pin::pin!(stream);

        while let Some(Ok(msg)) = stream.next().await {
            let chunk = match msg {
                LogMsg::Stdout(x) => x,
                LogMsg::JsonPatch(_) | LogMsg::SessionId(_) | LogMsg::Stderr(_) => continue,
                LogMsg::Finished => break,
            };

            buffer.push_str(&chunk);

            for line in buffer
                .split_inclusive('\n')
                .filter(|l| l.ends_with('\n'))
                .filter(|l| !l.trim().is_empty())
                .map(str::to_owned)
                .collect::<Vec<_>>()
            {
                yield line;
            }

            buffer = buffer.rsplit('\n').next().unwrap_or("").to_owned();
        }

        if !buffer.trim().is_empty() {
            yield buffer;
        }
    }
}

/// Layer 2: Parse lines into structured data
fn parse_lines(lines: impl Stream<Item = String>) -> impl Stream<Item = ParsedLine> {
    async_stream::stream! {
        let mut lines = std::pin::pin!(lines);

        while let Some(line) = lines.next().await {
            let trimmed = line.trim();

            match serde_json::from_str::<DroidJson>(trimmed) {
                Ok(droid_json) => yield ParsedLine::DroidJson(droid_json),
                Err(_) => yield ParsedLine::UnparsedContent(trimmed.to_string()),
            }
        }
    }
}

/// Layer 3: Process parsed items and emit patches
async fn process_parsed_items(
    parsed_items: impl Stream<Item = ParsedLine>,
    msg_store: Arc<MsgStore>,
    worktree_path: &Path,
    entry_index_provider: EntryIndexProvider,
) {
    let mut parsed_items = std::pin::pin!(parsed_items);
    let mut session_id_extracted = false;
    let mut state = ProcessorState::default();
    let mut patch_emitter = PatchEmitter::new();

    while let Some(item) = parsed_items.next().await {
        match item {
            ParsedLine::DroidJson(droid_json) => {
                if !session_id_extracted && let Some(session_id) = droid_json.session_id() {
                    msg_store.push_session_id(session_id.to_string());
                    session_id_extracted = true;
                }

                let (new_state, events) = process_event(state, &droid_json, worktree_path);
                state = new_state;

                let patches = patch_emitter.emit_patches(events, &entry_index_provider);
                for patch in patches {
                    msg_store.push_patch(patch);
                }
            }
            ParsedLine::UnparsedContent(content) => {
                let entry = NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::SystemMessage,
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
            let stream = msg_store.history_plus_stream();
            let lines = lines_from_stream(stream);
            let parsed_items = parse_lines(lines);

            process_parsed_items(
                parsed_items,
                msg_store,
                &worktree_path,
                entry_index_provider,
            )
            .await;
        });
    }
}
