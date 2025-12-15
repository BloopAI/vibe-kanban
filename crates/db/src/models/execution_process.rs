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

use super::{
    attempt_repo::AttemptRepo,
    execution_process_repo_state::{CreateExecutionProcessRepoState, ExecutionProcessRepoState},
    project::Project,
    repo::Repo,
    task::Task,
    task_attempt::TaskAttempt,
};

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
    pub project: Project,
    pub repos: Vec<Repo>,
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
    pub repo_id: Uuid,
    pub prev_after_head_commit: Option<String>,
    pub target_branch: String,
    pub repo_path: Option<String>,
}

impl ExecutionProcess {
    /// Find execution process by ID
    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            ExecutionProcess,
            r#"SELECT
                    ep.id as "id!: Uuid",
                    ep.task_attempt_id as "task_attempt_id!: Uuid",
                    ep.run_reason as "run_reason!: ExecutionProcessRunReason",
                    ep.executor_action as "executor_action!: sqlx::types::Json<ExecutorActionField>",
                    ep.status as "status!: ExecutionProcessStatus",
                    ep.exit_code,
                    ep.dropped,
                    ep.started_at as "started_at!: DateTime<Utc>",
                    ep.completed_at as "completed_at?: DateTime<Utc>",
                    ep.created_at as "created_at!: DateTime<Utc>",
                    ep.updated_at as "updated_at!: DateTime<Utc>"
               FROM execution_processes ep WHERE ep.id = ?"#,
            id
        )
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
                eprs.repo_id                  as "repo_id!: Uuid",
                eprs.after_head_commit        as after_head_commit,
                prev.after_head_commit        as prev_after_head_commit,
                ar.target_branch              as "target_branch!",
                r.path                        as repo_path
            FROM execution_processes ep
            JOIN execution_process_repo_states eprs ON eprs.execution_process_id = ep.id
            JOIN repos r ON r.id = eprs.repo_id
            JOIN task_attempts ta ON ta.id = ep.task_attempt_id
            JOIN attempt_repos ar ON ar.attempt_id = ta.id AND ar.repo_id = eprs.repo_id
            LEFT JOIN execution_process_repo_states prev
              ON prev.execution_process_id = (
                   SELECT id FROM execution_processes
                     WHERE task_attempt_id = ep.task_attempt_id
                       AND created_at < ep.created_at
                     ORDER BY created_at DESC
                     LIMIT 1
               )
              AND prev.repo_id = eprs.repo_id
            WHERE eprs.before_head_commit IS NULL
              AND eprs.after_head_commit IS NOT NULL"#
        )
        .fetch_all(pool)
        .await?;

        let result = rows
            .into_iter()
            .map(|r| MissingBeforeContext {
                id: r.id,
                task_attempt_id: r.task_attempt_id,
                repo_id: r.repo_id,
                prev_after_head_commit: r.prev_after_head_commit,
                target_branch: r.target_branch,
                repo_path: Some(r.repo_path),
            })
            .collect();
        Ok(result)
    }

    /// Find execution process by rowid
    pub async fn find_by_rowid(pool: &SqlitePool, rowid: i64) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            ExecutionProcess,
            r#"SELECT
                    ep.id as "id!: Uuid",
                    ep.task_attempt_id as "task_attempt_id!: Uuid",
                    ep.run_reason as "run_reason!: ExecutionProcessRunReason",
                    ep.executor_action as "executor_action!: sqlx::types::Json<ExecutorActionField>",
                    ep.status as "status!: ExecutionProcessStatus",
                    ep.exit_code,
                    ep.dropped,
                    ep.started_at as "started_at!: DateTime<Utc>",
                    ep.completed_at as "completed_at?: DateTime<Utc>",
                    ep.created_at as "created_at!: DateTime<Utc>",
                    ep.updated_at as "updated_at!: DateTime<Utc>"
               FROM execution_processes ep WHERE ep.rowid = ?"#,
            rowid
        )
        .fetch_optional(pool)
        .await
    }

    /// Find all execution processes for a task attempt (optionally include soft-deleted)
    pub async fn find_by_task_attempt_id(
        pool: &SqlitePool,
        task_attempt_id: Uuid,
        show_soft_deleted: bool,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            ExecutionProcess,
            r#"SELECT
                      ep.id              as "id!: Uuid",
                      ep.task_attempt_id as "task_attempt_id!: Uuid",
                      ep.run_reason      as "run_reason!: ExecutionProcessRunReason",
                      ep.executor_action as "executor_action!: sqlx::types::Json<ExecutorActionField>",
                      ep.status          as "status!: ExecutionProcessStatus",
                      ep.exit_code,
                      ep.dropped,
                      ep.started_at      as "started_at!: DateTime<Utc>",
                      ep.completed_at    as "completed_at?: DateTime<Utc>",
                      ep.created_at      as "created_at!: DateTime<Utc>",
                      ep.updated_at      as "updated_at!: DateTime<Utc>"
               FROM execution_processes ep
               WHERE ep.task_attempt_id = ?
                 AND (? OR ep.dropped = FALSE)
               ORDER BY ep.created_at ASC"#,
            task_attempt_id,
            show_soft_deleted
        )
        .fetch_all(pool)
        .await
    }

    /// Find running execution processes
    pub async fn find_running(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            ExecutionProcess,
            r#"SELECT
                    ep.id as "id!: Uuid",
                    ep.task_attempt_id as "task_attempt_id!: Uuid",
                    ep.run_reason as "run_reason!: ExecutionProcessRunReason",
                    ep.executor_action as "executor_action!: sqlx::types::Json<ExecutorActionField>",
                    ep.status as "status!: ExecutionProcessStatus",
                    ep.exit_code,
                    ep.dropped,
                    ep.started_at as "started_at!: DateTime<Utc>",
                    ep.completed_at as "completed_at?: DateTime<Utc>",
                    ep.created_at as "created_at!: DateTime<Utc>",
                    ep.updated_at as "updated_at!: DateTime<Utc>"
               FROM execution_processes ep WHERE ep.status = 'running' ORDER BY ep.created_at ASC"#,
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
            r#"SELECT ep.id as "id!: Uuid", ep.task_attempt_id as "task_attempt_id!: Uuid", ep.run_reason as "run_reason!: ExecutionProcessRunReason", ep.executor_action as "executor_action!: sqlx::types::Json<ExecutorActionField>",
                      ep.status as "status!: ExecutionProcessStatus", ep.exit_code,
                      ep.dropped, ep.started_at as "started_at!: DateTime<Utc>", ep.completed_at as "completed_at?: DateTime<Utc>", ep.created_at as "created_at!: DateTime<Utc>", ep.updated_at as "updated_at!: DateTime<Utc>"
               FROM execution_processes ep
               JOIN task_attempts ta ON ep.task_attempt_id = ta.id
               JOIN tasks t ON ta.task_id = t.id
               WHERE ep.status = 'running' AND ep.run_reason = 'devserver' AND t.project_id = ?
               ORDER BY ep.created_at ASC"#,
            project_id
        )
        .fetch_all(pool)
        .await
    }

    /// Find running dev servers for a specific task attempt
    pub async fn find_running_dev_servers_by_task_attempt(
        pool: &SqlitePool,
        task_attempt_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            ExecutionProcess,
            r#"
        SELECT
            ep.id as "id!: Uuid",
            ep.task_attempt_id as "task_attempt_id!: Uuid",
            ep.run_reason as "run_reason!: ExecutionProcessRunReason",
            ep.executor_action as "executor_action!: sqlx::types::Json<ExecutorActionField>",
            ep.status as "status!: ExecutionProcessStatus",
            ep.exit_code,
            ep.dropped,
            ep.started_at as "started_at!: DateTime<Utc>",
            ep.completed_at as "completed_at?: DateTime<Utc>",
            ep.created_at as "created_at!: DateTime<Utc>",
            ep.updated_at as "updated_at!: DateTime<Utc>"
        FROM execution_processes ep
        WHERE ep.status = 'running'
          AND ep.run_reason = 'devserver'
          AND ep.task_attempt_id = ?
        ORDER BY ep.created_at DESC
        "#,
            task_attempt_id
        )
        .fetch_all(pool)
        .await
    }

    /// Check if there are running processes (excluding dev servers) for a task attempt
    pub async fn has_running_non_dev_server_processes(
        pool: &SqlitePool,
        task_attempt_id: Uuid,
    ) -> Result<bool, sqlx::Error> {
        let count: i64 = sqlx::query_scalar(
            r#"SELECT COUNT(*)
               FROM execution_processes
               WHERE task_attempt_id = ?
                 AND status = 'running'
                 AND run_reason != 'devserver'"#,
        )
        .bind(task_attempt_id)
        .fetch_one(pool)
        .await?;
        Ok(count > 0)
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
                 AND ep.dropped = FALSE
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
                    ep.id as "id!: Uuid",
                    ep.task_attempt_id as "task_attempt_id!: Uuid",
                    ep.run_reason as "run_reason!: ExecutionProcessRunReason",
                    ep.executor_action as "executor_action!: sqlx::types::Json<ExecutorActionField>",
                    ep.status as "status!: ExecutionProcessStatus",
                    ep.exit_code,
                    ep.dropped,
                    ep.started_at as "started_at!: DateTime<Utc>",
                    ep.completed_at as "completed_at?: DateTime<Utc>",
                    ep.created_at as "created_at!: DateTime<Utc>",
                    ep.updated_at as "updated_at!: DateTime<Utc>"
               FROM execution_processes ep
               WHERE ep.task_attempt_id = ? AND ep.run_reason = ? AND ep.dropped = FALSE
               ORDER BY ep.created_at DESC LIMIT 1"#,
            task_attempt_id,
            run_reason
        )
        .fetch_optional(pool)
        .await
    }

    /// Create a new execution process
    ///
    /// Note: We intentionally avoid using a transaction here. SQLite update
    /// hooks fire during transactions (before commit), and the hook spawns an
    /// async task that queries `find_by_rowid` on a different connection.
    /// If we used a transaction, that query would not see the uncommitted row,
    /// causing the WebSocket event to be lost.
    pub async fn create(
        pool: &SqlitePool,
        data: &CreateExecutionProcess,
        process_id: Uuid,
        repo_states: &[CreateExecutionProcessRepoState],
    ) -> Result<Self, sqlx::Error> {
        let now = Utc::now();
        let executor_action_json = sqlx::types::Json(&data.executor_action);

        sqlx::query!(
            r#"INSERT INTO execution_processes (
                    id, task_attempt_id, run_reason, executor_action,
                    status, exit_code, started_at, completed_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
            process_id,
            data.task_attempt_id,
            data.run_reason,
            executor_action_json,
            ExecutionProcessStatus::Running,
            None::<i64>,
            now,
            None::<DateTime<Utc>>,
            now,
            now
        )
        .execute(pool)
        .await?;

        ExecutionProcessRepoState::create_many(pool, process_id, repo_states).await?;

        Self::find_by_id(pool, process_id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)
    }

    pub async fn was_stopped(pool: &SqlitePool, id: Uuid) -> bool {
        if let Ok(exp_process) = Self::find_by_id(pool, id).await
            && exp_process.is_some_and(|ep| {
                ep.status == ExecutionProcessStatus::Killed
                    || ep.status == ExecutionProcessStatus::Completed
            })
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

    /// Soft-drop processes at and after the specified boundary (inclusive)
    pub async fn drop_at_and_after(
        pool: &SqlitePool,
        task_attempt_id: Uuid,
        boundary_process_id: Uuid,
    ) -> Result<i64, sqlx::Error> {
        let result = sqlx::query!(
            r#"UPDATE execution_processes
               SET dropped = TRUE
             WHERE task_attempt_id = $1
               AND created_at >= (SELECT created_at FROM execution_processes WHERE id = $2)
               AND dropped = FALSE"#,
            task_attempt_id,
            boundary_process_id
        )
        .execute(pool)
        .await?;
        Ok(result.rows_affected() as i64)
    }

    /// Find the previous process's after_head_commit before the given boundary process
    /// for a specific repository
    pub async fn find_prev_after_head_commit(
        pool: &SqlitePool,
        task_attempt_id: Uuid,
        boundary_process_id: Uuid,
        repo_id: Uuid,
    ) -> Result<Option<String>, sqlx::Error> {
        let repo_res = sqlx::query_scalar(
            r#"SELECT eprs.after_head_commit
               FROM execution_process_repo_states eprs
               JOIN execution_processes ep ON ep.id = eprs.execution_process_id
              WHERE ep.task_attempt_id = ?
                AND eprs.repo_id = ?
                AND ep.created_at < (SELECT created_at FROM execution_processes WHERE id = ?)
              ORDER BY ep.created_at DESC
              LIMIT 1"#,
        )
        .bind(task_attempt_id)
        .bind(repo_id)
        .bind(boundary_process_id)
        .fetch_optional(pool)
        .await?;

        Ok(repo_res)
    }

    /// Get the parent TaskAttempt for this execution process
    pub async fn parent_task_attempt(
        &self,
        pool: &SqlitePool,
    ) -> Result<Option<TaskAttempt>, sqlx::Error> {
        TaskAttempt::find_by_id(pool, self.task_attempt_id).await
    }

    /// Load execution context with related task attempt, task, project, and repos
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

        let project = Project::find_by_id(pool, task.project_id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        let repos = AttemptRepo::find_repos_for_attempt(pool, task_attempt.id).await?;

        Ok(ExecutionContext {
            execution_process,
            task_attempt,
            task,
            project,
            repos,
        })
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
            _ => Err(ExecutionProcessError::ValidationError(
                "Couldn't find profile from initial request".to_string(),
            )),
        }
    }
}
