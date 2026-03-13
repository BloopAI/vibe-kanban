use std::{collections::HashMap, sync::Arc};

use relay_webrtc::WebRtcClient;
use tokio::sync::RwLock;
use uuid::Uuid;

/// State of a WebRTC connection for a single host.
enum WebRtcHostState {
    /// Handshake is in progress.
    Connecting,
    /// Connection established.
    Connected(Arc<WebRtcClient>),
    /// Negotiation failed — prevents infinite retry loops.
    Failed,
}

/// Cache of active WebRTC direct connections keyed by host ID.
#[derive(Clone, Default)]
pub(crate) struct WebRtcConnectionCache {
    hosts: Arc<RwLock<HashMap<Uuid, WebRtcHostState>>>,
}

impl WebRtcConnectionCache {
    pub async fn get(&self, host_id: Uuid) -> Option<Arc<WebRtcClient>> {
        match self.hosts.read().await.get(&host_id) {
            Some(WebRtcHostState::Connected(client)) => Some(client.clone()),
            _ => None,
        }
    }

    pub async fn insert(&self, host_id: Uuid, client: Arc<WebRtcClient>) {
        self.hosts
            .write()
            .await
            .insert(host_id, WebRtcHostState::Connected(client));
    }

    pub async fn remove(&self, host_id: Uuid) {
        if let Some(WebRtcHostState::Connected(client)) = self.hosts.write().await.remove(&host_id)
        {
            client.shutdown();
        }
    }

    /// Try to mark a host as "connecting". Returns false if already connected,
    /// a handshake is already in progress, or a previous handshake failed.
    pub async fn start_connecting(&self, host_id: Uuid) -> bool {
        use std::collections::hash_map::Entry;
        let mut hosts = self.hosts.write().await;
        match hosts.entry(host_id) {
            Entry::Occupied(_) => false,
            Entry::Vacant(e) => {
                e.insert(WebRtcHostState::Connecting);
                true
            }
        }
    }

    pub async fn mark_failed(&self, host_id: Uuid) {
        self.hosts
            .write()
            .await
            .insert(host_id, WebRtcHostState::Failed);
    }
}
