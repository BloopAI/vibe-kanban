use std::sync::Arc;

use json_patch::Patch;
use serde::Serialize;
use serde_json::{from_value, json, to_value};
use ts_rs::TS;
use workspace_utils::{diff::Diff, msg_store::MsgStore};

use crate::{
    executors::SlashCommandDescription,
    logs::{NormalizedEntry, utils::EntryIndexProvider},
};

#[allow(clippy::large_enum_variant)]
#[derive(Serialize, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE", tag = "type", content = "content")]
pub enum PatchType {
    NormalizedEntry(NormalizedEntry),
    Stdout(String),
    Stderr(String),
    Diff(Diff),
}

pub fn escape_json_pointer_segment(s: &str) -> String {
    s.replace('~', "~0").replace('/', "~1")
}

/// Helper functions to create JSON patches for conversation entries
pub struct ConversationPatch;

impl ConversationPatch {
    /// Create an ADD patch for a new conversation entry at the given index
    pub fn add_normalized_entry(entry_index: usize, entry: NormalizedEntry) -> Patch {
        let value = to_value(PatchType::NormalizedEntry(entry)).unwrap();
        Patch(vec![json_patch::PatchOperation::Add(
            json_patch::AddOperation {
                path: format!("/entries/{entry_index}").try_into().unwrap(),
                value,
            },
        )])
    }

    /// Create an ADD patch for a new string at the given index
    pub fn add_stdout(entry_index: usize, entry: String) -> Patch {
        let value = to_value(PatchType::Stdout(entry)).unwrap();
        Patch(vec![json_patch::PatchOperation::Add(
            json_patch::AddOperation {
                path: format!("/entries/{entry_index}").try_into().unwrap(),
                value,
            },
        )])
    }

    /// Create an ADD patch for a new string at the given index
    pub fn add_stderr(entry_index: usize, entry: String) -> Patch {
        let value = to_value(PatchType::Stderr(entry)).unwrap();
        Patch(vec![json_patch::PatchOperation::Add(
            json_patch::AddOperation {
                path: format!("/entries/{entry_index}").try_into().unwrap(),
                value,
            },
        )])
    }

    /// Create an ADD patch for a new diff at the given index
    pub fn add_diff(entry_index: String, diff: Diff) -> Patch {
        let value = to_value(PatchType::Diff(diff)).unwrap();
        Patch(vec![json_patch::PatchOperation::Add(
            json_patch::AddOperation {
                path: format!("/entries/{entry_index}").try_into().unwrap(),
                value,
            },
        )])
    }

    /// Create an ADD patch for a new diff at the given index
    pub fn replace_diff(entry_index: String, diff: Diff) -> Patch {
        let value = to_value(PatchType::Diff(diff)).unwrap();
        Patch(vec![json_patch::PatchOperation::Replace(
            json_patch::ReplaceOperation {
                path: format!("/entries/{entry_index}").try_into().unwrap(),
                value,
            },
        )])
    }

    /// Create a REMOVE patch for removing a diff
    pub fn remove_diff(entry_index: String) -> Patch {
        Patch(vec![json_patch::PatchOperation::Remove(
            json_patch::RemoveOperation {
                path: format!("/entries/{entry_index}").try_into().unwrap(),
            },
        )])
    }

    /// Create a REPLACE patch for updating an existing conversation entry at the given index
    pub fn replace(entry_index: usize, entry: NormalizedEntry) -> Patch {
        let value = to_value(PatchType::NormalizedEntry(entry)).unwrap();
        Patch(vec![json_patch::PatchOperation::Replace(
            json_patch::ReplaceOperation {
                path: format!("/entries/{entry_index}").try_into().unwrap(),
                value,
            },
        )])
    }

    pub fn remove(entry_index: usize) -> Patch {
        Patch(vec![json_patch::PatchOperation::Remove(
            json_patch::RemoveOperation {
                path: format!("/entries/{entry_index}").try_into().unwrap(),
            },
        )])
    }
}

/// Extract the entry index and `NormalizedEntry` from a JsonPatch if it contains one
pub fn extract_normalized_entry_from_patch(patch: &Patch) -> Option<(usize, NormalizedEntry)> {
    let value = to_value(patch).ok()?;
    let ops = value.as_array()?;
    ops.iter().rev().find_map(|op| {
        let path = op.get("path")?.as_str()?;
        let entry_index = path.strip_prefix("/entries/")?.parse::<usize>().ok()?;

        let value = op.get("value")?;
        (value.get("type")?.as_str()? == "NORMALIZED_ENTRY")
            .then(|| value.get("content"))
            .flatten()
            .and_then(|c| from_value::<NormalizedEntry>(c.clone()).ok())
            .map(|entry| (entry_index, entry))
    })
}

pub fn upsert_normalized_entry(
    msg_store: &Arc<MsgStore>,
    index: usize,
    normalized_entry: NormalizedEntry,
    is_new: bool,
) {
    if is_new {
        msg_store.push_patch(ConversationPatch::add_normalized_entry(
            index,
            normalized_entry,
        ));
    } else {
        msg_store.push_patch(ConversationPatch::replace(index, normalized_entry));
    }
}

pub fn add_normalized_entry(
    msg_store: &Arc<MsgStore>,
    index_provider: &EntryIndexProvider,
    normalized_entry: NormalizedEntry,
) -> usize {
    let index = index_provider.next();
    upsert_normalized_entry(msg_store, index, normalized_entry, true);
    index
}

pub fn replace_normalized_entry(
    msg_store: &Arc<MsgStore>,
    index: usize,
    normalized_entry: NormalizedEntry,
) {
    upsert_normalized_entry(msg_store, index, normalized_entry, false);
}

pub fn slash_commands(
    commands: Vec<SlashCommandDescription>,
    discovering: bool,
    error: Option<String>,
) -> Patch {
    serde_json::from_value(json!([
        {"op": "replace", "path": "/commands", "value": commands},
        {"op": "replace", "path": "/discovering", "value": discovering},
        {"op": "replace", "path": "/error", "value": error},
    ]))
    .unwrap_or_default()
}
