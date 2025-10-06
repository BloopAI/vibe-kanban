use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;

#[derive(Debug, Serialize, Deserialize)]
pub struct ActivityResponse {
    pub data: Vec<ActivityEvent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityEvent {
    pub seq: i64,
    pub event_id: uuid::Uuid,
    pub organization_id: String,
    pub event_type: String,
    pub created_at: DateTime<Utc>,
    pub payload: Option<serde_json::Value>,
}

impl ActivityEvent {
    pub fn new(
        seq: i64,
        event_id: uuid::Uuid,
        organization_id: String,
        event_type: String,
        created_at: DateTime<Utc>,
        payload: Option<serde_json::Value>,
    ) -> Self {
        Self {
            seq,
            event_id,
            organization_id,
            event_type,
            created_at,
            payload,
        }
    }
}

#[derive(Clone)]
pub struct ActivityBroker {
    sender: broadcast::Sender<ActivityEvent>,
}

impl ActivityBroker {
    pub fn new(capacity: usize) -> Self {
        let (sender, _receiver) = broadcast::channel(capacity);
        Self { sender }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<ActivityEvent> {
        self.sender.subscribe()
    }

    pub fn publish(&self, event: ActivityEvent) {
        if let Err(error) = self.sender.send(event) {
            tracing::debug!(?error, "no subscribers for activity event");
        }
    }
}

impl Default for ActivityBroker {
    fn default() -> Self {
        Self::new(1024)
    }
}
