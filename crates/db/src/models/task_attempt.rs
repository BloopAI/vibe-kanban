use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool, Type};
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

use super::{project::Project, task::Task};

#[derive(Debug)]
pub struct PrInfo {
    pub attempt_id: Uuid,
    pub task_id: Uuid,
    pub pr_number: i64,
    pub repo_owner: String,
    pub repo_name: String,
}

impl PrInfo {
    pub fn from_task_attempt_data(
        attempt_id: Uuid,
        task_id: Uuid,
        pr_number: i64,
        pr_url: &str,
    ) -> Result<Self, sqlx::Error> {
        let re = regex::Regex::new(r"github\.com/(?P<owner>[^/]+)/(?P<repo>[^/]+)").unwrap();
        let caps = re
            .captures(pr_url)
            .ok_or_else(|| sqlx::Error::ColumnNotFound("Invalid URL format".into()))?;

        let owner = caps.name("owner").unwrap().as_str().to_string();
        let repo_name = caps.name("repo").unwrap().as_str().to_string();

        Ok(Self {
            attempt_id,
            task_id,
            pr_number,
            repo_owner: owner,
            repo_name,
        })
    }
}

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
    pub branch: Option<String>,        // Git branch name for this task attempt
    pub base_branch: String,           // Base branch this attempt is based on
    pub merge_commit: Option<String>,
    pub profile: String, // Name of the base coding agent to use ("AMP", "CLAUDE_CODE",
    // "GEMINI", etc.)
    pub pr_url: Option<String>,                    // GitHub PR URL
    pub pr_number: Option<i64>,                    // GitHub PR number
    pub pr_status: Option<String>,                 // open, closed, merged
    pub pr_merged_at: Option<DateTime<Utc>>,       // When PR was merged
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

#[derive(Debug)]
pub struct TaskAttemptContext {
    pub task_attempt: TaskAttempt,
    pub task: Task,
    pub project: Project,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateTaskAttempt {
    pub profile: String,
    pub base_branch: String,
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
                              base_branch,
                              merge_commit,
                              profile AS "profile!",
                              pr_url,
                              pr_number,
                              pr_status,
                              pr_merged_at AS "pr_merged_at: DateTime<Utc>",
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
                              base_branch,
                              merge_commit,
                              profile AS "profile!",
                              pr_url,
                              pr_number,
                              pr_status,
                              pr_merged_at AS "pr_merged_at: DateTime<Utc>",
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
                       ta.base_branch,
                       ta.merge_commit,
                       ta.profile AS "profile!",
                       ta.pr_url,
                       ta.pr_number,
                       ta.pr_status,
                       ta.pr_merged_at      AS "pr_merged_at: DateTime<Utc>",
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

    pub async fn update_branch(
        pool: &SqlitePool,
        attempt_id: Uuid,
        branch: &str,
    ) -> Result<(), sqlx::Error> {
        let now = Utc::now();
        sqlx::query!(
            "UPDATE task_attempts SET branch = $1, updated_at = $2 WHERE id = $3",
            branch,
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
                       merge_commit,
                       base_branch,
                       profile AS "profile!",
                       pr_url,
                       pr_number,
                       pr_status,
                       pr_merged_at      AS "pr_merged_at: DateTime<Utc>",
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
                       merge_commit,
                       base_branch,
                       profile AS "profile!",
                       pr_url,
                       pr_number,
                       pr_status,
                       pr_merged_at      AS "pr_merged_at: DateTime<Utc>",
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

    // pub async fn find_by_task_id(
    //     pool: &SqlitePool,
    //     task_id: Uuid,
    // ) -> Result<Vec<Self>, sqlx::Error> {
    //     sqlx::query_as!(
    //         TaskAttempt,
    //         r#"SELECT  id                AS "id!: Uuid",
    //                    task_id           AS "task_id!: Uuid",
    //                    worktree_path,
    //                    branch,
    //                    base_branch,
    //                    merge_commit,
    //                    executor,
    //                    pr_url,
    //                    pr_number,
    //                    pr_status,
    //                    pr_merged_at      AS "pr_merged_at: DateTime<Utc>",
    //                    worktree_deleted  AS "worktree_deleted!: bool",
    //                    setup_completed_at AS "setup_completed_at: DateTime<Utc>",
    //                    created_at        AS "created_at!: DateTime<Utc>",
    //                    updated_at        AS "updated_at!: DateTime<Utc>"
    //            FROM    task_attempts
    //            WHERE   task_id = $1
    //            ORDER BY created_at DESC"#,
    //         task_id
    //     )
    //     .fetch_all(pool)
    //     .await
    // }

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

    /// Find task attempts that are expired (24+ hours since last activity) and eligible for worktree cleanup
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
            HAVING datetime('now', '-24 hours') > datetime(
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
        task_id: Uuid,
    ) -> Result<Self, TaskAttemptError> {
        let attempt_id = Uuid::new_v4();
        // let prefixed_id = format!("vibe-kanban-{}", attempt_id);
        // Insert the record into the database
        Ok(sqlx::query_as!(
            TaskAttempt,
            r#"INSERT INTO task_attempts (id, task_id, container_ref, branch, base_branch, merge_commit, profile, pr_url, pr_number, pr_status, pr_merged_at, worktree_deleted, setup_completed_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
               RETURNING id as "id!: Uuid", task_id as "task_id!: Uuid", container_ref, branch, base_branch, merge_commit, profile as "profile!",  pr_url, pr_number, pr_status, pr_merged_at as "pr_merged_at: DateTime<Utc>", worktree_deleted as "worktree_deleted!: bool", setup_completed_at as "setup_completed_at: DateTime<Utc>", created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>""#,
            attempt_id,
            task_id,
            Option::<String>::None, // Container isn't known yet
            Option::<String>::None, // branch name isn't known yet
            data.base_branch,
            Option::<String>::None, // merge_commit is always None during creation
            data.profile,
            Option::<String>::None, // pr_url is None during creation
            Option::<i64>::None, // pr_number is None during creation
            Option::<String>::None, // pr_status is None during creation
            Option::<DateTime<Utc>>::None, // pr_merged_at is None during creation
            false, // worktree_deleted is false during creation
            Option::<DateTime<Utc>>::None // setup_completed_at is None during creation
        )
        .fetch_one(pool)
        .await?)
    }

    /// Update the task attempt with the merge commit ID
    pub async fn update_merge_commit(
        pool: &SqlitePool,
        attempt_id: Uuid,
        merge_commit_id: &str,
    ) -> Result<(), TaskAttemptError> {
        sqlx::query!(
            "UPDATE task_attempts SET merge_commit = $1, updated_at = datetime('now') WHERE id = $2",
            merge_commit_id,
            attempt_id
        )
        .execute(pool)
        .await?;

        Ok(())
    }

    pub async fn update_base_branch(
        pool: &SqlitePool,
        attempt_id: Uuid,
        new_base_branch: &str,
    ) -> Result<(), TaskAttemptError> {
        sqlx::query!(
            "UPDATE task_attempts SET base_branch = $1, updated_at = datetime('now') WHERE id = $2",
            new_base_branch,
            attempt_id,
        )
        .execute(pool)
        .await?;

        Ok(())
    }

    /// Update PR status for a task attempt
    pub async fn update_pr_status(
        pool: &SqlitePool,
        attempt_id: Uuid,
        pr_url: String,
        pr_number: i64,
        pr_status: String,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "UPDATE task_attempts SET pr_url = $1, pr_number = $2, pr_status = $3, updated_at = datetime('now') WHERE id = $4",
            pr_url,
            pr_number,
            pr_status,
            attempt_id
        )
        .execute(pool)
        .await?;

        Ok(())
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

    pub async fn get_open_prs(pool: &SqlitePool) -> Result<Vec<PrInfo>, sqlx::Error> {
        let rows = sqlx::query!(
            r#"SELECT 
                ta.id as "attempt_id!: Uuid",
                ta.task_id as "task_id!: Uuid",
                ta.pr_number as "pr_number!: i64",
                ta.pr_url as "pr_url!: String"
               FROM task_attempts ta
               WHERE ta.pr_status = 'open' AND ta.pr_number IS NOT NULL"#
        )
        .fetch_all(pool)
        .await?;
        Ok(rows
            .into_iter()
            .filter_map(|r| {
                PrInfo::from_task_attempt_data(r.attempt_id, r.task_id, r.pr_number, &r.pr_url).ok()
            })
            .collect())
    }
}
