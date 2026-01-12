use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Executor, Postgres};
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskComment {
    pub id: Uuid,
    pub task_id: Uuid,
    pub author_id: Uuid,
    pub message: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Error)]
pub enum TaskCommentError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

pub struct TaskCommentRepository;

impl TaskCommentRepository {
    pub async fn find_by_id<'e, E>(
        executor: E,
        id: Uuid,
    ) -> Result<Option<TaskComment>, TaskCommentError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let record = sqlx::query_as!(
            TaskComment,
            r#"
            SELECT
                id          AS "id!: Uuid",
                task_id     AS "task_id!: Uuid",
                author_id   AS "author_id!: Uuid",
                message     AS "message!",
                created_at  AS "created_at!: DateTime<Utc>",
                updated_at  AS "updated_at!: DateTime<Utc>"
            FROM task_comments
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(executor)
        .await?;

        Ok(record)
    }

    pub async fn create<'e, E>(
        executor: E,
        task_id: Uuid,
        author_id: Uuid,
        message: String,
    ) -> Result<TaskComment, TaskCommentError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let id = Uuid::new_v4();
        let now = Utc::now();
        let record = sqlx::query_as!(
            TaskComment,
            r#"
            INSERT INTO task_comments (id, task_id, author_id, message, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING
                id          AS "id!: Uuid",
                task_id     AS "task_id!: Uuid",
                author_id   AS "author_id!: Uuid",
                message     AS "message!",
                created_at  AS "created_at!: DateTime<Utc>",
                updated_at  AS "updated_at!: DateTime<Utc>"
            "#,
            id,
            task_id,
            author_id,
            message,
            now,
            now
        )
        .fetch_one(executor)
        .await?;

        Ok(record)
    }

    pub async fn update<'e, E>(
        executor: E,
        id: Uuid,
        message: String,
    ) -> Result<TaskComment, TaskCommentError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let updated_at = Utc::now();
        let record = sqlx::query_as!(
            TaskComment,
            r#"
            UPDATE task_comments
            SET
                message = $1,
                updated_at = $2
            WHERE id = $3
            RETURNING
                id          AS "id!: Uuid",
                task_id     AS "task_id!: Uuid",
                author_id   AS "author_id!: Uuid",
                message     AS "message!",
                created_at  AS "created_at!: DateTime<Utc>",
                updated_at  AS "updated_at!: DateTime<Utc>"
            "#,
            message,
            updated_at,
            id
        )
        .fetch_one(executor)
        .await?;

        Ok(record)
    }

    pub async fn delete<'e, E>(executor: E, id: Uuid) -> Result<(), TaskCommentError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        sqlx::query!("DELETE FROM task_comments WHERE id = $1", id)
            .execute(executor)
            .await?;
        Ok(())
    }

    pub async fn list_by_task<'e, E>(
        executor: E,
        task_id: Uuid,
    ) -> Result<Vec<TaskComment>, TaskCommentError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let records = sqlx::query_as!(
            TaskComment,
            r#"
            SELECT
                id          AS "id!: Uuid",
                task_id     AS "task_id!: Uuid",
                author_id   AS "author_id!: Uuid",
                message     AS "message!",
                created_at  AS "created_at!: DateTime<Utc>",
                updated_at  AS "updated_at!: DateTime<Utc>"
            FROM task_comments
            WHERE task_id = $1
            "#,
            task_id
        )
        .fetch_all(executor)
        .await?;

        Ok(records)
    }
}
