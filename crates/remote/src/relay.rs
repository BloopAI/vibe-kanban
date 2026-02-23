//! In-memory relay registry for active tunnel connections on the remote server.

use std::{
    collections::HashMap,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
};

use relay_tunnel::server::SharedControl;
use tokio::sync::Mutex;
use uuid::Uuid;

const MAX_TCP_STREAMS_PER_HOST: usize = 10;

/// An active relay connection from a local server.
pub struct ActiveRelay {
    /// Open yamux streams to the connected local host.
    pub control: SharedControl,
    /// Number of active TCP tunnel streams (for connection limiting).
    active_tcp_streams: AtomicUsize,
}

impl ActiveRelay {
    pub fn new(control: SharedControl) -> Self {
        Self {
            control,
            active_tcp_streams: AtomicUsize::new(0),
        }
    }
}

/// Try to acquire a TCP stream slot on the given relay. Returns a guard
/// that decrements the counter on drop, or `None` if the limit is reached.
pub fn try_acquire_tcp_stream(relay: &Arc<ActiveRelay>) -> Option<TcpStreamGuard> {
    let prev = relay.active_tcp_streams.fetch_add(1, Ordering::Relaxed);
    if prev >= MAX_TCP_STREAMS_PER_HOST {
        relay.active_tcp_streams.fetch_sub(1, Ordering::Relaxed);
        None
    } else {
        Some(TcpStreamGuard {
            relay: relay.clone(),
        })
    }
}

/// RAII guard that decrements the active TCP stream counter on drop.
pub struct TcpStreamGuard {
    relay: Arc<ActiveRelay>,
}

impl Drop for TcpStreamGuard {
    fn drop(&mut self) {
        self.relay
            .active_tcp_streams
            .fetch_sub(1, Ordering::Relaxed);
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
