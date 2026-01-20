use serde::{Deserialize, Serialize};
use sqlx::{Executor, Postgres};
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct IssueFollower {
    pub id: Uuid,
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
    pub async fn find_by_id<'e, E>(
        executor: E,
        id: Uuid,
    ) -> Result<Option<IssueFollower>, IssueFollowerError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let record = sqlx::query_as!(
            IssueFollower,
            r#"
            SELECT
                id       AS "id!: Uuid",
                issue_id AS "issue_id!: Uuid",
                user_id  AS "user_id!: Uuid"
            FROM issue_followers
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
    ) -> Result<Vec<IssueFollower>, IssueFollowerError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let records = sqlx::query_as!(
            IssueFollower,
            r#"
            SELECT
                id       AS "id!: Uuid",
                issue_id AS "issue_id!: Uuid",
                user_id  AS "user_id!: Uuid"
            FROM issue_followers
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
        issue_id: Uuid,
        user_id: Uuid,
    ) -> Result<IssueFollower, IssueFollowerError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let id = Uuid::new_v4();
        let record = sqlx::query_as!(
            IssueFollower,
            r#"
            INSERT INTO issue_followers (id, issue_id, user_id)
            VALUES ($1, $2, $3)
            RETURNING
                id       AS "id!: Uuid",
                issue_id AS "issue_id!: Uuid",
                user_id  AS "user_id!: Uuid"
            "#,
            id,
            issue_id,
            user_id
        )
        .fetch_one(executor)
        .await?;

        Ok(record)
    }

    pub async fn delete<'e, E>(executor: E, id: Uuid) -> Result<(), IssueFollowerError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        sqlx::query!("DELETE FROM issue_followers WHERE id = $1", id)
            .execute(executor)
            .await?;
        Ok(())
    }
}
