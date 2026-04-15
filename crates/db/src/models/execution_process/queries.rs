//! CRUD and query operations for execution processes.

use chrono::{DateTime, Utc};
use sqlx::SqlitePool;
use uuid::Uuid;

use super::{
    CreateExecutionProcess, ExecutionContext, ExecutionProcess, ExecutionProcessRunReason,
    ExecutionProcessStatus, ExecutorActionField, MissingBeforeContext,
};
use crate::models::{task::Task, task_attempt::TaskAttempt};

impl ExecutionProcess {
    /// Find execution process by ID
    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            ExecutionProcess,
            r#"SELECT id as "id!: Uuid", task_attempt_id as "task_attempt_id!: Uuid", run_reason as "run_reason!: ExecutionProcessRunReason", executor_action as "executor_action!: sqlx::types::Json<ExecutorActionField>", before_head_commit,
                      after_head_commit, status as "status!: ExecutionProcessStatus", exit_code, dropped, pid, started_at as "started_at!: DateTime<Utc>", completed_at as "completed_at?: DateTime<Utc>",
                      created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>", hive_synced_at as "hive_synced_at: DateTime<Utc>", server_instance_id, completion_reason, completion_message
               FROM execution_processes WHERE id = ?"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    /// Find execution process by rowid
    pub async fn find_by_rowid(pool: &SqlitePool, rowid: i64) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            ExecutionProcess,
            r#"SELECT id as "id!: Uuid", task_attempt_id as "task_attempt_id!: Uuid", run_reason as "run_reason!: ExecutionProcessRunReason", executor_action as "executor_action!: sqlx::types::Json<ExecutorActionField>", before_head_commit,
                      after_head_commit, status as "status!: ExecutionProcessStatus", exit_code, dropped, pid, started_at as "started_at!: DateTime<Utc>", completed_at as "completed_at?: DateTime<Utc>",
                      created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>", hive_synced_at as "hive_synced_at: DateTime<Utc>", server_instance_id, completion_reason, completion_message
               FROM execution_processes WHERE rowid = ?"#,
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
            r#"SELECT id              as "id!: Uuid",
                      task_attempt_id as "task_attempt_id!: Uuid",
                      run_reason      as "run_reason!: ExecutionProcessRunReason",
                      executor_action as "executor_action!: sqlx::types::Json<ExecutorActionField>",
                      before_head_commit,
                      after_head_commit,
                      status          as "status!: ExecutionProcessStatus",
                      exit_code,
                      dropped,
                      pid,
                      started_at      as "started_at!: DateTime<Utc>",
                      completed_at    as "completed_at?: DateTime<Utc>",
                      created_at      as "created_at!: DateTime<Utc>",
                      updated_at      as "updated_at!: DateTime<Utc>",
                      hive_synced_at  as "hive_synced_at: DateTime<Utc>",
                      server_instance_id,
                      completion_reason,
                      completion_message
               FROM execution_processes
               WHERE task_attempt_id = ?
                 AND (? OR dropped = FALSE)
               ORDER BY created_at ASC"#,
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
            r#"SELECT id as "id!: Uuid", task_attempt_id as "task_attempt_id!: Uuid", run_reason as "run_reason!: ExecutionProcessRunReason", executor_action as "executor_action!: sqlx::types::Json<ExecutorActionField>", before_head_commit,
                      after_head_commit, status as "status!: ExecutionProcessStatus", exit_code, dropped, pid, started_at as "started_at!: DateTime<Utc>", completed_at as "completed_at?: DateTime<Utc>",
                      created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>", hive_synced_at as "hive_synced_at: DateTime<Utc>", server_instance_id, completion_reason, completion_message
               FROM execution_processes WHERE status = 'running' ORDER BY created_at ASC"#,
        )
        .fetch_all(pool)
        .await
    }

    /// Find running execution processes for a specific server instance
    /// Used to only kill processes belonging to THIS server instance on shutdown
    pub async fn find_running_by_instance(
        pool: &SqlitePool,
        instance_id: &str,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            ExecutionProcess,
            r#"SELECT id as "id!: Uuid", task_attempt_id as "task_attempt_id!: Uuid", run_reason as "run_reason!: ExecutionProcessRunReason", executor_action as "executor_action!: sqlx::types::Json<ExecutorActionField>", before_head_commit,
                      after_head_commit, status as "status!: ExecutionProcessStatus", exit_code, dropped, pid, started_at as "started_at!: DateTime<Utc>", completed_at as "completed_at?: DateTime<Utc>",
                      created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>", hive_synced_at as "hive_synced_at: DateTime<Utc>", server_instance_id, completion_reason, completion_message
               FROM execution_processes WHERE status = 'running' AND server_instance_id = ? ORDER BY created_at ASC"#,
            instance_id
        )
        .fetch_all(pool)
        .await
    }

    /// Mark orphaned running processes as failed on startup.
    /// A process is orphaned if it has status = 'running' but its server_instance_id
    /// is not in the list of currently active instances (or has no instance ID at all).
    /// Returns the number of processes marked as failed.
    pub async fn mark_orphaned_as_failed(
        pool: &SqlitePool,
        current_instance_id: &str,
    ) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!(
            r#"UPDATE execution_processes
               SET status = 'failed', updated_at = datetime('now')
               WHERE status = 'running'
                 AND (server_instance_id IS NULL OR server_instance_id != ?)"#,
            current_instance_id
        )
        .execute(pool)
        .await?;

        Ok(result.rows_affected())
    }

    /// Find running dev servers for a specific project
    pub async fn find_running_dev_servers_by_project(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            ExecutionProcess,
            r#"SELECT ep.id as "id!: Uuid", ep.task_attempt_id as "task_attempt_id!: Uuid", ep.run_reason as "run_reason!: ExecutionProcessRunReason", ep.executor_action as "executor_action!: sqlx::types::Json<ExecutorActionField>",
                      ep.before_head_commit, ep.after_head_commit, ep.status as "status!: ExecutionProcessStatus", ep.exit_code,
                      ep.dropped, ep.pid, ep.started_at as "started_at!: DateTime<Utc>", ep.completed_at as "completed_at?: DateTime<Utc>", ep.created_at as "created_at!: DateTime<Utc>", ep.updated_at as "updated_at!: DateTime<Utc>", ep.hive_synced_at as "hive_synced_at: DateTime<Utc>", ep.server_instance_id, ep.completion_reason, ep.completion_message
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
            id as "id!: Uuid",
            task_attempt_id as "task_attempt_id!: Uuid",
            run_reason as "run_reason!: ExecutionProcessRunReason",
            executor_action as "executor_action!: sqlx::types::Json<ExecutorActionField>",
            before_head_commit,
            after_head_commit,
            status as "status!: ExecutionProcessStatus",
            exit_code,
            dropped,
            pid,
            started_at as "started_at!: DateTime<Utc>",
            completed_at as "completed_at?: DateTime<Utc>",
            created_at as "created_at!: DateTime<Utc>",
            updated_at as "updated_at!: DateTime<Utc>",
            hive_synced_at as "hive_synced_at: DateTime<Utc>",
            server_instance_id,
            completion_reason,
            completion_message
        FROM execution_processes
        WHERE status = 'running'
          AND run_reason = 'devserver'
          AND task_attempt_id = ?
        ORDER BY created_at DESC
        "#,
            task_attempt_id
        )
        .fetch_all(pool)
        .await
    }

    /// Find running execution processes that have a PID stored (for process tree discovery)
    pub async fn find_running_with_pids(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            ExecutionProcess,
            r#"SELECT id as "id!: Uuid", task_attempt_id as "task_attempt_id!: Uuid", run_reason as "run_reason!: ExecutionProcessRunReason", executor_action as "executor_action!: sqlx::types::Json<ExecutorActionField>", before_head_commit,
                      after_head_commit, status as "status!: ExecutionProcessStatus", exit_code, dropped, pid, started_at as "started_at!: DateTime<Utc>", completed_at as "completed_at?: DateTime<Utc>",
                      created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>", hive_synced_at as "hive_synced_at: DateTime<Utc>", server_instance_id, completion_reason, completion_message
               FROM execution_processes WHERE status = 'running' AND pid IS NOT NULL ORDER BY created_at ASC"#,
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
        // Prefer non-dropped processes (ep.dropped ASC puts FALSE first), but fall back to
        // dropped ones if all processes were dropped — this allows follow-ups to resume
        // context even when the previous execution was killed or retried.
        let row = sqlx::query!(
            r#"SELECT es.session_id
               FROM execution_processes ep
               JOIN executor_sessions es ON ep.id = es.execution_process_id
               WHERE ep.task_attempt_id = $1
                 AND ep.run_reason = 'codingagent'
                 AND es.session_id IS NOT NULL
               ORDER BY ep.dropped ASC, ep.created_at DESC
               LIMIT 1"#,
            task_attempt_id
        )
        .fetch_optional(pool)
        .await?;

        tracing::info!("Latest session id: {:?}", row);

        Ok(row.and_then(|r| r.session_id))
    }

    /// Find previous session_ids by task attempt (for fallback when latest fails)
    /// Returns up to `limit` session IDs ordered by most recent first
    pub async fn find_previous_session_ids(
        pool: &SqlitePool,
        task_attempt_id: Uuid,
        limit: i64,
    ) -> Result<Vec<String>, sqlx::Error> {
        let rows = sqlx::query!(
            r#"SELECT es.session_id
               FROM execution_processes ep
               JOIN executor_sessions es ON ep.id = es.execution_process_id
               WHERE ep.task_attempt_id = $1
                 AND ep.run_reason = 'codingagent'
                 AND es.session_id IS NOT NULL
               ORDER BY ep.dropped ASC, ep.created_at DESC
               LIMIT $2"#,
            task_attempt_id,
            limit
        )
        .fetch_all(pool)
        .await?;

        Ok(rows.iter().filter_map(|r| r.session_id.clone()).collect())
    }

    /// Find latest execution process by task attempt and run reason
    pub async fn find_latest_by_task_attempt_and_run_reason(
        pool: &SqlitePool,
        task_attempt_id: Uuid,
        run_reason: &ExecutionProcessRunReason,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            ExecutionProcess,
            r#"SELECT id as "id!: Uuid", task_attempt_id as "task_attempt_id!: Uuid", run_reason as "run_reason!: ExecutionProcessRunReason", executor_action as "executor_action!: sqlx::types::Json<ExecutorActionField>", before_head_commit,
                      after_head_commit, status as "status!: ExecutionProcessStatus", exit_code, dropped, pid, started_at as "started_at!: DateTime<Utc>", completed_at as "completed_at?: DateTime<Utc>",
                      created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>", hive_synced_at as "hive_synced_at: DateTime<Utc>", server_instance_id, completion_reason, completion_message
               FROM execution_processes
               WHERE task_attempt_id = ? AND run_reason = ? AND dropped = FALSE
               ORDER BY created_at DESC LIMIT 1"#,
            task_attempt_id,
            run_reason
        )
        .fetch_optional(pool)
        .await
    }

    /// Find the most recent execution process for a task attempt
    /// Used for logging system messages to an attempt's conversation
    pub async fn find_latest_for_attempt(
        pool: &SqlitePool,
        task_attempt_id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            ExecutionProcess,
            r#"SELECT id as "id!: Uuid", task_attempt_id as "task_attempt_id!: Uuid", run_reason as "run_reason!: ExecutionProcessRunReason", executor_action as "executor_action!: sqlx::types::Json<ExecutorActionField>", before_head_commit,
                      after_head_commit, status as "status!: ExecutionProcessStatus", exit_code, dropped, pid, started_at as "started_at!: DateTime<Utc>", completed_at as "completed_at?: DateTime<Utc>",
                      created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>", hive_synced_at as "hive_synced_at: DateTime<Utc>", server_instance_id, completion_reason, completion_message
               FROM execution_processes
               WHERE task_attempt_id = ? AND dropped = FALSE
               ORDER BY created_at DESC LIMIT 1"#,
            task_attempt_id
        )
        .fetch_optional(pool)
        .await
    }

    /// Create a new execution process
    pub async fn create(
        pool: &SqlitePool,
        data: &CreateExecutionProcess,
        process_id: Uuid,
        before_head_commit: Option<&str>,
        server_instance_id: Option<&str>,
    ) -> Result<Self, sqlx::Error> {
        let now = Utc::now();
        let executor_action_json = sqlx::types::Json(&data.executor_action);

        sqlx::query_as!(
            ExecutionProcess,
            r#"INSERT INTO execution_processes (
                    id, task_attempt_id, run_reason, executor_action, before_head_commit,
                    after_head_commit, status, exit_code, pid, started_at, completed_at, created_at, updated_at, server_instance_id
                ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, NULL, ?, ?, ?, ?, ?) RETURNING
                    id as "id!: Uuid", task_attempt_id as "task_attempt_id!: Uuid", run_reason as "run_reason!: ExecutionProcessRunReason", executor_action as "executor_action!: sqlx::types::Json<ExecutorActionField>", before_head_commit,
                    after_head_commit, status as "status!: ExecutionProcessStatus", exit_code, dropped, pid, started_at as "started_at!: DateTime<Utc>", completed_at as "completed_at?: DateTime<Utc>", created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>", hive_synced_at as "hive_synced_at: DateTime<Utc>", server_instance_id, completion_reason, completion_message"#,
            process_id,
            data.task_attempt_id,
            data.run_reason,
            executor_action_json,
            before_head_commit,
            ExecutionProcessStatus::Running,
            None::<i64>,
            now,
            None::<DateTime<Utc>>,
            now,
            now,
            server_instance_id
        )
        .fetch_one(pool)
        .await
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
                ta.target_branch              as target_branch,
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
                target_branch: r.target_branch,
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

    /// Find the session ID from the process immediately before a target process.
    ///
    /// This query finds the most recent execution process that:
    /// - Belongs to the same task attempt
    /// - Has run_reason = 'codingagent'
    /// - Is not dropped
    /// - Has an associated session ID
    /// - Was created before the target process
    ///
    /// Used for resuming Claude Code sessions when retrying a failed process.
    pub async fn find_session_id_before_process(
        pool: &SqlitePool,
        task_attempt_id: Uuid,
        process_id: Uuid,
    ) -> Result<Option<String>, sqlx::Error> {
        let result = sqlx::query_scalar!(
            r#"SELECT es.session_id
               FROM execution_processes ep
               JOIN executor_sessions es ON ep.id = es.execution_process_id
               WHERE ep.task_attempt_id = ?
                 AND ep.run_reason = 'codingagent'
                 AND ep.dropped = FALSE
                 AND es.session_id IS NOT NULL
                 AND ep.created_at < (SELECT created_at FROM execution_processes WHERE id = ?)
               ORDER BY ep.created_at DESC
               LIMIT 1"#,
            task_attempt_id,
            process_id
        )
        .fetch_optional(pool)
        .await?;

        // Flatten Option<Option<String>> to Option<String>
        Ok(result.flatten())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_utils::create_test_pool;
    use uuid::Uuid;

    async fn create_test_project(pool: &SqlitePool) -> Uuid {
        let id = Uuid::new_v4();
        sqlx::query(
            r#"INSERT INTO projects (id, name, git_repo_path)
               VALUES ($1, 'Test Project', '/tmp/test')"#,
        )
        .bind(id)
        .execute(pool)
        .await
        .expect("create project");
        id
    }

    async fn create_test_task(pool: &SqlitePool, project_id: Uuid) -> Uuid {
        let id = Uuid::new_v4();
        sqlx::query(
            r#"INSERT INTO tasks (id, project_id, title, status)
               VALUES ($1, $2, 'Test Task', 'inprogress')"#,
        )
        .bind(id)
        .bind(project_id)
        .execute(pool)
        .await
        .expect("create task");
        id
    }

    async fn create_test_attempt(pool: &SqlitePool, task_id: Uuid) -> Uuid {
        let id = Uuid::new_v4();
        sqlx::query(
            r#"INSERT INTO task_attempts (id, task_id, executor, branch, target_branch, container_ref)
               VALUES ($1, $2, 'CLAUDE_CODE', 'test-branch', 'main', '/tmp/test-worktree')"#,
        )
        .bind(id)
        .bind(task_id)
        .execute(pool)
        .await
        .expect("create attempt");
        id
    }

    async fn create_execution_with_session(
        pool: &SqlitePool,
        attempt_id: Uuid,
        session_id: Option<&str>,
        dropped: bool,
    ) -> Uuid {
        let exec_id = Uuid::new_v4();
        sqlx::query(
            r#"INSERT INTO execution_processes (id, task_attempt_id, status, run_reason, executor_action)
               VALUES ($1, $2, 'completed', 'codingagent', '{}')"#,
        )
        .bind(exec_id)
        .bind(attempt_id)
        .execute(pool)
        .await
        .expect("create execution");

        if dropped {
            sqlx::query("UPDATE execution_processes SET dropped = TRUE WHERE id = $1")
                .bind(exec_id)
                .execute(pool)
                .await
                .expect("mark dropped");
        }

        if let Some(sid) = session_id {
            let session_record_id = Uuid::new_v4();
            sqlx::query(
                r#"INSERT INTO executor_sessions (id, execution_process_id, task_attempt_id, session_id)
                   VALUES ($1, $2, $3, $4)"#,
            )
            .bind(session_record_id)
            .bind(exec_id)
            .bind(attempt_id)
            .bind(sid)
            .execute(pool)
            .await
            .expect("create session");
        }

        exec_id
    }

    #[tokio::test]
    async fn test_find_session_id_before_process_returns_previous_session() {
        let (pool, _temp_dir) = create_test_pool().await;
        let project_id = create_test_project(&pool).await;
        let task_id = create_test_task(&pool, project_id).await;
        let attempt_id = create_test_attempt(&pool, task_id).await;

        // Create P1 with session
        let _p1 =
            create_execution_with_session(&pool, attempt_id, Some("session-abc"), false).await;
        tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;

        // Create P2 (target)
        let p2 = create_execution_with_session(&pool, attempt_id, Some("session-def"), false).await;

        // Should find P1's session
        let result = ExecutionProcess::find_session_id_before_process(&pool, attempt_id, p2)
            .await
            .expect("query should succeed");

        assert_eq!(result, Some("session-abc".to_string()));
    }

    #[tokio::test]
    async fn test_find_session_id_before_process_returns_none_for_first() {
        let (pool, _temp_dir) = create_test_pool().await;
        let project_id = create_test_project(&pool).await;
        let task_id = create_test_task(&pool, project_id).await;
        let attempt_id = create_test_attempt(&pool, task_id).await;

        // Create only P1 with session
        let p1 =
            create_execution_with_session(&pool, attempt_id, Some("session-first"), false).await;

        // Should return None (no process before P1)
        let result = ExecutionProcess::find_session_id_before_process(&pool, attempt_id, p1)
            .await
            .expect("query should succeed");

        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_find_session_id_before_process_skips_dropped() {
        let (pool, _temp_dir) = create_test_pool().await;
        let project_id = create_test_project(&pool).await;
        let task_id = create_test_task(&pool, project_id).await;
        let attempt_id = create_test_attempt(&pool, task_id).await;

        // Create P1 with session (not dropped)
        let _p1 =
            create_execution_with_session(&pool, attempt_id, Some("session-one"), false).await;
        tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;

        // Create P2 with session (DROPPED)
        let _p2 =
            create_execution_with_session(&pool, attempt_id, Some("session-dropped"), true).await;
        tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;

        // Create P3 (target)
        let p3 =
            create_execution_with_session(&pool, attempt_id, Some("session-three"), false).await;

        // Should find P1's session (skipping dropped P2)
        let result = ExecutionProcess::find_session_id_before_process(&pool, attempt_id, p3)
            .await
            .expect("query should succeed");

        assert_eq!(result, Some("session-one".to_string()));
    }
}
