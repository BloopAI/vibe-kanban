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
pub struct IssueCommentReaction {
    pub id: Uuid,
    pub comment_id: Uuid,
    pub user_id: Uuid,
    pub emoji: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Error)]
pub enum IssueCommentReactionError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

pub struct IssueCommentReactionRepository;

impl IssueCommentReactionRepository {
    pub async fn find_by_id(
        pool: &PgPool,
        id: Uuid,
    ) -> Result<Option<IssueCommentReaction>, IssueCommentReactionError> {
        let record = sqlx::query_as!(
            IssueCommentReaction,
            r#"
            SELECT
                id          AS "id!: Uuid",
                comment_id  AS "comment_id!: Uuid",
                user_id     AS "user_id!: Uuid",
                emoji       AS "emoji!",
                created_at  AS "created_at!: DateTime<Utc>"
            FROM issue_comment_reactions
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
        comment_id: Uuid,
        user_id: Uuid,
        emoji: String,
    ) -> Result<MutationResponse<IssueCommentReaction>, IssueCommentReactionError> {
        let mut tx = pool.begin().await?;
        let id = id.unwrap_or_else(Uuid::new_v4);
        let created_at = Utc::now();
        let data = sqlx::query_as!(
            IssueCommentReaction,
            r#"
            INSERT INTO issue_comment_reactions (id, comment_id, user_id, emoji, created_at)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING
                id          AS "id!: Uuid",
                comment_id  AS "comment_id!: Uuid",
                user_id     AS "user_id!: Uuid",
                emoji       AS "emoji!",
                created_at  AS "created_at!: DateTime<Utc>"
            "#,
            id,
            comment_id,
            user_id,
            emoji,
            created_at
        )
        .fetch_one(&mut *tx)
        .await?;
        let txid = get_txid(&mut *tx).await?;
        tx.commit().await?;

        Ok(MutationResponse { data, txid })
    }

    /// Update an issue comment reaction with partial fields. Uses COALESCE to preserve existing values
    /// when None is provided.
    pub async fn update(
        pool: &PgPool,
        id: Uuid,
        emoji: Option<String>,
    ) -> Result<MutationResponse<IssueCommentReaction>, IssueCommentReactionError> {
        let mut tx = pool.begin().await?;
        let data = sqlx::query_as!(
            IssueCommentReaction,
            r#"
            UPDATE issue_comment_reactions
            SET
                emoji = COALESCE($1, emoji)
            WHERE id = $2
            RETURNING
                id          AS "id!: Uuid",
                comment_id  AS "comment_id!: Uuid",
                user_id     AS "user_id!: Uuid",
                emoji       AS "emoji!",
                created_at  AS "created_at!: DateTime<Utc>"
            "#,
            emoji,
            id
        )
        .fetch_one(&mut *tx)
        .await?;
        let txid = get_txid(&mut *tx).await?;
        tx.commit().await?;

        Ok(MutationResponse { data, txid })
    }

    pub async fn delete(
        pool: &PgPool,
        id: Uuid,
    ) -> Result<DeleteResponse, IssueCommentReactionError> {
        let mut tx = pool.begin().await?;
        sqlx::query!("DELETE FROM issue_comment_reactions WHERE id = $1", id)
            .execute(&mut *tx)
            .await?;
        let txid = get_txid(&mut *tx).await?;
        tx.commit().await?;
        Ok(DeleteResponse { txid })
    }

    pub async fn list_by_comment(
        pool: &PgPool,
        comment_id: Uuid,
    ) -> Result<Vec<IssueCommentReaction>, IssueCommentReactionError> {
        let records = sqlx::query_as!(
            IssueCommentReaction,
            r#"
            SELECT
                id          AS "id!: Uuid",
                comment_id  AS "comment_id!: Uuid",
                user_id     AS "user_id!: Uuid",
                emoji       AS "emoji!",
                created_at  AS "created_at!: DateTime<Utc>"
            FROM issue_comment_reactions
            WHERE comment_id = $1
            "#,
            comment_id
        )
        .fetch_all(pool)
        .await?;

        Ok(records)
    }
}
