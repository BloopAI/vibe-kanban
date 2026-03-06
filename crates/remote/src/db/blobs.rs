use api_types::Blob;
use chrono::{DateTime, Utc};
use sqlx::{Executor, PgPool, Postgres};
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum BlobError {
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}

pub struct BlobRepository;

impl BlobRepository {
    pub async fn find_by_id<'e, E>(executor: E, id: Uuid) -> Result<Option<Blob>, BlobError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let record = sqlx::query_as!(
            Blob,
            r#"
            SELECT
                id                  AS "id!: Uuid",
                project_id          AS "project_id!: Uuid",
                blob_path           AS "blob_path!",
                thumbnail_blob_path AS "thumbnail_blob_path?",
                original_name       AS "original_name!",
                mime_type           AS "mime_type?",
                size_bytes          AS "size_bytes!",
                hash                AS "hash!",
                width               AS "width?",
                height              AS "height?",
                created_at          AS "created_at!: DateTime<Utc>",
                updated_at          AS "updated_at!: DateTime<Utc>"
            FROM blobs
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(executor)
        .await?;

        Ok(record)
    }

    /// Find a blob by its content hash within a project.
    pub async fn find_by_hash(
        pool: &PgPool,
        project_id: Uuid,
        hash: &str,
    ) -> Result<Option<Blob>, BlobError> {
        let record = sqlx::query_as!(
            Blob,
            r#"
            SELECT
                id                  AS "id!: Uuid",
                project_id          AS "project_id!: Uuid",
                blob_path           AS "blob_path!",
                thumbnail_blob_path AS "thumbnail_blob_path?",
                original_name       AS "original_name!",
                mime_type           AS "mime_type?",
                size_bytes          AS "size_bytes!",
                hash                AS "hash!",
                width               AS "width?",
                height              AS "height?",
                created_at          AS "created_at!: DateTime<Utc>",
                updated_at          AS "updated_at!: DateTime<Utc>"
            FROM blobs
            WHERE project_id = $1 AND hash = $2
            LIMIT 1
            "#,
            project_id,
            hash
        )
        .fetch_optional(pool)
        .await?;

        Ok(record)
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn create(
        pool: &PgPool,
        id: Option<Uuid>,
        project_id: Uuid,
        blob_path: String,
        thumbnail_blob_path: Option<String>,
        original_name: String,
        mime_type: Option<String>,
        size_bytes: i64,
        hash: String,
        width: Option<i32>,
        height: Option<i32>,
    ) -> Result<Blob, BlobError> {
        let id = id.unwrap_or_else(Uuid::new_v4);

        let data = sqlx::query_as!(
            Blob,
            r#"
            INSERT INTO blobs (
                id, project_id, blob_path, thumbnail_blob_path, original_name,
                mime_type, size_bytes, hash, width, height
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (blob_path) DO UPDATE SET
                updated_at = NOW()
            RETURNING
                id                  AS "id!: Uuid",
                project_id          AS "project_id!: Uuid",
                blob_path           AS "blob_path!",
                thumbnail_blob_path AS "thumbnail_blob_path?",
                original_name       AS "original_name!",
                mime_type           AS "mime_type?",
                size_bytes          AS "size_bytes!",
                hash                AS "hash!",
                width               AS "width?",
                height              AS "height?",
                created_at          AS "created_at!: DateTime<Utc>",
                updated_at          AS "updated_at!: DateTime<Utc>"
            "#,
            id,
            project_id,
            blob_path,
            thumbnail_blob_path,
            original_name,
            mime_type,
            size_bytes,
            hash,
            width,
            height,
        )
        .fetch_one(pool)
        .await?;

        Ok(data)
    }

    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<Option<Blob>, BlobError> {
        let record = sqlx::query_as!(
            Blob,
            r#"
            DELETE FROM blobs
            WHERE id = $1
            RETURNING
                id                  AS "id!: Uuid",
                project_id          AS "project_id!: Uuid",
                blob_path           AS "blob_path!",
                thumbnail_blob_path AS "thumbnail_blob_path?",
                original_name       AS "original_name!",
                mime_type           AS "mime_type?",
                size_bytes          AS "size_bytes!",
                hash                AS "hash!",
                width               AS "width?",
                height              AS "height?",
                created_at          AS "created_at!: DateTime<Utc>",
                updated_at          AS "updated_at!: DateTime<Utc>"
            "#,
            id
        )
        .fetch_optional(pool)
        .await?;

        Ok(record)
    }

    /// Get the organization_id for a blob via its project.
    pub async fn organization_id(pool: &PgPool, blob_id: Uuid) -> Result<Option<Uuid>, BlobError> {
        let record = sqlx::query_scalar!(
            r#"
            SELECT p.organization_id
            FROM blobs b
            INNER JOIN projects p ON p.id = b.project_id
            WHERE b.id = $1
            "#,
            blob_id
        )
        .fetch_optional(pool)
        .await?;

        Ok(record)
    }
}
