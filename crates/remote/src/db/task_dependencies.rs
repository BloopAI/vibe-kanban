use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Executor, Postgres};
use thiserror::Error;
use uuid::Uuid;

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
    pub async fn find<'e, E>(
        executor: E,
        blocking_task_id: Uuid,
        blocked_task_id: Uuid,
    ) -> Result<Option<TaskDependency>, TaskDependencyError>
    where
        E: Executor<'e, Database = Postgres>,
    {
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
        .fetch_optional(executor)
        .await?;

        Ok(record)
    }
}
