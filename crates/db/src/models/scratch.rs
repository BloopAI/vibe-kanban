use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
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
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct RichText {
    pub json: Value,
    pub md: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "type", content = "data", rename_all = "snake_case")]
pub enum ScratchPayload {
    DraftTask(RichText),
    DraftFollowUp(RichText),
}

#[derive(Debug, Clone, FromRow)]
struct ScratchRow {
    pub id: Uuid,
    pub payload_type: String,
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

impl TryFrom<ScratchRow> for Scratch {
    type Error = ScratchError;
    fn try_from(r: ScratchRow) -> Result<Self, ScratchError> {
        let rich: RichText = serde_json::from_str(&r.payload)?;

        let payload = match r.payload_type.as_str() {
            "draft_task" => ScratchPayload::DraftTask(rich),
            "draft_follow_up" => ScratchPayload::DraftFollowUp(rich),
            _ => return Err(ScratchError::UnknownScratchType(r.payload_type)),
        };

        Ok(Scratch {
            id: r.id,
            payload,
            created_at: r.created_at,
            updated_at: r.updated_at,
        })
    }
}

#[derive(Debug, Serialize, Deserialize, TS)]
pub struct CreateScratch {
    pub payload: ScratchPayload,
}

#[derive(Debug, Serialize, Deserialize, TS)]
pub struct UpdateScratch {
    pub payload: Option<ScratchPayload>,
}

impl Scratch {
    pub async fn create(
        pool: &SqlitePool,
        id: Uuid,
        data: &CreateScratch,
    ) -> Result<Self, ScratchError> {
        let payload_type_str = match &data.payload {
            ScratchPayload::DraftTask(_) => "draft_task",
            ScratchPayload::DraftFollowUp(_) => "draft_follow_up",
        };

        let rich = match &data.payload {
            ScratchPayload::DraftTask(r) | ScratchPayload::DraftFollowUp(r) => r,
        };

        let payload_str =
            serde_json::to_string(rich).map_err(|e| sqlx::Error::Protocol(e.to_string()))?;

        let row = sqlx::query_as!(
            ScratchRow,
            r#"
            INSERT INTO scratch (id, payload_type, payload)
            VALUES ($1, $2, $3)
            RETURNING
                id              as "id!: Uuid",
                payload_type,
                payload,
                created_at      as "created_at!: DateTime<Utc>",
                updated_at      as "updated_at!: DateTime<Utc>"
            "#,
            id,
            payload_type_str,
            payload_str,
        )
        .fetch_one(pool)
        .await?;

        Ok(Scratch::try_from(row)?)
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, ScratchError> {
        let row = sqlx::query_as!(
            ScratchRow,
            r#"
            SELECT
                id              as "id!: Uuid",
                payload_type,
                payload,
                created_at      as "created_at!: DateTime<Utc>",
                updated_at      as "updated_at!: DateTime<Utc>"
            FROM scratch
            WHERE id = $1
            "#,
            id,
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
                payload_type,
                payload,
                created_at      as "created_at!: DateTime<Utc>",
                updated_at      as "updated_at!: DateTime<Utc>"
            FROM scratch
            ORDER BY created_at DESC
            "#
        )
        .fetch_all(pool)
        .await?;

        tracing::info!("DEBUG1");

        let scratches = rows
            .into_iter()
            .filter_map(|row| Scratch::try_from(row).ok())
            .collect();

        Ok(scratches)
    }

    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        data: &UpdateScratch,
    ) -> Result<Option<Self>, ScratchError> {
        if let Some(existing) = Self::find_by_id(pool, id).await? {
            let new_payload = data.payload.clone().unwrap_or(existing.payload);

            let payload_type_str = match &new_payload {
                ScratchPayload::DraftTask(_) => "draft_task",
                ScratchPayload::DraftFollowUp(_) => "draft_follow_up",
            };

            let rich = match &new_payload {
                ScratchPayload::DraftTask(r) | ScratchPayload::DraftFollowUp(r) => r,
            };

            let payload_str = serde_json::to_string(rich)?;

            let row = sqlx::query_as!(
                ScratchRow,
                r#"
                UPDATE scratch
                SET
                    payload_type = $2,
                    payload      = $3,
                    updated_at   = CURRENT_TIMESTAMP
                WHERE id = $1
                RETURNING
                    id              as "id!: Uuid",
                    payload_type,
                    payload,
                    created_at      as "created_at!: DateTime<Utc>",
                    updated_at      as "updated_at!: DateTime<Utc>"
                "#,
                id,
                payload_type_str,
                payload_str,
            )
            .fetch_optional(pool)
            .await?;

            let scratch = row.map(Scratch::try_from).transpose()?;
            Ok(scratch)
        } else {
            Ok(None)
        }
    }

    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM scratch WHERE id = $1", id)
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
                payload_type,
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
