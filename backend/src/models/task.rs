use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool, Type};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Type, Serialize, Deserialize, PartialEq, TS)]
#[sqlx(type_name = "task_status", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum TaskStatus {
    Todo,
    InProgress,
    InReview,
    Done,
    Cancelled,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Task {
    pub id: Uuid,
    pub project_id: Uuid, // Foreign key to Project
    pub title: String,
    pub description: Option<String>,
    pub status: TaskStatus,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TaskWithAttemptStatus {
    pub id: Uuid,
    pub project_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub status: TaskStatus,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub has_in_progress_attempt: bool,
    pub has_merged_attempt: bool,
    pub has_failed_attempt: bool,
}

#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct CreateTask {
    pub project_id: Uuid,
    pub title: String,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct CreateTaskAndStart {
    pub project_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub executor: Option<crate::executor::ExecutorConfig>,
}

#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct UpdateTask {
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<TaskStatus>,
}

impl Task {
    pub async fn find_by_project_id_with_attempt_status(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Vec<TaskWithAttemptStatus>, sqlx::Error> {
        let records = sqlx::query!(
            r#"SELECT 
                t.id                  AS "id!: Uuid", 
                t.project_id          AS "project_id!: Uuid", 
                t.title, 
                t.description, 
                t.status              AS "status!: TaskStatus", 
                t.created_at          AS "created_at!: DateTime<Utc>", 
                t.updated_at          AS "updated_at!: DateTime<Utc>",
                CASE 
                WHEN in_progress_attempts.task_id IS NOT NULL THEN true 
                ELSE false 
                END                   AS "has_in_progress_attempt!: i64",
                CASE 
                WHEN merged_attempts.task_id IS NOT NULL THEN true 
                ELSE false 
                END                   AS "has_merged_attempt!",
                CASE 
                WHEN failed_attempts.task_id IS NOT NULL THEN true 
                ELSE false 
                END                   AS "has_failed_attempt!"
            FROM tasks t
            LEFT JOIN (
                SELECT DISTINCT ta.task_id
                FROM task_attempts ta
                JOIN execution_processes ep 
                ON ta.id = ep.task_attempt_id
                JOIN (
                    -- pick exactly one “latest” activity per process,
                    -- tiebreaking so that running‐states are lower priority
                    SELECT execution_process_id, status
                    FROM (
                        SELECT
                            execution_process_id,
                            status,
                            ROW_NUMBER() OVER (
                                PARTITION BY execution_process_id
                                ORDER BY
                                    created_at DESC,
                                    CASE 
                                    WHEN status IN ('setuprunning','executorrunning') THEN 1 
                                    ELSE 0 
                                    END
                            ) AS rn
                        FROM task_attempt_activities
                    ) sub
                    WHERE rn = 1
                ) latest_act 
                ON ep.id = latest_act.execution_process_id
                WHERE latest_act.status IN ('setuprunning','executorrunning')
            ) in_progress_attempts 
            ON t.id = in_progress_attempts.task_id
            LEFT JOIN (
                SELECT DISTINCT ta.task_id
                FROM task_attempts ta
                WHERE ta.merge_commit IS NOT NULL
            ) merged_attempts 
            ON t.id = merged_attempts.task_id
            LEFT JOIN (
                SELECT DISTINCT ta.task_id
                FROM task_attempts ta
                JOIN execution_processes ep 
                ON ta.id = ep.task_attempt_id
                JOIN (
                    -- pick exactly one "latest" activity per process,
                    -- tiebreaking so that running‐states are lower priority
                    SELECT execution_process_id, status
                    FROM (
                        SELECT
                            execution_process_id,
                            status,
                            ROW_NUMBER() OVER (
                                PARTITION BY execution_process_id
                                ORDER BY
                                    created_at DESC,
                                    CASE 
                                    WHEN status IN ('setuprunning','executorrunning') THEN 1 
                                    ELSE 0 
                                    END
                            ) AS rn
                        FROM task_attempt_activities
                    ) sub
                    WHERE rn = 1
                ) latest_act 
                ON ep.id = latest_act.execution_process_id
                WHERE latest_act.status IN ('setupfailed','executorfailed')
                  AND ta.merge_commit IS NULL  -- Don't show as failed if already merged
            ) failed_attempts 
            ON t.id = failed_attempts.task_id
            WHERE t.project_id = $1
            ORDER BY t.created_at DESC;
            "#,
            project_id
        )
        .fetch_all(pool)
        .await?;

        let tasks = records
            .into_iter()
            .map(|record| TaskWithAttemptStatus {
                id: record.id,
                project_id: record.project_id,
                title: record.title,
                description: record.description,
                status: record.status,
                created_at: record.created_at,
                updated_at: record.updated_at,
                has_in_progress_attempt: record.has_in_progress_attempt != 0,
                has_merged_attempt: record.has_merged_attempt != 0,
                has_failed_attempt: record.has_failed_attempt != 0,
            })
            .collect();

        Ok(tasks)
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Task,
            r#"SELECT id as "id!: Uuid", project_id as "project_id!: Uuid", title, description, status as "status!: TaskStatus", created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>"
               FROM tasks 
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_id_and_project_id(
        pool: &SqlitePool,
        id: Uuid,
        project_id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Task,
            r#"SELECT id as "id!: Uuid", project_id as "project_id!: Uuid", title, description, status as "status!: TaskStatus", created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>"
               FROM tasks 
               WHERE id = $1 AND project_id = $2"#,
            id,
            project_id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn create(
        pool: &SqlitePool,
        data: &CreateTask,
        task_id: Uuid,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as!(
            Task,
            r#"INSERT INTO tasks (id, project_id, title, description, status) 
               VALUES ($1, $2, $3, $4, $5) 
               RETURNING id as "id!: Uuid", project_id as "project_id!: Uuid", title, description, status as "status!: TaskStatus", created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>""#,
            task_id,
            data.project_id,
            data.title,
            data.description,
            TaskStatus::Todo as TaskStatus
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        project_id: Uuid,
        title: String,
        description: Option<String>,
        status: TaskStatus,
    ) -> Result<Self, sqlx::Error> {
        let status_value = status as TaskStatus;
        sqlx::query_as!(
            Task,
            r#"UPDATE tasks 
               SET title = $3, description = $4, status = $5 
               WHERE id = $1 AND project_id = $2 
               RETURNING id as "id!: Uuid", project_id as "project_id!: Uuid", title, description, status as "status!: TaskStatus", created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            project_id,
            title,
            description,
            status_value
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update_status(
        pool: &SqlitePool,
        id: Uuid,
        project_id: Uuid,
        status: TaskStatus,
    ) -> Result<(), sqlx::Error> {
        let status_value = status as TaskStatus;
        sqlx::query!(
            "UPDATE tasks SET status = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND project_id = $2",
            id,
            project_id,
            status_value
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn delete(pool: &SqlitePool, id: Uuid, project_id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!(
            "DELETE FROM tasks WHERE id = $1 AND project_id = $2",
            id,
            project_id
        )
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }

    pub async fn exists(
        pool: &SqlitePool,
        id: Uuid,
        project_id: Uuid,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query!(
            "SELECT id as \"id!: Uuid\" FROM tasks WHERE id = $1 AND project_id = $2",
            id,
            project_id
        )
        .fetch_optional(pool)
        .await?;
        Ok(result.is_some())
    }

    pub async fn find_task_by_title(
        pool: &SqlitePool,
        project_id: Uuid,
        title: &str,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Task,
            r#"SELECT id as "id!: Uuid", project_id as "project_id!: Uuid", title, description, status as "status!: TaskStatus", created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>"
               FROM tasks 
               WHERE project_id = $1 AND title = $2
               LIMIT 1"#,
            project_id,
            title
        )
        .fetch_optional(pool)
        .await
    }
}
