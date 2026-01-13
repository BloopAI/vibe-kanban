use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Executor, Postgres};
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
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
    pub async fn find_by_id<'e, E>(
        executor: E,
        id: Uuid,
    ) -> Result<Option<IssueComment>, IssueCommentError>
    where
        E: Executor<'e, Database = Postgres>,
    {
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
        .fetch_optional(executor)
        .await?;

        Ok(record)
    }

    pub async fn create<'e, E>(
        executor: E,
        issue_id: Uuid,
        author_id: Uuid,
        message: String,
    ) -> Result<IssueComment, IssueCommentError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let id = Uuid::new_v4();
        let now = Utc::now();
        let record = sqlx::query_as!(
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
        .fetch_one(executor)
        .await?;

        Ok(record)
    }

    pub async fn update<'e, E>(
        executor: E,
        id: Uuid,
        message: String,
    ) -> Result<IssueComment, IssueCommentError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let updated_at = Utc::now();
        let record = sqlx::query_as!(
            IssueComment,
            r#"
            UPDATE issue_comments
            SET
                message = $1,
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
        .fetch_one(executor)
        .await?;

        Ok(record)
    }

    pub async fn delete<'e, E>(executor: E, id: Uuid) -> Result<(), IssueCommentError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        sqlx::query!("DELETE FROM issue_comments WHERE id = $1", id)
            .execute(executor)
            .await?;
        Ok(())
    }

    pub async fn list_by_issue<'e, E>(
        executor: E,
        issue_id: Uuid,
    ) -> Result<Vec<IssueComment>, IssueCommentError>
    where
        E: Executor<'e, Database = Postgres>,
    {
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
        .fetch_all(executor)
        .await?;

        Ok(records)
    }
}
