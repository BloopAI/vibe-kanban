//! Execution process model for managing coding agent execution sessions.
//!
//! An execution process represents a single run of an executor (coding agent,
//! dev server, setup script, etc.) within a task attempt. It tracks the process
//! status, git state before/after, and provides context for log entries.

mod lifecycle;
mod queries;
mod sync;

use chrono::{DateTime, Utc};
use executors::{
    actions::{ExecutorAction, ExecutorActionType},
    profile::ExecutorProfileId,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{FromRow, SqlitePool, Type};
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

use super::{task::Task, task_attempt::TaskAttempt};

#[derive(Debug, Error)]
pub enum ExecutionProcessError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error("Execution process not found")]
    ExecutionProcessNotFound,
    #[error("Failed to create execution process: {0}")]
    CreateFailed(String),
    #[error("Failed to update execution process: {0}")]
    UpdateFailed(String),
    #[error("Invalid executor action format")]
    InvalidExecutorAction,
    #[error("Validation error: {0}")]
    ValidationError(String),
}

#[derive(Debug, Clone, Type, Serialize, Deserialize, PartialEq, TS)]
#[sqlx(type_name = "execution_process_status", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
#[ts(use_ts_enum)]
pub enum ExecutionProcessStatus {
    Running,
    Completed,
    Failed,
    Killed,
}

#[derive(Debug, Clone, Type, Serialize, Deserialize, PartialEq, TS)]
#[sqlx(type_name = "execution_process_run_reason", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum ExecutionProcessRunReason {
    SetupScript,
    CleanupScript,
    CodingAgent,
    DevServer,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct ExecutionProcess {
    pub id: Uuid,
    pub task_attempt_id: Uuid,
    pub run_reason: ExecutionProcessRunReason,
    #[ts(type = "ExecutorAction")]
    pub executor_action: sqlx::types::Json<ExecutorActionField>,
    /// Git HEAD commit OID captured before the process starts
    pub before_head_commit: Option<String>,
    /// Git HEAD commit OID captured after the process ends
    pub after_head_commit: Option<String>,
    pub status: ExecutionProcessStatus,
    pub exit_code: Option<i64>,
    /// dropped: true if this process is excluded from the current
    /// history view (due to restore/trimming). Hidden from logs/timeline;
    /// still listed in the Processes tab.
    pub dropped: bool,
    /// System process ID (PID) for process tree discovery
    pub pid: Option<i64>,
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    /// When this execution process was last synced to the Hive. NULL means not yet synced.
    #[ts(optional)]
    pub hive_synced_at: Option<DateTime<Utc>>,
    /// The server instance that spawned this process. Used for instance-scoped
    /// process cleanup on shutdown (so cargo watch restarts don't kill other instances' processes).
    #[ts(optional)]
    pub server_instance_id: Option<String>,
    /// Why the session completed: "result_success", "result_error", "eof", "killed", "error"
    #[ts(optional)]
    pub completion_reason: Option<String>,
    /// Additional details about completion (e.g., error message)
    #[ts(optional)]
    pub completion_message: Option<String>,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateExecutionProcess {
    pub task_attempt_id: Uuid,
    pub executor_action: ExecutorAction,
    pub run_reason: ExecutionProcessRunReason,
}

#[derive(Debug, Deserialize, TS)]
#[allow(dead_code)]
pub struct UpdateExecutionProcess {
    pub status: Option<ExecutionProcessStatus>,
    pub exit_code: Option<i64>,
    pub completed_at: Option<DateTime<Utc>>,
}

#[derive(Debug)]
pub struct ExecutionContext {
    pub execution_process: ExecutionProcess,
    pub task_attempt: TaskAttempt,
    pub task: Task,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ExecutorActionField {
    ExecutorAction(ExecutorAction),
    Other(Value),
}

#[derive(Debug, Clone)]
pub struct MissingBeforeContext {
    pub id: Uuid,
    pub task_attempt_id: Uuid,
    pub prev_after_head_commit: Option<String>,
    pub target_branch: String,
    pub git_repo_path: Option<String>,
}

impl ExecutionProcess {
    pub fn executor_action(&self) -> Result<&ExecutorAction, anyhow::Error> {
        match &self.executor_action.0 {
            ExecutorActionField::ExecutorAction(action) => Ok(action),
            ExecutorActionField::Other(_) => Err(anyhow::anyhow!(
                "Executor action is not a valid ExecutorAction JSON object"
            )),
        }
    }

    /// Fetch the latest CodingAgent executor profile for a task attempt
    pub async fn latest_executor_profile_for_attempt(
        pool: &SqlitePool,
        attempt_id: Uuid,
    ) -> Result<ExecutorProfileId, ExecutionProcessError> {
        let latest_execution_process = Self::find_latest_by_task_attempt_and_run_reason(
            pool,
            attempt_id,
            &ExecutionProcessRunReason::CodingAgent,
        )
        .await?
        .ok_or_else(|| {
            ExecutionProcessError::ValidationError(
                "Couldn't find initial coding agent process, has it run yet?".to_string(),
            )
        })?;

        let action = latest_execution_process
            .executor_action()
            .map_err(|e| ExecutionProcessError::ValidationError(e.to_string()))?;

        match &action.typ {
            ExecutorActionType::CodingAgentInitialRequest(request) => {
                Ok(request.executor_profile_id.clone())
            }
            ExecutorActionType::CodingAgentFollowUpRequest(request) => {
                Ok(request.executor_profile_id.clone())
            }
            ExecutorActionType::CodingAgentReviewRequest(request) => {
                Ok(request.executor_profile_id.clone())
            }
            _ => Err(ExecutionProcessError::ValidationError(
                "Couldn't find profile from initial request".to_string(),
            )),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{
        project::{CreateProject, Project},
        task::{CreateTask, Task},
    };
    use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode};
    use std::str::FromStr;
    use tempfile::TempDir;

    /// Create a test SQLite pool with migrations applied.
    async fn setup_test_pool() -> (SqlitePool, TempDir) {
        let temp_dir = TempDir::new().expect("Failed to create temp dir");
        let db_path = temp_dir.path().join("test.db");

        let options =
            SqliteConnectOptions::from_str(&format!("sqlite://{}", db_path.to_string_lossy()))
                .expect("Invalid database URL")
                .create_if_missing(true)
                .journal_mode(SqliteJournalMode::Wal);

        let pool = SqlitePool::connect_with(options)
            .await
            .expect("Failed to create pool");

        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .expect("Failed to run migrations");

        (pool, temp_dir)
    }

    /// Create a test attempt and return (attempt_id, project_id, task_id)
    async fn create_test_attempt(pool: &SqlitePool) -> (Uuid, Uuid, Uuid) {
        let project_id = Uuid::new_v4();
        let project_data = CreateProject {
            name: "Test Project".to_string(),
            git_repo_path: format!("/tmp/test-repo-{}", project_id),
            use_existing_repo: true,
            clone_url: None,
            setup_script: None,
            dev_script: None,
            cleanup_script: None,
            copy_files: None,
        };
        let _project = Project::create(pool, &project_data, project_id)
            .await
            .expect("Failed to create project");

        let task_id = Uuid::new_v4();
        let task_data =
            CreateTask::from_title_description(project_id, "Test Task".to_string(), None);
        let _task = Task::create(pool, &task_data, task_id)
            .await
            .expect("Failed to create task");

        let attempt_id = Uuid::new_v4();
        sqlx::query(
            r#"INSERT INTO task_attempts (id, task_id, executor, branch, target_branch)
               VALUES ($1, $2, 'CLAUDE_CODE', 'test-branch', 'main')"#,
        )
        .bind(attempt_id)
        .bind(task_id)
        .execute(pool)
        .await
        .expect("Failed to create task attempt");

        (attempt_id, project_id, task_id)
    }

    /// Create an execution process for the given attempt
    async fn create_execution_for_attempt(pool: &SqlitePool, attempt_id: Uuid) -> Uuid {
        let execution_id = Uuid::new_v4();
        sqlx::query(
            r#"INSERT INTO execution_processes (id, task_attempt_id, status, run_reason, executor_action)
               VALUES ($1, $2, 'running', 'codingagent', '{}')"#,
        )
        .bind(execution_id)
        .bind(attempt_id)
        .execute(pool)
        .await
        .expect("Failed to create execution process");
        execution_id
    }

    #[tokio::test]
    async fn test_find_latest_for_attempt() {
        let (pool, _temp_dir) = setup_test_pool().await;
        let (attempt_id, _, _) = create_test_attempt(&pool).await;

        // Create first execution process
        let exec1_id = create_execution_for_attempt(&pool, attempt_id).await;

        // Small delay to ensure different timestamps
        tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;

        // Create second execution process (most recent)
        let exec2_id = create_execution_for_attempt(&pool, attempt_id).await;

        // find_latest_for_attempt should return the most recent one
        let latest = ExecutionProcess::find_latest_for_attempt(&pool, attempt_id)
            .await
            .expect("Query should succeed")
            .expect("Should find an execution process");

        assert_eq!(
            latest.id, exec2_id,
            "Should return the most recent execution process"
        );
        assert_ne!(
            latest.id, exec1_id,
            "Should not return the older execution process"
        );
    }

    #[tokio::test]
    async fn test_find_latest_for_attempt_none() {
        let (pool, _temp_dir) = setup_test_pool().await;
        let (attempt_id, _, _) = create_test_attempt(&pool).await;

        // Don't create any execution processes

        let result = ExecutionProcess::find_latest_for_attempt(&pool, attempt_id)
            .await
            .expect("Query should succeed");

        assert!(
            result.is_none(),
            "Should return None when no execution processes exist"
        );
    }

    #[tokio::test]
    async fn test_find_latest_for_attempt_excludes_dropped() {
        let (pool, _temp_dir) = setup_test_pool().await;
        let (attempt_id, _, _) = create_test_attempt(&pool).await;

        // Create first execution process
        let exec1_id = create_execution_for_attempt(&pool, attempt_id).await;

        tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;

        // Create second execution process and mark it as dropped
        let exec2_id = create_execution_for_attempt(&pool, attempt_id).await;
        sqlx::query("UPDATE execution_processes SET dropped = TRUE WHERE id = $1")
            .bind(exec2_id)
            .execute(&pool)
            .await
            .expect("Failed to mark as dropped");

        // find_latest_for_attempt should return exec1 (since exec2 is dropped)
        let latest = ExecutionProcess::find_latest_for_attempt(&pool, attempt_id)
            .await
            .expect("Query should succeed")
            .expect("Should find an execution process");

        assert_eq!(
            latest.id, exec1_id,
            "Should return the non-dropped execution process"
        );
    }
}
