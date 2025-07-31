use json_patch::Patch;
use serde::{Deserialize, Serialize};
use serde_json::{from_value, json};

use crate::logs::NormalizedEntry;

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
enum PatchOperation {
    Add,
    Replace,
}

#[derive(Serialize)]
struct PatchEntry {
    op: PatchOperation,
    path: String,
    value: NormalizedEntry,
}

/// Helper functions to create JSON patches for conversation entries
pub struct ConversationPatch;

impl ConversationPatch {
    /// Create an ADD patch for a new conversation entry at the given index
    pub fn add(entry_index: usize, entry: NormalizedEntry) -> Patch {
        let patch_entry = PatchEntry {
            op: PatchOperation::Add,
            path: format!("/entries/{}", entry_index),
            value: entry,
        };

        from_value(json!([patch_entry])).unwrap()
    }

    /// Create a REPLACE patch for updating an existing conversation entry at the given index
    pub fn replace(entry_index: usize, entry: NormalizedEntry) -> Patch {
        let patch_entry = PatchEntry {
            op: PatchOperation::Replace,
            path: format!("/entries/{}", entry_index),
            value: entry,
        };

        from_value(json!([patch_entry])).unwrap()
    }
}
