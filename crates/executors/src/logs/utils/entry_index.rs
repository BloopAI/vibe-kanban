//! Entry Index Provider for thread-safe monotonic indexing

use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};

use json_patch::PatchOperation;
use utils::{log_msg::LogMsg, msg_store::MsgStore};

/// Thread-safe provider for monotonically increasing entry indexes
#[derive(Debug, Clone)]
pub struct EntryIndexProvider(Arc<AtomicUsize>);

impl EntryIndexProvider {
    /// Create a new index provider starting from 0 (private; prefer seeding)
    fn new() -> Self {
        Self(Arc::new(AtomicUsize::new(0)))
    }

    /// Get the next available index
    pub fn next(&self) -> usize {
        self.0.fetch_add(1, Ordering::Relaxed)
    }

    /// Get the current index without incrementing
    pub fn current(&self) -> usize {
        self.0.load(Ordering::Relaxed)
    }

    pub fn reset(&self) {
        self.0.store(0, Ordering::Relaxed);
    }

    /// Create a provider seeded from the maximum existing normalized-entry index
    /// observed in prior JSON patches in `MsgStore`.
    pub fn seeded_from_msg_store(msg_store: &MsgStore) -> Self {
        let provider = EntryIndexProvider::new();

        let max_index: Option<usize> = msg_store
            .get_history()
            .iter()
            .filter_map(|msg| {
                if let LogMsg::JsonPatch(patch) = msg {
                    patch.iter().find_map(|op| {
                        if let PatchOperation::Add(add) = op {
                            add.path
                                .strip_prefix("/entries/")
                                .and_then(|n_str| n_str.parse::<usize>().ok())
                        } else {
                            None
                        }
                    })
                } else {
                    None
                }
            })
            .max();

        let start_at = max_index.map_or(0, |n| n.saturating_add(1));
        provider.0.store(start_at, Ordering::Relaxed);
        provider
    }
}

impl Default for EntryIndexProvider {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
impl EntryIndexProvider {
    /// Test-only constructor for a fresh provider starting at 0
    pub fn test_new() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_entry_index_provider() {
        let provider = EntryIndexProvider::test_new();
        assert_eq!(provider.next(), 0);
        assert_eq!(provider.next(), 1);
        assert_eq!(provider.next(), 2);
    }

    #[test]
    fn test_entry_index_provider_clone() {
        let provider1 = EntryIndexProvider::test_new();
        let provider2 = provider1.clone();

        assert_eq!(provider1.next(), 0);
        assert_eq!(provider2.next(), 1);
        assert_eq!(provider1.next(), 2);
    }

    #[test]
    fn test_current_index() {
        let provider = EntryIndexProvider::test_new();
        assert_eq!(provider.current(), 0);

        provider.next();
        assert_eq!(provider.current(), 1);

        provider.next();
        assert_eq!(provider.current(), 2);
    }
}
