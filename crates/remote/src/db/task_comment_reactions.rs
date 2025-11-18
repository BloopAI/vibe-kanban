use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

use super::Tx;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskCommentReaction {
    pub id: Uuid,
    pub comment_id: Uuid,
    pub user_id: Uuid,
    pub emoji: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Error)]
pub enum TaskCommentReactionError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

pub struct TaskCommentReactionRepository;

impl TaskCommentReactionRepository {
    pub async fn find_by_id(
        tx: &mut Tx<'_>,
        id: Uuid,
    ) -> Result<Option<TaskCommentReaction>, TaskCommentReactionError> {
        let record = sqlx::query_as!(
            TaskCommentReaction,
            r#"
            SELECT
                id          AS "id!: Uuid",
                comment_id  AS "comment_id!: Uuid",
                user_id     AS "user_id!: Uuid",
                emoji       AS "emoji!",
                created_at  AS "created_at!: DateTime<Utc>"
            FROM task_comment_reactions
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(&mut **tx)
        .await?;

        Ok(record)
    }

    pub async fn fetch_by_id(
        pool: &PgPool,
        id: Uuid,
    ) -> Result<Option<TaskCommentReaction>, TaskCommentReactionError> {
        let record = sqlx::query_as!(
            TaskCommentReaction,
            r#"
            SELECT
                id          AS "id!: Uuid",
                comment_id  AS "comment_id!: Uuid",
                user_id     AS "user_id!: Uuid",
                emoji       AS "emoji!",
                created_at  AS "created_at!: DateTime<Utc>"
            FROM task_comment_reactions
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(pool)
        .await?;

        Ok(record)
    }

    pub async fn create(
        tx: &mut Tx<'_>,
        comment_id: Uuid,
        user_id: Uuid,
        emoji: String,
    ) -> Result<TaskCommentReaction, TaskCommentReactionError> {
        let id = Uuid::new_v4();
        let created_at = Utc::now();
        let record = sqlx::query_as!(
            TaskCommentReaction,
            r#"
            INSERT INTO task_comment_reactions (id, comment_id, user_id, emoji, created_at)
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
        .fetch_one(&mut **tx)
        .await?;

        Ok(record)
    }

    pub async fn create_with_pool(
        pool: &PgPool,
        comment_id: Uuid,
        user_id: Uuid,
        emoji: String,
    ) -> Result<TaskCommentReaction, TaskCommentReactionError> {
        let mut tx = pool.begin().await?;
        let record = Self::create(&mut tx, comment_id, user_id, emoji).await?;
        tx.commit().await?;
        Ok(record)
    }

    pub async fn delete(tx: &mut Tx<'_>, id: Uuid) -> Result<(), TaskCommentReactionError> {
        sqlx::query!("DELETE FROM task_comment_reactions WHERE id = $1", id)
            .execute(&mut **tx)
            .await?;
        Ok(())
    }

    pub async fn delete_with_pool(pool: &PgPool, id: Uuid) -> Result<(), TaskCommentReactionError> {
        let mut tx = pool.begin().await?;
        Self::delete(&mut tx, id).await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn list_by_comment(
        tx: &mut Tx<'_>,
        comment_id: Uuid,
    ) -> Result<Vec<TaskCommentReaction>, TaskCommentReactionError> {
        let records = sqlx::query_as!(
            TaskCommentReaction,
            r#"
            SELECT
                id          AS "id!: Uuid",
                comment_id  AS "comment_id!: Uuid",
                user_id     AS "user_id!: Uuid",
                emoji       AS "emoji!",
                created_at  AS "created_at!: DateTime<Utc>"
            FROM task_comment_reactions
            WHERE comment_id = $1
            "#,
            comment_id
        )
        .fetch_all(&mut **tx)
        .await?;

        Ok(records)
    }

    pub async fn fetch_by_comment(
        pool: &PgPool,
        comment_id: Uuid,
    ) -> Result<Vec<TaskCommentReaction>, TaskCommentReactionError> {
        let records = sqlx::query_as!(
            TaskCommentReaction,
            r#"
            SELECT
                id          AS "id!: Uuid",
                comment_id  AS "comment_id!: Uuid",
                user_id     AS "user_id!: Uuid",
                emoji       AS "emoji!",
                created_at  AS "created_at!: DateTime<Utc>"
            FROM task_comment_reactions
            WHERE comment_id = $1
            "#,
            comment_id
        )
        .fetch_all(pool)
        .await?;

        Ok(records)
    }
}
