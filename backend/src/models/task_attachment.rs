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
        _pool: &SqlitePool,
        task_id: Uuid,
        file_name: String,
        file_type: String,
        file_data: Vec<u8>,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        let file_size = file_data.len() as i64;
        let created_at = Utc::now();
        
        // TODO: Uncomment after running migrations and updating SQLx cache
        // For now, return a dummy attachment to allow compilation
        Ok(Self {
            id,
            task_id,
            file_name,
            file_type,
            file_size,
            file_data,
            created_at,
        })
    }
    
    pub async fn find_by_id(_pool: &SqlitePool, _id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        // TODO: Uncomment after running migrations and updating SQLx cache
        // For now, return None to allow compilation
        Ok(None)
    }
    
    pub async fn find_by_task_id(_pool: &SqlitePool, _task_id: Uuid) -> Result<Vec<TaskAttachmentInfo>, sqlx::Error> {
        // TODO: Uncomment after running migrations and updating SQLx cache
        // For now, return empty vec to allow compilation
        Ok(Vec::new())
    }
    
    pub async fn delete(_pool: &SqlitePool, _id: Uuid) -> Result<u64, sqlx::Error> {
        // TODO: Uncomment after running migrations and updating SQLx cache
        // For now, return 0 to allow compilation
        Ok(0)
    }
}