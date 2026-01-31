use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, Row, SqlitePool, Type};
use strum_macros::{Display, EnumString};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Type, Serialize, Deserialize, PartialEq, TS, EnumString, Display, Default)]
#[sqlx(type_name = "sandbox_status", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
#[strum(serialize_all = "lowercase")]
pub enum SandboxStatus {
    #[default]
    Idle,
    Busy,
    Destroyed,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct Sandbox {
    pub id: Uuid,
    pub daytona_id: String,
    pub swarm_id: Option<Uuid>,
    pub status: SandboxStatus,
    pub current_task_id: Option<Uuid>,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date | null")]
    pub last_used_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateSandbox {
    pub daytona_id: String,
    pub swarm_id: Option<Uuid>,
}

impl Sandbox {
    fn from_row(row: sqlx::sqlite::SqliteRow) -> Result<Self, sqlx::Error> {
        let status_str: String = row.try_get("status")?;
        let status = status_str.parse::<SandboxStatus>().unwrap_or_default();

        Ok(Self {
            id: row.try_get("id")?,
            daytona_id: row.try_get("daytona_id")?,
            swarm_id: row.try_get("swarm_id")?,
            status,
            current_task_id: row.try_get("current_task_id")?,
            created_at: row.try_get("created_at")?,
            last_used_at: row.try_get("last_used_at")?,
        })
    }

    pub async fn find_all(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        let rows = sqlx::query(
            "SELECT id, daytona_id, swarm_id, status, current_task_id, created_at, last_used_at
             FROM sandboxes
             ORDER BY created_at DESC"
        )
        .fetch_all(pool)
        .await?;

        rows.into_iter().map(Self::from_row).collect()
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        let row = sqlx::query(
            "SELECT id, daytona_id, swarm_id, status, current_task_id, created_at, last_used_at
             FROM sandboxes
             WHERE id = $1"
        )
        .bind(id)
        .fetch_optional(pool)
        .await?;

        row.map(Self::from_row).transpose()
    }

    pub async fn find_by_daytona_id(pool: &SqlitePool, daytona_id: &str) -> Result<Option<Self>, sqlx::Error> {
        let row = sqlx::query(
            "SELECT id, daytona_id, swarm_id, status, current_task_id, created_at, last_used_at
             FROM sandboxes
             WHERE daytona_id = $1"
        )
        .bind(daytona_id)
        .fetch_optional(pool)
        .await?;

        row.map(Self::from_row).transpose()
    }

    pub async fn find_idle(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        let rows = sqlx::query(
            "SELECT id, daytona_id, swarm_id, status, current_task_id, created_at, last_used_at
             FROM sandboxes
             WHERE status = 'idle'
             ORDER BY last_used_at ASC"
        )
        .fetch_all(pool)
        .await?;

        rows.into_iter().map(Self::from_row).collect()
    }

    pub async fn find_busy(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        let rows = sqlx::query(
            "SELECT id, daytona_id, swarm_id, status, current_task_id, created_at, last_used_at
             FROM sandboxes
             WHERE status = 'busy'
             ORDER BY created_at DESC"
        )
        .fetch_all(pool)
        .await?;

        rows.into_iter().map(Self::from_row).collect()
    }

    pub async fn count_active(pool: &SqlitePool) -> Result<i64, sqlx::Error> {
        let row = sqlx::query("SELECT COUNT(*) as count FROM sandboxes WHERE status != 'destroyed'")
            .fetch_one(pool)
            .await?;

        row.try_get::<i64, _>("count")
    }

    pub async fn create(pool: &SqlitePool, data: &CreateSandbox, sandbox_id: Uuid) -> Result<Self, sqlx::Error> {
        let row = sqlx::query(
            "INSERT INTO sandboxes (id, daytona_id, swarm_id)
             VALUES ($1, $2, $3)
             RETURNING id, daytona_id, swarm_id, status, current_task_id, created_at, last_used_at"
        )
        .bind(sandbox_id)
        .bind(&data.daytona_id)
        .bind(data.swarm_id)
        .fetch_one(pool)
        .await?;

        Self::from_row(row)
    }

    pub async fn update_status(pool: &SqlitePool, id: Uuid, status: SandboxStatus) -> Result<(), sqlx::Error> {
        let status_str = status.to_string();
        sqlx::query("UPDATE sandboxes SET status = $2, last_used_at = CURRENT_TIMESTAMP WHERE id = $1")
            .bind(id)
            .bind(&status_str)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn assign_task(pool: &SqlitePool, id: Uuid, task_id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE sandboxes SET current_task_id = $2, status = 'busy', last_used_at = CURRENT_TIMESTAMP WHERE id = $1")
            .bind(id)
            .bind(task_id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn release_task(pool: &SqlitePool, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE sandboxes SET current_task_id = NULL, status = 'idle', last_used_at = CURRENT_TIMESTAMP WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn mark_destroyed(pool: &SqlitePool, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE sandboxes SET status = 'destroyed', current_task_id = NULL WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query("DELETE FROM sandboxes WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    pub async fn delete_destroyed(pool: &SqlitePool) -> Result<u64, sqlx::Error> {
        let result = sqlx::query("DELETE FROM sandboxes WHERE status = 'destroyed'")
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }
}
