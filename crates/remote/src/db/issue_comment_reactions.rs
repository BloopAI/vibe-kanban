use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Executor, Postgres};
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
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
    pub async fn find_by_id<'e, E>(
        executor: E,
        id: Uuid,
    ) -> Result<Option<IssueCommentReaction>, IssueCommentReactionError>
    where
        E: Executor<'e, Database = Postgres>,
    {
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
        .fetch_optional(executor)
        .await?;

        Ok(record)
    }

    pub async fn create<'e, E>(
        executor: E,
        comment_id: Uuid,
        user_id: Uuid,
        emoji: String,
    ) -> Result<IssueCommentReaction, IssueCommentReactionError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let id = Uuid::new_v4();
        let created_at = Utc::now();
        let record = sqlx::query_as!(
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
        .fetch_one(executor)
        .await?;

        Ok(record)
    }

    pub async fn delete<'e, E>(executor: E, id: Uuid) -> Result<(), IssueCommentReactionError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        sqlx::query!("DELETE FROM issue_comment_reactions WHERE id = $1", id)
            .execute(executor)
            .await?;
        Ok(())
    }

    pub async fn list_by_comment<'e, E>(
        executor: E,
        comment_id: Uuid,
    ) -> Result<Vec<IssueCommentReaction>, IssueCommentReactionError>
    where
        E: Executor<'e, Database = Postgres>,
    {
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
        .fetch_all(executor)
        .await?;

        Ok(records)
    }
}
