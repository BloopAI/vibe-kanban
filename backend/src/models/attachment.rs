use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow, TS)]
#[ts(export)]
pub struct Attachment {
    pub id: Uuid,
    pub task_id: Uuid,
    pub filename: String,
    pub original_filename: String,
    pub content_type: String,
    pub size: i64,
    pub created_at: DateTime<Utc>,
}

impl Attachment {
    pub async fn create(
        pool: &sqlx::SqlitePool,
        task_id: Uuid,
        filename: String,
        original_filename: String,
        content_type: String,
        size: i64,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        let created_at = Utc::now();

        let attachment = sqlx::query_as::<_, Attachment>(
            r#"
            INSERT INTO attachments (id, task_id, filename, original_filename, content_type, size, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            RETURNING *
            "#,
        )
        .bind(id)
        .bind(task_id)
        .bind(&filename)
        .bind(&original_filename)
        .bind(&content_type)
        .bind(size)
        .bind(created_at)
        .fetch_one(pool)
        .await?;

        Ok(attachment)
    }

    pub async fn find_by_task_id(
        pool: &sqlx::SqlitePool,
        task_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        let attachments = sqlx::query_as::<_, Attachment>(
            r#"
            SELECT * FROM attachments
            WHERE task_id = ?1
            ORDER BY created_at DESC
            "#,
        )
        .bind(task_id)
        .fetch_all(pool)
        .await?;

        Ok(attachments)
    }

    pub async fn find_by_id(
        pool: &sqlx::SqlitePool,
        id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        let attachment = sqlx::query_as::<_, Attachment>(
            r#"
            SELECT * FROM attachments
            WHERE id = ?1
            "#,
        )
        .bind(id)
        .fetch_optional(pool)
        .await?;

        Ok(attachment)
    }

    pub async fn delete(pool: &sqlx::SqlitePool, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM attachments WHERE id = ?1")
            .bind(id)
            .execute(pool)
            .await?;

        Ok(())
    }
}