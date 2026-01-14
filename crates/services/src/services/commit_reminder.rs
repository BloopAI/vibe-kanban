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
    /// Build the commit reminder prompt, optionally including cleanup scripts to run first.
    /// The prompt always implies commits are expected.
    pub fn build_prompt(cleanup_scripts: &[String]) -> String {
        let mut prompt = String::new();

        // Always start with the core expectation that commits are needed
        prompt.push_str("You have uncommitted changes that need to be committed. ");

        // Add cleanup scripts as a prerequisite step if they exist
        if !cleanup_scripts.is_empty() {
            prompt.push_str("First, run the following cleanup script(s):\n");
            for script in cleanup_scripts {
                prompt.push_str(&format!("```bash\n{}\n```\n", script));
            }
            prompt.push_str("\nAfter running the cleanup scripts, review ");
        } else {
            prompt.push_str("Review ");
        }

        prompt.push_str(
            "what you've done and create an appropriate git commit with a descriptive message summarizing the changes.",
        );
        prompt
    }

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
