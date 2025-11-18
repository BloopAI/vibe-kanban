use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

use super::Tx;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskFollower {
    pub task_id: Uuid,
    pub user_id: Uuid,
}

#[derive(Debug, Error)]
pub enum TaskFollowerError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

pub struct TaskFollowerRepository;

impl TaskFollowerRepository {
    pub async fn get(
        tx: &mut Tx<'_>,
        task_id: Uuid,
        user_id: Uuid,
    ) -> Result<Option<TaskFollower>, TaskFollowerError> {
        let record = sqlx::query_as!(
            TaskFollower,
            r#"
            SELECT
                task_id AS "task_id!: Uuid",
                user_id AS "user_id!: Uuid"
            FROM task_followers
            WHERE task_id = $1 AND user_id = $2
            "#,
            task_id,
            user_id
        )
        .fetch_optional(&mut **tx)
        .await?;

        Ok(record)
    }

    pub async fn fetch(
        pool: &PgPool,
        task_id: Uuid,
        user_id: Uuid,
    ) -> Result<Option<TaskFollower>, TaskFollowerError> {
        let record = sqlx::query_as!(
            TaskFollower,
            r#"
            SELECT
                task_id AS "task_id!: Uuid",
                user_id AS "user_id!: Uuid"
            FROM task_followers
            WHERE task_id = $1 AND user_id = $2
            "#,
            task_id,
            user_id
        )
        .fetch_optional(pool)
        .await?;

        Ok(record)
    }
}
