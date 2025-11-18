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
}
