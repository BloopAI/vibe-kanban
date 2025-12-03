//! Cached node model for storing node information synced from the hive.
//!
//! This provides a local cache of all nodes in the organization, allowing
//! the frontend to show a unified view of projects across all nodes.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

/// Node status enum matching the remote server's NodeStatus
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum CachedNodeStatus {
    #[default]
    Pending,
    Online,
    Offline,
    Busy,
    Draining,
}

impl std::fmt::Display for CachedNodeStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CachedNodeStatus::Pending => write!(f, "pending"),
            CachedNodeStatus::Online => write!(f, "online"),
            CachedNodeStatus::Offline => write!(f, "offline"),
            CachedNodeStatus::Busy => write!(f, "busy"),
            CachedNodeStatus::Draining => write!(f, "draining"),
        }
    }
}

impl std::str::FromStr for CachedNodeStatus {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "pending" => Ok(CachedNodeStatus::Pending),
            "online" => Ok(CachedNodeStatus::Online),
            "offline" => Ok(CachedNodeStatus::Offline),
            "busy" => Ok(CachedNodeStatus::Busy),
            "draining" => Ok(CachedNodeStatus::Draining),
            _ => Err(format!("Unknown node status: {}", s)),
        }
    }
}

impl From<String> for CachedNodeStatus {
    fn from(s: String) -> Self {
        s.parse().unwrap_or_default()
    }
}

/// Node capabilities describing what a node can execute
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
pub struct CachedNodeCapabilities {
    /// List of executor types this node supports
    #[serde(default)]
    pub executors: Vec<String>,
    /// Maximum number of concurrent tasks
    #[serde(default = "default_max_concurrent")]
    pub max_concurrent_tasks: i32,
    /// Operating system (e.g., "darwin", "linux", "windows")
    #[serde(default)]
    pub os: String,
    /// CPU architecture (e.g., "arm64", "x86_64")
    #[serde(default)]
    pub arch: String,
    /// Vibe Kanban version running on the node
    #[serde(default)]
    pub version: String,
}

fn default_max_concurrent() -> i32 {
    1
}

/// A cached node from the hive
#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct CachedNode {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub name: String,
    pub machine_id: String,
    #[sqlx(try_from = "String")]
    pub status: CachedNodeStatus,
    /// JSON-serialized capabilities
    #[sqlx(rename = "capabilities")]
    #[serde(default)]
    capabilities_json: String,
    pub public_url: Option<String>,
    #[ts(type = "Date | null")]
    pub last_heartbeat_at: Option<DateTime<Utc>>,
    #[ts(type = "Date | null")]
    pub connected_at: Option<DateTime<Utc>>,
    #[ts(type = "Date | null")]
    pub disconnected_at: Option<DateTime<Utc>>,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub last_synced_at: DateTime<Utc>,
}

impl CachedNode {
    /// Parse the capabilities from JSON
    pub fn capabilities(&self) -> CachedNodeCapabilities {
        serde_json::from_str(&self.capabilities_json).unwrap_or_default()
    }
}

/// Input for creating/updating a cached node
#[derive(Debug, Clone)]
pub struct CachedNodeInput {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub name: String,
    pub machine_id: String,
    pub status: CachedNodeStatus,
    pub capabilities: CachedNodeCapabilities,
    pub public_url: Option<String>,
    pub last_heartbeat_at: Option<DateTime<Utc>>,
    pub connected_at: Option<DateTime<Utc>>,
    pub disconnected_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl CachedNode {
    /// List all cached nodes for an organization
    pub async fn list_by_organization(
        pool: &SqlitePool,
        organization_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            CachedNode,
            r#"
            SELECT
                id                  AS "id!: Uuid",
                organization_id     AS "organization_id!: Uuid",
                name                AS "name!",
                machine_id          AS "machine_id!",
                status              AS "status!: String",
                capabilities        AS "capabilities_json!",
                public_url          AS "public_url?",
                last_heartbeat_at   AS "last_heartbeat_at?: DateTime<Utc>",
                connected_at        AS "connected_at?: DateTime<Utc>",
                disconnected_at     AS "disconnected_at?: DateTime<Utc>",
                created_at          AS "created_at!: DateTime<Utc>",
                updated_at          AS "updated_at!: DateTime<Utc>",
                last_synced_at      AS "last_synced_at!: DateTime<Utc>"
            FROM cached_nodes
            WHERE organization_id = $1
            ORDER BY name ASC
            "#,
            organization_id
        )
        .fetch_all(pool)
        .await
    }

    /// Find a cached node by ID
    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            CachedNode,
            r#"
            SELECT
                id                  AS "id!: Uuid",
                organization_id     AS "organization_id!: Uuid",
                name                AS "name!",
                machine_id          AS "machine_id!",
                status              AS "status!: String",
                capabilities        AS "capabilities_json!",
                public_url          AS "public_url?",
                last_heartbeat_at   AS "last_heartbeat_at?: DateTime<Utc>",
                connected_at        AS "connected_at?: DateTime<Utc>",
                disconnected_at     AS "disconnected_at?: DateTime<Utc>",
                created_at          AS "created_at!: DateTime<Utc>",
                updated_at          AS "updated_at!: DateTime<Utc>",
                last_synced_at      AS "last_synced_at!: DateTime<Utc>"
            FROM cached_nodes
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    /// Upsert a cached node
    pub async fn upsert(pool: &SqlitePool, data: CachedNodeInput) -> Result<Self, sqlx::Error> {
        let status = data.status.to_string();
        let capabilities_json =
            serde_json::to_string(&data.capabilities).unwrap_or_else(|_| "{}".to_string());

        sqlx::query_as!(
            CachedNode,
            r#"
            INSERT INTO cached_nodes (
                id, organization_id, name, machine_id, status, capabilities,
                public_url, last_heartbeat_at, connected_at, disconnected_at,
                created_at, updated_at, last_synced_at
            )
            VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, datetime('now', 'subsec')
            )
            ON CONFLICT(id) DO UPDATE SET
                organization_id   = excluded.organization_id,
                name              = excluded.name,
                machine_id        = excluded.machine_id,
                status            = excluded.status,
                capabilities      = excluded.capabilities,
                public_url        = excluded.public_url,
                last_heartbeat_at = excluded.last_heartbeat_at,
                connected_at      = excluded.connected_at,
                disconnected_at   = excluded.disconnected_at,
                created_at        = excluded.created_at,
                updated_at        = excluded.updated_at,
                last_synced_at    = datetime('now', 'subsec')
            RETURNING
                id                  AS "id!: Uuid",
                organization_id     AS "organization_id!: Uuid",
                name                AS "name!",
                machine_id          AS "machine_id!",
                status              AS "status!: String",
                capabilities        AS "capabilities_json!",
                public_url          AS "public_url?",
                last_heartbeat_at   AS "last_heartbeat_at?: DateTime<Utc>",
                connected_at        AS "connected_at?: DateTime<Utc>",
                disconnected_at     AS "disconnected_at?: DateTime<Utc>",
                created_at          AS "created_at!: DateTime<Utc>",
                updated_at          AS "updated_at!: DateTime<Utc>",
                last_synced_at      AS "last_synced_at!: DateTime<Utc>"
            "#,
            data.id,
            data.organization_id,
            data.name,
            data.machine_id,
            status,
            capabilities_json,
            data.public_url,
            data.last_heartbeat_at,
            data.connected_at,
            data.disconnected_at,
            data.created_at,
            data.updated_at
        )
        .fetch_one(pool)
        .await
    }

    /// Remove nodes that are not in the given list of IDs (stale entries)
    pub async fn remove_stale(
        pool: &SqlitePool,
        organization_id: Uuid,
        keep_ids: &[Uuid],
    ) -> Result<u64, sqlx::Error> {
        if keep_ids.is_empty() {
            // Remove all nodes for this org
            let result = sqlx::query!(
                "DELETE FROM cached_nodes WHERE organization_id = $1",
                organization_id
            )
            .execute(pool)
            .await?;
            return Ok(result.rows_affected());
        }

        // Build the IN clause for IDs to keep
        let placeholders: Vec<String> = keep_ids.iter().map(|id| format!("'{}'", id)).collect();
        let in_clause = placeholders.join(", ");

        let query = format!(
            "DELETE FROM cached_nodes WHERE organization_id = ? AND id NOT IN ({})",
            in_clause
        );

        let result = sqlx::query(&query)
            .bind(organization_id)
            .execute(pool)
            .await?;

        Ok(result.rows_affected())
    }

    /// Remove a specific cached node
    pub async fn remove(pool: &SqlitePool, id: Uuid) -> Result<bool, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM cached_nodes WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}
