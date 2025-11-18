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
}
