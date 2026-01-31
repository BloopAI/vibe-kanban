use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, Row, SqlitePool, Type};
use strum_macros::{Display, EnumString};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Type, Serialize, Deserialize, PartialEq, TS, EnumString, Display)]
#[sqlx(type_name = "sender_type", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
#[strum(serialize_all = "lowercase")]
pub enum SenderType {
    System,
    User,
    Sandbox,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct SwarmChat {
    pub id: Uuid,
    pub swarm_id: Uuid,
    pub sender_type: SenderType,
    pub sender_id: Option<String>,
    pub message: String,
    pub metadata: Option<String>,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateSwarmChat {
    pub swarm_id: Uuid,
    pub sender_type: SenderType,
    pub sender_id: Option<String>,
    pub message: String,
    pub metadata: Option<String>,
}

impl SwarmChat {
    fn from_row(row: sqlx::sqlite::SqliteRow) -> Result<Self, sqlx::Error> {
        let sender_type_str: String = row.try_get("sender_type")?;
        let sender_type = sender_type_str.parse::<SenderType>().unwrap_or(SenderType::System);

        Ok(Self {
            id: row.try_get("id")?,
            swarm_id: row.try_get("swarm_id")?,
            sender_type,
            sender_id: row.try_get("sender_id")?,
            message: row.try_get("message")?,
            metadata: row.try_get("metadata")?,
            created_at: row.try_get("created_at")?,
        })
    }

    pub async fn find_by_swarm_id(
        pool: &SqlitePool,
        swarm_id: Uuid,
        limit: Option<i32>,
    ) -> Result<Vec<Self>, sqlx::Error> {
        let limit = limit.unwrap_or(100).min(500);
        let rows = sqlx::query(
            "SELECT id, swarm_id, sender_type, sender_id, message, metadata, created_at
             FROM swarm_chat
             WHERE swarm_id = $1
             ORDER BY created_at DESC
             LIMIT $2"
        )
        .bind(swarm_id)
        .bind(limit)
        .fetch_all(pool)
        .await?;

        rows.into_iter().map(Self::from_row).collect()
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        let row = sqlx::query(
            "SELECT id, swarm_id, sender_type, sender_id, message, metadata, created_at
             FROM swarm_chat
             WHERE id = $1"
        )
        .bind(id)
        .fetch_optional(pool)
        .await?;

        row.map(Self::from_row).transpose()
    }

    pub async fn create(pool: &SqlitePool, data: &CreateSwarmChat, message_id: Uuid) -> Result<Self, sqlx::Error> {
        let sender_type_str = data.sender_type.to_string();

        let row = sqlx::query(
            "INSERT INTO swarm_chat (id, swarm_id, sender_type, sender_id, message, metadata)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, swarm_id, sender_type, sender_id, message, metadata, created_at"
        )
        .bind(message_id)
        .bind(data.swarm_id)
        .bind(&sender_type_str)
        .bind(&data.sender_id)
        .bind(&data.message)
        .bind(&data.metadata)
        .fetch_one(pool)
        .await?;

        Self::from_row(row)
    }

    pub async fn delete_by_swarm_id(pool: &SqlitePool, swarm_id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query("DELETE FROM swarm_chat WHERE swarm_id = $1")
            .bind(swarm_id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }
}
