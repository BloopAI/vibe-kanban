use std::{collections::HashMap, sync::Arc};

use tokio::sync::{RwLock, broadcast};
use uuid::Uuid;

/// Manages broadcast channels for real-time conversation updates per workspace.
///
/// Each workspace gets its own broadcast channel. When a conversation mutation occurs
/// (message added, conversation resolved, etc.), the event is broadcast to all
/// connected WebSocket clients for that workspace.
#[derive(Clone)]
pub struct ConversationBroadcaster {
    channels: Arc<RwLock<HashMap<Uuid, broadcast::Sender<String>>>>,
}

impl ConversationBroadcaster {
    pub fn new() -> Self {
        Self {
            channels: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Subscribe to conversation events for a workspace.
    /// Returns a receiver that will get JSON-serialized ConversationEvent messages.
    pub async fn subscribe(&self, workspace_id: Uuid) -> broadcast::Receiver<String> {
        let mut channels = self.channels.write().await;
        let sender = channels
            .entry(workspace_id)
            .or_insert_with(|| broadcast::channel(64).0);
        sender.subscribe()
    }

    /// Broadcast a JSON-serialized event to all subscribers of a workspace.
    /// If no subscribers exist or all have been dropped, the message is silently discarded.
    pub async fn broadcast(&self, workspace_id: Uuid, event_json: &str) {
        let channels = self.channels.read().await;
        if let Some(sender) = channels.get(&workspace_id) {
            // Ignore send errors (no active receivers)
            let _ = sender.send(event_json.to_string());
        }
    }
}

impl Default for ConversationBroadcaster {
    fn default() -> Self {
        Self::new()
    }
}
