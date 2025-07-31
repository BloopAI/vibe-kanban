//! Entry Index Provider for thread-safe monotonic indexing

use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};

/// Thread-safe provider for monotonically increasing entry indexes
#[derive(Debug, Clone)]
pub struct EntryIndexProvider(Arc<AtomicUsize>);

impl EntryIndexProvider {
    /// Create a new index provider starting from 0
    pub fn new() -> Self {
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
}

impl Default for EntryIndexProvider {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_entry_index_provider() {
        let provider = EntryIndexProvider::new();
        assert_eq!(provider.next(), 0);
        assert_eq!(provider.next(), 1);
        assert_eq!(provider.next(), 2);
    }

    #[test]
    fn test_entry_index_provider_clone() {
        let provider1 = EntryIndexProvider::new();
        let provider2 = provider1.clone();

        assert_eq!(provider1.next(), 0);
        assert_eq!(provider2.next(), 1);
        assert_eq!(provider1.next(), 2);
    }

    #[test]
    fn test_current_index() {
        let provider = EntryIndexProvider::new();
        assert_eq!(provider.current(), 0);

        provider.next();
        assert_eq!(provider.current(), 1);

        provider.next();
        assert_eq!(provider.current(), 2);
    }
}
