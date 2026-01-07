use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use strum_macros::{Display, EnumDiscriminants, EnumString};
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum ScratchError {
    #[error(transparent)]
    Serde(#[from] serde_json::Error),
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error("Scratch type mismatch: expected '{expected}' but got '{actual}'")]
    TypeMismatch { expected: String, actual: String },
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
#[derive(Debug, Clone, Serialize, Deserialize, TS, EnumDiscriminants)]
#[serde(tag = "type", content = "data", rename_all = "SCREAMING_SNAKE_CASE")]
#[strum_discriminants(name(ScratchType))]
#[strum_discriminants(derive(Display, EnumString, Serialize, Deserialize, TS))]
#[strum_discriminants(ts(use_ts_enum))]
#[strum_discriminants(serde(rename_all = "SCREAMING_SNAKE_CASE"))]
#[strum_discriminants(strum(serialize_all = "SCREAMING_SNAKE_CASE"))]
pub enum ScratchPayload {
    DraftTask(String),
    DraftFollowUp(DraftFollowUpData),
}

impl ScratchPayload {
    /// Returns the scratch type for this payload
    pub fn scratch_type(&self) -> ScratchType {
        ScratchType::from(self)
    }

    /// Validates that the payload type matches the expected type
    pub fn validate_type(&self, expected: ScratchType) -> Result<(), ScratchError> {
        let actual = self.scratch_type();
        if actual != expected {
            return Err(ScratchError::TypeMismatch {
                expected: expected.to_string(),
                actual: actual.to_string(),
            });
        }
        Ok(())
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
    pub fn scratch_type(&self) -> ScratchType {
        self.payload.scratch_type()
    }
}

impl TryFrom<ScratchRow> for Scratch {
    type Error = ScratchError;
    fn try_from(r: ScratchRow) -> Result<Self, ScratchError> {
        let payload: ScratchPayload = serde_json::from_str(&r.payload)?;
        payload.validate_type(r.scratch_type.parse().map_err(|_| {
            ScratchError::TypeMismatch {
                expected: r.scratch_type.clone(),
                actual: payload.scratch_type().to_string(),
            }
        })?)?;
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
    pub payload: ScratchPayload,
}

impl Scratch {
    pub async fn create(
        pool: &SqlitePool,
        id: Uuid,
        data: &CreateScratch,
    ) -> Result<Self, ScratchError> {
        let scratch_type_str = data.payload.scratch_type().to_string();
        let payload_str = serde_json::to_string(&data.payload)?;

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
    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        scratch_type: &ScratchType,
        data: &UpdateScratch,
    ) -> Result<Self, ScratchError> {
        let payload_str = serde_json::to_string(&data.payload)?;
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

        Scratch::try_from(row)
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
