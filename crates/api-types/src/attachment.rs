use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

/// An attachment links a blob to an issue or comment.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Attachment {
    pub id: Uuid,
    pub blob_id: Uuid,
    pub issue_id: Option<Uuid>,
    pub comment_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
}

/// An attachment with its associated blob data (for API responses).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct AttachmentWithBlob {
    pub id: Uuid,
    pub blob_id: Uuid,
    pub issue_id: Option<Uuid>,
    pub comment_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    // Blob fields
    pub blob_path: String,
    pub thumbnail_blob_path: Option<String>,
    pub original_name: String,
    pub mime_type: Option<String>,
    pub size_bytes: i64,
    pub hash: String,
    pub width: Option<i32>,
    pub height: Option<i32>,
}

/// An attachment with blob data and a presigned file URL.
#[derive(Debug, Serialize, Deserialize)]
pub struct AttachmentWithUrl {
    #[serde(flatten)]
    pub attachment: AttachmentWithBlob,
    pub file_url: Option<String>,
}

/// Response from listing attachments.
#[derive(Debug, Serialize, Deserialize)]
pub struct ListAttachmentsResponse {
    pub attachments: Vec<AttachmentWithUrl>,
}

/// Response containing a presigned URL for an attachment file or thumbnail.
#[derive(Debug, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct AttachmentUrlResponse {
    pub url: String,
}
