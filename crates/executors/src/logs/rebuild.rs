//! Rebuild a `Vec<NormalizedEntry>` from a sequence of `LogMsg` values
//! (the same data layer the WebSocket conversation stream exposes).

use workspace_utils::log_msg::LogMsg;

use crate::logs::{NormalizedConversation, NormalizedEntry};

/// Apply every `LogMsg::JsonPatch` in order to an empty conversation and return
/// the materialised `entries` vector.
pub fn rebuild_entries(msgs: &[LogMsg]) -> Vec<NormalizedEntry> {
    let mut doc = serde_json::to_value(NormalizedConversation::default())
        .expect("serialize empty conversation");
    for msg in msgs {
        if let LogMsg::JsonPatch(patch) = msg {
            // Ignore patch errors — matches frontend leniency.
            let _ = json_patch::patch(&mut doc, patch);
        }
    }
    let conv: NormalizedConversation = serde_json::from_value(doc).unwrap_or_default();
    conv.entries
}

#[cfg(test)]
mod tests {
    use json_patch::{Patch, PatchOperation};
    use workspace_utils::log_msg::LogMsg;

    use super::*;
    use crate::logs::{NormalizedEntry, NormalizedEntryType};

    fn mk_entry(content: &str) -> NormalizedEntry {
        NormalizedEntry {
            timestamp: None,
            entry_type: NormalizedEntryType::AssistantMessage,
            content: content.into(),
            metadata: None,
        }
    }

    #[test]
    fn empty_stream_yields_empty_vec() {
        let out = rebuild_entries(&[]);
        assert!(out.is_empty());
    }

    #[test]
    fn appends_entries_in_order() {
        let a = mk_entry("a");
        let b = mk_entry("b");
        let add_a = Patch(vec![PatchOperation::Add(json_patch::AddOperation {
            path: "/entries/0".try_into().unwrap(),
            value: serde_json::to_value(&a).unwrap(),
        })]);
        let add_b = Patch(vec![PatchOperation::Add(json_patch::AddOperation {
            path: "/entries/1".try_into().unwrap(),
            value: serde_json::to_value(&b).unwrap(),
        })]);
        let msgs = vec![LogMsg::JsonPatch(add_a), LogMsg::JsonPatch(add_b)];
        let out = rebuild_entries(&msgs);
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].content, "a");
        assert_eq!(out[1].content, "b");
    }

    #[test]
    fn ignores_non_patch_messages() {
        let a = mk_entry("a");
        let add_a = Patch(vec![PatchOperation::Add(json_patch::AddOperation {
            path: "/entries/0".try_into().unwrap(),
            value: serde_json::to_value(&a).unwrap(),
        })]);
        let msgs = vec![
            LogMsg::Stdout("noise".into()),
            LogMsg::JsonPatch(add_a),
            LogMsg::Ready,
            LogMsg::Finished,
        ];
        let out = rebuild_entries(&msgs);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].content, "a");
    }

    #[test]
    fn malformed_patch_is_silently_skipped() {
        // Replace on a path that doesn't exist yet — json-patch returns error,
        // rebuild_entries must swallow it and continue with subsequent patches.
        let bad = Patch(vec![PatchOperation::Replace(
            json_patch::ReplaceOperation {
                path: "/entries/99/content".try_into().unwrap(),
                value: serde_json::json!("nope"),
            },
        )]);
        let good = Patch(vec![PatchOperation::Add(json_patch::AddOperation {
            path: "/entries/0".try_into().unwrap(),
            value: serde_json::to_value(mk_entry("ok")).unwrap(),
        })]);
        let out = rebuild_entries(&[LogMsg::JsonPatch(bad), LogMsg::JsonPatch(good)]);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].content, "ok");
    }
}
