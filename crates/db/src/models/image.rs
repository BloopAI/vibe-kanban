use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct Image {
    pub id: Uuid,
    pub file_path: String, // relative path within cache/images/
    pub original_name: String,
    pub mime_type: Option<String>,
    pub size_bytes: i64,
    pub hash: String, // SHA256 hash for deduplication
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateImage {
    pub file_path: String,
    pub original_name: String,
    pub mime_type: Option<String>,
    pub size_bytes: i64,
    pub hash: String,
}

impl Image {
    pub async fn create(pool: &SqlitePool, data: &CreateImage) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        sqlx::query_as!(
            Image,
            r#"INSERT INTO images (id, file_path, original_name, mime_type, size_bytes, hash)
               VALUES ($1, $2, $3, $4, $5, $6)
               RETURNING id as "id!: Uuid", 
                         file_path as "file_path!", 
                         original_name as "original_name!", 
                         mime_type,
                         size_bytes as "size_bytes!",
                         hash as "hash!",
                         created_at as "created_at!: DateTime<Utc>", 
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            data.file_path,
            data.original_name,
            data.mime_type,
            data.size_bytes,
            data.hash,
        )
        .fetch_one(pool)
        .await
    }

    pub async fn find_by_hash(pool: &SqlitePool, hash: &str) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Image,
            r#"SELECT id as "id!: Uuid",
                      file_path as "file_path!",
                      original_name as "original_name!",
                      mime_type,
                      size_bytes as "size_bytes!",
                      hash as "hash!",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM images
               WHERE hash = $1"#,
            hash
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Image,
            r#"SELECT id as "id!: Uuid",
                      file_path as "file_path!",
                      original_name as "original_name!",
                      mime_type,
                      size_bytes as "size_bytes!",
                      hash as "hash!",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM images
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_file_path(
        pool: &SqlitePool,
        file_path: &str,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Image,
            r#"SELECT id as "id!: Uuid",
                      file_path as "file_path!",
                      original_name as "original_name!",
                      mime_type,
                      size_bytes as "size_bytes!",
                      hash as "hash!",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM images
               WHERE file_path = $1"#,
            file_path
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_workspace_id(
        pool: &SqlitePool,
        workspace_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Image,
            r#"SELECT i.id as "id!: Uuid",
                      i.file_path as "file_path!",
                      i.original_name as "original_name!",
                      i.mime_type,
                      i.size_bytes as "size_bytes!",
                      i.hash as "hash!",
                      i.created_at as "created_at!: DateTime<Utc>",
                      i.updated_at as "updated_at!: DateTime<Utc>"
               FROM images i
               JOIN workspace_images wi ON i.id = wi.image_id
               WHERE wi.workspace_id = $1
               ORDER BY wi.created_at"#,
            workspace_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query!(r#"DELETE FROM images WHERE id = $1"#, id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn find_orphaned_images(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Image,
            r#"SELECT i.id as "id!: Uuid",
                      i.file_path as "file_path!",
                      i.original_name as "original_name!",
                      i.mime_type,
                      i.size_bytes as "size_bytes!",
                      i.hash as "hash!",
                      i.created_at as "created_at!: DateTime<Utc>",
                      i.updated_at as "updated_at!: DateTime<Utc>"
               FROM images i
               LEFT JOIN workspace_images wi ON i.id = wi.image_id
               WHERE wi.workspace_id IS NULL"#
        )
        .fetch_all(pool)
        .await
    }
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct WorkspaceImage {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub image_id: Uuid,
    pub created_at: DateTime<Utc>,
}

impl WorkspaceImage {
    /// Associate multiple images with a workspace, skipping duplicates.
    pub async fn associate_many_dedup(
        pool: &SqlitePool,
        workspace_id: Uuid,
        image_ids: &[Uuid],
    ) -> Result<(), sqlx::Error> {
        for &image_id in image_ids {
            let id = Uuid::new_v4();
            sqlx::query!(
                r#"INSERT INTO workspace_images (id, workspace_id, image_id)
                   SELECT $1, $2, $3
                   WHERE NOT EXISTS (
                       SELECT 1 FROM workspace_images WHERE workspace_id = $2 AND image_id = $3
                   )"#,
                id,
                workspace_id,
                image_id
            )
            .execute(pool)
            .await?;
        }
        Ok(())
    }
}
