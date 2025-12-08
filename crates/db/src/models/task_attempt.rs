use chrono::{DateTime, Utc};
use executors::executors::BaseCodingAgent;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool, Type};
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
}

impl TaskAttempt {
    pub async fn parent_task(&self, pool: &SqlitePool) -> Result<Option<Task>, sqlx::Error> {
        Task::find_by_id(pool, self.task_id).await
    }

    /// Fetch all task attempts, optionally filtered by task_id. Newest first.
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
                              updated_at AS "updated_at!: DateTime<Utc>"
                       FROM task_attempts
                       WHERE task_id = $1
                       ORDER BY created_at DESC"#,
                tid
            )
            .fetch_all(pool)
            .await
            .map_err(TaskAttemptError::Database)?,
            None => sqlx::query_as!(
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
                              updated_at AS "updated_at!: DateTime<Utc>"
                       FROM task_attempts
                       ORDER BY created_at DESC"#
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
                       ta.updated_at        AS "updated_at!: DateTime<Utc>"
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
                       updated_at        AS "updated_at!: DateTime<Utc>"
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
                       updated_at        AS "updated_at!: DateTime<Utc>"
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
    ) -> Result<Vec<(Uuid, String)>, sqlx::Error> {
        let records = sqlx::query!(
        r#"SELECT id as "id!: Uuid", container_ref FROM task_attempts WHERE worktree_deleted = FALSE"#,
        )
        .fetch_all(pool).await?;
        Ok(records
            .into_iter()
            .filter_map(|r| r.container_ref.map(|path| (r.id, path)))
            .collect())
    }

    pub async fn container_ref_exists(
        pool: &SqlitePool,
        container_ref: &str,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query!(
            r#"SELECT EXISTS(SELECT 1 FROM task_attempts WHERE container_ref = ?) as "exists!: bool""#,
            container_ref
        )
        .fetch_one(pool)
        .await?;

        Ok(result.exists)
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
            r#"INSERT INTO task_attempts (id, task_id, container_ref, branch, target_branch, executor, worktree_deleted, setup_completed_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               RETURNING id as "id!: Uuid", task_id as "task_id!: Uuid", container_ref, branch, target_branch, executor as "executor!",  worktree_deleted as "worktree_deleted!: bool", setup_completed_at as "setup_completed_at: DateTime<Utc>", created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            task_id,
            Option::<String>::None, // Container isn't known yet
            data.branch,
            data.base_branch, // Target branch is same as base branch during creation
            data.executor,
            false, // worktree_deleted is false during creation
            Option::<DateTime<Utc>>::None // setup_completed_at is None during creation
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

    pub async fn update_target_branch_for_children_of_attempt(
        pool: &SqlitePool,
        parent_attempt_id: Uuid,
        old_branch: &str,
        new_branch: &str,
    ) -> Result<u64, TaskAttemptError> {
        let result = sqlx::query!(
            r#"UPDATE task_attempts
               SET target_branch = $3, updated_at = datetime('now')
               WHERE target_branch = $2
                 AND task_id IN (
                   SELECT id FROM tasks 
                   WHERE parent_task_attempt = $1
                 )"#,
            parent_attempt_id,
            old_branch,
            new_branch
        )
        .execute(pool)
        .await?;

        Ok(result.rows_affected())
    }

    /// Find a task attempt by its branch name within a project.
    /// Returns the most recently created attempt if multiple exist with the same branch.
    pub async fn find_by_branch(
        pool: &SqlitePool,
        project_id: Uuid,
        branch: &str,
    ) -> Result<Option<TaskAttempt>, sqlx::Error> {
        sqlx::query_as!(
            TaskAttempt,
            r#"SELECT ta.id as "id!: Uuid", ta.task_id as "task_id!: Uuid",
                      ta.container_ref, ta.branch, ta.target_branch,
                      ta.executor as "executor!", ta.worktree_deleted as "worktree_deleted!: bool",
                      ta.setup_completed_at as "setup_completed_at: DateTime<Utc>",
                      ta.created_at as "created_at!: DateTime<Utc>",
                      ta.updated_at as "updated_at!: DateTime<Utc>"
               FROM task_attempts ta
               JOIN tasks t ON ta.task_id = t.id
               WHERE t.project_id = ? AND ta.branch = ?
               ORDER BY ta.created_at DESC
               LIMIT 1"#,
            project_id,
            branch
        )
        .fetch_optional(pool)
        .await
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
               WHERE ta.container_ref = ?"#,
            container_ref
        )
        .fetch_optional(pool)
        .await?
        .ok_or(sqlx::Error::RowNotFound)?;

        Ok((result.attempt_id, result.task_id, result.project_id))
    }
}
