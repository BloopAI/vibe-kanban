use async_trait::async_trait;
use uuid::Uuid;

use crate::{
    command_runner::{CommandProcess, CommandRunner},
    executor::{Executor, ExecutorError, SpawnContext},
    models::task::Task,
    utils::shell::get_shell_command,
};

/// A dummy executor that echoes the task title and description
pub struct EchoExecutor;

#[async_trait]
impl Executor for EchoExecutor {
    async fn spawn(
        &self,
        pool: &sqlx::SqlitePool,
        task_id: Uuid,
        _worktree_path: &str,
    ) -> Result<CommandProcess, ExecutorError> {
        // Get the task to fetch its description
        let task = Task::find_by_id(pool, task_id)
            .await?
            .ok_or(ExecutorError::TaskNotFound)?;

        let _message = format!(
            "Executing task: {} - {}",
            task.title,
            task.description.as_deref().unwrap_or("No description")
        );

        // For demonstration of streaming, we can use a shell command that outputs multiple lines
        let (shell_cmd, shell_arg) = get_shell_command();
        let script = if shell_cmd == "cmd" {
            // Windows batch script
            format!(
                r#"echo Starting task: {}
for /l %%i in (1,1,50) do (
    echo Progress line %%i
    timeout /t 1 /nobreak > nul
)
echo Task completed: {}"#,
                task.title, task.title
            )
        } else {
            // Unix shell script (bash/sh)
            format!(
                r#"echo "Starting task: {}"
for i in {{1..50}}; do
    echo "Progress line $i"
    sleep 1
done
echo "Task completed: {}""#,
                task.title, task.title
            )
        };

        let mut command_runner = CommandRunner::new();
        command_runner
            .command(shell_cmd)
            .arg(shell_arg)
            .arg(&script);

        let child = command_runner.start().await.map_err(|e| {
            SpawnContext::from_command(&command_runner, "Echo")
                .with_task(task_id, Some(task.title.clone()))
                .with_context("Shell script execution for echo demo")
                .spawn_error(e)
        })?;

        Ok(child)
    }
}
