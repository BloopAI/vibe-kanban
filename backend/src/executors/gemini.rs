use async_trait::async_trait;
use command_group::{AsyncCommandGroup, AsyncGroupChild};
use tokio::process::Command;
use uuid::Uuid;

use crate::{
    executor::{Executor, ExecutorError},
    models::task::Task,
};

/// An executor that uses Gemini CLI to process tasks
pub struct GeminiExecutor;

/// An executor that resumes a Gemini session
pub struct GeminiFollowupExecutor {
    pub session_id: String,
    pub prompt: String,
}

#[async_trait]
impl Executor for GeminiExecutor {
    async fn spawn(
        &self,
        pool: &sqlx::SqlitePool,
        task_id: Uuid,
        worktree_path: &str,
    ) -> Result<AsyncGroupChild, ExecutorError> {
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

        // Use Gemini CLI to process the task
        let mut command = Command::new("npx");
        command
            .kill_on_drop(true)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .current_dir(worktree_path)
            .arg("@bloopai/gemini-cli-interactive")
            .arg("-p")
            .arg(&prompt);

        let child = command
            .group_spawn() // Create new process group so we can kill entire tree
            .map_err(|e| {
                crate::executor::SpawnContext::from_command(&command, "Gemini")
                    .with_task(task_id, Some(task.title.clone()))
                    .with_context("Gemini CLI execution for new task")
                    .spawn_error(e)
            })?;

        Ok(child)
    }
}

#[async_trait]
impl Executor for GeminiFollowupExecutor {
    async fn spawn(
        &self,
        _pool: &sqlx::SqlitePool,
        _task_id: Uuid,
        worktree_path: &str,
    ) -> Result<AsyncGroupChild, ExecutorError> {
        // Use Gemini CLI with session resumption (if supported)
        let mut command = Command::new("npx");
        command
            .kill_on_drop(true)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .current_dir(worktree_path)
            .arg("https://github.com/google-gemini/gemini-cli")
            .arg("-p")
            .arg(&self.prompt)
            .arg(format!("--resume={}", self.session_id));

        let child = command
            .group_spawn() // Create new process group so we can kill entire tree
            .map_err(|e| {
                crate::executor::SpawnContext::from_command(&command, "Gemini")
                    .with_context(format!(
                        "Gemini CLI followup execution for session {}",
                        self.session_id
                    ))
                    .spawn_error(e)
            })?;

        Ok(child)
    }
}
