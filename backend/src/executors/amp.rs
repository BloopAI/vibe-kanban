use async_trait::async_trait;
use tokio::process::Child;
use uuid::Uuid;

use crate::{
    executor::{Executor, ExecutorError},
    models::task::Task,
};

/// An executor that uses Amp to process tasks
pub struct AmpExecutor;

/// An executor that continues an Amp thread
pub struct AmpFollowupExecutor {
    pub thread_id: String,
    pub prompt: String,
}

#[async_trait]
impl Executor for AmpExecutor {
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

        use std::process::Stdio;

        use tokio::{io::AsyncWriteExt, process::Command};

        let prompt = format!(
            "Task title: {}\nTask description: {}",
            task.title,
            task.description
                .as_deref()
                .unwrap_or("No description provided")
        );

        let mut child = Command::new("npx")
            .kill_on_drop(true)
            .stdin(Stdio::piped()) // <-- open a pipe
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(worktree_path)
            .arg("@sourcegraph/amp")
            .arg("--format=jsonl")
            .process_group(0) // Create new process group so we can kill entire tree
            .spawn()
            .map_err(ExecutorError::SpawnFailed)?;

        // feed the prompt in, then close the pipe so `amp` sees EOF
        if let Some(mut stdin) = child.stdin.take() {
            stdin.write_all(prompt.as_bytes()).await.unwrap();
            stdin.shutdown().await.unwrap(); // or `drop(stdin);`
        }

        Ok(child)
    }
}

#[async_trait]
impl Executor for AmpFollowupExecutor {
    async fn spawn(
        &self,
        _pool: &sqlx::SqlitePool,
        _task_id: Uuid,
        worktree_path: &str,
    ) -> Result<Child, ExecutorError> {
        use std::process::Stdio;

        use tokio::{io::AsyncWriteExt, process::Command};

        let mut child = Command::new("npx")
            .kill_on_drop(true)
            .stdin(Stdio::piped()) // <-- open a pipe
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(worktree_path)
            .arg("@sourcegraph/amp")
            .arg("threads")
            .arg("continue")
            .arg(&self.thread_id)
            .arg("--format=jsonl")
            .process_group(0) // Create new process group so we can kill entire tree
            .spawn()
            .map_err(ExecutorError::SpawnFailed)?;

        // feed the prompt in, then close the pipe so `amp` sees EOF
        if let Some(mut stdin) = child.stdin.take() {
            stdin.write_all(self.prompt.as_bytes()).await.unwrap();
            stdin.shutdown().await.unwrap(); // or `drop(stdin);`
        }

        Ok(child)
    }
}
