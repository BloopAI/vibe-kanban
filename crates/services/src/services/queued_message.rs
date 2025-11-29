use std::sync::Arc;

use chrono::{DateTime, Utc};
use dashmap::DashMap;
use db::models::scratch::DraftFollowUpData;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

/// Represents a queued follow-up message for a task attempt
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct QueuedMessage {
    /// The task attempt this message is queued for
    pub task_attempt_id: Uuid,
    /// The follow-up data (message + variant)
    pub data: DraftFollowUpData,
    /// Timestamp when the message was queued
    pub queued_at: DateTime<Utc>,
}

/// Status of the queue for a task attempt (for frontend display)
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "status", rename_all = "snake_case")]
#[ts(export)]
pub enum QueueStatus {
    /// No message queued
    Empty,
    /// Message is queued and waiting for execution to complete
    Queued { message: QueuedMessage },
}

/// In-memory service for managing queued follow-up messages.
/// One queued message per task attempt.
#[derive(Clone)]
pub struct QueuedMessageService {
    queue: Arc<DashMap<Uuid, QueuedMessage>>,
}

impl QueuedMessageService {
    pub fn new() -> Self {
        Self {
            queue: Arc::new(DashMap::new()),
        }
    }

    /// Queue a message for a task attempt. Replaces any existing queued message.
    pub fn queue_message(&self, task_attempt_id: Uuid, data: DraftFollowUpData) -> QueuedMessage {
        let queued = QueuedMessage {
            task_attempt_id,
            data,
            queued_at: Utc::now(),
        };
        self.queue.insert(task_attempt_id, queued.clone());
        queued
    }

    /// Cancel/remove a queued message for a task attempt
    pub fn cancel_queued(&self, task_attempt_id: Uuid) -> Option<QueuedMessage> {
        self.queue.remove(&task_attempt_id).map(|(_, v)| v)
    }

    /// Get the queued message for a task attempt (if any)
    pub fn get_queued(&self, task_attempt_id: Uuid) -> Option<QueuedMessage> {
        self.queue.get(&task_attempt_id).map(|r| r.clone())
    }

    /// Take (remove and return) the queued message for a task attempt.
    /// Used by finalization flow to consume the queued message.
    pub fn take_queued(&self, task_attempt_id: Uuid) -> Option<QueuedMessage> {
        self.queue.remove(&task_attempt_id).map(|(_, v)| v)
    }

    /// Check if a task attempt has a queued message
    pub fn has_queued(&self, task_attempt_id: Uuid) -> bool {
        self.queue.contains_key(&task_attempt_id)
    }

    /// Get queue status for frontend display
    pub fn get_status(&self, task_attempt_id: Uuid) -> QueueStatus {
        match self.get_queued(task_attempt_id) {
            Some(msg) => QueueStatus::Queued { message: msg },
            None => QueueStatus::Empty,
        }
    }
}

impl Default for QueuedMessageService {
    fn default() -> Self {
        Self::new()
    }
}
