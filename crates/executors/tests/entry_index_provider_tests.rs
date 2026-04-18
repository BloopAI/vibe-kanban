use executors::logs::utils::{ConversationPatch, EntryIndexProvider};
use std::sync::Arc;
use workspace_utils::msg_store::MsgStore;

#[test]
fn test_start_from_empty_msg_store() {
    let msg_store = Arc::new(MsgStore::new());
    let provider = EntryIndexProvider::start_from(&msg_store);

    // Empty store should start at 0
    assert_eq!(provider.current(), 0);
}

#[test]
fn test_start_from_with_existing_entries() {
    let msg_store = Arc::new(MsgStore::new());

    // Add patch with entry index 5
    msg_store.push_patch(ConversationPatch::add_stdout(5, "test".to_string()));

    let provider = EntryIndexProvider::start_from(&msg_store);

    // Should start at max_index + 1 = 6
    assert_eq!(provider.current(), 6);
}

#[test]
fn test_start_from_with_non_sequential_entries() {
    let msg_store = Arc::new(MsgStore::new());

    // Add patches with gaps in indices: 0, 2, 5, 10
    for idx in [0, 2, 5, 10] {
        msg_store.push_patch(ConversationPatch::add_stdout(idx, "test".to_string()));
    }

    let provider = EntryIndexProvider::start_from(&msg_store);

    // Should start at max_index + 1 = 11
    assert_eq!(provider.current(), 11);
}
