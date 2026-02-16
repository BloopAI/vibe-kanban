use chrono::{DateTime, Utc};
use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct PendingUpload {
    pub id: Uuid,
    pub project_id: Uuid,
    pub blob_path: String,
    pub hash: String,
    pub created_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, Error)]
pub enum PendingUploadError {
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}

pub struct PendingUploadRepository;

impl PendingUploadRepository {
    pub async fn create(
        pool: &PgPool,
        project_id: Uuid,
        blob_path: String,
        hash: String,
        expires_at: DateTime<Utc>,
    ) -> Result<PendingUpload, PendingUploadError> {
        let record = sqlx::query_as!(
            PendingUpload,
            r#"
            INSERT INTO pending_uploads (project_id, blob_path, hash, expires_at)
            VALUES ($1, $2, $3, $4)
            RETURNING
                id          AS "id!: Uuid",
                project_id  AS "project_id!: Uuid",
                blob_path   AS "blob_path!",
                hash        AS "hash!",
                created_at  AS "created_at!: DateTime<Utc>",
                expires_at  AS "expires_at!: DateTime<Utc>"
            "#,
            project_id,
            blob_path,
            hash,
            expires_at,
        )
        .fetch_one(pool)
        .await?;

        Ok(record)
    }

    pub async fn find_by_id(
        pool: &PgPool,
        id: Uuid,
    ) -> Result<Option<PendingUpload>, PendingUploadError> {
        let record = sqlx::query_as!(
            PendingUpload,
            r#"
            SELECT
                id          AS "id!: Uuid",
                project_id  AS "project_id!: Uuid",
                blob_path   AS "blob_path!",
                hash        AS "hash!",
                created_at  AS "created_at!: DateTime<Utc>",
                expires_at  AS "expires_at!: DateTime<Utc>"
            FROM pending_uploads
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(pool)
        .await?;

        Ok(record)
    }

    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<(), PendingUploadError> {
        sqlx::query!("DELETE FROM pending_uploads WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn delete_expired(pool: &PgPool) -> Result<Vec<PendingUpload>, PendingUploadError> {
        let records = sqlx::query_as!(
            PendingUpload,
            r#"
            DELETE FROM pending_uploads
            WHERE expires_at < NOW()
            RETURNING
                id          AS "id!: Uuid",
                project_id  AS "project_id!: Uuid",
                blob_path   AS "blob_path!",
                hash        AS "hash!",
                created_at  AS "created_at!: DateTime<Utc>",
                expires_at  AS "expires_at!: DateTime<Utc>"
            "#,
        )
        .fetch_all(pool)
        .await?;
        Ok(records)
    }
}
