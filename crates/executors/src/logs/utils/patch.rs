use std::sync::Arc;

use json_patch::Patch;
use serde::Serialize;
use serde_json::{from_value, json, to_value};
use ts_rs::TS;
use workspace_utils::{diff::Diff, msg_store::MsgStore};

use crate::{
    executor_discovery::ExecutorDiscoveredOptions,
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

fn single_op(op: json_patch::PatchOperation) -> Patch {
    Patch(vec![op])
}

fn add_entry(path: impl std::fmt::Display, value: serde_json::Value) -> Patch {
    single_op(json_patch::PatchOperation::Add(json_patch::AddOperation {
        path: format!("/entries/{path}").try_into().unwrap(),
        value,
    }))
}

fn replace_entry(path: impl std::fmt::Display, value: serde_json::Value) -> Patch {
    single_op(json_patch::PatchOperation::Replace(
        json_patch::ReplaceOperation {
            path: format!("/entries/{path}").try_into().unwrap(),
            value,
        },
    ))
}

fn remove_entry(path: impl std::fmt::Display) -> Patch {
    single_op(json_patch::PatchOperation::Remove(
        json_patch::RemoveOperation {
            path: format!("/entries/{path}").try_into().unwrap(),
        },
    ))
}

/// Helper functions to create JSON patches for conversation entries
pub struct ConversationPatch;

impl ConversationPatch {
    pub fn add_normalized_entry(entry_index: usize, entry: NormalizedEntry) -> Patch {
        add_entry(entry_index, to_value(PatchType::NormalizedEntry(entry)).unwrap())
    }

    pub fn add_stdout(entry_index: usize, entry: String) -> Patch {
        add_entry(entry_index, to_value(PatchType::Stdout(entry)).unwrap())
    }

    pub fn add_stderr(entry_index: usize, entry: String) -> Patch {
        add_entry(entry_index, to_value(PatchType::Stderr(entry)).unwrap())
    }

    pub fn add_diff(entry_index: String, diff: Diff) -> Patch {
        add_entry(entry_index, to_value(PatchType::Diff(diff)).unwrap())
    }

    pub fn replace_diff(entry_index: String, diff: Diff) -> Patch {
        replace_entry(entry_index, to_value(PatchType::Diff(diff)).unwrap())
    }

    pub fn remove_diff(entry_index: String) -> Patch {
        remove_entry(entry_index)
    }

    pub fn replace(entry_index: usize, entry: NormalizedEntry) -> Patch {
        replace_entry(entry_index, to_value(PatchType::NormalizedEntry(entry)).unwrap())
    }

    pub fn remove(entry_index: usize) -> Patch {
        remove_entry(entry_index)
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

/// Extract the path string from a Patch (assumes single-operation patches).
pub fn patch_entry_path(patch: &Patch) -> Option<String> {
    patch.0.first().map(|op| op.path().to_string())
}

pub fn is_add_or_replace(patch: &Patch) -> bool {
    use json_patch::PatchOperation::*;
    patch.0.iter().all(|op| matches!(op, Add(..) | Replace(..)))
}

pub fn convert_replace_to_add(mut patch: Patch) -> Patch {
    for op in &mut patch.0 {
        if let json_patch::PatchOperation::Replace(r) = op {
            *op = json_patch::PatchOperation::Add(json_patch::AddOperation {
                path: r.path.clone(),
                value: r.value.clone(),
            });
        }
    }
    patch
}

pub fn executor_discovered_options(options: ExecutorDiscoveredOptions) -> Patch {
    serde_json::from_value(json!([
        {"op": "replace", "path": "/options", "value": options},
    ]))
    .unwrap_or_default()
}

pub fn update_models(models: Vec<crate::model_selector::ModelInfo>) -> Patch {
    serde_json::from_value(json!([
        {"op": "replace", "path": "/options/model_selector/models", "value": models},
    ]))
    .unwrap_or_default()
}

pub fn models_loaded() -> Patch {
    serde_json::from_value(json!([
        {"op": "replace", "path": "/options/loading_models", "value": false},
    ]))
    .unwrap_or_default()
}

pub fn update_agents(agents: Vec<crate::model_selector::AgentInfo>) -> Patch {
    serde_json::from_value(json!([
        {"op": "replace", "path": "/options/model_selector/agents", "value": agents},
    ]))
    .unwrap_or_default()
}

pub fn agents_loaded() -> Patch {
    serde_json::from_value(json!([
        {"op": "replace", "path": "/options/loading_agents", "value": false},
    ]))
    .unwrap_or_default()
}

pub fn update_slash_commands(
    slash_commands: Vec<crate::executors::SlashCommandDescription>,
) -> Patch {
    serde_json::from_value(json!([
        {"op": "replace", "path": "/options/slash_commands", "value": slash_commands},
    ]))
    .unwrap_or_default()
}

pub fn slash_commands_loaded() -> Patch {
    serde_json::from_value(json!([
        {"op": "replace", "path": "/options/loading_slash_commands", "value": false},
    ]))
    .unwrap_or_default()
}

pub fn update_providers(providers: Vec<crate::model_selector::ModelProvider>) -> Patch {
    serde_json::from_value(json!([
        {"op": "replace", "path": "/options/model_selector/providers", "value": providers},
    ]))
    .unwrap_or_default()
}

pub fn update_default_model(default_model: Option<String>) -> Patch {
    serde_json::from_value(json!([
        {"op": "replace", "path": "/options/model_selector/default_model", "value": default_model},
    ]))
    .unwrap_or_default()
}

pub fn discovery_error(error: String) -> Patch {
    serde_json::from_value(json!([
        {"op": "replace", "path": "/options/error", "value": error},
        {"op": "replace", "path": "/options/loading_models", "value": false},
        {"op": "replace", "path": "/options/loading_agents", "value": false},
        {"op": "replace", "path": "/options/loading_slash_commands", "value": false},
    ]))
    .unwrap_or_default()
}
