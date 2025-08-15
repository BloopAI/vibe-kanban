use chrono::{DateTime, Utc};
use executors::actions::ExecutorAction;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{FromRow, SqlitePool, Type};
use ts_rs::TS;
use uuid::Uuid;

use super::{task::Task, task_attempt::TaskAttempt};

#[derive(Debug, Clone, Type, Serialize, Deserialize, PartialEq, TS)]
#[sqlx(type_name = "execution_process_status", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
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
    pub status: ExecutionProcessStatus,
    pub exit_code: Option<i64>,
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
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

impl ExecutionProcess {
    /// Find execution process by ID
    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            ExecutionProcess,
            r#"SELECT 
                id as "id!: Uuid", 
                task_attempt_id as "task_attempt_id!: Uuid", 
                run_reason as "run_reason!: ExecutionProcessRunReason",
                executor_action as "executor_action!: sqlx::types::Json<ExecutorActionField>",
                status as "status!: ExecutionProcessStatus",
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

    /// Find execution process by rowid
    pub async fn find_by_rowid(pool: &SqlitePool, rowid: i64) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            ExecutionProcess,
            r#"SELECT 
                id as "id!: Uuid", 
                task_attempt_id as "task_attempt_id!: Uuid", 
                run_reason as "run_reason!: ExecutionProcessRunReason",
                executor_action as "executor_action!: sqlx::types::Json<ExecutorActionField>",
                status as "status!: ExecutionProcessStatus",
                exit_code,
                started_at as "started_at!: DateTime<Utc>",
                completed_at as "completed_at?: DateTime<Utc>",
                created_at as "created_at!: DateTime<Utc>", 
                updated_at as "updated_at!: DateTime<Utc>"
               FROM execution_processes 
               WHERE rowid = $1"#,
            rowid
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
                run_reason as "run_reason!: ExecutionProcessRunReason",
                executor_action as "executor_action!: sqlx::types::Json<ExecutorActionField>",
                status as "status!: ExecutionProcessStatus",
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
                run_reason as "run_reason!: ExecutionProcessRunReason",
                executor_action as "executor_action!: sqlx::types::Json<ExecutorActionField>",
                status as "status!: ExecutionProcessStatus",
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
                ep.run_reason as "run_reason!: ExecutionProcessRunReason",
                ep.executor_action as "executor_action!: sqlx::types::Json<ExecutorActionField>",
                ep.status as "status!: ExecutionProcessStatus",
                ep.exit_code,
                ep.started_at as "started_at!: DateTime<Utc>",
                ep.completed_at as "completed_at?: DateTime<Utc>",
                ep.created_at as "created_at!: DateTime<Utc>", 
                ep.updated_at as "updated_at!: DateTime<Utc>"
               FROM execution_processes ep
               JOIN task_attempts ta ON ep.task_attempt_id = ta.id
               JOIN tasks t ON ta.task_id = t.id
               WHERE ep.status = 'running' 
               AND ep.run_reason = 'devserver'
               AND t.project_id = $1
               ORDER BY ep.created_at ASC"#,
            project_id
        )
        .fetch_all(pool)
        .await
    }

    /// Find latest session_id by task attempt (simple scalar query)
    pub async fn find_latest_session_id_by_task_attempt(
        pool: &SqlitePool,
        task_attempt_id: Uuid,
    ) -> Result<Option<String>, sqlx::Error> {
        tracing::info!(
            "Finding latest session id for task attempt {}",
            task_attempt_id
        );
        let row = sqlx::query!(
            r#"SELECT es.session_id
               FROM execution_processes ep
               JOIN executor_sessions es ON ep.id = es.execution_process_id  
               WHERE ep.task_attempt_id = $1
                 AND ep.run_reason = 'codingagent'
                 AND es.session_id IS NOT NULL
               ORDER BY ep.created_at DESC
               LIMIT 1"#,
            task_attempt_id
        )
        .fetch_optional(pool)
        .await?;

        tracing::info!("Latest session id: {:?}", row);

        Ok(row.and_then(|r| r.session_id))
    }

    /// Find latest execution process by task attempt and run reason
    pub async fn find_latest_by_task_attempt_and_run_reason(
        pool: &SqlitePool,
        task_attempt_id: Uuid,
        run_reason: &ExecutionProcessRunReason,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            ExecutionProcess,
            r#"SELECT 
                id as "id!: Uuid", 
                task_attempt_id as "task_attempt_id!: Uuid", 
                run_reason as "run_reason!: ExecutionProcessRunReason",
                executor_action as "executor_action!: sqlx::types::Json<ExecutorActionField>",
                status as "status!: ExecutionProcessStatus",
                exit_code,
                started_at as "started_at!: DateTime<Utc>",
                completed_at as "completed_at?: DateTime<Utc>",
                created_at as "created_at!: DateTime<Utc>", 
                updated_at as "updated_at!: DateTime<Utc>"
               FROM execution_processes 
               WHERE task_attempt_id = ?1 
               AND run_reason = ?2
               ORDER BY created_at DESC 
               LIMIT 1"#,
            task_attempt_id,
            run_reason
        )
        .fetch_optional(pool)
        .await
    }

    /// Create a new execution process
    pub async fn create(
        pool: &SqlitePool,
        data: &CreateExecutionProcess,
        process_id: Uuid,
    ) -> Result<Self, sqlx::Error> {
        let now = Utc::now();
        let executor_action_json = sqlx::types::Json(&data.executor_action);

        sqlx::query_as!(
            ExecutionProcess,
            r#"INSERT INTO execution_processes (
                id, task_attempt_id, run_reason, executor_action, status, 
                exit_code, started_at, 
                completed_at, created_at, updated_at
               ) 
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
               RETURNING 
                id as "id!: Uuid", 
                task_attempt_id as "task_attempt_id!: Uuid", 
                run_reason as "run_reason!: ExecutionProcessRunReason",
                executor_action as "executor_action!: sqlx::types::Json<ExecutorActionField>",
                status as "status!: ExecutionProcessStatus",
                exit_code,
                started_at as "started_at!: DateTime<Utc>",
                completed_at as "completed_at?: DateTime<Utc>",
                created_at as "created_at!: DateTime<Utc>", 
                updated_at as "updated_at!: DateTime<Utc>""#,
            process_id,
            data.task_attempt_id,
            data.run_reason,
            executor_action_json,
            ExecutionProcessStatus::Running,
            None::<i64>,           // exit_code
            now,                   // started_at
            None::<DateTime<Utc>>, // completed_at
            now,                   // created_at
            now                    // updated_at
        )
        .fetch_one(pool)
        .await
    }
    pub async fn was_killed(pool: &SqlitePool, id: Uuid) -> bool {
        if let Ok(exp_process) = Self::find_by_id(pool, id).await
            && exp_process.is_some_and(|ep| ep.status == ExecutionProcessStatus::Killed)
        {
            return true;
        }
        false
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
               SET status = $1, exit_code = $2, completed_at = $3
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

    pub fn executor_action(&self) -> Result<&ExecutorAction, anyhow::Error> {
        match &self.executor_action.0 {
            ExecutorActionField::ExecutorAction(action) => Ok(action),
            ExecutorActionField::Other(_) => Err(anyhow::anyhow!(
                "Executor action is not a valid ExecutorAction JSON object"
            )),
        }
    }

    /// Get the parent TaskAttempt for this execution process
    pub async fn parent_task_attempt(
        &self,
        pool: &SqlitePool,
    ) -> Result<Option<TaskAttempt>, sqlx::Error> {
        TaskAttempt::find_by_id(pool, self.task_attempt_id).await
    }

    /// Load execution context with related task attempt and task
    pub async fn load_context(
        pool: &SqlitePool,
        exec_id: Uuid,
    ) -> Result<ExecutionContext, sqlx::Error> {
        let execution_process = Self::find_by_id(pool, exec_id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        let task_attempt = TaskAttempt::find_by_id(pool, execution_process.task_attempt_id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        let task = Task::find_by_id(pool, task_attempt.task_id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        Ok(ExecutionContext {
            execution_process,
            task_attempt,
            task,
        })
    }
}
