use serde::{Deserialize, Serialize};
use sqlx::{Executor, Postgres};
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct IssueFollower {
    pub issue_id: Uuid,
    pub user_id: Uuid,
}

#[derive(Debug, Error)]
pub enum IssueFollowerError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

pub struct IssueFollowerRepository;

impl IssueFollowerRepository {
    pub async fn find<'e, E>(
        executor: E,
        issue_id: Uuid,
        user_id: Uuid,
    ) -> Result<Option<IssueFollower>, IssueFollowerError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let record = sqlx::query_as!(
            IssueFollower,
            r#"
            SELECT
                issue_id AS "issue_id!: Uuid",
                user_id  AS "user_id!: Uuid"
            FROM issue_followers
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
