use std::{collections::HashMap, sync::Arc};

use tokio::sync::{RwLock, broadcast};
use uuid::Uuid;

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

    pub async fn subscribe(&self, workspace_id: Uuid) -> broadcast::Receiver<String> {
        let mut channels = self.channels.write().await;
        let sender = channels
            .entry(workspace_id)
            .or_insert_with(|| broadcast::channel(64).0);
        sender.subscribe()
    }

    pub async fn broadcast(&self, workspace_id: Uuid, event_json: &str) {
        let channels = self.channels.read().await;
        if let Some(sender) = channels.get(&workspace_id) {
            let _ = sender.send(event_json.to_string());
        }
    }
}

impl Default for ConversationBroadcaster {
    fn default() -> Self {
        Self::new()
    }
}
