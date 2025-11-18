use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

use super::Tx;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskDependency {
    pub blocking_task_id: Uuid,
    pub blocked_task_id: Uuid,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Error)]
pub enum TaskDependencyError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

pub struct TaskDependencyRepository;

impl TaskDependencyRepository {
    pub async fn get(
        tx: &mut Tx<'_>,
        blocking_task_id: Uuid,
        blocked_task_id: Uuid,
    ) -> Result<Option<TaskDependency>, TaskDependencyError> {
        let record = sqlx::query_as!(
            TaskDependency,
            r#"
            SELECT
                blocking_task_id AS "blocking_task_id!: Uuid",
                blocked_task_id  AS "blocked_task_id!: Uuid",
                created_at       AS "created_at!: DateTime<Utc>"
            FROM task_dependencies
            WHERE blocking_task_id = $1 AND blocked_task_id = $2
            "#,
            blocking_task_id,
            blocked_task_id
        )
        .fetch_optional(&mut **tx)
        .await?;

        Ok(record)
    }

    pub async fn fetch(
        pool: &PgPool,
        blocking_task_id: Uuid,
        blocked_task_id: Uuid,
    ) -> Result<Option<TaskDependency>, TaskDependencyError> {
        let record = sqlx::query_as!(
            TaskDependency,
            r#"
            SELECT
                blocking_task_id AS "blocking_task_id!: Uuid",
                blocked_task_id  AS "blocked_task_id!: Uuid",
                created_at       AS "created_at!: DateTime<Utc>"
            FROM task_dependencies
            WHERE blocking_task_id = $1 AND blocked_task_id = $2
            "#,
            blocking_task_id,
            blocked_task_id
        )
        .fetch_optional(pool)
        .await?;

        Ok(record)
    }
}
