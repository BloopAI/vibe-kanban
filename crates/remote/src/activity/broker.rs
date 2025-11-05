use std::{
    hash::{Hash, Hasher},
    pin::Pin,
    sync::Arc,
};

use chrono::{DateTime, Utc};
use futures::{Stream, StreamExt, future};
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;
use tokio_stream::wrappers::{BroadcastStream, errors::BroadcastStreamRecvError};

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
    shards: Arc<Vec<broadcast::Sender<ActivityEvent>>>,
}

pub type ActivityStream =
    Pin<Box<dyn Stream<Item = Result<ActivityEvent, BroadcastStreamRecvError>> + Send + 'static>>;

impl ActivityBroker {
    /// Shard broadcast senders to keep busy organisations from evicting everyone else's events.
    pub fn new(shard_count: usize, shard_capacity: usize) -> Self {
        let shard_count = shard_count.max(1);
        let shard_capacity = shard_capacity.max(1);
        let shards = (0..shard_count)
            .map(|_| {
                let (sender, _receiver) = broadcast::channel(shard_capacity);
                sender
            })
            .collect();

        Self {
            shards: Arc::new(shards),
        }
    }

    pub fn subscribe(&self, organization_id: &str) -> ActivityStream {
        let index = self.shard_index(organization_id);
        let receiver = self.shards[index].subscribe();

        let org = organization_id.to_string();
        let stream = BroadcastStream::new(receiver).filter_map(move |item| {
            future::ready(match item {
                Ok(event) if event.organization_id.as_str() == org.as_str() => Some(Ok(event)),
                Ok(_) => None,
                Err(err) => Some(Err(err)),
            })
        });

        Box::pin(stream)
    }

    pub fn publish(&self, event: ActivityEvent) {
        let index = self.shard_index(event.organization_id.as_str());
        if let Err(error) = self.shards[index].send(event) {
            tracing::debug!(?error, "no subscribers for activity event");
        }
    }

    fn shard_index(&self, organization_id: &str) -> usize {
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        organization_id.hash(&mut hasher);
        (hasher.finish() as usize) % self.shards.len()
    }
}

impl Default for ActivityBroker {
    fn default() -> Self {
        Self::new(16, 512)
    }
}
