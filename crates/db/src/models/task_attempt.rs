use chrono::{DateTime, Utc};
use executors::executors::BaseCodingAgent;
use serde::{Deserialize, Serialize};
use sqlx::{Executor, FromRow, Sqlite, SqlitePool, Type};
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

use super::{project::Project, task::Task};

#[derive(Debug, Error)]
pub enum TaskAttemptError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error("Task not found")]
    TaskNotFound,
    #[error("Project not found")]
    ProjectNotFound,
    #[error("Validation error: {0}")]
    ValidationError(String),
    #[error("Branch not found: {0}")]
    BranchNotFound(String),
}

#[derive(Debug, Clone, Type, Serialize, Deserialize, PartialEq, TS)]
#[sqlx(type_name = "task_attempt_status", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum TaskAttemptStatus {
    SetupRunning,
    SetupComplete,
    SetupFailed,
    ExecutorRunning,
    ExecutorComplete,
    ExecutorFailed,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct TaskAttempt {
    pub id: Uuid,
    pub task_id: Uuid,                 // Foreign key to Task
    pub container_ref: Option<String>, // Path to a worktree (local), or cloud container id
    pub branch: String,                // Git branch name for this task attempt
    pub target_branch: String,         // Target branch for this attempt
    pub executor: String, // Name of the base coding agent to use ("AMP", "CLAUDE_CODE",
    // "GEMINI", etc.)
    pub worktree_deleted: bool, // Flag indicating if worktree has been cleaned up
    pub setup_completed_at: Option<DateTime<Utc>>, // When setup script was last completed
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    /// When this attempt was last synced to the Hive. NULL means not yet synced.
    #[ts(optional)]
    pub hive_synced_at: Option<DateTime<Utc>>,
    /// The assignment ID from the Hive for tasks dispatched by the Hive.
    /// NULL for locally-started tasks until a synthetic assignment is created.
    #[ts(optional)]
    pub hive_assignment_id: Option<Uuid>,
    /// The node ID that created this attempt. NULL for legacy data (treated as local).
    /// Used for hybrid local+Hive queries: local attempts are always queried from local DB.
    #[ts(optional)]
    pub origin_node_id: Option<Uuid>,
}

/// GitHub PR creation parameters
pub struct CreatePrParams<'a> {
    pub attempt_id: Uuid,
    pub task_id: Uuid,
    pub project_id: Uuid,
    pub github_token: &'a str,
    pub title: &'a str,
    pub body: Option<&'a str>,
    pub base_branch: Option<&'a str>,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateFollowUpAttempt {
    pub prompt: String,
}

/// Context data for resume operations (simplified)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttemptResumeContext {
    pub execution_history: String,
    pub cumulative_diffs: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskAttemptContext {
    pub task_attempt: TaskAttempt,
    pub task: Task,
    pub project: Project,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateTaskAttempt {
    pub executor: BaseCodingAgent,
    pub base_branch: String,
    pub branch: String,
    /// The node ID creating this attempt. None for non-swarm or legacy operations.
    #[ts(optional)]
    #[serde(default)]
    pub origin_node_id: Option<Uuid>,
}

impl TaskAttempt {
    pub async fn parent_task(&self, pool: &SqlitePool) -> Result<Option<Task>, sqlx::Error> {
        Task::find_by_id(pool, self.task_id).await
    }

    /// Fetch all task attempts, optionally filtered by task_id. Newest first.
    /// When task_id is None, limits results to the most recent 500 attempts.
    pub async fn fetch_all(
        pool: &SqlitePool,
        task_id: Option<Uuid>,
    ) -> Result<Vec<Self>, TaskAttemptError> {
        let attempts = match task_id {
            Some(tid) => sqlx::query_as!(
                TaskAttempt,
                r#"SELECT id AS "id!: Uuid",
                              task_id AS "task_id!: Uuid",
                              container_ref,
                              branch,
                              target_branch,
                              executor AS "executor!",
                              worktree_deleted AS "worktree_deleted!: bool",
                              setup_completed_at AS "setup_completed_at: DateTime<Utc>",
                              created_at AS "created_at!: DateTime<Utc>",
                              updated_at AS "updated_at!: DateTime<Utc>",
                              hive_synced_at AS "hive_synced_at: DateTime<Utc>",
                              hive_assignment_id AS "hive_assignment_id: Uuid",
                              origin_node_id AS "origin_node_id: Uuid"
                       FROM task_attempts
                       WHERE task_id = $1
                       ORDER BY created_at DESC"#,
                tid
            )
            .fetch_all(pool)
            .await
            .map_err(TaskAttemptError::Database)?,
            // Use runtime query (not macro) so adding LIMIT doesn't invalidate the .sqlx cache
            None => sqlx::query_as::<_, TaskAttempt>(
                r#"SELECT id, task_id, container_ref, branch, target_branch, executor,
                              worktree_deleted, setup_completed_at, created_at, updated_at,
                              hive_synced_at, hive_assignment_id, origin_node_id
                       FROM task_attempts
                       ORDER BY created_at DESC
                       LIMIT 500"#,
            )
            .fetch_all(pool)
            .await
            .map_err(TaskAttemptError::Database)?,
        };

        Ok(attempts)
    }

    /// Load task attempt with full validation - ensures task_attempt belongs to task and task belongs to project
    pub async fn load_context(
        pool: &SqlitePool,
        attempt_id: Uuid,
        task_id: Uuid,
        project_id: Uuid,
    ) -> Result<TaskAttemptContext, TaskAttemptError> {
        // Single query with JOIN validation to ensure proper relationships
        let task_attempt = sqlx::query_as!(
            TaskAttempt,
            r#"SELECT  ta.id                AS "id!: Uuid",
                       ta.task_id           AS "task_id!: Uuid",
                       ta.container_ref,
                       ta.branch,
                       ta.target_branch,
                       ta.executor AS "executor!",
                       ta.worktree_deleted  AS "worktree_deleted!: bool",
                       ta.setup_completed_at AS "setup_completed_at: DateTime<Utc>",
                       ta.created_at        AS "created_at!: DateTime<Utc>",
                       ta.updated_at        AS "updated_at!: DateTime<Utc>",
                       ta.hive_synced_at    AS "hive_synced_at: DateTime<Utc>",
                       ta.hive_assignment_id AS "hive_assignment_id: Uuid",
                       ta.origin_node_id    AS "origin_node_id: Uuid"
               FROM    task_attempts ta
               JOIN    tasks t ON ta.task_id = t.id
               JOIN    projects p ON t.project_id = p.id
               WHERE   ta.id = $1 AND t.id = $2 AND p.id = $3"#,
            attempt_id,
            task_id,
            project_id
        )
        .fetch_optional(pool)
        .await?
        .ok_or(TaskAttemptError::TaskNotFound)?;

        // Load task and project (we know they exist due to JOIN validation)
        let task = Task::find_by_id(pool, task_id)
            .await?
            .ok_or(TaskAttemptError::TaskNotFound)?;

        let project = Project::find_by_id(pool, project_id)
            .await?
            .ok_or(TaskAttemptError::ProjectNotFound)?;

        Ok(TaskAttemptContext {
            task_attempt,
            task,
            project,
        })
    }

    /// Update container reference
    pub async fn update_container_ref(
        pool: &SqlitePool,
        attempt_id: Uuid,
        container_ref: &str,
    ) -> Result<(), sqlx::Error> {
        let now = Utc::now();
        sqlx::query!(
            "UPDATE task_attempts SET container_ref = $1, updated_at = $2 WHERE id = $3",
            container_ref,
            now,
            attempt_id
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Helper function to mark a worktree as deleted in the database
    pub async fn mark_worktree_deleted(
        pool: &SqlitePool,
        attempt_id: Uuid,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "UPDATE task_attempts SET worktree_deleted = TRUE, updated_at = datetime('now') WHERE id = ?",
            attempt_id
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskAttempt,
            r#"SELECT  id                AS "id!: Uuid",
                       task_id           AS "task_id!: Uuid",
                       container_ref,
                       branch,
                       target_branch,
                       executor AS "executor!",
                       worktree_deleted  AS "worktree_deleted!: bool",
                       setup_completed_at AS "setup_completed_at: DateTime<Utc>",
                       created_at        AS "created_at!: DateTime<Utc>",
                       updated_at        AS "updated_at!: DateTime<Utc>",
                       hive_synced_at    AS "hive_synced_at: DateTime<Utc>",
                       hive_assignment_id AS "hive_assignment_id: Uuid",
                       origin_node_id    AS "origin_node_id: Uuid"
               FROM    task_attempts
               WHERE   id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_rowid(pool: &SqlitePool, rowid: i64) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskAttempt,
            r#"SELECT  id                AS "id!: Uuid",
                       task_id           AS "task_id!: Uuid",
                       container_ref,
                       branch,
                       target_branch,
                       executor AS "executor!",
                       worktree_deleted  AS "worktree_deleted!: bool",
                       setup_completed_at AS "setup_completed_at: DateTime<Utc>",
                       created_at        AS "created_at!: DateTime<Utc>",
                       updated_at        AS "updated_at!: DateTime<Utc>",
                       hive_synced_at    AS "hive_synced_at: DateTime<Utc>",
                       hive_assignment_id AS "hive_assignment_id: Uuid",
                       origin_node_id    AS "origin_node_id: Uuid"
               FROM    task_attempts
               WHERE   rowid = $1"#,
            rowid
        )
        .fetch_optional(pool)
        .await
    }

    /// Find task attempts by task_id with project git repo path for cleanup operations
    pub async fn find_by_task_id_with_project(
        pool: &SqlitePool,
        task_id: Uuid,
    ) -> Result<Vec<(Uuid, Option<String>, String)>, sqlx::Error> {
        let records = sqlx::query!(
            r#"
            SELECT ta.id as "attempt_id!: Uuid", ta.container_ref, p.git_repo_path as "git_repo_path!"
            FROM task_attempts ta
            JOIN tasks t ON ta.task_id = t.id
            JOIN projects p ON t.project_id = p.id
            WHERE ta.task_id = $1
            "#,
            task_id
        )
        .fetch_all(pool)
        .await?;

        Ok(records
            .into_iter()
            .map(|r| (r.attempt_id, r.container_ref, r.git_repo_path))
            .collect())
    }

    pub async fn find_by_worktree_deleted(
        pool: &SqlitePool,
    ) -> Result<Vec<(Uuid, String, DateTime<Utc>)>, sqlx::Error> {
        let records = sqlx::query!(
        r#"SELECT id as "id!: Uuid", container_ref, updated_at as "updated_at!: DateTime<Utc>" FROM task_attempts WHERE worktree_deleted = FALSE"#,
        )
        .fetch_all(pool).await?;
        Ok(records
            .into_iter()
            .filter_map(|r| r.container_ref.map(|path| (r.id, path, r.updated_at)))
            .collect())
    }

    pub async fn container_ref_exists(
        pool: &SqlitePool,
        container_ref: &str,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query!(
            r#"SELECT EXISTS(SELECT 1 FROM task_attempts WHERE container_ref = ? AND worktree_deleted = FALSE) as "exists!: bool""#,
            container_ref
        )
        .fetch_one(pool)
        .await?;

        Ok(result.exists)
    }

    /// Clear the container_ref for an attempt — used to roll back a DB reservation if disk
    /// creation subsequently fails (pairs with `update_container_ref`).
    pub async fn clear_container_ref(
        pool: &SqlitePool,
        attempt_id: Uuid,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "UPDATE task_attempts SET container_ref = NULL, updated_at = datetime('now') WHERE id = ?",
            attempt_id
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Reset the worktree_deleted flag to FALSE — mirrors `mark_worktree_deleted`.
    /// Used after a successful `ensure_worktree_exists` to clear any flag that was set
    /// incorrectly during the creation-window race.
    ///
    /// The WHERE clause includes `AND worktree_deleted = TRUE` so the UPDATE is a no-op
    /// (and does NOT bump `updated_at`) when the flag is already FALSE. This is important
    /// because `updated_at` feeds the 72-hour expiry query in `find_expired_for_cleanup`;
    /// bumping it on every `ensure_container_exists` call would silently reset the cleanup
    /// clock and cause worktrees to accumulate indefinitely.
    pub async fn reset_worktree_deleted(
        pool: &SqlitePool,
        attempt_id: Uuid,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "UPDATE task_attempts SET worktree_deleted = FALSE, updated_at = datetime('now') WHERE id = ? AND worktree_deleted = TRUE",
            attempt_id
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Find task attempts that are expired (72+ hours since last activity) and eligible for worktree cleanup
    /// Activity includes: execution completion, task attempt updates (including worktree recreation),
    /// and any attempts that are currently in progress
    pub async fn find_expired_for_cleanup(
        pool: &SqlitePool,
    ) -> Result<Vec<(Uuid, String, String)>, sqlx::Error> {
        let records = sqlx::query!(
            r#"
            SELECT ta.id as "attempt_id!: Uuid", ta.container_ref, p.git_repo_path as "git_repo_path!"
            FROM task_attempts ta
            LEFT JOIN execution_processes ep ON ta.id = ep.task_attempt_id AND ep.completed_at IS NOT NULL
            JOIN tasks t ON ta.task_id = t.id
            JOIN projects p ON t.project_id = p.id
            WHERE ta.worktree_deleted = FALSE
                -- Exclude attempts with any running processes (in progress)
                AND ta.id NOT IN (
                    SELECT DISTINCT ep2.task_attempt_id
                    FROM execution_processes ep2
                    WHERE ep2.completed_at IS NULL
                )
            GROUP BY ta.id, ta.container_ref, p.git_repo_path, ta.updated_at
            HAVING datetime('now', '-72 hours') > datetime(
                MAX(
                    CASE
                        WHEN ep.completed_at IS NOT NULL THEN ep.completed_at
                        ELSE ta.updated_at
                    END
                )
            )
            ORDER BY MAX(
                CASE
                    WHEN ep.completed_at IS NOT NULL THEN ep.completed_at
                    ELSE ta.updated_at
                END
            ) ASC
            "#
        )
        .fetch_all(pool)
        .await?;

        Ok(records
            .into_iter()
            .filter_map(|r| {
                r.container_ref
                    .map(|path| (r.attempt_id, path, r.git_repo_path))
            })
            .collect())
    }

    pub async fn create(
        pool: &SqlitePool,
        data: &CreateTaskAttempt,
        id: Uuid,
        task_id: Uuid,
    ) -> Result<Self, TaskAttemptError> {
        // let prefixed_id = format!("vibe-kanban-{}", attempt_id);
        // Insert the record into the database
        Ok(sqlx::query_as!(
            TaskAttempt,
            r#"INSERT INTO task_attempts (id, task_id, container_ref, branch, target_branch, executor, worktree_deleted, setup_completed_at, origin_node_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
               RETURNING id as "id!: Uuid", task_id as "task_id!: Uuid", container_ref, branch, target_branch, executor as "executor!",  worktree_deleted as "worktree_deleted!: bool", setup_completed_at as "setup_completed_at: DateTime<Utc>", created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>", hive_synced_at as "hive_synced_at: DateTime<Utc>", hive_assignment_id as "hive_assignment_id: Uuid", origin_node_id as "origin_node_id: Uuid""#,
            id,
            task_id,
            Option::<String>::None, // Container isn't known yet
            data.branch,
            data.base_branch, // Target branch is same as base branch during creation
            data.executor,
            false, // worktree_deleted is false during creation
            Option::<DateTime<Utc>>::None, // setup_completed_at is None during creation
            data.origin_node_id // origin_node_id for tracking which node created this attempt
        )
        .fetch_one(pool)
        .await?)
    }

    pub async fn update_target_branch(
        pool: &SqlitePool,
        attempt_id: Uuid,
        new_target_branch: &str,
    ) -> Result<(), TaskAttemptError> {
        sqlx::query!(
            "UPDATE task_attempts SET target_branch = $1, updated_at = datetime('now') WHERE id = $2",
            new_target_branch,
            attempt_id,
        )
        .execute(pool)
        .await?;

        Ok(())
    }

    pub async fn update_branch_name(
        pool: &SqlitePool,
        attempt_id: Uuid,
        new_branch_name: &str,
    ) -> Result<(), TaskAttemptError> {
        sqlx::query!(
            "UPDATE task_attempts SET branch = $1, updated_at = datetime('now') WHERE id = $2",
            new_branch_name,
            attempt_id,
        )
        .execute(pool)
        .await?;

        Ok(())
    }

    pub async fn update_target_branch_for_children_of_task(
        pool: &SqlitePool,
        parent_task_id: Uuid,
        old_branch: &str,
        new_branch: &str,
    ) -> Result<u64, TaskAttemptError> {
        let result = sqlx::query!(
            r#"UPDATE task_attempts
               SET target_branch = $3, updated_at = datetime('now')
               WHERE target_branch = $2
                 AND task_id IN (
                   SELECT id FROM tasks
                   WHERE parent_task_id = $1
                 )"#,
            parent_task_id,
            old_branch,
            new_branch
        )
        .execute(pool)
        .await?;

        Ok(result.rows_affected())
    }

    pub async fn resolve_container_ref(
        pool: &SqlitePool,
        container_ref: &str,
    ) -> Result<(Uuid, Uuid, Uuid), sqlx::Error> {
        let result = sqlx::query!(
            r#"SELECT ta.id as "attempt_id!: Uuid",
                      ta.task_id as "task_id!: Uuid",
                      t.project_id as "project_id!: Uuid"
               FROM task_attempts ta
               JOIN tasks t ON ta.task_id = t.id
               LEFT JOIN execution_processes ep ON ep.task_attempt_id = ta.id
                   AND ep.status = 'running'
               WHERE ta.container_ref = ?
               ORDER BY
                   CASE WHEN ep.id IS NOT NULL THEN 0 ELSE 1 END,
                   ep.started_at DESC,
                   ta.created_at DESC
               LIMIT 1"#,
            container_ref
        )
        .fetch_optional(pool)
        .await?
        .ok_or(sqlx::Error::RowNotFound)?;

        Ok((result.attempt_id, result.task_id, result.project_id))
    }

    /// Check if any attempt for this task shares a container_ref with parent task's attempts.
    /// This indicates the task is using a shared worktree from its parent.
    ///
    /// Returns true if any attempt shares container_ref with parent, false otherwise.
    pub async fn task_uses_shared_worktree(
        pool: &SqlitePool,
        task_id: Uuid,
        parent_task_id: Uuid,
    ) -> Result<bool, sqlx::Error> {
        // Use a single SQL query to check for any matching container_ref
        // This is more efficient than fetching all attempts and comparing in Rust
        let result = sqlx::query!(
            r#"SELECT EXISTS(
                SELECT 1 FROM task_attempts child
                JOIN task_attempts parent ON child.container_ref = parent.container_ref
                WHERE child.task_id = $1
                  AND parent.task_id = $2
                  AND child.container_ref IS NOT NULL
            ) as "exists!: bool""#,
            task_id,
            parent_task_id
        )
        .fetch_one(pool)
        .await?;

        Ok(result.exists)
    }

    /// Find active task attempts that don't have a PR merge record.
    /// "Active" means the parent task is NOT in done/cancelled status.
    /// Returns tuples of (attempt_id, branch, github_owner, github_repo).
    ///
    /// This is used by the PR monitor to discover PRs that were created by
    /// agents but not yet tracked in our database.
    pub async fn find_active_without_pr(
        pool: &SqlitePool,
    ) -> Result<Vec<(Uuid, String, String, String)>, sqlx::Error> {
        let records = sqlx::query!(
            r#"
            SELECT
                ta.id as "attempt_id!: Uuid",
                ta.branch as "branch!",
                p.github_owner as "github_owner!",
                p.github_repo as "github_repo!"
            FROM task_attempts ta
            JOIN tasks t ON ta.task_id = t.id
            JOIN projects p ON t.project_id = p.id
            LEFT JOIN merges m ON ta.id = m.task_attempt_id AND m.merge_type = 'pr'
            WHERE
                -- Only for tasks not in terminal states
                t.status NOT IN ('done', 'cancelled')
                -- Only for projects with GitHub enabled
                AND p.github_enabled = TRUE
                AND p.github_owner IS NOT NULL
                AND p.github_repo IS NOT NULL
                -- Only for attempts that don't have a PR merge record
                AND m.id IS NULL
            ORDER BY ta.created_at DESC
            "#
        )
        .fetch_all(pool)
        .await?;

        Ok(records
            .into_iter()
            .map(|r| (r.attempt_id, r.branch, r.github_owner, r.github_repo))
            .collect())
    }

    /// Find task attempts that have not been synced to the Hive.
    /// Returns attempts ordered by created_at (oldest first) for incremental sync.
    pub async fn find_unsynced(pool: &SqlitePool, limit: i64) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskAttempt,
            r#"SELECT  id                AS "id!: Uuid",
                       task_id           AS "task_id!: Uuid",
                       container_ref,
                       branch,
                       target_branch,
                       executor AS "executor!",
                       worktree_deleted  AS "worktree_deleted!: bool",
                       setup_completed_at AS "setup_completed_at: DateTime<Utc>",
                       created_at        AS "created_at!: DateTime<Utc>",
                       updated_at        AS "updated_at!: DateTime<Utc>",
                       hive_synced_at    AS "hive_synced_at: DateTime<Utc>",
                       hive_assignment_id AS "hive_assignment_id: Uuid",
                       origin_node_id    AS "origin_node_id: Uuid"
               FROM    task_attempts
               WHERE   hive_synced_at IS NULL
               ORDER BY created_at ASC
               LIMIT $1"#,
            limit
        )
        .fetch_all(pool)
        .await
    }

    /// Count task attempts that have not been synced to the Hive.
    /// Useful for monitoring sync status.
    pub async fn count_unsynced(pool: &SqlitePool) -> Result<i64, sqlx::Error> {
        let result = sqlx::query!(
            r#"SELECT COUNT(*) as "count!" FROM task_attempts WHERE hive_synced_at IS NULL"#
        )
        .fetch_one(pool)
        .await?;
        Ok(result.count)
    }

    /// Mark a task attempt as synced to the Hive.
    pub async fn mark_hive_synced(pool: &SqlitePool, id: Uuid) -> Result<(), sqlx::Error> {
        let now = Utc::now();
        sqlx::query!(
            "UPDATE task_attempts SET hive_synced_at = $1 WHERE id = $2",
            now,
            id
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Mark multiple task attempts as synced to the Hive.
    pub async fn mark_hive_synced_batch(
        pool: &SqlitePool,
        ids: &[Uuid],
    ) -> Result<u64, sqlx::Error> {
        if ids.is_empty() {
            return Ok(0);
        }

        let now = Utc::now();
        // Build a query with placeholders for all IDs
        let placeholders: Vec<String> = (1..=ids.len()).map(|i| format!("${}", i + 1)).collect();
        let query = format!(
            "UPDATE task_attempts SET hive_synced_at = $1 WHERE id IN ({})",
            placeholders.join(", ")
        );

        let mut query_builder = sqlx::query(&query).bind(now);
        for id in ids {
            query_builder = query_builder.bind(id);
        }

        let result = query_builder.execute(pool).await?;
        Ok(result.rows_affected())
    }

    /// Set the Hive assignment ID for this attempt.
    /// This is called when a task is dispatched by the Hive to store the assignment relationship.
    pub async fn set_hive_assignment_id(
        pool: &SqlitePool,
        id: Uuid,
        assignment_id: Uuid,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "UPDATE task_attempts SET hive_assignment_id = $1, updated_at = datetime('now') WHERE id = $2",
            assignment_id,
            id
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Find a task attempt by its Hive assignment ID.
    pub async fn find_by_hive_assignment_id(
        pool: &SqlitePool,
        assignment_id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskAttempt,
            r#"SELECT  id                AS "id!: Uuid",
                       task_id           AS "task_id!: Uuid",
                       container_ref,
                       branch,
                       target_branch,
                       executor AS "executor!",
                       worktree_deleted  AS "worktree_deleted!: bool",
                       setup_completed_at AS "setup_completed_at: DateTime<Utc>",
                       created_at        AS "created_at!: DateTime<Utc>",
                       updated_at        AS "updated_at!: DateTime<Utc>",
                       hive_synced_at    AS "hive_synced_at: DateTime<Utc>",
                       hive_assignment_id AS "hive_assignment_id: Uuid",
                       origin_node_id    AS "origin_node_id: Uuid"
               FROM    task_attempts
               WHERE   hive_assignment_id = $1"#,
            assignment_id
        )
        .fetch_optional(pool)
        .await
    }

    /// Clear hive_synced_at for all attempts in a project.
    /// This is used when unlinking a project from a shared task to trigger re-sync.
    pub async fn clear_hive_sync_for_project(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!(
            r#"UPDATE task_attempts
               SET hive_synced_at = NULL
               WHERE task_id IN (
                   SELECT id FROM tasks WHERE project_id = $1
               )"#,
            project_id
        )
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }

    /// Clears the stored Hive sync timestamp for all task attempts belonging to a project.
    ///
    /// Sets `hive_synced_at` to `NULL` for every `task_attempts` row whose parent `task` references the provided `project_id`.
    ///
    /// # Returns
    ///
    /// The number of task attempt rows that were updated.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// # use sqlx::SqlitePool;
    /// # use uuid::Uuid;
    /// # async fn example(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    /// let project_id = Uuid::parse_str("00000000-0000-0000-0000-000000000000").unwrap();
    /// let updated = crate::models::task_attempt::TaskAttempt::clear_hive_sync_for_project_tx(pool, project_id).await?;
    /// println!("Updated {} rows", updated);
    /// # Ok(())
    /// # }
    /// ```
    pub async fn clear_hive_sync_for_project_tx<'e, E>(
        executor: E,
        project_id: Uuid,
    ) -> Result<u64, sqlx::Error>
    where
        E: Executor<'e, Database = Sqlite>,
    {
        let result = sqlx::query!(
            r#"UPDATE task_attempts
               SET hive_synced_at = NULL
               FROM tasks
               WHERE task_attempts.task_id = tasks.id
                 AND tasks.project_id = $1"#,
            project_id
        )
        .execute(executor)
        .await?;
        Ok(result.rows_affected())
    }

    /// Clear hive_synced_at for all attempts of a specific task.
    /// This triggers re-sync of attempts when the task's shared_task_id changes.
    pub async fn clear_hive_sync_for_task(
        pool: &SqlitePool,
        task_id: Uuid,
    ) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!(
            r#"UPDATE task_attempts
               SET hive_synced_at = NULL
               WHERE task_id = $1"#,
            task_id
        )
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }

    /// Remove the task attempt record with the given ID from the database.
    ///
    /// This is intended for cleanup of failed or partially created attempts (for example, when worktree creation fails).
    ///
    /// # Examples
    ///
    /// ```
    /// # async fn example(pool: &sqlx::SqlitePool, id: uuid::Uuid) -> Result<(), sqlx::Error> {
    /// TaskAttempt::delete(pool, id).await?;
    /// # Ok(())
    /// # }
    /// ```
    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query!("DELETE FROM task_attempts WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::execution_process::{
        CreateExecutionProcess, ExecutionProcess, ExecutionProcessRunReason,
    };
    use crate::models::project::{CreateProject, Project};
    use crate::models::task::{CreateTask, Task};
    use crate::test_utils::create_test_pool;
    use executors::actions::{
        ExecutorAction, ExecutorActionType, coding_agent_initial::CodingAgentInitialRequest,
    };
    use executors::executors::BaseCodingAgent;
    use executors::profile::ExecutorProfileId;

    #[tokio::test]
    async fn test_resolve_container_ref_prioritizes_running_process() {
        let (pool, _temp_dir) = create_test_pool().await;

        // Create project
        let project_data = CreateProject {
            name: "test-project".to_string(),
            git_repo_path: "/tmp/test-repo".to_string(),
            use_existing_repo: true,
            clone_url: None,
            setup_script: None,
            dev_script: None,
            cleanup_script: None,
            copy_files: None,
        };
        let project = Project::create(&pool, &project_data, Uuid::new_v4())
            .await
            .unwrap();

        // Create task
        let task_data = CreateTask {
            project_id: project.id,
            title: "test-task".to_string(),
            description: None,
            status: None,
            parent_task_id: None,
            image_ids: None,
            shared_task_id: None,
        };
        let task = Task::create(&pool, &task_data, Uuid::new_v4())
            .await
            .unwrap();

        // Create two attempts with same container_ref
        let attempt_data = CreateTaskAttempt {
            executor: BaseCodingAgent::ClaudeCode,
            base_branch: "main".to_string(),
            branch: "feature-1".to_string(),
            origin_node_id: None,
        };
        let attempt1 = TaskAttempt::create(&pool, &attempt_data, Uuid::new_v4(), task.id)
            .await
            .unwrap();
        let attempt2 = TaskAttempt::create(&pool, &attempt_data, Uuid::new_v4(), task.id)
            .await
            .unwrap();

        // Set same container_ref for both attempts
        let container_ref = "/tmp/shared-worktree";
        TaskAttempt::update_container_ref(&pool, attempt1.id, container_ref)
            .await
            .unwrap();
        TaskAttempt::update_container_ref(&pool, attempt2.id, container_ref)
            .await
            .unwrap();

        // Create running execution_process for attempt2
        let initial_request = CodingAgentInitialRequest {
            prompt: "test prompt".to_string(),
            executor_profile_id: ExecutorProfileId::new(BaseCodingAgent::ClaudeCode),
        };
        let exec_data = CreateExecutionProcess {
            task_attempt_id: attempt2.id,
            executor_action: ExecutorAction::new(
                ExecutorActionType::CodingAgentInitialRequest(initial_request),
                None,
            ),
            run_reason: ExecutionProcessRunReason::CodingAgent,
        };
        ExecutionProcess::create(&pool, &exec_data, Uuid::new_v4(), None, None)
            .await
            .unwrap();

        // Resolve should return attempt2 (has running process)
        let (resolved_attempt_id, resolved_task_id, resolved_project_id) =
            TaskAttempt::resolve_container_ref(&pool, container_ref)
                .await
                .unwrap();

        assert_eq!(
            resolved_attempt_id, attempt2.id,
            "Should resolve to attempt with running process"
        );
        assert_eq!(resolved_task_id, task.id);
        assert_eq!(resolved_project_id, project.id);
    }
}
