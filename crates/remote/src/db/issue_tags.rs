use serde::{Deserialize, Serialize};
use sqlx::{Executor, Postgres};
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct IssueTag {
    pub id: Uuid,
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
    pub async fn find_by_id<'e, E>(executor: E, id: Uuid) -> Result<Option<IssueTag>, IssueTagError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let record = sqlx::query_as!(
            IssueTag,
            r#"
            SELECT
                id       AS "id!: Uuid",
                issue_id AS "issue_id!: Uuid",
                tag_id   AS "tag_id!: Uuid"
            FROM issue_tags
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(executor)
        .await?;

        Ok(record)
    }

    pub async fn list_by_issue<'e, E>(
        executor: E,
        issue_id: Uuid,
    ) -> Result<Vec<IssueTag>, IssueTagError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let records = sqlx::query_as!(
            IssueTag,
            r#"
            SELECT
                id       AS "id!: Uuid",
                issue_id AS "issue_id!: Uuid",
                tag_id   AS "tag_id!: Uuid"
            FROM issue_tags
            WHERE issue_id = $1
            "#,
            issue_id
        )
        .fetch_all(executor)
        .await?;

        Ok(records)
    }

    pub async fn create<'e, E>(
        executor: E,
        id: Option<Uuid>,
        issue_id: Uuid,
        tag_id: Uuid,
    ) -> Result<IssueTag, IssueTagError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let id = id.unwrap_or_else(Uuid::new_v4);
        let record = sqlx::query_as!(
            IssueTag,
            r#"
            INSERT INTO issue_tags (id, issue_id, tag_id)
            VALUES ($1, $2, $3)
            RETURNING
                id       AS "id!: Uuid",
                issue_id AS "issue_id!: Uuid",
                tag_id   AS "tag_id!: Uuid"
            "#,
            id,
            issue_id,
            tag_id
        )
        .fetch_one(executor)
        .await?;

        Ok(record)
    }

    pub async fn delete<'e, E>(executor: E, id: Uuid) -> Result<(), IssueTagError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        sqlx::query!("DELETE FROM issue_tags WHERE id = $1", id)
            .execute(executor)
            .await?;
        Ok(())
    }
}
