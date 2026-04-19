use std::sync::Arc;

use dashmap::DashMap;
use relay_tunnel_core::server::SharedControl;

/// In-memory registry of active relay control channels, keyed by machine ID.
#[derive(Clone, Default)]
pub struct RelayRegistry {
    inner: Arc<DashMap<String, SharedControl>>,
}

impl RelayRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn insert(&self, machine_id: String, control: SharedControl) {
        self.inner.insert(machine_id, control);
    }

    pub fn remove(&self, machine_id: &str) {
        self.inner.remove(machine_id);
    }

    pub fn get(&self, machine_id: &str) -> Option<SharedControl> {
        self.inner.get(machine_id).map(|r| r.clone())
    }
}
