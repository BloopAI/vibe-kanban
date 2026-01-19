use serde::{Deserialize, Serialize};
use sqlx::{Executor, Postgres};
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct IssueTag {
    pub issue_id: Uuid,
    pub tag_id: Uuid,
}

#[derive(Debug, Error)]
pub enum IssueTagError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

pub struct IssueTagRepository;

impl IssueTagRepository {
    pub async fn find<'e, E>(
        executor: E,
        issue_id: Uuid,
        tag_id: Uuid,
    ) -> Result<Option<IssueTag>, IssueTagError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let record = sqlx::query_as!(
            IssueTag,
            r#"
            SELECT
                issue_id AS "issue_id!: Uuid",
                tag_id   AS "tag_id!: Uuid"
            FROM issue_tags
            WHERE issue_id = $1 AND tag_id = $2
            "#,
            issue_id,
            tag_id
        )
        .fetch_optional(executor)
        .await?;

        Ok(record)
    }
}
