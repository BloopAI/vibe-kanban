use std::sync::Arc;

use dashmap::DashSet;
use uuid::Uuid;

/// In-memory service for tracking commit reminder executions.
/// Tracks which executions ARE commit reminders to avoid infinite loops
/// while still allowing new user-initiated executions to receive reminders.
#[derive(Clone)]
pub struct CommitReminderService {
    /// Execution IDs that are commit reminder follow-ups
    reminder_executions: Arc<DashSet<Uuid>>,
}

impl CommitReminderService {
    /// Build the commit reminder prompt, optionally including cleanup scripts to run first.
    /// The prompt always implies commits are expected.
    pub fn build_prompt(cleanup_scripts: &[String]) -> String {
        let mut prompt = String::from(
            "You have uncommitted changes. You are expected to commit all your changes with a descriptive message.",
        );

        if !cleanup_scripts.is_empty() {
            prompt.push_str(" Before committing ensure the following scripts run without error:\n");
            for script in cleanup_scripts {
                prompt.push_str(&format!("```bash\n{}\n```\n", script));
            }
        }

        prompt
    }

    pub fn new() -> Self {
        Self {
            reminder_executions: Arc::new(DashSet::new()),
        }
    }

    /// Mark an execution as being a commit reminder follow-up
    pub fn mark_as_reminder(&self, exec_id: Uuid) {
        self.reminder_executions.insert(exec_id);
    }

    /// Check if an execution is a commit reminder follow-up
    pub fn is_reminder_execution(&self, exec_id: Uuid) -> bool {
        self.reminder_executions.contains(&exec_id)
    }
}

impl Default for CommitReminderService {
    fn default() -> Self {
        Self::new()
    }
}
