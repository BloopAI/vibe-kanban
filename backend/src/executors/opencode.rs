use async_trait::async_trait;
use command_group::{AsyncCommandGroup, AsyncGroupChild};
use uuid::Uuid;

use crate::{
    executor::{Executor, ExecutorError},
    models::task::Task,
    utils::shell::get_shell_command,
};

/// An executor that uses OpenCode to process tasks
pub struct CharmOpencodeExecutor;

/// An executor that continues an OpenCode thread
pub struct CharmOpencodeFollowupExecutor {
    pub session_id: String,
    pub prompt: String,
}

#[async_trait]
impl Executor for CharmOpencodeExecutor {
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

        use std::process::Stdio;

        use tokio::process::Command;

        let prompt = if let Some(task_description) = task.description {
            format!(
                r#"project_id: {}
            
Task title: {}
Task description: {}"#,
                task.project_id, task.title, task_description
            )
        } else {
            format!(
                r#"project_id: {}
            
Task title: {}"#,
                task.project_id, task.title
            )
        };

        // Use shell command for cross-platform compatibility
        let (shell_cmd, shell_arg) = get_shell_command();
        let opencode_command = format!(
            "opencode -p \"{}\" --output-format=json",
            prompt.replace('"', "\\\"")
        );

        let mut command = Command::new(shell_cmd);
        command
            .kill_on_drop(true)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(worktree_path)
            .arg(shell_arg)
            .arg(opencode_command);

        let child = command
            .group_spawn() // Create new process group so we can kill entire tree
            .map_err(|e| {
                crate::executor::SpawnContext::from_command(&command, "CharmOpenCode")
                    .with_task(task_id, Some(task.title.clone()))
                    .with_context("CharmOpenCode CLI execution for new task")
                    .spawn_error(e)
            })?;

        Ok(child)
    }
}

#[async_trait]
impl Executor for CharmOpencodeFollowupExecutor {
    async fn spawn(
        &self,
        _pool: &sqlx::SqlitePool,
        _task_id: Uuid,
        worktree_path: &str,
    ) -> Result<AsyncGroupChild, ExecutorError> {
        use std::process::Stdio;

        use tokio::process::Command;

        // Use shell command for cross-platform compatibility
        let (shell_cmd, shell_arg) = get_shell_command();
        let opencode_command = format!(
            "opencode -p \"{}\" --output-format=json",
            self.prompt.replace('"', "\\\"")
        );

        let mut command = Command::new(shell_cmd);
        command
            .kill_on_drop(true)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(worktree_path)
            .arg(shell_arg)
            .arg(&opencode_command);

        let child = command
            .group_spawn() // Create new process group so we can kill entire tree
            .map_err(|e| {
                crate::executor::SpawnContext::from_command(&command, "CharmOpenCode")
                    .with_context(format!(
                        "CharmOpenCode CLI followup execution for session {}",
                        self.session_id
                    ))
                    .spawn_error(e)
            })?;

        Ok(child)
    }
}
