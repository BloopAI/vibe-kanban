use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

use super::Tx;

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
    pub async fn find_by_id(
        tx: &mut Tx<'_>,
        id: Uuid,
    ) -> Result<Option<TaskComment>, TaskCommentError> {
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
        .fetch_optional(&mut **tx)
        .await?;

        Ok(record)
    }

    pub async fn fetch_by_id(
        pool: &PgPool,
        id: Uuid,
    ) -> Result<Option<TaskComment>, TaskCommentError> {
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
        .fetch_optional(pool)
        .await?;

        Ok(record)
    }

    pub async fn create(
        tx: &mut Tx<'_>,
        task_id: Uuid,
        author_id: Uuid,
        message: String,
    ) -> Result<TaskComment, TaskCommentError> {
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
        .fetch_one(&mut **tx)
        .await?;

        Ok(record)
    }

    pub async fn create_with_pool(
        pool: &PgPool,
        task_id: Uuid,
        author_id: Uuid,
        message: String,
    ) -> Result<TaskComment, TaskCommentError> {
        let mut tx = pool.begin().await?;
        let record = Self::create(&mut tx, task_id, author_id, message).await?;
        tx.commit().await?;
        Ok(record)
    }

    pub async fn update(
        tx: &mut Tx<'_>,
        id: Uuid,
        message: String,
    ) -> Result<TaskComment, TaskCommentError> {
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
        .fetch_one(&mut **tx)
        .await?;

        Ok(record)
    }

    pub async fn update_with_pool(
        pool: &PgPool,
        id: Uuid,
        message: String,
    ) -> Result<TaskComment, TaskCommentError> {
        let mut tx = pool.begin().await?;
        let record = Self::update(&mut tx, id, message).await?;
        tx.commit().await?;
        Ok(record)
    }

    pub async fn delete(tx: &mut Tx<'_>, id: Uuid) -> Result<(), TaskCommentError> {
        sqlx::query!("DELETE FROM task_comments WHERE id = $1", id)
            .execute(&mut **tx)
            .await?;
        Ok(())
    }

    pub async fn delete_with_pool(pool: &PgPool, id: Uuid) -> Result<(), TaskCommentError> {
        let mut tx = pool.begin().await?;
        Self::delete(&mut tx, id).await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn list_by_task(
        tx: &mut Tx<'_>,
        task_id: Uuid,
    ) -> Result<Vec<TaskComment>, TaskCommentError> {
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
        .fetch_all(&mut **tx)
        .await?;

        Ok(records)
    }

    pub async fn fetch_by_task(
        pool: &PgPool,
        task_id: Uuid,
    ) -> Result<Vec<TaskComment>, TaskCommentError> {
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
        .fetch_all(pool)
        .await?;

        Ok(records)
    }
}
