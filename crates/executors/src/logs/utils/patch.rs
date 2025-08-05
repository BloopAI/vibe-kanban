use json_patch::Patch;
use serde::{Deserialize, Serialize};
use serde_json::{from_value, json};
use ts_rs::TS;
use utils::diff::FileDiff;

use crate::logs::NormalizedEntry;

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, Eq, TS)]
#[ts(export)]
#[serde(rename_all = "lowercase")]
enum PatchOperation {
    Add,
    Replace,
    Remove,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE", tag = "type", content = "content")]
pub enum PatchType {
    NormalizedEntry(NormalizedEntry),
    Stdout(String),
    Stderr(String),
    FileDiff(FileDiff),
}

#[derive(Serialize)]
struct PatchEntry {
    op: PatchOperation,
    path: String,
    value: PatchType,
}

fn escape_json_pointer_segment(s: &str) -> String {
    s.replace('~', "~0").replace('/', "~1")
}

/// Helper functions to create JSON patches for conversation entries
pub struct ConversationPatch;

impl ConversationPatch {
    /// Create an ADD patch for a new conversation entry at the given index
    pub fn add_normalized_entry(entry_index: usize, entry: NormalizedEntry) -> Patch {
        let patch_entry = PatchEntry {
            op: PatchOperation::Add,
            path: format!("/entries/{}", entry_index),
            value: PatchType::NormalizedEntry(entry),
        };

        from_value(json!([patch_entry])).unwrap()
    }

    /// Create an ADD patch for a new string at the given index
    pub fn add_stdout(entry_index: usize, entry: String) -> Patch {
        let patch_entry = PatchEntry {
            op: PatchOperation::Add,
            path: format!("/entries/{}", entry_index),
            value: PatchType::Stdout(entry),
        };

        from_value(json!([patch_entry])).unwrap()
    }

    /// Create an ADD patch for a new string at the given index
    pub fn add_stderr(entry_index: usize, entry: String) -> Patch {
        let patch_entry = PatchEntry {
            op: PatchOperation::Add,
            path: format!("/entries/{}", entry_index),
            value: PatchType::Stderr(entry),
        };

        from_value(json!([patch_entry])).unwrap()
    }

    /// Create an ADD patch for a new file diff at the given index
    pub fn add_file_diff(file_diff: FileDiff) -> Patch {
        let patch_entry = PatchEntry {
            op: PatchOperation::Add,
            path: format!("/entries/{}", escape_json_pointer_segment(&file_diff.path)),
            value: PatchType::FileDiff(file_diff),
        };

        from_value(json!([patch_entry])).unwrap()
    }

    /// Create an ADD patch for a new file diff at the given index
    pub fn replace_file_diff(file_diff: FileDiff) -> Patch {
        let patch_entry = PatchEntry {
            op: PatchOperation::Replace,
            path: format!("/entries/{}", escape_json_pointer_segment(&file_diff.path)),
            value: PatchType::FileDiff(file_diff),
        };

        from_value(json!([patch_entry])).unwrap()
    }

    /// Create a REMOVE patch for removing a file diff
    pub fn remove_file_diff(path: &str) -> Patch {
        from_value(json!([{
            "op": PatchOperation::Remove,
            "path": format!("/entries/{}", escape_json_pointer_segment(path))
        }]))
        .unwrap()
    }

    /// Create a REPLACE patch for updating an existing conversation entry at the given index
    pub fn replace(entry_index: usize, entry: NormalizedEntry) -> Patch {
        let patch_entry = PatchEntry {
            op: PatchOperation::Replace,
            path: format!("/entries/{}", entry_index),
            value: PatchType::NormalizedEntry(entry),
        };

        from_value(json!([patch_entry])).unwrap()
    }
}
