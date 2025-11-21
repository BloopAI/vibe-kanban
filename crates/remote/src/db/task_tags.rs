use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

use super::Tx;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskTag {
    pub task_id: Uuid,
    pub tag_id: Uuid,
}

#[derive(Debug, Error)]
pub enum TaskTagError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

pub struct TaskTagRepository;

impl TaskTagRepository {
    pub async fn get(
        tx: &mut Tx<'_>,
        task_id: Uuid,
        tag_id: Uuid,
    ) -> Result<Option<TaskTag>, TaskTagError> {
        let record = sqlx::query_as!(
            TaskTag,
            r#"
            SELECT
                task_id AS "task_id!: Uuid",
                tag_id  AS "tag_id!: Uuid"
            FROM task_tags
            WHERE task_id = $1 AND tag_id = $2
            "#,
            task_id,
            tag_id
        )
        .fetch_optional(&mut **tx)
        .await?;

        Ok(record)
    }

    pub async fn fetch(
        pool: &PgPool,
        task_id: Uuid,
        tag_id: Uuid,
    ) -> Result<Option<TaskTag>, TaskTagError> {
        let record = sqlx::query_as!(
            TaskTag,
            r#"
            SELECT
                task_id AS "task_id!: Uuid",
                tag_id  AS "tag_id!: Uuid"
            FROM task_tags
            WHERE task_id = $1 AND tag_id = $2
            "#,
            task_id,
            tag_id
        )
        .fetch_optional(pool)
        .await?;

        Ok(record)
    }
}
