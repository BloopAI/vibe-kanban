use chrono::{DateTime, Utc};
use sqlx::{FromRow, PgPool, Row};
use thiserror::Error;
use uuid::Uuid;

use crate::nodes::{Node, NodeRegistration, NodeStatus};

#[derive(Debug, Error)]
pub enum NodeDbError {
    #[error("node not found")]
    NotFound,
    #[error("node already exists for this machine")]
    AlreadyExists,
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}

// Internal struct for raw database row
#[derive(Debug, FromRow)]
struct NodeRow {
    id: Uuid,
    organization_id: Uuid,
    name: String,
    machine_id: String,
    status: NodeStatus,
    capabilities: serde_json::Value,
    public_url: Option<String>,
    last_heartbeat_at: Option<DateTime<Utc>>,
    connected_at: Option<DateTime<Utc>>,
    disconnected_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl From<NodeRow> for Node {
    fn from(row: NodeRow) -> Self {
        Node {
            id: row.id,
            organization_id: row.organization_id,
            name: row.name,
            machine_id: row.machine_id,
            status: row.status,
            capabilities: serde_json::from_value(row.capabilities).unwrap_or_default(),
            public_url: row.public_url,
            last_heartbeat_at: row.last_heartbeat_at,
            connected_at: row.connected_at,
            disconnected_at: row.disconnected_at,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

pub struct NodeRepository<'a> {
    pool: &'a PgPool,
}

impl<'a> NodeRepository<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    /// Register a new node or update existing one by machine_id
    pub async fn upsert(
        &self,
        organization_id: Uuid,
        data: NodeRegistration,
    ) -> Result<Node, NodeDbError> {
        let capabilities = serde_json::to_value(&data.capabilities).unwrap_or_default();

        let row = sqlx::query_as::<_, NodeRow>(
            r#"
            INSERT INTO nodes (organization_id, name, machine_id, capabilities, public_url, status)
            VALUES ($1, $2, $3, $4, $5, 'online')
            ON CONFLICT (organization_id, machine_id)
            DO UPDATE SET
                name = EXCLUDED.name,
                capabilities = EXCLUDED.capabilities,
                public_url = EXCLUDED.public_url,
                status = 'online',
                connected_at = NOW(),
                last_heartbeat_at = NOW(),
                updated_at = NOW()
            RETURNING
                id,
                organization_id,
                name,
                machine_id,
                status,
                capabilities,
                public_url,
                last_heartbeat_at,
                connected_at,
                disconnected_at,
                created_at,
                updated_at
            "#,
        )
        .bind(organization_id)
        .bind(&data.name)
        .bind(&data.machine_id)
        .bind(&capabilities)
        .bind(&data.public_url)
        .fetch_one(self.pool)
        .await?;

        Ok(Node::from(row))
    }

    /// Find a node by ID
    pub async fn find_by_id(&self, node_id: Uuid) -> Result<Option<Node>, NodeDbError> {
        let row = sqlx::query_as::<_, NodeRow>(
            r#"
            SELECT
                id,
                organization_id,
                name,
                machine_id,
                status,
                capabilities,
                public_url,
                last_heartbeat_at,
                connected_at,
                disconnected_at,
                created_at,
                updated_at
            FROM nodes
            WHERE id = $1
            "#,
        )
        .bind(node_id)
        .fetch_optional(self.pool)
        .await?;

        Ok(row.map(Node::from))
    }

    /// List all nodes for an organization
    pub async fn list_by_organization(
        &self,
        organization_id: Uuid,
    ) -> Result<Vec<Node>, NodeDbError> {
        let rows = sqlx::query_as::<_, NodeRow>(
            r#"
            SELECT
                id,
                organization_id,
                name,
                machine_id,
                status,
                capabilities,
                public_url,
                last_heartbeat_at,
                connected_at,
                disconnected_at,
                created_at,
                updated_at
            FROM nodes
            WHERE organization_id = $1
            ORDER BY name ASC
            "#,
        )
        .bind(organization_id)
        .fetch_all(self.pool)
        .await?;

        Ok(rows.into_iter().map(Node::from).collect())
    }

    /// Update node status and heartbeat timestamp
    pub async fn heartbeat(&self, node_id: Uuid, status: NodeStatus) -> Result<(), NodeDbError> {
        let result = sqlx::query(
            r#"
            UPDATE nodes
            SET status = $2,
                last_heartbeat_at = NOW(),
                updated_at = NOW()
            WHERE id = $1
            "#,
        )
        .bind(node_id)
        .bind(status)
        .execute(self.pool)
        .await?;

        if result.rows_affected() == 0 {
            return Err(NodeDbError::NotFound);
        }

        Ok(())
    }

    /// Mark stale nodes as offline (nodes that haven't sent heartbeat within threshold)
    pub async fn mark_stale_offline(
        &self,
        threshold: DateTime<Utc>,
    ) -> Result<Vec<Uuid>, NodeDbError> {
        let rows = sqlx::query(
            r#"
            UPDATE nodes
            SET status = 'offline',
                disconnected_at = NOW(),
                updated_at = NOW()
            WHERE status IN ('online', 'busy')
              AND last_heartbeat_at < $1
            RETURNING id
            "#,
        )
        .bind(threshold)
        .fetch_all(self.pool)
        .await?;

        Ok(rows.iter().map(|r| r.get("id")).collect())
    }

    /// Update node public URL
    pub async fn update_public_url(
        &self,
        node_id: Uuid,
        public_url: Option<&str>,
    ) -> Result<(), NodeDbError> {
        let result = sqlx::query(
            r#"
            UPDATE nodes
            SET public_url = $2,
                updated_at = NOW()
            WHERE id = $1
            "#,
        )
        .bind(node_id)
        .bind(public_url)
        .execute(self.pool)
        .await?;

        if result.rows_affected() == 0 {
            return Err(NodeDbError::NotFound);
        }

        Ok(())
    }

    /// Delete a node
    pub async fn delete(&self, node_id: Uuid) -> Result<(), NodeDbError> {
        let result = sqlx::query(
            r#"
            DELETE FROM nodes
            WHERE id = $1
            "#,
        )
        .bind(node_id)
        .execute(self.pool)
        .await?;

        if result.rows_affected() == 0 {
            return Err(NodeDbError::NotFound);
        }

        Ok(())
    }
}
