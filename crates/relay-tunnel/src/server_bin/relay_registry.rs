//! In-memory relay registry for active tunnel connections.
//!
//! Each connected local server gets an `ActiveRelay` entry. The remote
//! relay proxy looks up relays by host ID and opens yamux streams over
//! the existing control connection. One-time auth codes are DB-backed.

use std::{collections::HashMap, sync::Arc};

use tokio::sync::Mutex;
use uuid::Uuid;

use crate::server::SharedControl;

/// An active relay connection from a local server.
pub struct ActiveRelay {
    /// Open yamux streams to the connected local host.
    pub control: SharedControl,
}

impl ActiveRelay {
    pub fn new(control: SharedControl) -> Self {
        Self { control }
    }
}

/// Registry of all active relay connections, indexed by host ID.
#[derive(Default, Clone)]
pub struct RelayRegistry {
    inner: Arc<Mutex<HashMap<Uuid, Arc<ActiveRelay>>>>,
}

impl RelayRegistry {
    /// Register a relay for a host. Replaces any existing relay for that host.
    pub async fn insert(&self, host_id: Uuid, relay: Arc<ActiveRelay>) {
        self.inner.lock().await.insert(host_id, relay);
    }

    /// Remove the relay for a host.
    pub async fn remove(&self, host_id: &Uuid) {
        self.inner.lock().await.remove(host_id);
    }

    /// Remove the relay for a host only when it still matches the provided relay.
    pub async fn remove_if_same(&self, host_id: &Uuid, relay: &Arc<ActiveRelay>) -> bool {
        let mut relays = self.inner.lock().await;
        if relays
            .get(host_id)
            .is_some_and(|current| Arc::ptr_eq(current, relay))
        {
            relays.remove(host_id);
            true
        } else {
            false
        }
    }

    /// Look up the active relay for a host.
    pub async fn get(&self, host_id: &Uuid) -> Option<Arc<ActiveRelay>> {
        self.inner.lock().await.get(host_id).cloned()
    }
}
