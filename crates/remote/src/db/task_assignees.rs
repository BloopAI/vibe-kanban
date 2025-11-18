use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

use super::Tx;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskAssignee {
    pub task_id: Uuid,
    pub user_id: Uuid,
    pub lead: bool,
}

#[derive(Debug, Error)]
pub enum TaskAssigneeError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

pub struct TaskAssigneeRepository;

impl TaskAssigneeRepository {
    pub async fn get(
        tx: &mut Tx<'_>,
        task_id: Uuid,
        user_id: Uuid,
    ) -> Result<Option<TaskAssignee>, TaskAssigneeError> {
        let record = sqlx::query_as!(
            TaskAssignee,
            r#"
            SELECT
                task_id AS "task_id!: Uuid",
                user_id AS "user_id!: Uuid",
                lead    AS "lead!"
            FROM task_assignees
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
    ) -> Result<Option<TaskAssignee>, TaskAssigneeError> {
        let record = sqlx::query_as!(
            TaskAssignee,
            r#"
            SELECT
                task_id AS "task_id!: Uuid",
                user_id AS "user_id!: Uuid",
                lead    AS "lead!"
            FROM task_assignees
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
