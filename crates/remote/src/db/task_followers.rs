use serde::{Deserialize, Serialize};
use sqlx::{Executor, Postgres};
use thiserror::Error;
use uuid::Uuid;

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
    pub async fn find<'e, E>(
        executor: E,
        task_id: Uuid,
        user_id: Uuid,
    ) -> Result<Option<TaskFollower>, TaskFollowerError>
    where
        E: Executor<'e, Database = Postgres>,
    {
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
        .fetch_optional(executor)
        .await?;

        Ok(record)
    }
}
