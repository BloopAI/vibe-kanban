use async_trait::async_trait;
use tokio::process::{Child, Command};
use uuid::Uuid;

use crate::{
    executor::{Executor, ExecutorError},
    models::task::Task,
};

/// An executor that uses Claude CLI to process tasks
pub struct ClaudeExecutor;

/// An executor that resumes a Claude session
pub struct ClaudeFollowupExecutor {
    pub session_id: String,
    pub prompt: String,
}

#[async_trait]
impl Executor for ClaudeExecutor {
    async fn spawn(
        &self,
        pool: &sqlx::SqlitePool,
        task_id: Uuid,
        worktree_path: &str,
    ) -> Result<Child, ExecutorError> {
        // Get the task to fetch its description
        let task = Task::find_by_id(pool, task_id)
            .await?
            .ok_or(ExecutorError::TaskNotFound)?;

        let prompt = format!(
            "Task title: {}
            Task description: {}",
            task.title,
            task.description
                .as_deref()
                .unwrap_or("No description provided")
        );

        // Use Claude CLI to process the task
        let child = Command::new("claude")
            .kill_on_drop(true)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .current_dir(worktree_path)
            .arg(&prompt)
            .arg("-p")
            .arg("--dangerously-skip-permissions")
            .arg("--verbose")
            .arg("--output-format=stream-json")
            .process_group(0) // Create new process group so we can kill entire tree
            .spawn()
            .map_err(ExecutorError::SpawnFailed)?;

        Ok(child)
    }
}

#[async_trait]
impl Executor for ClaudeFollowupExecutor {
    async fn spawn(
        &self,
        _pool: &sqlx::SqlitePool,
        _task_id: Uuid,
        worktree_path: &str,
    ) -> Result<Child, ExecutorError> {
        // Use Claude CLI with --resume flag to continue the session
        let child = Command::new("claude")
            .kill_on_drop(true)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .current_dir(worktree_path)
            .arg(&self.prompt)
            .arg("-p")
            .arg("--dangerously-skip-permissions")
            .arg("--verbose")
            .arg("--output-format=stream-json")
            .arg(format!("--resume={}", self.session_id))
            .process_group(0) // Create new process group so we can kill entire tree
            .spawn()
            .map_err(ExecutorError::SpawnFailed)?;

        Ok(child)
    }
}
