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
pub struct IssueComment {
    pub id: Uuid,
    pub issue_id: Uuid,
    pub author_id: Uuid,
    pub message: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Error)]
pub enum IssueCommentError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

pub struct IssueCommentRepository;

impl IssueCommentRepository {
    pub async fn find_by_id(
        pool: &PgPool,
        id: Uuid,
    ) -> Result<Option<IssueComment>, IssueCommentError> {
        let record = sqlx::query_as!(
            IssueComment,
            r#"
            SELECT
                id          AS "id!: Uuid",
                issue_id    AS "issue_id!: Uuid",
                author_id   AS "author_id!: Uuid",
                message     AS "message!",
                created_at  AS "created_at!: DateTime<Utc>",
                updated_at  AS "updated_at!: DateTime<Utc>"
            FROM issue_comments
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(pool)
        .await?;

        Ok(record)
    }

    pub async fn create(
        pool: &PgPool,
        id: Option<Uuid>,
        issue_id: Uuid,
        author_id: Uuid,
        message: String,
    ) -> Result<MutationResponse<IssueComment>, IssueCommentError> {
        let id = id.unwrap_or_else(Uuid::new_v4);
        let now = Utc::now();
        let mut tx = pool.begin().await?;
        let data = sqlx::query_as!(
            IssueComment,
            r#"
            INSERT INTO issue_comments (id, issue_id, author_id, message, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING
                id          AS "id!: Uuid",
                issue_id    AS "issue_id!: Uuid",
                author_id   AS "author_id!: Uuid",
                message     AS "message!",
                created_at  AS "created_at!: DateTime<Utc>",
                updated_at  AS "updated_at!: DateTime<Utc>"
            "#,
            id,
            issue_id,
            author_id,
            message,
            now,
            now
        )
        .fetch_one(&mut *tx)
        .await?;
        let txid = get_txid(&mut *tx).await?;
        tx.commit().await?;

        Ok(MutationResponse { data, txid })
    }

    /// Update an issue comment with partial fields. Uses COALESCE to preserve existing values
    /// when None is provided.
    pub async fn update(
        pool: &PgPool,
        id: Uuid,
        message: Option<String>,
    ) -> Result<MutationResponse<IssueComment>, IssueCommentError> {
        let updated_at = Utc::now();
        let mut tx = pool.begin().await?;
        let data = sqlx::query_as!(
            IssueComment,
            r#"
            UPDATE issue_comments
            SET
                message = COALESCE($1, message),
                updated_at = $2
            WHERE id = $3
            RETURNING
                id          AS "id!: Uuid",
                issue_id    AS "issue_id!: Uuid",
                author_id   AS "author_id!: Uuid",
                message     AS "message!",
                created_at  AS "created_at!: DateTime<Utc>",
                updated_at  AS "updated_at!: DateTime<Utc>"
            "#,
            message,
            updated_at,
            id
        )
        .fetch_one(&mut *tx)
        .await?;
        let txid = get_txid(&mut *tx).await?;
        tx.commit().await?;

        Ok(MutationResponse { data, txid })
    }

    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<DeleteResponse, IssueCommentError> {
        let mut tx = pool.begin().await?;
        sqlx::query!("DELETE FROM issue_comments WHERE id = $1", id)
            .execute(&mut *tx)
            .await?;
        let txid = get_txid(&mut *tx).await?;
        tx.commit().await?;
        Ok(DeleteResponse { txid })
    }

    pub async fn list_by_issue(
        pool: &PgPool,
        issue_id: Uuid,
    ) -> Result<Vec<IssueComment>, IssueCommentError> {
        let records = sqlx::query_as!(
            IssueComment,
            r#"
            SELECT
                id          AS "id!: Uuid",
                issue_id    AS "issue_id!: Uuid",
                author_id   AS "author_id!: Uuid",
                message     AS "message!",
                created_at  AS "created_at!: DateTime<Utc>",
                updated_at  AS "updated_at!: DateTime<Utc>"
            FROM issue_comments
            WHERE issue_id = $1
            "#,
            issue_id
        )
        .fetch_all(pool)
        .await?;

        Ok(records)
    }
}
