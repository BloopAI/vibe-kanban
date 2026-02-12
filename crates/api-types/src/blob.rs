use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Blob {
    pub id: Uuid,
    pub project_id: Uuid,
    pub blob_path: String,
    pub thumbnail_blob_path: Option<String>,
    pub original_name: String,
    pub mime_type: Option<String>,
    pub size_bytes: i64,
    pub hash: String,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
