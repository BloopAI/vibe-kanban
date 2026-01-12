use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Executor, Postgres};
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskAssignee {
    pub task_id: Uuid,
    pub user_id: Uuid,
    pub assigned_at: DateTime<Utc>,
}

#[derive(Debug, Error)]
pub enum TaskAssigneeError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

pub struct TaskAssigneeRepository;

impl TaskAssigneeRepository {
    pub async fn find<'e, E>(
        executor: E,
        task_id: Uuid,
        user_id: Uuid,
    ) -> Result<Option<TaskAssignee>, TaskAssigneeError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let record = sqlx::query_as!(
            TaskAssignee,
            r#"
            SELECT
                task_id     AS "task_id!: Uuid",
                user_id     AS "user_id!: Uuid",
                assigned_at AS "assigned_at!: DateTime<Utc>"
            FROM task_assignees
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
