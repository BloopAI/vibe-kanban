use std::sync::Arc;

use dashmap::DashSet;
use uuid::Uuid;

/// In-memory service for tracking commit reminders sent to sessions.
/// Prevents sending multiple commit reminders to the same session.
#[derive(Clone)]
pub struct CommitReminderService {
    sent: Arc<DashSet<Uuid>>,
}

impl CommitReminderService {
    pub fn new() -> Self {
        Self {
            sent: Arc::new(DashSet::new()),
        }
    }

    /// Mark that a commit reminder has been sent for this session
    pub fn mark_sent(&self, session_id: Uuid) {
        self.sent.insert(session_id);
    }

    /// Check if a commit reminder has already been sent for this session
    pub fn has_sent(&self, session_id: Uuid) -> bool {
        self.sent.contains(&session_id)
    }
}

impl Default for CommitReminderService {
    fn default() -> Self {
        Self::new()
    }
}
