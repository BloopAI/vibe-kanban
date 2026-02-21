//! In-memory relay registry for active WebSocket relay connections.
//!
//! Each connected local server gets an `ActiveRelay` entry. The remote
//! relay proxy looks up relays by user ID (from JWT) to route traffic.

use std::{
    collections::HashMap,
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    time::Instant,
};

use api_types::{LocalToRelay, RelayToLocal};
use tokio::sync::{Mutex, mpsc, oneshot};
use uuid::Uuid;

/// An active relay connection from a local server.
pub struct ActiveRelay {
    /// Send messages to the local server through the control channel.
    pub tx: mpsc::Sender<RelayToLocal>,
    /// Pending HTTP request/response pairs, keyed by stream_id.
    pub pending_http: Mutex<HashMap<u64, oneshot::Sender<LocalToRelay>>>,
    /// Active WebSocket streams, keyed by stream_id.
    pub active_ws: Mutex<HashMap<u64, mpsc::Sender<LocalToRelay>>>,
    /// Monotonically increasing stream ID counter.
    next_stream_id: AtomicU64,
}

impl ActiveRelay {
    pub fn new(tx: mpsc::Sender<RelayToLocal>) -> Self {
        Self {
            tx,
            pending_http: Mutex::new(HashMap::new()),
            active_ws: Mutex::new(HashMap::new()),
            next_stream_id: AtomicU64::new(1),
        }
    }

    /// Allocate a new unique stream ID.
    pub fn next_stream_id(&self) -> u64 {
        self.next_stream_id.fetch_add(1, Ordering::Relaxed)
    }
}

/// Registry of all active relay connections, indexed by user ID.
#[derive(Default, Clone)]
pub struct RelayRegistry {
    inner: Arc<Mutex<HashMap<Uuid, Arc<ActiveRelay>>>>,
    /// One-time auth codes for relay subdomain cookie exchange.
    /// Maps code → (user_id, access_token, created_at).
    auth_codes: Arc<Mutex<HashMap<String, (Uuid, String, Instant)>>>,
}

/// How long an auth code is valid.
const AUTH_CODE_TTL_SECS: u64 = 30;

impl RelayRegistry {
    /// Register a relay for a user. Replaces any existing relay for that user.
    pub async fn insert(&self, user_id: Uuid, relay: Arc<ActiveRelay>) {
        self.inner.lock().await.insert(user_id, relay);
    }

    /// Remove the relay for a user.
    pub async fn remove(&self, user_id: &Uuid) {
        self.inner.lock().await.remove(user_id);
    }

    /// Look up the active relay for a user.
    pub async fn get(&self, user_id: &Uuid) -> Option<Arc<ActiveRelay>> {
        self.inner.lock().await.get(user_id).cloned()
    }

    /// Store a one-time auth code. Returns the code string.
    pub async fn store_auth_code(&self, user_id: Uuid, access_token: String) -> String {
        let code = Uuid::new_v4().to_string();
        let mut codes = self.auth_codes.lock().await;
        // Garbage-collect expired codes while we're here
        codes.retain(|_, (_, _, created)| created.elapsed().as_secs() < AUTH_CODE_TTL_SECS);
        codes.insert(code.clone(), (user_id, access_token, Instant::now()));
        code
    }

    /// Consume a one-time auth code. Returns (user_id, access_token) if valid.
    pub async fn redeem_auth_code(&self, code: &str) -> Option<(Uuid, String)> {
        let mut codes = self.auth_codes.lock().await;
        let (user_id, token, created) = codes.remove(code)?;
        if created.elapsed().as_secs() >= AUTH_CODE_TTL_SECS {
            return None; // Expired
        }
        Some((user_id, token))
    }
}
