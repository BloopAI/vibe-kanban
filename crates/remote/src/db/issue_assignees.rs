use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Executor, Postgres};
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssueAssignee {
    pub issue_id: Uuid,
    pub user_id: Uuid,
    pub assigned_at: DateTime<Utc>,
}

#[derive(Debug, Error)]
pub enum IssueAssigneeError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

pub struct IssueAssigneeRepository;

impl IssueAssigneeRepository {
    pub async fn find<'e, E>(
        executor: E,
        issue_id: Uuid,
        user_id: Uuid,
    ) -> Result<Option<IssueAssignee>, IssueAssigneeError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let record = sqlx::query_as!(
            IssueAssignee,
            r#"
            SELECT
                issue_id    AS "issue_id!: Uuid",
                user_id     AS "user_id!: Uuid",
                assigned_at AS "assigned_at!: DateTime<Utc>"
            FROM issue_assignees
            WHERE issue_id = $1 AND user_id = $2
            "#,
            issue_id,
            user_id
        )
        .fetch_optional(executor)
        .await?;

        Ok(record)
    }
}
