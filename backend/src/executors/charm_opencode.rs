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

        // Fetch attachments for this task
        let attachments = crate::models::attachment::Attachment::find_by_task_id(pool, task_id)
            .await
            .map_err(|e| ExecutorError::DatabaseError(e))?;

        let mut prompt = if let Some(task_description) = task.description {
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

        // Add attachment information if any exist
        if !attachments.is_empty() {
            prompt.push_str("\n\nThe following files have been attached to this task. Please read and analyze them:");
            for attachment in attachments {
                // Include the absolute file path that CharmOpenCode can access
                let file_path = crate::utils::uploads_dir().join(&attachment.filename);
                
                prompt.push_str(&format!(
                    "\n\n- Attachment: {} ({})",
                    attachment.original_filename,
                    attachment.content_type
                ));
                prompt.push_str(&format!(
                    "\n  File location: {}",
                    file_path.display()
                ));
                prompt.push_str(&format!(
                    "\n  Action required: Please read and analyze this {} file and incorporate its content into your response.",
                    if attachment.content_type.starts_with("image/") { "image" } else { "file" }
                ));
            }
            prompt.push_str("\n\nAfter reading the attached files, proceed with the task requirements.");
        }

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

    async fn spawn_followup(
        &self,
        _pool: &sqlx::SqlitePool,
        _task_id: Uuid,
        _session_id: &str,
        prompt: &str,
        worktree_path: &str,
    ) -> Result<AsyncGroupChild, ExecutorError> {
        use std::process::Stdio;

        use tokio::process::Command;

        // CharmOpencode doesn't support session-based followup, so we ignore session_id
        // and just run with the new prompt
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
            .arg(&opencode_command);

        let child = command.group_spawn().map_err(|e| {
            crate::executor::SpawnContext::from_command(&command, "CharmOpenCode")
                .with_context("CharmOpenCode CLI followup execution")
                .spawn_error(e)
        })?;

        Ok(child)
    }
}
