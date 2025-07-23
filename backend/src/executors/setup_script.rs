use async_trait::async_trait;
use uuid::Uuid;

use crate::{
    command_runner::{CommandProcess, CommandRunner},
    executor::{Executor, ExecutorError},
    models::{project::Project, task::Task},
    utils::shell::get_shell_command,
};

/// Executor for running project setup scripts
pub struct SetupScriptExecutor {
    pub script: String,
}

impl SetupScriptExecutor {
    pub fn new(script: String) -> Self {
        Self { script }
    }
}

#[async_trait]
impl Executor for SetupScriptExecutor {
    async fn spawn(
        &self,
        pool: &sqlx::SqlitePool,
        task_id: Uuid,
        worktree_path: &str,
    ) -> Result<CommandProcess, ExecutorError> {
        // Validate the task and project exist
        let task = Task::find_by_id(pool, task_id)
            .await?
            .ok_or(ExecutorError::TaskNotFound)?;

        let _project = Project::find_by_id(pool, task.project_id)
            .await?
            .ok_or(ExecutorError::TaskNotFound)?; // Reuse TaskNotFound for simplicity

        let (shell_cmd, shell_arg) = get_shell_command();
        let mut command = CommandRunner::new();
        command
            .command(shell_cmd)
            .arg(shell_arg)
            .arg(&self.script)
            .working_dir(worktree_path);

        let proc = command.start().await.map_err(|e| {
            crate::executor::SpawnContext::from_command(&command, "SetupScript")
                .with_task(task_id, Some(task.title.clone()))
                .with_context("Setup script execution")
                .spawn_error(e)
        })?;

        Ok(proc)
    }

    /// Normalize setup script logs into a readable format
    fn normalize_logs(
        &self,
        logs: &str,
        _worktree_path: &str,
    ) -> Result<crate::executor::NormalizedConversation, String> {
        let mut entries = Vec::new();

        // Add script command as first entry
        entries.push(crate::executor::NormalizedEntry {
            timestamp: None,
            entry_type: crate::executor::NormalizedEntryType::SystemMessage,
            content: format!("Executing setup script:\n{}", self.script),
            metadata: None,
        });

        // Process the logs - split by lines and create entries
        if !logs.trim().is_empty() {
            let lines: Vec<&str> = logs.lines().collect();
            let mut current_chunk = String::new();

            for line in lines {
                current_chunk.push_str(line);
                current_chunk.push('\n');

                // Create entry for every 10 lines or when we encounter an error-like line
                if current_chunk.lines().count() >= 10
                    || line.to_lowercase().contains("error")
                    || line.to_lowercase().contains("failed")
                    || line.to_lowercase().contains("exception")
                {
                    let entry_type = if line.to_lowercase().contains("error")
                        || line.to_lowercase().contains("failed")
                        || line.to_lowercase().contains("exception")
                    {
                        crate::executor::NormalizedEntryType::ErrorMessage
                    } else {
                        crate::executor::NormalizedEntryType::SystemMessage
                    };

                    entries.push(crate::executor::NormalizedEntry {
                        timestamp: Some(chrono::Utc::now().to_rfc3339()),
                        entry_type,
                        content: current_chunk.trim().to_string(),
                        metadata: None,
                    });

                    current_chunk.clear();
                }
            }

            // Add any remaining content
            if !current_chunk.trim().is_empty() {
                entries.push(crate::executor::NormalizedEntry {
                    timestamp: Some(chrono::Utc::now().to_rfc3339()),
                    entry_type: crate::executor::NormalizedEntryType::SystemMessage,
                    content: current_chunk.trim().to_string(),
                    metadata: None,
                });
            }
        }

        Ok(crate::executor::NormalizedConversation {
            entries,
            session_id: None,
            executor_type: "setup-script".to_string(),
            prompt: Some(self.script.clone()),
            summary: None,
        })
    }
}
