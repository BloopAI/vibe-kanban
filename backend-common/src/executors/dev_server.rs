use async_trait::async_trait;
use uuid::Uuid;

use crate::{
    app_state::AppState,
    command_executor::{CommandExecutor, CommandProcess},
    command_runner::CommandRunner,
    deployment::Deployment,
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
        app_state: &AppState,
        task_id: Uuid,
        worktree_path: &str,
    ) -> Result<CommandProcess, ExecutorError> {
        // Validate the task and project exist
        let task = Task::find_by_id(&app_state.db_pool, task_id)
            .await?
            .ok_or(ExecutorError::TaskNotFound)?;

        let _project = Project::find_by_id(&app_state.db_pool, task.project_id)
            .await?
            .ok_or(ExecutorError::TaskNotFound)?; // Reuse TaskNotFound for simplicity

        let (shell_cmd, shell_arg) = get_shell_command();
        let mut command = CommandRunner::new();
        command
            .command(shell_cmd)
            .arg(shell_arg)
            .arg(&self.script)
            .working_dir(worktree_path);

        let process = app_state
            .deployment
            .command_executor()
            .runner_start(&command)
            .await
            .map_err(|e| {
                crate::executor::SpawnContext::from_command(&command, "DevServer")
                    .with_task(task_id, Some(task.title.clone()))
                    .with_context("Development server execution")
                    .spawn_error(e)
            })?;

        Ok(process)
    }
}
