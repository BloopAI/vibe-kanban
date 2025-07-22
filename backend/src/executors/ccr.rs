use async_trait::async_trait;
use uuid::Uuid;

use crate::{
    command_runner::CommandProcess,
    executor::{Executor, ExecutorError, NormalizedConversation},
    executors::ClaudeExecutor,
};

/// An executor that uses Claude Code Router (CCR) to process tasks
/// This is a thin wrapper around ClaudeExecutor that uses Claude Code Router instead of Claude CLI
pub struct CCRExecutor(ClaudeExecutor);

impl Default for CCRExecutor {
    fn default() -> Self {
        Self::new()
    }
}

impl CCRExecutor {
    pub fn new() -> Self {
        Self(ClaudeExecutor::with_command(
            "claude-code-router".to_string(),
            "npx -y @musistudio/claude-code-router code -p --dangerously-skip-permissions --verbose --output-format=stream-json".to_string(),
        ))
    }
}

#[async_trait]
impl Executor for CCRExecutor {
    async fn spawn(
        &self,
        pool: &sqlx::SqlitePool,
        task_id: Uuid,
        worktree_path: &str,
    ) -> Result<CommandProcess, ExecutorError> {
        self.0.spawn(pool, task_id, worktree_path).await
    }

    async fn spawn_followup(
        &self,
        pool: &sqlx::SqlitePool,
        task_id: Uuid,
        session_id: &str,
        prompt: &str,
        worktree_path: &str,
    ) -> Result<CommandProcess, ExecutorError> {
        self.0
            .spawn_followup(pool, task_id, session_id, prompt, worktree_path)
            .await
    }

    fn normalize_logs(
        &self,
        logs: &str,
        worktree_path: &str,
    ) -> Result<NormalizedConversation, String> {
        let filtered_logs = filter_ccr_service_messages(logs);
        let mut result = self.0.normalize_logs(&filtered_logs, worktree_path)?;
        result.executor_type = "claude-code-router".to_string();
        Ok(result)
    }
}

/// Filter out CCR service messages that appear in stdout but shouldn't be shown to users
/// These are informational messages from the CCR wrapper itself
fn filter_ccr_service_messages(logs: &str) -> String {
    logs.lines()
        .filter(|line| {
            let trimmed = line.trim();

            // Filter out known CCR service messages
            if trimmed.eq("Service not running, starting service...")
                || trimmed.eq("claude code router service has been successfully stopped.")
            {
                return false;
            }

            // Filter out system init JSON that contains misleading model information
            // CCR delegates to different models, so the init model info is incorrect
            if trimmed.starts_with(r#"{"type":"system","subtype":"init""#)
                && trimmed.contains(r#""model":"#)
            {
                return false;
            }

            true
        })
        .collect::<Vec<&str>>()
        .join("\n")
}
