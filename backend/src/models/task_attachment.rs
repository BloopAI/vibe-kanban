use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TaskAttachment {
    pub id: Uuid,
    pub task_id: Uuid,
    pub file_name: String,
    pub file_type: String,
    pub file_size: i64,
    #[serde(skip_serializing)] // Don't send binary data in JSON responses
    #[ts(skip)]
    pub file_data: Vec<u8>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TaskAttachmentInfo {
    pub id: Uuid,
    pub task_id: Uuid,
    pub file_name: String,
    pub file_type: String,
    pub file_size: i64,
    pub created_at: DateTime<Utc>,
}

impl TaskAttachment {
    pub async fn create(
        pool: &SqlitePool,
        task_id: Uuid,
        file_name: String,
        file_type: String,
        file_data: Vec<u8>,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        let file_size = file_data.len() as i64;
        
        sqlx::query_as!(
            TaskAttachment,
            r#"INSERT INTO task_attachments (id, task_id, file_name, file_type, file_size, file_data) 
               VALUES ($1, $2, $3, $4, $5, $6)
               RETURNING id as "id!: Uuid", task_id as "task_id!: Uuid", file_name, file_type, file_size, file_data, created_at as "created_at!: DateTime<Utc>""#,
            id,
            task_id,
            file_name,
            file_type,
            file_size,
            file_data
        )
        .fetch_one(pool)
        .await
    }
    
    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskAttachment,
            r#"SELECT id as "id!: Uuid", task_id as "task_id!: Uuid", file_name, file_type, file_size, file_data, created_at as "created_at!: DateTime<Utc>"
               FROM task_attachments
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }
    
    pub async fn find_by_task_id(pool: &SqlitePool, task_id: Uuid) -> Result<Vec<TaskAttachmentInfo>, sqlx::Error> {
        let attachments = sqlx::query!(
            r#"SELECT id as "id!: Uuid", task_id as "task_id!: Uuid", file_name, file_type, file_size, created_at as "created_at!: DateTime<Utc>"
               FROM task_attachments
               WHERE task_id = $1
               ORDER BY created_at ASC"#,
            task_id
        )
        .fetch_all(pool)
        .await?;
        
        Ok(attachments.into_iter().map(|row| TaskAttachmentInfo {
            id: row.id,
            task_id: row.task_id,
            file_name: row.file_name,
            file_type: row.file_type,
            file_size: row.file_size,
            created_at: row.created_at,
        }).collect())
    }
    
    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!(
            "DELETE FROM task_attachments WHERE id = $1",
            id
        )
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }
}