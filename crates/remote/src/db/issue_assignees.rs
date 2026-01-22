use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

use super::get_txid;
use crate::mutation_types::{DeleteResponse, MutationResponse};

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
    pub async fn find_by_id(
        pool: &PgPool,
        id: Uuid,
    ) -> Result<Option<IssueAssignee>, IssueAssigneeError> {
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
        .fetch_optional(pool)
        .await?;

        Ok(record)
    }

    pub async fn list_by_issue(
        pool: &PgPool,
        issue_id: Uuid,
    ) -> Result<Vec<IssueAssignee>, IssueAssigneeError> {
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
        .fetch_all(pool)
        .await?;

        Ok(records)
    }

    pub async fn create(
        pool: &PgPool,
        id: Option<Uuid>,
        issue_id: Uuid,
        user_id: Uuid,
    ) -> Result<MutationResponse<IssueAssignee>, IssueAssigneeError> {
        let id = id.unwrap_or_else(Uuid::new_v4);
        let mut tx = pool.begin().await?;
        let data = sqlx::query_as!(
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
        .fetch_one(&mut *tx)
        .await?;
        let txid = get_txid(&mut *tx).await?;
        tx.commit().await?;

        Ok(MutationResponse { data, txid })
    }

    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<DeleteResponse, IssueAssigneeError> {
        let mut tx = pool.begin().await?;
        sqlx::query!("DELETE FROM issue_assignees WHERE id = $1", id)
            .execute(&mut *tx)
            .await?;
        let txid = get_txid(&mut *tx).await?;
        tx.commit().await?;
        Ok(DeleteResponse { txid })
    }
}
