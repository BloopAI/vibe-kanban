use std::{collections::VecDeque, sync::Arc};

use chrono::{DateTime, Utc};
use dashmap::DashMap;
use db::models::scratch::DraftFollowUpData;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

/// Represents a queued follow-up message for a session
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct QueuedMessage {
    /// The session this message is queued for
    pub session_id: Uuid,
    /// The follow-up data (message + variant)
    pub data: DraftFollowUpData,
    /// Timestamp when the message was queued
    pub queued_at: DateTime<Utc>,
    /// Which queue this message belongs to
    pub kind: QueuedMessageKind,
}

/// High-priority steer messages run before buffered queue messages.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum QueuedMessageKind {
    Steer,
    Queue,
}

/// Which queue slice to clear when cancelling queued follow-up messages.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS, Default)]
#[serde(rename_all = "snake_case")]
pub enum QueueClearMode {
    /// Pop only the most recently added message across steer and buffered queue.
    #[default]
    Latest,
    /// Clear both steer and buffered queue messages.
    All,
    /// Clear only buffered queue messages.
    Queue,
    /// Clear only steer messages.
    Steer,
}

#[derive(Debug, Clone, Default)]
struct SessionQueueState {
    pending_steers: VecDeque<QueuedMessage>,
    queued_messages: VecDeque<QueuedMessage>,
}

impl SessionQueueState {
    fn is_empty(&self) -> bool {
        self.pending_steers.is_empty() && self.queued_messages.is_empty()
    }
}

/// Status of the queue for a session (for frontend display)
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum QueueStatus {
    /// No message queued
    Empty,
    /// Messages are queued and waiting for execution to complete
    Queued {
        next: QueuedMessage,
        pending_steers: Vec<QueuedMessage>,
        queued_messages: Vec<QueuedMessage>,
    },
}

/// In-memory service for managing queued follow-up messages.
/// Supports two channels:
/// - pending steers (high priority)
/// - buffered queue messages (FIFO)
#[derive(Clone)]
pub struct QueuedMessageService {
    queue: Arc<DashMap<Uuid, SessionQueueState>>,
}

impl QueuedMessageService {
    pub fn new() -> Self {
        Self {
            queue: Arc::new(DashMap::new()),
        }
    }

    fn build_queued_message(
        session_id: Uuid,
        data: DraftFollowUpData,
        kind: QueuedMessageKind,
    ) -> QueuedMessage {
        QueuedMessage {
            session_id,
            data,
            queued_at: Utc::now(),
            kind,
        }
    }

    /// Queue a buffered message for a session.
    pub fn queue_message(&self, session_id: Uuid, data: DraftFollowUpData) -> QueuedMessage {
        let queued = Self::build_queued_message(session_id, data, QueuedMessageKind::Queue);
        self.queue
            .entry(session_id)
            .or_default()
            .queued_messages
            .push_back(queued.clone());
        queued
    }

    /// Queue a high-priority steer message for a session.
    pub fn queue_steer(&self, session_id: Uuid, data: DraftFollowUpData) -> QueuedMessage {
        let queued = Self::build_queued_message(session_id, data, QueuedMessageKind::Steer);
        self.queue
            .entry(session_id)
            .or_default()
            .pending_steers
            .push_back(queued.clone());
        queued
    }

    /// Pop the most recently added queued message (LIFO) so the UI can restore it for editing.
    /// This compares the latest steer and buffered queue entries by queued_at.
    pub fn cancel_latest(&self, session_id: Uuid) -> Option<QueuedMessage> {
        let mut state = self.queue.get_mut(&session_id)?;
        let cancelled = match (state.pending_steers.back(), state.queued_messages.back()) {
            (Some(latest_steer), Some(latest_queue)) => {
                if latest_steer.queued_at >= latest_queue.queued_at {
                    state.pending_steers.pop_back()
                } else {
                    state.queued_messages.pop_back()
                }
            }
            (Some(_), None) => state.pending_steers.pop_back(),
            (None, Some(_)) => state.queued_messages.pop_back(),
            (None, None) => None,
        };
        let should_remove = state.is_empty();
        drop(state);

        if should_remove {
            self.queue.remove(&session_id);
        }

        cancelled
    }

    /// Clear queue entries by mode.
    /// - latest: pop a single latest message and return it for editor restore.
    /// - all/queue/steer: clear matching entries, returning no cancelled message.
    pub fn clear(&self, session_id: Uuid, mode: QueueClearMode) -> Option<QueuedMessage> {
        match mode {
            QueueClearMode::Latest => self.cancel_latest(session_id),
            QueueClearMode::All => {
                self.queue.remove(&session_id);
                None
            }
            QueueClearMode::Queue => {
                self.clear_buffered_queue(session_id);
                None
            }
            QueueClearMode::Steer => {
                self.clear_pending_steers(session_id);
                None
            }
        }
    }

    /// Take (remove and return) the next queued message for execution.
    /// Pending steers are consumed before buffered queue messages.
    pub fn take_next(&self, session_id: Uuid) -> Option<QueuedMessage> {
        let mut state = self.queue.get_mut(&session_id)?;
        let next = state
            .pending_steers
            .pop_front()
            .or_else(|| state.queued_messages.pop_front());
        let should_remove = state.is_empty();
        drop(state);

        if should_remove {
            self.queue.remove(&session_id);
        }

        next
    }

    /// Push back a message to the front of its original queue.
    /// Used when follow-up start fails after taking the next message.
    pub fn requeue_front(&self, message: QueuedMessage) {
        let mut state = self.queue.entry(message.session_id).or_default();
        match message.kind {
            QueuedMessageKind::Steer => state.pending_steers.push_front(message),
            QueuedMessageKind::Queue => state.queued_messages.push_front(message),
        }
    }

    /// Check if a session has a queued message
    pub fn has_queued(&self, session_id: Uuid) -> bool {
        self.queue
            .get(&session_id)
            .is_some_and(|state| !state.is_empty())
    }

    /// Get queue status for frontend display
    pub fn get_status(&self, session_id: Uuid) -> QueueStatus {
        let Some(state) = self.queue.get(&session_id) else {
            return QueueStatus::Empty;
        };

        let next = state
            .pending_steers
            .front()
            .cloned()
            .or_else(|| state.queued_messages.front().cloned());

        let Some(next) = next else {
            return QueueStatus::Empty;
        };

        QueueStatus::Queued {
            next,
            pending_steers: state.pending_steers.iter().cloned().collect(),
            queued_messages: state.queued_messages.iter().cloned().collect(),
        }
    }

    fn clear_buffered_queue(&self, session_id: Uuid) {
        let Some(mut state) = self.queue.get_mut(&session_id) else {
            return;
        };
        state.queued_messages.clear();
        let should_remove = state.is_empty();
        drop(state);

        if should_remove {
            self.queue.remove(&session_id);
        }
    }

    fn clear_pending_steers(&self, session_id: Uuid) {
        let Some(mut state) = self.queue.get_mut(&session_id) else {
            return;
        };
        state.pending_steers.clear();
        let should_remove = state.is_empty();
        drop(state);

        if should_remove {
            self.queue.remove(&session_id);
        }
    }
}

impl Default for QueuedMessageService {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use std::{thread::sleep, time::Duration};

    use db::models::scratch::DraftFollowUpData;
    use executors::{executors::BaseCodingAgent, profile::ExecutorConfig};

    use super::*;

    fn draft(message: &str) -> DraftFollowUpData {
        DraftFollowUpData {
            message: message.to_string(),
            executor_config: ExecutorConfig::new(BaseCodingAgent::Codex),
        }
    }

    #[test]
    fn takes_steers_before_buffered_queue_in_fifo_order() {
        let service = QueuedMessageService::new();
        let session_id = Uuid::new_v4();

        service.queue_message(session_id, draft("q1"));
        service.queue_message(session_id, draft("q2"));
        service.queue_steer(session_id, draft("s1"));
        service.queue_steer(session_id, draft("s2"));

        let first = service.take_next(session_id).expect("first message");
        let second = service.take_next(session_id).expect("second message");
        let third = service.take_next(session_id).expect("third message");
        let fourth = service.take_next(session_id).expect("fourth message");

        assert_eq!(first.data.message, "s1");
        assert_eq!(second.data.message, "s2");
        assert_eq!(third.data.message, "q1");
        assert_eq!(fourth.data.message, "q2");
        assert!(service.take_next(session_id).is_none());
    }

    #[test]
    fn cancel_latest_uses_most_recent_message_across_both_channels() {
        let service = QueuedMessageService::new();
        let session_id = Uuid::new_v4();

        service.queue_steer(session_id, draft("s1"));
        sleep(Duration::from_millis(2));
        service.queue_message(session_id, draft("q1"));
        sleep(Duration::from_millis(2));
        service.queue_steer(session_id, draft("s2"));

        let first = service.cancel_latest(session_id).expect("first cancel");
        let second = service.cancel_latest(session_id).expect("second cancel");
        let third = service.cancel_latest(session_id).expect("third cancel");

        assert_eq!(first.data.message, "s2");
        assert_eq!(first.kind, QueuedMessageKind::Steer);
        assert_eq!(second.data.message, "q1");
        assert_eq!(second.kind, QueuedMessageKind::Queue);
        assert_eq!(third.data.message, "s1");
        assert_eq!(third.kind, QueuedMessageKind::Steer);
        assert!(service.cancel_latest(session_id).is_none());
    }

    #[test]
    fn queue_status_reports_next_and_pending_lists() {
        let service = QueuedMessageService::new();
        let session_id = Uuid::new_v4();

        service.queue_message(session_id, draft("q1"));
        service.queue_steer(session_id, draft("s1"));

        match service.get_status(session_id) {
            QueueStatus::Queued {
                next,
                pending_steers,
                queued_messages,
            } => {
                assert_eq!(next.data.message, "s1");
                assert_eq!(next.kind, QueuedMessageKind::Steer);
                assert_eq!(pending_steers.len(), 1);
                assert_eq!(queued_messages.len(), 1);
            }
            QueueStatus::Empty => panic!("expected queued status"),
        }
    }

    #[test]
    fn buffered_queue_executes_three_or_more_messages_in_fifo_order() {
        let service = QueuedMessageService::new();
        let session_id = Uuid::new_v4();

        service.queue_message(session_id, draft("q1"));
        service.queue_message(session_id, draft("q2"));
        service.queue_message(session_id, draft("q3"));

        let first = service.take_next(session_id).expect("first queued");
        let second = service.take_next(session_id).expect("second queued");
        let third = service.take_next(session_id).expect("third queued");

        assert_eq!(first.data.message, "q1");
        assert_eq!(second.data.message, "q2");
        assert_eq!(third.data.message, "q3");
        assert!(service.take_next(session_id).is_none());
    }

    #[test]
    fn requeue_front_restores_message_after_follow_up_start_failure() {
        let service = QueuedMessageService::new();
        let session_id = Uuid::new_v4();

        service.queue_message(session_id, draft("q1"));
        service.queue_message(session_id, draft("q2"));

        let first = service
            .take_next(session_id)
            .expect("first queued message should exist");
        assert_eq!(first.data.message, "q1");
        assert_eq!(first.kind, QueuedMessageKind::Queue);

        service.requeue_front(first);

        let replayed = service
            .take_next(session_id)
            .expect("requeued message should be replayed first");
        let second = service
            .take_next(session_id)
            .expect("second queued message should still exist");

        assert_eq!(replayed.data.message, "q1");
        assert_eq!(second.data.message, "q2");
        assert!(service.take_next(session_id).is_none());
    }

    #[test]
    fn clear_queue_removes_only_buffered_messages() {
        let service = QueuedMessageService::new();
        let session_id = Uuid::new_v4();

        service.queue_steer(session_id, draft("s1"));
        service.queue_message(session_id, draft("q1"));
        service.queue_message(session_id, draft("q2"));

        assert!(service.clear(session_id, QueueClearMode::Queue).is_none());

        let first = service.take_next(session_id).expect("steer should remain");
        assert_eq!(first.data.message, "s1");
        assert_eq!(first.kind, QueuedMessageKind::Steer);
        assert!(service.take_next(session_id).is_none());
    }

    #[test]
    fn clear_steer_removes_only_steer_messages() {
        let service = QueuedMessageService::new();
        let session_id = Uuid::new_v4();

        service.queue_steer(session_id, draft("s1"));
        service.queue_steer(session_id, draft("s2"));
        service.queue_message(session_id, draft("q1"));

        assert!(service.clear(session_id, QueueClearMode::Steer).is_none());

        let first = service
            .take_next(session_id)
            .expect("buffered queue should remain");
        assert_eq!(first.data.message, "q1");
        assert_eq!(first.kind, QueuedMessageKind::Queue);
        assert!(service.take_next(session_id).is_none());
    }

    #[test]
    fn clear_all_removes_everything() {
        let service = QueuedMessageService::new();
        let session_id = Uuid::new_v4();

        service.queue_steer(session_id, draft("s1"));
        service.queue_message(session_id, draft("q1"));

        assert!(service.clear(session_id, QueueClearMode::All).is_none());
        assert!(matches!(service.get_status(session_id), QueueStatus::Empty));
        assert!(service.take_next(session_id).is_none());
    }
}
