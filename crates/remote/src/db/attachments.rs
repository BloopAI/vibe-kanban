use chrono::{DateTime, Utc};
use sqlx::{Executor, PgPool, Postgres};
use thiserror::Error;
use uuid::Uuid;

use api_types::{Attachment, AttachmentWithBlob, Blob};

#[derive(Debug, Error)]
pub enum AttachmentError {
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}

pub struct AttachmentRepository;

impl AttachmentRepository {
    pub async fn find_by_id<'e, E>(
        executor: E,
        id: Uuid,
    ) -> Result<Option<Attachment>, AttachmentError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let record = sqlx::query_as!(
            Attachment,
            r#"
            SELECT
                id          AS "id!: Uuid",
                blob_id     AS "blob_id!: Uuid",
                issue_id    AS "issue_id?: Uuid",
                comment_id  AS "comment_id?: Uuid",
                created_at  AS "created_at!: DateTime<Utc>",
                expires_at  AS "expires_at?: DateTime<Utc>"
            FROM attachments
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(executor)
        .await?;

        Ok(record)
    }

    pub async fn find_by_id_with_blob<'e, E>(
        executor: E,
        id: Uuid,
    ) -> Result<Option<AttachmentWithBlob>, AttachmentError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let record = sqlx::query_as!(
            AttachmentWithBlob,
            r#"
            SELECT
                a.id                    AS "id!: Uuid",
                a.blob_id               AS "blob_id!: Uuid",
                a.issue_id              AS "issue_id?: Uuid",
                a.comment_id            AS "comment_id?: Uuid",
                a.created_at            AS "created_at!: DateTime<Utc>",
                a.expires_at            AS "expires_at?: DateTime<Utc>",
                b.blob_path             AS "blob_path!",
                b.thumbnail_blob_path   AS "thumbnail_blob_path?",
                b.original_name         AS "original_name!",
                b.mime_type             AS "mime_type?",
                b.size_bytes            AS "size_bytes!",
                b.hash                  AS "hash!",
                b.width                 AS "width?",
                b.height                AS "height?"
            FROM attachments a
            INNER JOIN blobs b ON b.id = a.blob_id
            WHERE a.id = $1
            "#,
            id
        )
        .fetch_optional(executor)
        .await?;

        Ok(record)
    }

    pub async fn find_by_issue_id(
        pool: &PgPool,
        issue_id: Uuid,
    ) -> Result<Vec<AttachmentWithBlob>, AttachmentError> {
        let records = sqlx::query_as!(
            AttachmentWithBlob,
            r#"
            SELECT
                a.id                    AS "id!: Uuid",
                a.blob_id               AS "blob_id!: Uuid",
                a.issue_id              AS "issue_id?: Uuid",
                a.comment_id            AS "comment_id?: Uuid",
                a.created_at            AS "created_at!: DateTime<Utc>",
                a.expires_at            AS "expires_at?: DateTime<Utc>",
                b.blob_path             AS "blob_path!",
                b.thumbnail_blob_path   AS "thumbnail_blob_path?",
                b.original_name         AS "original_name!",
                b.mime_type             AS "mime_type?",
                b.size_bytes            AS "size_bytes!",
                b.hash                  AS "hash!",
                b.width                 AS "width?",
                b.height                AS "height?"
            FROM attachments a
            INNER JOIN blobs b ON b.id = a.blob_id
            WHERE a.issue_id = $1
            ORDER BY a.created_at ASC
            "#,
            issue_id
        )
        .fetch_all(pool)
        .await?;

        Ok(records)
    }

    pub async fn find_by_comment_id(
        pool: &PgPool,
        comment_id: Uuid,
    ) -> Result<Vec<AttachmentWithBlob>, AttachmentError> {
        let records = sqlx::query_as!(
            AttachmentWithBlob,
            r#"
            SELECT
                a.id                    AS "id!: Uuid",
                a.blob_id               AS "blob_id!: Uuid",
                a.issue_id              AS "issue_id?: Uuid",
                a.comment_id            AS "comment_id?: Uuid",
                a.created_at            AS "created_at!: DateTime<Utc>",
                a.expires_at            AS "expires_at?: DateTime<Utc>",
                b.blob_path             AS "blob_path!",
                b.thumbnail_blob_path   AS "thumbnail_blob_path?",
                b.original_name         AS "original_name!",
                b.mime_type             AS "mime_type?",
                b.size_bytes            AS "size_bytes!",
                b.hash                  AS "hash!",
                b.width                 AS "width?",
                b.height                AS "height?"
            FROM attachments a
            INNER JOIN blobs b ON b.id = a.blob_id
            WHERE a.comment_id = $1
            ORDER BY a.created_at ASC
            "#,
            comment_id
        )
        .fetch_all(pool)
        .await?;

        Ok(records)
    }

    pub async fn create(
        pool: &PgPool,
        id: Option<Uuid>,
        blob_id: Uuid,
        issue_id: Option<Uuid>,
        comment_id: Option<Uuid>,
        expires_at: Option<DateTime<Utc>>,
    ) -> Result<Attachment, AttachmentError> {
        let id = id.unwrap_or_else(Uuid::new_v4);

        let data = sqlx::query_as!(
            Attachment,
            r#"
            INSERT INTO attachments (id, blob_id, issue_id, comment_id, expires_at)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING
                id          AS "id!: Uuid",
                blob_id     AS "blob_id!: Uuid",
                issue_id    AS "issue_id?: Uuid",
                comment_id  AS "comment_id?: Uuid",
                created_at  AS "created_at!: DateTime<Utc>",
                expires_at  AS "expires_at?: DateTime<Utc>"
            "#,
            id,
            blob_id,
            issue_id,
            comment_id,
            expires_at
        )
        .fetch_one(pool)
        .await?;

        Ok(data)
    }

    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<Option<Attachment>, AttachmentError> {
        let record = sqlx::query_as!(
            Attachment,
            r#"
            DELETE FROM attachments
            WHERE id = $1
            RETURNING
                id          AS "id!: Uuid",
                blob_id     AS "blob_id!: Uuid",
                issue_id    AS "issue_id?: Uuid",
                comment_id  AS "comment_id?: Uuid",
                created_at  AS "created_at!: DateTime<Utc>",
                expires_at  AS "expires_at?: DateTime<Utc>"
            "#,
            id
        )
        .fetch_optional(pool)
        .await?;

        Ok(record)
    }

    /// Count how many attachments reference a specific blob.
    pub async fn count_by_blob_id(pool: &PgPool, blob_id: Uuid) -> Result<i64, AttachmentError> {
        let count = sqlx::query_scalar!(
            r#"
            SELECT COUNT(*) AS "count!"
            FROM attachments
            WHERE blob_id = $1
            "#,
            blob_id
        )
        .fetch_one(pool)
        .await?;

        Ok(count)
    }

    /// Commit staged attachments to an issue (sets issue_id and clears expires_at).
    pub async fn commit_to_issue(
        pool: &PgPool,
        attachment_ids: &[Uuid],
        issue_id: Uuid,
    ) -> Result<Vec<AttachmentWithBlob>, AttachmentError> {
        let records = sqlx::query_as!(
            AttachmentWithBlob,
            r#"
            UPDATE attachments a
            SET issue_id = $1, expires_at = NULL
            FROM blobs b
            WHERE a.blob_id = b.id
              AND a.id = ANY($2)
              AND a.issue_id IS NULL
              AND a.comment_id IS NULL
            RETURNING
                a.id                    AS "id!: Uuid",
                a.blob_id               AS "blob_id!: Uuid",
                a.issue_id              AS "issue_id?: Uuid",
                a.comment_id            AS "comment_id?: Uuid",
                a.created_at            AS "created_at!: DateTime<Utc>",
                a.expires_at            AS "expires_at?: DateTime<Utc>",
                b.blob_path             AS "blob_path!",
                b.thumbnail_blob_path   AS "thumbnail_blob_path?",
                b.original_name         AS "original_name!",
                b.mime_type             AS "mime_type?",
                b.size_bytes            AS "size_bytes!",
                b.hash                  AS "hash!",
                b.width                 AS "width?",
                b.height                AS "height?"
            "#,
            issue_id,
            attachment_ids
        )
        .fetch_all(pool)
        .await?;

        Ok(records)
    }

    /// Commit staged attachments to a comment (sets comment_id and clears expires_at).
    pub async fn commit_to_comment(
        pool: &PgPool,
        attachment_ids: &[Uuid],
        comment_id: Uuid,
    ) -> Result<Vec<AttachmentWithBlob>, AttachmentError> {
        let records = sqlx::query_as!(
            AttachmentWithBlob,
            r#"
            UPDATE attachments a
            SET comment_id = $1, expires_at = NULL
            FROM blobs b
            WHERE a.blob_id = b.id
              AND a.id = ANY($2)
              AND a.issue_id IS NULL
              AND a.comment_id IS NULL
            RETURNING
                a.id                    AS "id!: Uuid",
                a.blob_id               AS "blob_id!: Uuid",
                a.issue_id              AS "issue_id?: Uuid",
                a.comment_id            AS "comment_id?: Uuid",
                a.created_at            AS "created_at!: DateTime<Utc>",
                a.expires_at            AS "expires_at?: DateTime<Utc>",
                b.blob_path             AS "blob_path!",
                b.thumbnail_blob_path   AS "thumbnail_blob_path?",
                b.original_name         AS "original_name!",
                b.mime_type             AS "mime_type?",
                b.size_bytes            AS "size_bytes!",
                b.hash                  AS "hash!",
                b.width                 AS "width?",
                b.height                AS "height?"
            "#,
            comment_id,
            attachment_ids
        )
        .fetch_all(pool)
        .await?;

        Ok(records)
    }

    /// Get the project_id for an attachment via its blob.
    pub async fn project_id(
        pool: &PgPool,
        attachment_id: Uuid,
    ) -> Result<Option<Uuid>, AttachmentError> {
        let record = sqlx::query_scalar!(
            r#"
            SELECT b.project_id
            FROM attachments a
            INNER JOIN blobs b ON b.id = a.blob_id
            WHERE a.id = $1
            "#,
            attachment_id
        )
        .fetch_optional(pool)
        .await?;

        Ok(record)
    }

    /// Get the blob data for an attachment.
    pub async fn get_blob(pool: &PgPool, attachment_id: Uuid) -> Result<Option<Blob>, AttachmentError> {
        let record = sqlx::query_as!(
            Blob,
            r#"
            SELECT
                b.id                  AS "id!: Uuid",
                b.project_id          AS "project_id!: Uuid",
                b.blob_path           AS "blob_path!",
                b.thumbnail_blob_path AS "thumbnail_blob_path?",
                b.original_name       AS "original_name!",
                b.mime_type           AS "mime_type?",
                b.size_bytes          AS "size_bytes!",
                b.hash                AS "hash!",
                b.width               AS "width?",
                b.height              AS "height?",
                b.created_at          AS "created_at!: DateTime<Utc>",
                b.updated_at          AS "updated_at!: DateTime<Utc>"
            FROM attachments a
            INNER JOIN blobs b ON b.id = a.blob_id
            WHERE a.id = $1
            "#,
            attachment_id
        )
        .fetch_optional(pool)
        .await?;

        Ok(record)
    }

    /// Find attachments whose `expires_at` is in the past (abandoned staged uploads).
    /// Returns up to `limit` results, oldest expired first.
    pub async fn find_expired(
        pool: &PgPool,
        limit: i64,
    ) -> Result<Vec<Attachment>, AttachmentError> {
        let records = sqlx::query_as!(
            Attachment,
            r#"
            SELECT
                id          AS "id!: Uuid",
                blob_id     AS "blob_id!: Uuid",
                issue_id    AS "issue_id?: Uuid",
                comment_id  AS "comment_id?: Uuid",
                created_at  AS "created_at!: DateTime<Utc>",
                expires_at  AS "expires_at?: DateTime<Utc>"
            FROM attachments
            WHERE expires_at IS NOT NULL AND expires_at < NOW()
            ORDER BY expires_at ASC
            LIMIT $1
            "#,
            limit
        )
        .fetch_all(pool)
        .await?;

        Ok(records)
    }
}
