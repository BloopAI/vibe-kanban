use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

/// Thread-safe store for single-use pairing codes with TTL.
#[derive(Clone, Default)]
pub struct PairingStore {
    codes: Arc<Mutex<HashMap<String, Instant>>>,
}

impl PairingStore {
    pub fn new() -> Self {
        Self::default()
    }

    /// Insert `code` with an expiry of `expiry_minutes` from now.
    /// Also evicts any already-expired codes.
    pub fn set_pending_code(&self, code: String, expiry_minutes: u64) {
        let expiry = Instant::now() + Duration::from_secs(expiry_minutes * 60);
        let mut map = self.codes.lock().expect("pairing store lock poisoned");
        let now = Instant::now();
        map.retain(|_, exp| *exp > now);
        map.insert(code, expiry);
    }

    /// Remove `code` and return `true` only if it existed and has not expired.
    /// Each code can be consumed at most once (single-use).
    pub fn consume_code(&self, code: &str) -> bool {
        let mut map = self.codes.lock().expect("pairing store lock poisoned");
        map.remove(code)
            .is_some_and(|expiry| Instant::now() <= expiry)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_code_is_single_use() {
        let store = PairingStore::new();
        store.set_pending_code("TESTCODE".to_string(), 5);

        assert!(
            store.consume_code("TESTCODE"),
            "first consume should succeed"
        );
        assert!(
            !store.consume_code("TESTCODE"),
            "second consume should fail (single-use)"
        );
    }

    #[test]
    fn test_wrong_code_rejected() {
        let store = PairingStore::new();
        store.set_pending_code("RIGHTCODE".to_string(), 5);

        assert!(
            !store.consume_code("WRONGCODE"),
            "unknown code should be rejected"
        );
        assert!(
            store.consume_code("RIGHTCODE"),
            "correct code should still be valid"
        );
    }

    #[test]
    fn test_expired_code_rejected() {
        let store = PairingStore::new();
        // Insert with 0-minute TTL (immediately expired)
        {
            let mut map = store.codes.lock().unwrap();
            map.insert(
                "EXPIREDCODE".to_string(),
                Instant::now() - Duration::from_secs(1),
            );
        }
        assert!(
            !store.consume_code("EXPIREDCODE"),
            "expired code should be rejected"
        );
    }
}
