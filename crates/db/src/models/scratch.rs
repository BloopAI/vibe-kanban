use std::{fmt, str::FromStr};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum ScratchError {
    #[error(transparent)]
    Serde(#[from] serde_json::Error),
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error("Unknown scratch type: {0}")]
    UnknownScratchType(String),
    #[error("Scratch type mismatch: URL has '{url_type}' but payload has '{payload_type}'")]
    TypeMismatch {
        url_type: String,
        payload_type: String,
    },
}

/// Data for a draft follow-up scratch
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct DraftFollowUpData {
    pub message: String,
    #[serde(default)]
    pub variant: Option<String>,
}

/// The payload of a scratch, tagged by type. The type is part of the composite primary key.
/// Data is stored as markdown string.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "type", content = "data")]
pub enum ScratchPayload {
    #[serde(rename = "draft_task")]
    DraftTask(String),
    #[serde(rename = "draft_follow_up")]
    DraftFollowUp(DraftFollowUpData),
}

impl ScratchPayload {
    /// Returns the scratch type string for database storage and URL matching
    pub fn scratch_type(&self) -> &'static str {
        match self {
            Self::DraftTask(_) => "draft_task",
            Self::DraftFollowUp(_) => "draft_follow_up",
        }
    }

    /// Validates that the payload type matches the expected URL type
    pub fn validate_type(&self, url_type: &str) -> Result<(), ScratchError> {
        let payload_type = self.scratch_type();
        if payload_type != url_type {
            return Err(ScratchError::TypeMismatch {
                url_type: url_type.to_string(),
                payload_type: payload_type.to_string(),
            });
        }
        Ok(())
    }
}

impl fmt::Display for ScratchPayload {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.scratch_type())
    }
}

/// Used for URL path parsing - validates the scratch type from URL
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScratchType {
    DraftTask,
    DraftFollowUp,
}

impl fmt::Display for ScratchType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::DraftTask => write!(f, "draft_task"),
            Self::DraftFollowUp => write!(f, "draft_follow_up"),
        }
    }
}

impl FromStr for ScratchType {
    type Err = ScratchError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "draft_task" => Ok(Self::DraftTask),
            "draft_follow_up" => Ok(Self::DraftFollowUp),
            _ => Err(ScratchError::UnknownScratchType(s.to_string())),
        }
    }
}

#[derive(Debug, Clone, FromRow)]
struct ScratchRow {
    pub id: Uuid,
    pub scratch_type: String,
    pub payload: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Scratch {
    pub id: Uuid,
    pub payload: ScratchPayload,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Scratch {
    /// Returns the scratch type derived from the payload
    pub fn scratch_type(&self) -> &'static str {
        self.payload.scratch_type()
    }
}

impl TryFrom<ScratchRow> for Scratch {
    type Error = ScratchError;
    fn try_from(r: ScratchRow) -> Result<Self, ScratchError> {
        // Reconstruct the tagged enum based on scratch_type
        let payload = match r.scratch_type.as_str() {
            "draft_task" => {
                let data: String = serde_json::from_str(&r.payload)?;
                ScratchPayload::DraftTask(data)
            }
            "draft_follow_up" => {
                let data: DraftFollowUpData = serde_json::from_str(&r.payload)?;
                ScratchPayload::DraftFollowUp(data)
            }
            _ => return Err(ScratchError::UnknownScratchType(r.scratch_type)),
        };

        Ok(Scratch {
            id: r.id,
            payload,
            created_at: r.created_at,
            updated_at: r.updated_at,
        })
    }
}

/// Request body for creating a scratch (id comes from URL path, type from payload)
#[derive(Debug, Serialize, Deserialize, TS)]
pub struct CreateScratch {
    pub payload: ScratchPayload,
}

/// Request body for updating a scratch
#[derive(Debug, Serialize, Deserialize, TS)]
pub struct UpdateScratch {
    pub payload: Option<ScratchPayload>,
}

/// Helper to serialize the inner data from a ScratchPayload to JSON string for storage
fn serialize_payload_data(payload: &ScratchPayload) -> Result<String, serde_json::Error> {
    match payload {
        ScratchPayload::DraftTask(data) => serde_json::to_string(data),
        ScratchPayload::DraftFollowUp(data) => serde_json::to_string(data),
    }
}

impl Scratch {
    pub async fn create(
        pool: &SqlitePool,
        id: Uuid,
        data: &CreateScratch,
    ) -> Result<Self, ScratchError> {
        let scratch_type_str = data.payload.scratch_type();
        // Store the data as JSON-encoded string
        let payload_str = serialize_payload_data(&data.payload)?;

        let row = sqlx::query_as!(
            ScratchRow,
            r#"
            INSERT INTO scratch (id, scratch_type, payload)
            VALUES ($1, $2, $3)
            RETURNING
                id              as "id!: Uuid",
                scratch_type,
                payload,
                created_at      as "created_at!: DateTime<Utc>",
                updated_at      as "updated_at!: DateTime<Utc>"
            "#,
            id,
            scratch_type_str,
            payload_str,
        )
        .fetch_one(pool)
        .await?;

        Scratch::try_from(row)
    }

    pub async fn find_by_id(
        pool: &SqlitePool,
        id: Uuid,
        scratch_type: &ScratchType,
    ) -> Result<Option<Self>, ScratchError> {
        let scratch_type_str = scratch_type.to_string();
        let row = sqlx::query_as!(
            ScratchRow,
            r#"
            SELECT
                id              as "id!: Uuid",
                scratch_type,
                payload,
                created_at      as "created_at!: DateTime<Utc>",
                updated_at      as "updated_at!: DateTime<Utc>"
            FROM scratch
            WHERE id = $1 AND scratch_type = $2
            "#,
            id,
            scratch_type_str,
        )
        .fetch_optional(pool)
        .await?;

        let scratch = row.map(Scratch::try_from).transpose()?;
        Ok(scratch)
    }

    pub async fn find_all(pool: &SqlitePool) -> Result<Vec<Self>, ScratchError> {
        let rows = sqlx::query_as!(
            ScratchRow,
            r#"
            SELECT
                id              as "id!: Uuid",
                scratch_type,
                payload,
                created_at      as "created_at!: DateTime<Utc>",
                updated_at      as "updated_at!: DateTime<Utc>"
            FROM scratch
            ORDER BY created_at DESC
            "#
        )
        .fetch_all(pool)
        .await?;

        let scratches = rows
            .into_iter()
            .filter_map(|row| Scratch::try_from(row).ok())
            .collect();

        Ok(scratches)
    }

    /// Upsert a scratch record - creates if not exists, updates if exists.
    /// If `data.payload` is None, returns the existing record unchanged (or None if not found).
    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        scratch_type: &ScratchType,
        data: &UpdateScratch,
    ) -> Result<Option<Self>, ScratchError> {
        // If no payload provided, just fetch and return existing (no upsert possible)
        let Some(ref payload) = data.payload else {
            return Self::find_by_id(pool, id, scratch_type).await;
        };

        let payload_str = serialize_payload_data(payload)?;
        let scratch_type_str = scratch_type.to_string();

        // Upsert: insert if not exists, update if exists
        let row = sqlx::query_as!(
            ScratchRow,
            r#"
            INSERT INTO scratch (id, scratch_type, payload)
            VALUES ($1, $2, $3)
            ON CONFLICT(id, scratch_type) DO UPDATE SET
                payload = excluded.payload,
                updated_at = datetime('now', 'subsec')
            RETURNING
                id              as "id!: Uuid",
                scratch_type,
                payload,
                created_at      as "created_at!: DateTime<Utc>",
                updated_at      as "updated_at!: DateTime<Utc>"
            "#,
            id,
            scratch_type_str,
            payload_str,
        )
        .fetch_one(pool)
        .await?;

        Ok(Some(Scratch::try_from(row)?))
    }

    pub async fn delete(
        pool: &SqlitePool,
        id: Uuid,
        scratch_type: &ScratchType,
    ) -> Result<u64, sqlx::Error> {
        let scratch_type_str = scratch_type.to_string();
        let result = sqlx::query!(
            "DELETE FROM scratch WHERE id = $1 AND scratch_type = $2",
            id,
            scratch_type_str
        )
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }

    pub async fn find_by_rowid(
        pool: &SqlitePool,
        rowid: i64,
    ) -> Result<Option<Self>, ScratchError> {
        let row = sqlx::query_as!(
            ScratchRow,
            r#"
            SELECT
                id              as "id!: Uuid",
                scratch_type,
                payload,
                created_at      as "created_at!: DateTime<Utc>",
                updated_at      as "updated_at!: DateTime<Utc>"
            FROM scratch
            WHERE rowid = $1
            "#,
            rowid
        )
        .fetch_optional(pool)
        .await?;

        let scratch = row.map(Scratch::try_from).transpose()?;
        Ok(scratch)
    }
}
