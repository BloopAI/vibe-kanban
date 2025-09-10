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

#[derive(Debug, Clone)]
pub struct MissingBeforeContext {
    pub id: Uuid,
    pub task_attempt_id: Uuid,
    pub prev_after_head_commit: Option<String>,
    pub base_branch: String,
    pub git_repo_path: Option<String>,
}

impl ExecutionProcess {
    /// Find execution process by ID
    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as::<_, ExecutionProcess>(
            r#"SELECT id, task_attempt_id, run_reason, executor_action, before_head_commit,
                      after_head_commit, status, exit_code, dropped, started_at, completed_at,
                      created_at, updated_at
               FROM execution_processes WHERE id = ?"#,
        )
        .bind(id)
        .fetch_optional(pool)
        .await
    }

    /// Context for backfilling before_head_commit for legacy rows
    /// List processes that have after_head_commit set but missing before_head_commit, with join context
    pub async fn list_missing_before_context(
        pool: &SqlitePool,
    ) -> Result<Vec<MissingBeforeContext>, sqlx::Error> {
        let rows = sqlx::query!(
            r#"SELECT
                ep.id                         as "id!: Uuid",
                ep.task_attempt_id            as "task_attempt_id!: Uuid",
                ep.after_head_commit          as after_head_commit,
                prev.after_head_commit        as prev_after_head_commit,
                ta.base_branch                as base_branch,
                p.git_repo_path               as git_repo_path
            FROM execution_processes ep
            JOIN task_attempts ta ON ta.id = ep.task_attempt_id
            JOIN tasks t ON t.id = ta.task_id
            JOIN projects p ON p.id = t.project_id
            LEFT JOIN execution_processes prev
              ON prev.task_attempt_id = ep.task_attempt_id
             AND prev.created_at = (
                   SELECT max(created_at) FROM execution_processes
                     WHERE task_attempt_id = ep.task_attempt_id
                       AND created_at < ep.created_at
               )
            WHERE ep.before_head_commit IS NULL
              AND ep.after_head_commit IS NOT NULL"#
        )
        .fetch_all(pool)
        .await?;

        let result = rows
            .into_iter()
            .map(|r| MissingBeforeContext {
                id: r.id,
                task_attempt_id: r.task_attempt_id,
                prev_after_head_commit: r.prev_after_head_commit,
                base_branch: r.base_branch,
                git_repo_path: Some(r.git_repo_path),
            })
            .collect();
        Ok(result)
    }

    /// Count processes created after the given boundary process
    pub async fn count_later_than(
        pool: &SqlitePool,
        task_attempt_id: Uuid,
        boundary_process_id: Uuid,
    ) -> Result<i64, sqlx::Error> {
        let cnt = sqlx::query_scalar!(
            r#"SELECT COUNT(1) as "count!:_" FROM execution_processes
               WHERE task_attempt_id = $1
                 AND created_at > (SELECT created_at FROM execution_processes WHERE id = $2)"#,
            task_attempt_id,
            boundary_process_id
        )
        .fetch_one(pool)
        .await
        .unwrap_or(0i64);
        Ok(cnt)
    }

    /// Find execution process by rowid
    pub async fn find_by_rowid(pool: &SqlitePool, rowid: i64) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as::<_, ExecutionProcess>(
            r#"SELECT id, task_attempt_id, run_reason, executor_action, before_head_commit,
                      after_head_commit, status, exit_code, dropped, started_at, completed_at,
                      created_at, updated_at
               FROM execution_processes WHERE rowid = ?"#,
        )
        .bind(rowid)
        .fetch_optional(pool)
        .await
    }

    /// Find all execution processes for a task attempt
    pub async fn find_by_task_attempt_id(
        pool: &SqlitePool,
        task_attempt_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as::<_, ExecutionProcess>(
            r#"SELECT id, task_attempt_id, run_reason, executor_action, before_head_commit,
                      after_head_commit, status, exit_code, dropped, started_at, completed_at,
                      created_at, updated_at
               FROM execution_processes WHERE task_attempt_id = ? ORDER BY created_at ASC"#,
        )
        .bind(task_attempt_id)
        .fetch_all(pool)
        .await
    }

    /// Find running execution processes
    pub async fn find_running(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as::<_, ExecutionProcess>(
            r#"SELECT id, task_attempt_id, run_reason, executor_action, before_head_commit,
                      after_head_commit, status, exit_code, dropped, started_at, completed_at,
                      created_at, updated_at
               FROM execution_processes WHERE status = 'running' ORDER BY created_at ASC"#,
        )
        .fetch_all(pool)
        .await
    }

    /// Find running dev servers for a specific project
    pub async fn find_running_dev_servers_by_project(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as::<_, ExecutionProcess>(
            r#"SELECT ep.id, ep.task_attempt_id, ep.run_reason, ep.executor_action,
                      ep.before_head_commit, ep.after_head_commit, ep.status, ep.exit_code,
                      ep.dropped, ep.started_at, ep.completed_at, ep.created_at, ep.updated_at
               FROM execution_processes ep
               JOIN task_attempts ta ON ep.task_attempt_id = ta.id
               JOIN tasks t ON ta.task_id = t.id
               WHERE ep.status = 'running' AND ep.run_reason = 'devserver' AND t.project_id = ?
               ORDER BY ep.created_at ASC"#,
        )
        .bind(project_id)
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
                 AND ep.dropped = 0
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
        sqlx::query_as::<_, ExecutionProcess>(
            r#"SELECT id, task_attempt_id, run_reason, executor_action, before_head_commit,
                      after_head_commit, status, exit_code, dropped, started_at, completed_at,
                      created_at, updated_at
               FROM execution_processes
               WHERE task_attempt_id = ? AND run_reason = ? AND dropped = 0
               ORDER BY created_at DESC LIMIT 1"#,
        )
        .bind(task_attempt_id)
        .bind(run_reason)
        .fetch_optional(pool)
        .await
    }

    /// Create a new execution process
    pub async fn create(
        pool: &SqlitePool,
        data: &CreateExecutionProcess,
        process_id: Uuid,
        before_head_commit: Option<&str>,
    ) -> Result<Self, sqlx::Error> {
        let now = Utc::now();
        let executor_action_json = sqlx::types::Json(&data.executor_action);

        sqlx::query_as::<_, ExecutionProcess>(
            r#"INSERT INTO execution_processes (
                    id, task_attempt_id, run_reason, executor_action, before_head_commit,
                    after_head_commit, status, exit_code, started_at, completed_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?) RETURNING
                    id, task_attempt_id, run_reason, executor_action, before_head_commit,
                    after_head_commit, status, exit_code, dropped, started_at, completed_at, created_at, updated_at"#,
        )
        .bind(process_id)
        .bind(data.task_attempt_id)
        .bind(&data.run_reason)
        .bind(executor_action_json)
        .bind(before_head_commit)
        .bind(ExecutionProcessStatus::Running)
        .bind(None::<i64>)
        .bind(now)
        .bind(None::<DateTime<Utc>>)
        .bind(now)
        .bind(now)
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

    /// Update the "after" commit oid for the process
    pub async fn update_after_head_commit(
        pool: &SqlitePool,
        id: Uuid,
        after_head_commit: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            r#"UPDATE execution_processes 
               SET after_head_commit = $1 
               WHERE id = $2"#,
            after_head_commit,
            id
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Update the "before" commit oid for the process
    pub async fn update_before_head_commit(
        pool: &SqlitePool,
        id: Uuid,
        before_head_commit: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            r#"UPDATE execution_processes 
               SET before_head_commit = $1 
               WHERE id = $2"#,
            before_head_commit,
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

    /// Set restore boundary: drop processes newer than the specified process, undrop older/equal
    pub async fn set_restore_boundary(
        pool: &SqlitePool,
        task_attempt_id: Uuid,
        boundary_process_id: Uuid,
    ) -> Result<(), sqlx::Error> {
        // Monotonic drop: only mark newer records as dropped; never undrop.
        sqlx::query!(
            r#"UPDATE execution_processes
               SET dropped = 1
             WHERE task_attempt_id = $1
               AND created_at > (SELECT created_at FROM execution_processes WHERE id = $2)
               AND dropped = 0
            "#,
            task_attempt_id,
            boundary_process_id
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Delete processes at and after the specified boundary (inclusive)
    pub async fn delete_at_and_after(
        pool: &SqlitePool,
        task_attempt_id: Uuid,
        boundary_process_id: Uuid,
    ) -> Result<i64, sqlx::Error> {
        let result = sqlx::query!(
            r#"DELETE FROM execution_processes
               WHERE task_attempt_id = $1
                 AND created_at >= (SELECT created_at FROM execution_processes WHERE id = $2)"#,
            task_attempt_id,
            boundary_process_id
        )
        .execute(pool)
        .await?;
        Ok(result.rows_affected() as i64)
    }

    /// Find the previous process's after_head_commit before the given boundary process
    pub async fn find_prev_after_head_commit(
        pool: &SqlitePool,
        task_attempt_id: Uuid,
        boundary_process_id: Uuid,
    ) -> Result<Option<String>, sqlx::Error> {
        let res = sqlx::query_scalar(
            r#"SELECT after_head_commit FROM execution_processes
               WHERE task_attempt_id = ?
                 AND created_at < (SELECT created_at FROM execution_processes WHERE id = ?)
               ORDER BY created_at DESC
               LIMIT 1"#,
        )
        .bind(task_attempt_id)
        .bind(boundary_process_id)
        .fetch_optional(pool)
        .await?;
        Ok(res)
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
