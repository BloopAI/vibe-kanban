use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};

use relay_webrtc::WebRtcClient;
use tokio::sync::RwLock;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

/// How long to wait before retrying a failed WebRTC handshake.
const FAILED_RETRY_COOLDOWN: Duration = Duration::from_secs(5 * 60);

/// State of a WebRTC connection for a single host.
enum WebRtcConnectionState {
    /// Handshake is in progress.
    Connecting,
    /// Connection established.
    Connected(Arc<WebRtcClient>),
    /// Negotiation failed — retry allowed after the cooldown elapses.
    Failed(Instant),
}

#[derive(Clone)]
pub(crate) struct WebRtcConnectionCache {
    hosts: Arc<RwLock<HashMap<Uuid, WebRtcConnectionState>>>,
    shutdown: CancellationToken,
}

impl Default for WebRtcConnectionCache {
    fn default() -> Self {
        Self::new(CancellationToken::new())
    }
}

impl WebRtcConnectionCache {
    pub fn new(shutdown: CancellationToken) -> Self {
        Self {
            hosts: Arc::new(RwLock::new(HashMap::new())),
            shutdown,
        }
    }

    pub fn child_token(&self) -> CancellationToken {
        self.shutdown.child_token()
    }

    pub async fn get(&self, host_id: Uuid) -> Option<Arc<WebRtcClient>> {
        match self.hosts.read().await.get(&host_id) {
            Some(WebRtcConnectionState::Connected(client)) if client.is_connected() => {
                Some(client.clone())
            }
            _ => None,
        }
    }

    pub async fn insert(&self, host_id: Uuid, client: Arc<WebRtcClient>) {
        self.hosts
            .write()
            .await
            .insert(host_id, WebRtcConnectionState::Connected(client));
    }

    pub async fn remove(&self, host_id: Uuid) {
        if let Some(WebRtcConnectionState::Connected(client)) =
            self.hosts.write().await.remove(&host_id)
        {
            client.shutdown().await;
        }
    }

    /// Try to mark a host as "connecting". Returns false if already connected
    /// or a handshake is already in progress. A previous failure is retried
    /// once the cooldown has elapsed; a disconnected client is replaced.
    pub async fn start_connecting(&self, host_id: Uuid) -> bool {
        use std::collections::hash_map::Entry;
        let mut hosts = self.hosts.write().await;
        match hosts.entry(host_id) {
            Entry::Occupied(mut e) => match e.get() {
                WebRtcConnectionState::Failed(at) if at.elapsed() >= FAILED_RETRY_COOLDOWN => {
                    e.insert(WebRtcConnectionState::Connecting);
                    true
                }
                WebRtcConnectionState::Connected(client) if !client.is_connected() => {
                    e.insert(WebRtcConnectionState::Connecting);
                    true
                }
                _ => false,
            },
            Entry::Vacant(e) => {
                e.insert(WebRtcConnectionState::Connecting);
                true
            }
        }
    }

    pub async fn mark_failed(&self, host_id: Uuid) {
        self.hosts
            .write()
            .await
            .insert(host_id, WebRtcConnectionState::Failed(Instant::now()));
    }
}
