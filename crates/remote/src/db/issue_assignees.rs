use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Executor, Postgres};
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct IssueAssignee {
    pub id: Uuid,
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
    pub async fn find_by_id<'e, E>(
        executor: E,
        id: Uuid,
    ) -> Result<Option<IssueAssignee>, IssueAssigneeError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let record = sqlx::query_as!(
            IssueAssignee,
            r#"
            SELECT
                id          AS "id!: Uuid",
                issue_id    AS "issue_id!: Uuid",
                user_id     AS "user_id!: Uuid",
                assigned_at AS "assigned_at!: DateTime<Utc>"
            FROM issue_assignees
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
    ) -> Result<Vec<IssueAssignee>, IssueAssigneeError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let records = sqlx::query_as!(
            IssueAssignee,
            r#"
            SELECT
                id          AS "id!: Uuid",
                issue_id    AS "issue_id!: Uuid",
                user_id     AS "user_id!: Uuid",
                assigned_at AS "assigned_at!: DateTime<Utc>"
            FROM issue_assignees
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
        user_id: Uuid,
    ) -> Result<IssueAssignee, IssueAssigneeError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let id = id.unwrap_or_else(Uuid::new_v4);
        let record = sqlx::query_as!(
            IssueAssignee,
            r#"
            INSERT INTO issue_assignees (id, issue_id, user_id)
            VALUES ($1, $2, $3)
            RETURNING
                id          AS "id!: Uuid",
                issue_id    AS "issue_id!: Uuid",
                user_id     AS "user_id!: Uuid",
                assigned_at AS "assigned_at!: DateTime<Utc>"
            "#,
            id,
            issue_id,
            user_id
        )
        .fetch_one(executor)
        .await?;

        Ok(record)
    }

    pub async fn delete<'e, E>(executor: E, id: Uuid) -> Result<(), IssueAssigneeError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        sqlx::query!("DELETE FROM issue_assignees WHERE id = $1", id)
            .execute(executor)
            .await?;
        Ok(())
    }
}
