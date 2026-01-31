use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, Row, SqlitePool, Type};
use strum_macros::{Display, EnumString};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Type, Serialize, Deserialize, PartialEq, TS, EnumString, Display, Default)]
#[sqlx(type_name = "swarm_status", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
#[strum(serialize_all = "lowercase")]
pub enum SwarmStatus {
    #[default]
    Active,
    Paused,
    Stopped,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct Swarm {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub status: SwarmStatus,
    pub project_id: Option<Uuid>,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateSwarm {
    pub name: String,
    pub description: Option<String>,
    pub project_id: Option<Uuid>,
}

#[derive(Debug, Deserialize, TS)]
pub struct UpdateSwarm {
    pub name: Option<String>,
    pub description: Option<String>,
    pub status: Option<SwarmStatus>,
}

impl Swarm {
    fn from_row(row: sqlx::sqlite::SqliteRow) -> Result<Self, sqlx::Error> {
        let status_str: String = row.try_get("status")?;
        let status = status_str.parse::<SwarmStatus>().unwrap_or_else(|_| {
            tracing::warn!(
                status = %status_str,
                "Invalid swarm status in database, falling back to default"
            );
            SwarmStatus::default()
        });

        Ok(Self {
            id: row.try_get("id")?,
            name: row.try_get("name")?,
            description: row.try_get("description")?,
            status,
            project_id: row.try_get("project_id")?,
            created_at: row.try_get("created_at")?,
            updated_at: row.try_get("updated_at")?,
        })
    }

    pub async fn find_all(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        let rows = sqlx::query(
            "SELECT id, name, description, status, project_id, created_at, updated_at
             FROM swarms
             ORDER BY created_at DESC"
        )
        .fetch_all(pool)
        .await?;

        rows.into_iter().map(Self::from_row).collect()
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        let row = sqlx::query(
            "SELECT id, name, description, status, project_id, created_at, updated_at
             FROM swarms
             WHERE id = $1"
        )
        .bind(id)
        .fetch_optional(pool)
        .await?;

        row.map(Self::from_row).transpose()
    }

    pub async fn find_by_project_id(pool: &SqlitePool, project_id: Uuid) -> Result<Vec<Self>, sqlx::Error> {
        let rows = sqlx::query(
            "SELECT id, name, description, status, project_id, created_at, updated_at
             FROM swarms
             WHERE project_id = $1
             ORDER BY created_at DESC"
        )
        .bind(project_id)
        .fetch_all(pool)
        .await?;

        rows.into_iter().map(Self::from_row).collect()
    }

    pub async fn find_active(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        let rows = sqlx::query(
            "SELECT id, name, description, status, project_id, created_at, updated_at
             FROM swarms
             WHERE status = 'active'
             ORDER BY created_at DESC"
        )
        .fetch_all(pool)
        .await?;

        rows.into_iter().map(Self::from_row).collect()
    }

    pub async fn create(pool: &SqlitePool, data: &CreateSwarm, swarm_id: Uuid) -> Result<Self, sqlx::Error> {
        let row = sqlx::query(
            "INSERT INTO swarms (id, name, description, project_id)
             VALUES ($1, $2, $3, $4)
             RETURNING id, name, description, status, project_id, created_at, updated_at"
        )
        .bind(swarm_id)
        .bind(&data.name)
        .bind(&data.description)
        .bind(data.project_id)
        .fetch_one(pool)
        .await?;

        Self::from_row(row)
    }

    pub async fn update(pool: &SqlitePool, id: Uuid, data: &UpdateSwarm) -> Result<Self, sqlx::Error> {
        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        let name = data.name.clone().unwrap_or(existing.name);
        let description = data.description.clone().or(existing.description);
        let status = data.status.clone().unwrap_or(existing.status);
        let status_str = status.to_string();

        let row = sqlx::query(
            "UPDATE swarms
             SET name = $2, description = $3, status = $4, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING id, name, description, status, project_id, created_at, updated_at"
        )
        .bind(id)
        .bind(&name)
        .bind(&description)
        .bind(&status_str)
        .fetch_one(pool)
        .await?;

        Self::from_row(row)
    }

    pub async fn update_status(pool: &SqlitePool, id: Uuid, status: SwarmStatus) -> Result<(), sqlx::Error> {
        let status_str = status.to_string();
        sqlx::query("UPDATE swarms SET status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1")
            .bind(id)
            .bind(&status_str)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query("DELETE FROM swarms WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }
}
