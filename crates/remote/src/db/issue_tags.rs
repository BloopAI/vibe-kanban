use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

use super::get_txid;
use crate::mutation_types::{DeleteResponse, MutationResponse};

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
    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<IssueTag>, IssueTagError> {
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
        .fetch_optional(pool)
        .await?;

        Ok(record)
    }

    pub async fn list_by_issue(
        pool: &PgPool,
        issue_id: Uuid,
    ) -> Result<Vec<IssueTag>, IssueTagError> {
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
        .fetch_all(pool)
        .await?;

        Ok(records)
    }

    pub async fn create(
        pool: &PgPool,
        id: Option<Uuid>,
        issue_id: Uuid,
        tag_id: Uuid,
    ) -> Result<MutationResponse<IssueTag>, IssueTagError> {
        let id = id.unwrap_or_else(Uuid::new_v4);
        let mut tx = pool.begin().await?;
        let data = sqlx::query_as!(
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
        .fetch_one(&mut *tx)
        .await?;
        let txid = get_txid(&mut *tx).await?;
        tx.commit().await?;
        Ok(MutationResponse { data, txid })
    }

    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<DeleteResponse, IssueTagError> {
        let mut tx = pool.begin().await?;
        sqlx::query!("DELETE FROM issue_tags WHERE id = $1", id)
            .execute(&mut *tx)
            .await?;
        let txid = get_txid(&mut *tx).await?;
        tx.commit().await?;
        Ok(DeleteResponse { txid })
    }
}
