//! SwarmService - Swarm CRUD Operations
//!
//! Manages swarm lifecycle: create, read, update, delete.
//! Migrated from SwarmService.js

use db::models::swarm::{CreateSwarm, Swarm, SwarmStatus, UpdateSwarm};
use sqlx::{Row, SqlitePool};
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum SwarmServiceError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error("Swarm not found: {0}")]
    NotFound(Uuid),
    #[error("Name is required")]
    NameRequired,
    #[error("Cannot delete swarm with active sandboxes")]
    HasActiveSandboxes,
}

pub type Result<T> = std::result::Result<T, SwarmServiceError>;

/// Statistics about swarms
#[derive(Debug, Clone, serde::Serialize)]
pub struct SwarmStats {
    pub total: usize,
    pub active: usize,
    pub paused: usize,
    pub stopped: usize,
}

/// SwarmService handles all swarm CRUD operations
#[derive(Clone, Default)]
pub struct SwarmService;

impl SwarmService {
    pub fn new() -> Self {
        Self
    }

    /// List all swarms
    pub async fn list(&self, pool: &SqlitePool) -> Result<Vec<Swarm>> {
        let swarms = Swarm::find_all(pool).await?;
        tracing::debug!(count = swarms.len(), "Listed swarms");
        Ok(swarms)
    }

    /// Get a swarm by ID
    pub async fn get(&self, pool: &SqlitePool, id: Uuid) -> Result<Swarm> {
        Swarm::find_by_id(pool, id)
            .await?
            .ok_or(SwarmServiceError::NotFound(id))
    }

    /// Find swarm by ID (returns Option)
    pub async fn find(&self, pool: &SqlitePool, id: Uuid) -> Result<Option<Swarm>> {
        Ok(Swarm::find_by_id(pool, id).await?)
    }

    /// Check if swarm exists
    pub async fn exists(&self, pool: &SqlitePool, id: Uuid) -> Result<bool> {
        Ok(Swarm::find_by_id(pool, id).await?.is_some())
    }

    /// Find swarms by project ID
    pub async fn find_by_project(&self, pool: &SqlitePool, project_id: Uuid) -> Result<Vec<Swarm>> {
        Ok(Swarm::find_by_project_id(pool, project_id).await?)
    }

    /// Find all active swarms
    pub async fn find_active(&self, pool: &SqlitePool) -> Result<Vec<Swarm>> {
        Ok(Swarm::find_active(pool).await?)
    }

    /// Create a new swarm
    pub async fn create(&self, pool: &SqlitePool, data: CreateSwarm) -> Result<Swarm> {
        if data.name.trim().is_empty() {
            return Err(SwarmServiceError::NameRequired);
        }

        let swarm_id = Uuid::new_v4();
        let swarm = Swarm::create(pool, &data, swarm_id).await?;

        tracing::info!(
            swarm_id = %swarm.id,
            name = %swarm.name,
            "Swarm created"
        );

        Ok(swarm)
    }

    /// Update an existing swarm
    pub async fn update(&self, pool: &SqlitePool, id: Uuid, data: UpdateSwarm) -> Result<Swarm> {
        if !self.exists(pool, id).await? {
            return Err(SwarmServiceError::NotFound(id));
        }

        let swarm = Swarm::update(pool, id, &data).await?;

        tracing::info!(swarm_id = %id, "Swarm updated");

        Ok(swarm)
    }

    /// Pause a swarm
    pub async fn pause(&self, pool: &SqlitePool, id: Uuid) -> Result<()> {
        if !self.exists(pool, id).await? {
            return Err(SwarmServiceError::NotFound(id));
        }

        Swarm::update_status(pool, id, SwarmStatus::Paused).await?;

        tracing::info!(swarm_id = %id, "Swarm paused");

        Ok(())
    }

    /// Resume a paused swarm
    pub async fn resume(&self, pool: &SqlitePool, id: Uuid) -> Result<()> {
        if !self.exists(pool, id).await? {
            return Err(SwarmServiceError::NotFound(id));
        }

        Swarm::update_status(pool, id, SwarmStatus::Active).await?;

        tracing::info!(swarm_id = %id, "Swarm resumed");

        Ok(())
    }

    /// Stop a swarm
    pub async fn stop(&self, pool: &SqlitePool, id: Uuid) -> Result<()> {
        if !self.exists(pool, id).await? {
            return Err(SwarmServiceError::NotFound(id));
        }

        Swarm::update_status(pool, id, SwarmStatus::Stopped).await?;

        tracing::info!(swarm_id = %id, "Swarm stopped");

        Ok(())
    }

    /// Delete a swarm
    pub async fn delete(&self, pool: &SqlitePool, id: Uuid) -> Result<()> {
        if !self.exists(pool, id).await? {
            return Err(SwarmServiceError::NotFound(id));
        }

        let rows_affected = Swarm::delete(pool, id).await?;

        if rows_affected == 0 {
            return Err(SwarmServiceError::NotFound(id));
        }

        tracing::info!(swarm_id = %id, "Swarm deleted");

        Ok(())
    }

    /// Get swarm statistics
    pub async fn get_stats(&self, pool: &SqlitePool) -> Result<SwarmStats> {
        let rows = sqlx::query(
            "SELECT status, COUNT(*) as count FROM swarms GROUP BY status"
        )
        .fetch_all(pool)
        .await?;

        let mut stats = SwarmStats {
            total: 0,
            active: 0,
            paused: 0,
            stopped: 0,
        };

        for row in rows {
            let status: String = row.get("status");
            let count: i64 = row.get("count");
            match status.as_str() {
                "active" => stats.active = count as usize,
                "paused" => stats.paused = count as usize,
                "stopped" => stats.stopped = count as usize,
                _ => {}
            }
            stats.total += count as usize;
        }

        Ok(stats)
    }
}
