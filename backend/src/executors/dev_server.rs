use async_trait::async_trait;
use command_group::{AsyncCommandGroup, AsyncGroupChild};
use tokio::process::Command;
use uuid::Uuid;

use crate::{
    executor::{Executor, ExecutorError},
    models::{project::Project, task::Task},
    utils::shell::get_shell_command,
};

/// Executor for running project dev server scripts
pub struct DevServerExecutor {
    pub script: String,
}

#[async_trait]
impl Executor for DevServerExecutor {
    async fn spawn(
        &self,
        pool: &sqlx::SqlitePool,
        task_id: Uuid,
        worktree_path: &str,
    ) -> Result<AsyncGroupChild, ExecutorError> {
        // Validate the task and project exist
        let task = Task::find_by_id(pool, task_id)
            .await?
            .ok_or(ExecutorError::TaskNotFound)?;

        let _project = Project::find_by_id(pool, task.project_id)
            .await?
            .ok_or(ExecutorError::TaskNotFound)?; // Reuse TaskNotFound for simplicity

        let (shell_cmd, shell_arg) = get_shell_command();
        let mut command = Command::new(shell_cmd);
        command
            .kill_on_drop(true)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .arg(shell_arg)
            .arg(&self.script)
            .current_dir(worktree_path);

        let child = command.group_spawn().map_err(|e| {
            crate::executor::SpawnContext::from_command(&command, "DevServer")
                .with_task(task_id, Some(task.title.clone()))
                .with_context("Development server execution")
                .spawn_error(e)
        })?;

        Ok(child)
    }
}
