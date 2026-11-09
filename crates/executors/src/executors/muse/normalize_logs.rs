use std::{path::Path, sync::Arc};

use futures::{StreamExt, future::ready};
use serde_json::Value;
use workspace_utils::msg_store::MsgStore;

use crate::logs::{
    NormalizedEntry, NormalizedEntryError, NormalizedEntryType,
    stderr_processor::normalize_stderr_logs,
    utils::{EntryIndexProvider, patch::add_normalized_entry},
};

pub fn normalize_logs(
    msg_store: Arc<MsgStore>,
    _worktree_path: &Path,
    entry_index_provider: EntryIndexProvider,
) -> Vec<tokio::task::JoinHandle<()>> {
    let h1 = normalize_stderr_logs(msg_store.clone(), entry_index_provider.clone());

    let msg_store2 = msg_store.clone();
    let h2 = tokio::spawn(async move {
        let mut session_id_extracted = false;
        let mut lines_stream = msg_store2
            .stdout_lines_stream()
            .filter_map(|res| ready(res.ok()));

        while let Some(line) = lines_stream.next().await {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            let json: Value = match serde_json::from_str(trimmed) {
                Ok(v) => v,
                Err(_) => {
                    // Plain text fallback — treat as system message.
                    let entry = NormalizedEntry {
                        timestamp: None,
                        entry_type: NormalizedEntryType::SystemMessage,
                        content: strip_ansi_escapes::strip_str(trimmed).to_string(),
                        metadata: None,
                    };
                    add_normalized_entry(&msg_store2, &entry_index_provider, entry);
                    continue;
                }
            };

            // Session id lives on stream.id of every envelope line.
            if !session_id_extracted
                && let Some(session_id) = json
                    .get("stream")
                    .and_then(|s| s.get("id"))
                    .and_then(|v| v.as_str())
            {
                msg_store2.push_session_id(session_id.to_string());
                session_id_extracted = true;
            }

            let payload_type = json
                .get("payload_type")
                .and_then(|v| v.as_str())
                .unwrap_or("");

            let payload = json.get("payload").unwrap_or(&Value::Null);

            match payload_type {
                "run.output.delta" => {
                    let text = payload.get("text").and_then(|v| v.as_str()).unwrap_or("");
                    if !text.is_empty() {
                        let entry = NormalizedEntry {
                            timestamp: None,
                            entry_type: NormalizedEntryType::AssistantMessage,
                            content: text.to_string(),
                            metadata: None,
                        };
                        add_normalized_entry(&msg_store2, &entry_index_provider, entry);
                    }
                }
                "run.terminal.completed" => {
                    let text = payload.get("text").and_then(|v| v.as_str()).unwrap_or("");
                    if !text.is_empty() {
                        let entry = NormalizedEntry {
                            timestamp: None,
                            entry_type: NormalizedEntryType::AssistantMessage,
                            content: text.to_string(),
                            metadata: None,
                        };
                        add_normalized_entry(&msg_store2, &entry_index_provider, entry);
                    }
                }
                "run.terminal.failed" | "run.terminal.cancelled" => {
                    let text = payload
                        .get("text")
                        .or_else(|| payload.get("reason"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("Muse run ended without completing");
                    let entry = NormalizedEntry {
                        timestamp: None,
                        entry_type: NormalizedEntryType::ErrorMessage {
                            error_type: NormalizedEntryError::Other,
                        },
                        content: text.to_string(),
                        metadata: None,
                    };
                    add_normalized_entry(&msg_store2, &entry_index_provider, entry);
                }
                "tool.result" => {
                    let tool_name = payload
                        .get("correlation_facts")
                        .and_then(|c| c.get("tool_name"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("tool");
                    let outcome = payload
                        .get("correlation_facts")
                        .and_then(|c| c.get("outcome"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("completed");
                    let entry = NormalizedEntry {
                        timestamp: None,
                        entry_type: NormalizedEntryType::SystemMessage,
                        content: format!("tool {tool_name}: {outcome}"),
                        metadata: None,
                    };
                    add_normalized_entry(&msg_store2, &entry_index_provider, entry);
                }
                "run.usage" => {
                    // Usage lines carry token counts; surface as system message for now.
                    let entry = NormalizedEntry {
                        timestamp: None,
                        entry_type: NormalizedEntryType::SystemMessage,
                        content: format!("usage: {payload}"),
                        metadata: None,
                    };
                    add_normalized_entry(&msg_store2, &entry_index_provider, entry);
                }
                _ => {
                    // Ignore unknown payload types (session.*, task.*, etc.)
                    continue;
                }
            }
        }
    });

    vec![h1, h2]
}
