use chrono::{DateTime, Utc};
use executors::executors::BaseCodingAgent;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool, Type};
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

use super::{
    attempt_repo::{AttemptRepo, RepoWithTargetBranch},
    project::Project,
    task::Task,
};

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

#[derive(Debug, Clone, Serialize)]
pub struct ContainerInfo {
    pub attempt_id: Uuid,
    pub task_id: Uuid,
    pub project_id: Uuid,
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
    pub task_id: Uuid,
    pub container_ref: Option<String>,
    pub branch: String,
    pub executor: String,
    pub setup_completed_at: Option<DateTime<Utc>>,
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
    pub attempt_repos: Vec<RepoWithTargetBranch>,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateTaskAttempt {
    pub executor: BaseCodingAgent,
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
                              executor AS "executor!",
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
                              executor AS "executor!",
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
        let task_attempt = sqlx::query_as!(
            TaskAttempt,
            r#"SELECT  ta.id                AS "id!: Uuid",
                       ta.task_id           AS "task_id!: Uuid",
                       ta.container_ref,
                       ta.branch,
                       ta.executor AS "executor!",
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

        let attempt_repos =
            AttemptRepo::find_repos_with_target_branch_for_attempt(pool, attempt_id).await?;

        Ok(TaskAttemptContext {
            task_attempt,
            task,
            project,
            attempt_repos,
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

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskAttempt,
            r#"SELECT  id                AS "id!: Uuid",
                       task_id           AS "task_id!: Uuid",
                       container_ref,
                       branch,
                       executor AS "executor!",
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
                       executor AS "executor!",
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

    /// Find task attempts that are expired (72+ hours since last activity) and eligible for workspace cleanup
    pub async fn find_expired_for_cleanup(
        pool: &SqlitePool,
    ) -> Result<Vec<TaskAttempt>, sqlx::Error> {
        sqlx::query_as!(
            TaskAttempt,
            r#"
            SELECT
                ta.id as "id!: Uuid",
                ta.task_id as "task_id!: Uuid",
                ta.container_ref,
                ta.branch as "branch!",
                ta.executor as "executor!",
                ta.setup_completed_at as "setup_completed_at: DateTime<Utc>",
                ta.created_at as "created_at!: DateTime<Utc>",
                ta.updated_at as "updated_at!: DateTime<Utc>"
            FROM task_attempts ta
            LEFT JOIN execution_processes ep ON ta.id = ep.task_attempt_id AND ep.completed_at IS NOT NULL
            WHERE ta.container_ref IS NOT NULL
                AND ta.id NOT IN (
                    SELECT DISTINCT ep2.task_attempt_id
                    FROM execution_processes ep2
                    WHERE ep2.completed_at IS NULL
                )
            GROUP BY ta.id, ta.container_ref, ta.updated_at
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
        .await
    }

    pub async fn create(
        pool: &SqlitePool,
        data: &CreateTaskAttempt,
        id: Uuid,
        task_id: Uuid,
    ) -> Result<Self, TaskAttemptError> {
        Ok(sqlx::query_as!(
            TaskAttempt,
            r#"INSERT INTO task_attempts (id, task_id, container_ref, branch, executor, setup_completed_at)
               VALUES ($1, $2, $3, $4, $5, $6)
               RETURNING id as "id!: Uuid", task_id as "task_id!: Uuid", container_ref, branch, executor as "executor!", setup_completed_at as "setup_completed_at: DateTime<Utc>", created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            task_id,
            Option::<String>::None,
            data.branch,
            data.executor,
            Option::<DateTime<Utc>>::None
        )
        .fetch_one(pool)
        .await?)
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

    pub async fn resolve_container_ref(
        pool: &SqlitePool,
        container_ref: &str,
    ) -> Result<ContainerInfo, sqlx::Error> {
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

        Ok(ContainerInfo {
            attempt_id: result.attempt_id,
            task_id: result.task_id,
            project_id: result.project_id,
        })
    }
}
