use json_patch::Patch;
use serde::{Deserialize, Serialize};
use serde_json::{from_value, json, to_value};
use ts_rs::TS;
use workspace_utils::diff::Diff;

use crate::logs::NormalizedEntry;

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, Eq, TS)]
#[serde(rename_all = "lowercase")]
enum PatchOperation {
    Add,
    Replace,
    Remove,
}

#[allow(clippy::large_enum_variant)]
#[derive(Serialize, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE", tag = "type", content = "content")]
pub enum PatchType {
    NormalizedEntry(NormalizedEntry),
    Stdout(String),
    Stderr(String),
    Diff(Diff),
}

#[derive(Serialize)]
struct PatchEntry {
    op: PatchOperation,
    path: String,
    value: PatchType,
}

pub fn escape_json_pointer_segment(s: &str) -> String {
    s.replace('~', "~0").replace('/', "~1")
}

/// Helper functions to create JSON patches for conversation entries
pub struct ConversationPatch;

impl ConversationPatch {
    /// Create an ADD patch for a new conversation entry at the given index
    pub fn add_normalized_entry(entry_index: usize, entry: NormalizedEntry) -> Patch {
        let patch_entry = PatchEntry {
            op: PatchOperation::Add,
            path: format!("/entries/{entry_index}"),
            value: PatchType::NormalizedEntry(entry),
        };

        from_value(json!([patch_entry])).unwrap()
    }

    /// Create an ADD patch for a new string at the given index
    pub fn add_stdout(entry_index: usize, entry: String) -> Patch {
        let patch_entry = PatchEntry {
            op: PatchOperation::Add,
            path: format!("/entries/{entry_index}"),
            value: PatchType::Stdout(entry),
        };

        from_value(json!([patch_entry])).unwrap()
    }

    /// Create an ADD patch for a new string at the given index
    pub fn add_stderr(entry_index: usize, entry: String) -> Patch {
        let patch_entry = PatchEntry {
            op: PatchOperation::Add,
            path: format!("/entries/{entry_index}"),
            value: PatchType::Stderr(entry),
        };

        from_value(json!([patch_entry])).unwrap()
    }

    /// Create an ADD patch for a new diff at the given index
    pub fn add_diff(entry_index: String, diff: Diff) -> Patch {
        let patch_entry = PatchEntry {
            op: PatchOperation::Add,
            path: format!("/entries/{entry_index}"),
            value: PatchType::Diff(diff),
        };

        from_value(json!([patch_entry])).unwrap()
    }

    /// Create an ADD patch for a new diff at the given index
    pub fn replace_diff(entry_index: String, diff: Diff) -> Patch {
        let patch_entry = PatchEntry {
            op: PatchOperation::Replace,
            path: format!("/entries/{entry_index}"),
            value: PatchType::Diff(diff),
        };

        from_value(json!([patch_entry])).unwrap()
    }

    /// Create a REMOVE patch for removing a diff
    pub fn remove_diff(entry_index: String) -> Patch {
        from_value(json!([{
            "op": PatchOperation::Remove,
            "path": format!("/entries/{entry_index}"),
        }]))
        .unwrap()
    }

    /// Create a REPLACE patch for updating an existing conversation entry at the given index
    pub fn replace(entry_index: usize, entry: NormalizedEntry) -> Patch {
        let patch_entry = PatchEntry {
            op: PatchOperation::Replace,
            path: format!("/entries/{entry_index}"),
            value: PatchType::NormalizedEntry(entry),
        };

        from_value(json!([patch_entry])).unwrap()
    }

    pub fn remove(entry_index: usize) -> Patch {
        from_value(json!([{
            "op": PatchOperation::Remove,
            "path": format!("/entries/{entry_index}"),
        }]))
        .unwrap()
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
