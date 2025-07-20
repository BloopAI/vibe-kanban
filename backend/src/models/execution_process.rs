use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize, Serializer};
use sqlx::{FromRow, SqlitePool, Type};
use ts_rs::TS;
use uuid::Uuid;

use crate::app_state::ExecutionType;

/// Filter out stderr boundary markers from output
fn filter_stderr_boundary_markers(stderr: &Option<String>) -> Option<String> {
    stderr
        .as_ref()
        .map(|s| s.replace("---STDERR_CHUNK_BOUNDARY---", ""))
}

/// Custom serializer for stderr field that filters out boundary markers
fn serialize_filtered_stderr<S>(stderr: &Option<String>, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    let filtered = filter_stderr_boundary_markers(stderr);
    filtered.serialize(serializer)
}

#[derive(Debug, Clone, Type, Serialize, Deserialize, PartialEq, TS)]
#[sqlx(type_name = "execution_process_status", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum ExecutionProcessStatus {
    Running,
    Completed,
    Failed,
    Killed,
}

#[derive(Debug, Clone, Type, Serialize, Deserialize, PartialEq, TS)]
#[sqlx(type_name = "execution_process_type", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum ExecutionProcessType {
    SetupScript,
    CleanupScript,
    CodingAgent,
    DevServer,
}

impl From<ExecutionType> for ExecutionProcessType {
    fn from(exec_type: ExecutionType) -> Self {
        match exec_type {
            ExecutionType::SetupScript => ExecutionProcessType::SetupScript,
            ExecutionType::CleanupScript => ExecutionProcessType::CleanupScript,
            ExecutionType::CodingAgent => ExecutionProcessType::CodingAgent,
            ExecutionType::DevServer => ExecutionProcessType::DevServer,
        }
    }
}

impl From<ExecutionProcessType> for ExecutionType {
    fn from(exec_type: ExecutionProcessType) -> Self {
        match exec_type {
            ExecutionProcessType::SetupScript => ExecutionType::SetupScript,
            ExecutionProcessType::CleanupScript => ExecutionType::CleanupScript,
            ExecutionProcessType::CodingAgent => ExecutionType::CodingAgent,
            ExecutionProcessType::DevServer => ExecutionType::DevServer,
        }
    }
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ExecutionProcess {
    pub id: Uuid,
    pub task_attempt_id: Uuid,
    pub process_type: ExecutionProcessType,
    pub executor_type: Option<String>, // "echo", "claude", "amp", etc. - only for CodingAgent processes
    pub status: ExecutionProcessStatus,
    pub command: String,
    pub args: Option<String>, // JSON array of arguments
    pub working_directory: String,
    pub stdout: Option<String>,
    #[serde(serialize_with = "serialize_filtered_stderr")]
    pub stderr: Option<String>,
    pub exit_code: Option<i64>,
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct CreateExecutionProcess {
    pub task_attempt_id: Uuid,
    pub process_type: ExecutionProcessType,
    pub executor_type: Option<String>,
    pub command: String,
    pub args: Option<String>,
    pub working_directory: String,
}

#[derive(Debug, Deserialize, TS)]
#[ts(export)]
#[allow(dead_code)]
pub struct UpdateExecutionProcess {
    pub status: Option<ExecutionProcessStatus>,
    pub exit_code: Option<i64>,
    pub completed_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ExecutionProcessSummary {
    pub id: Uuid,
    pub task_attempt_id: Uuid,
    pub process_type: ExecutionProcessType,
    pub executor_type: Option<String>, // "echo", "claude", "amp", etc. - only for CodingAgent processes
    pub status: ExecutionProcessStatus,
    pub command: String,
    pub args: Option<String>, // JSON array of arguments
    pub working_directory: String,
    pub exit_code: Option<i64>,
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl ExecutionProcess {
    /// Find execution process by ID
    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            ExecutionProcess,
            r#"SELECT 
                id as "id!: Uuid", 
                task_attempt_id as "task_attempt_id!: Uuid", 
                process_type as "process_type!: ExecutionProcessType",
                executor_type,
                status as "status!: ExecutionProcessStatus",
                command, 
                args, 
                working_directory, 
                stdout, 
                stderr, 
                exit_code,
                started_at as "started_at!: DateTime<Utc>",
                completed_at as "completed_at?: DateTime<Utc>",
                created_at as "created_at!: DateTime<Utc>", 
                updated_at as "updated_at!: DateTime<Utc>"
               FROM execution_processes 
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    /// Find all execution processes for a task attempt
    pub async fn find_by_task_attempt_id(
        pool: &SqlitePool,
        task_attempt_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            ExecutionProcess,
            r#"SELECT 
                id as "id!: Uuid", 
                task_attempt_id as "task_attempt_id!: Uuid", 
                process_type as "process_type!: ExecutionProcessType",
                executor_type,
                status as "status!: ExecutionProcessStatus",
                command, 
                args, 
                working_directory, 
                stdout, 
                stderr, 
                exit_code,
                started_at as "started_at!: DateTime<Utc>",
                completed_at as "completed_at?: DateTime<Utc>",
                created_at as "created_at!: DateTime<Utc>", 
                updated_at as "updated_at!: DateTime<Utc>"
               FROM execution_processes 
               WHERE task_attempt_id = $1 
               ORDER BY created_at ASC"#,
            task_attempt_id
        )
        .fetch_all(pool)
        .await
    }

    /// Find execution process summaries for a task attempt (excluding stdio)
    pub async fn find_summaries_by_task_attempt_id(
        pool: &SqlitePool,
        task_attempt_id: Uuid,
    ) -> Result<Vec<ExecutionProcessSummary>, sqlx::Error> {
        sqlx::query_as!(
            ExecutionProcessSummary,
            r#"SELECT 
                id as "id!: Uuid", 
                task_attempt_id as "task_attempt_id!: Uuid", 
                process_type as "process_type!: ExecutionProcessType",
                executor_type,
                status as "status!: ExecutionProcessStatus",
                command, 
                args, 
                working_directory, 
                exit_code,
                started_at as "started_at!: DateTime<Utc>",
                completed_at as "completed_at?: DateTime<Utc>",
                created_at as "created_at!: DateTime<Utc>", 
                updated_at as "updated_at!: DateTime<Utc>"
               FROM execution_processes 
               WHERE task_attempt_id = $1 
               ORDER BY created_at ASC"#,
            task_attempt_id
        )
        .fetch_all(pool)
        .await
    }

    /// Find running execution processes
    pub async fn find_running(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            ExecutionProcess,
            r#"SELECT 
                id as "id!: Uuid", 
                task_attempt_id as "task_attempt_id!: Uuid", 
                process_type as "process_type!: ExecutionProcessType",
                executor_type,
                status as "status!: ExecutionProcessStatus",
                command, 
                args, 
                working_directory, 
                stdout, 
                stderr, 
                exit_code,
                started_at as "started_at!: DateTime<Utc>",
                completed_at as "completed_at?: DateTime<Utc>",
                created_at as "created_at!: DateTime<Utc>", 
                updated_at as "updated_at!: DateTime<Utc>"
               FROM execution_processes 
               WHERE status = 'running' 
               ORDER BY created_at ASC"#
        )
        .fetch_all(pool)
        .await
    }

    /// Find running dev servers for a specific project
    pub async fn find_running_dev_servers_by_project(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            ExecutionProcess,
            r#"SELECT 
                ep.id as "id!: Uuid", 
                ep.task_attempt_id as "task_attempt_id!: Uuid", 
                ep.process_type as "process_type!: ExecutionProcessType",
                ep.executor_type,
                ep.status as "status!: ExecutionProcessStatus",
                ep.command, 
                ep.args, 
                ep.working_directory, 
                ep.stdout, 
                ep.stderr, 
                ep.exit_code,
                ep.started_at as "started_at!: DateTime<Utc>",
                ep.completed_at as "completed_at?: DateTime<Utc>",
                ep.created_at as "created_at!: DateTime<Utc>", 
                ep.updated_at as "updated_at!: DateTime<Utc>"
               FROM execution_processes ep
               JOIN task_attempts ta ON ep.task_attempt_id = ta.id
               JOIN tasks t ON ta.task_id = t.id
               WHERE ep.status = 'running' 
               AND ep.process_type = 'devserver'
               AND t.project_id = $1
               ORDER BY ep.created_at ASC"#,
            project_id
        )
        .fetch_all(pool)
        .await
    }

    /// Create a new execution process
    pub async fn create(
        pool: &SqlitePool,
        data: &CreateExecutionProcess,
        process_id: Uuid,
    ) -> Result<Self, sqlx::Error> {
        let now = Utc::now();

        sqlx::query_as!(
            ExecutionProcess,
            r#"INSERT INTO execution_processes (
                id, task_attempt_id, process_type, executor_type, status, command, args, 
                working_directory, stdout, stderr, exit_code, started_at, 
                completed_at, created_at, updated_at
               ) 
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) 
               RETURNING 
                id as "id!: Uuid", 
                task_attempt_id as "task_attempt_id!: Uuid", 
                process_type as "process_type!: ExecutionProcessType",
                executor_type,
                status as "status!: ExecutionProcessStatus",
                command, 
                args, 
                working_directory, 
                stdout, 
                stderr, 
                exit_code,
                started_at as "started_at!: DateTime<Utc>",
                completed_at as "completed_at?: DateTime<Utc>",
                created_at as "created_at!: DateTime<Utc>", 
                updated_at as "updated_at!: DateTime<Utc>""#,
            process_id,
            data.task_attempt_id,
            data.process_type,
            data.executor_type,
            ExecutionProcessStatus::Running,
            data.command,
            data.args,
            data.working_directory,
            None::<String>,        // stdout
            None::<String>,        // stderr
            None::<i64>,           // exit_code
            now,                   // started_at
            None::<DateTime<Utc>>, // completed_at
            now,                   // created_at
            now                    // updated_at
        )
        .fetch_one(pool)
        .await
    }

    /// Update execution process status and completion info
    pub async fn update_completion(
        pool: &SqlitePool,
        id: Uuid,
        status: ExecutionProcessStatus,
        exit_code: Option<i64>,
    ) -> Result<(), sqlx::Error> {
        let completed_at = if matches!(status, ExecutionProcessStatus::Running) {
            None
        } else {
            Some(Utc::now())
        };

        sqlx::query!(
            r#"UPDATE execution_processes 
               SET status = $1, exit_code = $2, completed_at = $3, updated_at = datetime('now') 
               WHERE id = $4"#,
            status,
            exit_code,
            completed_at,
            id
        )
        .execute(pool)
        .await?;

        Ok(())
    }

    /// Append to stdout for this execution process (for streaming updates)
    pub async fn append_stdout(
        pool: &SqlitePool,
        id: Uuid,
        stdout_append: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "UPDATE execution_processes SET stdout = COALESCE(stdout, '') || $1, updated_at = datetime('now') WHERE id = $2",
            stdout_append,
            id
        )
        .execute(pool)
        .await?;

        Ok(())
    }

    /// Append to stderr for this execution process (for streaming updates)
    pub async fn append_stderr(
        pool: &SqlitePool,
        id: Uuid,
        stderr_append: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "UPDATE execution_processes SET stderr = COALESCE(stderr, '') || $1, updated_at = datetime('now') WHERE id = $2",
            stderr_append,
            id
        )
        .execute(pool)
        .await?;

        Ok(())
    }

    /// Append to both stdout and stderr for this execution process
    pub async fn append_output(
        pool: &SqlitePool,
        id: Uuid,
        stdout_append: Option<&str>,
        stderr_append: Option<&str>,
    ) -> Result<(), sqlx::Error> {
        if let Some(stdout_data) = stdout_append {
            Self::append_stdout(pool, id, stdout_data).await?;
        }

        if let Some(stderr_data) = stderr_append {
            Self::append_stderr(pool, id, stderr_data).await?;
        }

        Ok(())
    }

    /// Delete execution processes for a task attempt (cleanup)
    #[allow(dead_code)]
    pub async fn delete_by_task_attempt_id(
        pool: &SqlitePool,
        task_attempt_id: Uuid,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "DELETE FROM execution_processes WHERE task_attempt_id = $1",
            task_attempt_id
        )
        .execute(pool)
        .await?;

        Ok(())
    }
}
