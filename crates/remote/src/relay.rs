//! In-memory relay registry for active tunnel connections.
//!
//! Each connected local server gets an `ActiveRelay` entry. The remote
//! relay proxy looks up relays by host ID and opens yamux streams over
//! the existing control connection.

use std::{
    collections::HashMap,
    sync::Arc,
    time::Instant,
};

use relay_tunnel::server::SharedControl;
use tokio::sync::Mutex;
use uuid::Uuid;

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
    /// One-time auth codes for relay subdomain cookie exchange.
    /// Maps code → (host_id, relay_token, created_at).
    auth_codes: Arc<Mutex<HashMap<String, (Uuid, String, Instant)>>>,
}

/// How long an auth code is valid.
const AUTH_CODE_TTL_SECS: u64 = 30;

impl RelayRegistry {
    /// Register a relay for a host. Replaces any existing relay for that host.
    pub async fn insert(&self, host_id: Uuid, relay: Arc<ActiveRelay>) {
        self.inner.lock().await.insert(host_id, relay);
    }

    /// Remove the relay for a host.
    pub async fn remove(&self, host_id: &Uuid) {
        self.inner.lock().await.remove(host_id);
    }

    /// Look up the active relay for a host.
    pub async fn get(&self, host_id: &Uuid) -> Option<Arc<ActiveRelay>> {
        self.inner.lock().await.get(host_id).cloned()
    }

    /// Store a one-time auth code. Returns the code string.
    pub async fn store_auth_code(&self, host_id: Uuid, relay_token: String) -> String {
        let code = Uuid::new_v4().to_string();
        let mut codes = self.auth_codes.lock().await;
        // Garbage-collect expired codes while we're here.
        codes.retain(|_, (_, _, created)| created.elapsed().as_secs() < AUTH_CODE_TTL_SECS);
        codes.insert(code.clone(), (host_id, relay_token, Instant::now()));
        code
    }

    /// Consume a one-time auth code. Returns (host_id, relay_token) if valid.
    pub async fn redeem_auth_code(&self, code: &str) -> Option<(Uuid, String)> {
        let mut codes = self.auth_codes.lock().await;
        let (host_id, token, created) = codes.remove(code)?;
        if created.elapsed().as_secs() >= AUTH_CODE_TTL_SECS {
            return None;
        }
        Some((host_id, token))
    }
}
