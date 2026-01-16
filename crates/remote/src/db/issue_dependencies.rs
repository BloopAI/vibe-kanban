use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Executor, Postgres};
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssueDependency {
    pub blocking_issue_id: Uuid,
    pub blocked_issue_id: Uuid,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Error)]
pub enum IssueDependencyError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

pub struct IssueDependencyRepository;

impl IssueDependencyRepository {
    pub async fn find<'e, E>(
        executor: E,
        blocking_issue_id: Uuid,
        blocked_issue_id: Uuid,
    ) -> Result<Option<IssueDependency>, IssueDependencyError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let record = sqlx::query_as!(
            IssueDependency,
            r#"
            SELECT
                blocking_issue_id AS "blocking_issue_id!: Uuid",
                blocked_issue_id  AS "blocked_issue_id!: Uuid",
                created_at        AS "created_at!: DateTime<Utc>"
            FROM issue_dependencies
            WHERE blocking_issue_id = $1 AND blocked_issue_id = $2
            "#,
            blocking_issue_id,
            blocked_issue_id
        )
        .fetch_optional(executor)
        .await?;

        Ok(record)
    }
}
