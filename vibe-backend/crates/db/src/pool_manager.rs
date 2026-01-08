//! Database Pool Manager
//!
//! Manages the global Postgres connection pool.
//! Previously managed multiple SQLite pools, now adapted for single-DB architecture.

use std::{
    collections::HashMap,
    path::PathBuf,
    sync::Arc,
};

use tokio::sync::RwLock;

use crate::{DBService, registry::RegistryService};

/// Manages database connection pools for multiple teams
/// Adapted for Postgres: Holds one global pool shared by all.
#[derive(Clone)]
pub struct DBPoolManager {
    /// The global database connection
    global_pool: Arc<DBService>,
    /// Registry service (kept for API compatibility and team lookups)
    registry: Arc<RegistryService>,
}

impl DBPoolManager {
    /// Create a new pool manager with a registry service
    pub async fn new(registry: Arc<RegistryService>) -> Result<Self, crate::PoolManagerError> {
        // Initialize the global connection pool
        let global_pool = DBService::new().await.map_err(crate::PoolManagerError::Database)?;
        
        Ok(Self {
            global_pool: Arc::new(global_pool),
            registry,
        })
    }

    /// Get the connection pool (ignores team_id as we use single DB)
    pub async fn get_pool(&self, _team_id: &str) -> Result<Arc<DBService>, crate::PoolManagerError> {
        Ok(self.global_pool.clone())
    }

    /// Get pool by team slug (returns global pool)
    pub async fn get_pool_by_slug(&self, _slug: &str) -> Result<Arc<DBService>, crate::PoolManagerError> {
        Ok(self.global_pool.clone())
    }

    /// Create a new pool for a team (returns global pool)
    pub async fn create_pool_for_team(
        &self,
        _team_id: &str,
        _slug: &str,
    ) -> Result<Arc<DBService>, crate::PoolManagerError> {
        Ok(self.global_pool.clone())
    }

    /// Remove a pool (no-op)
    pub async fn remove_pool(&self, _team_id: &str) {
        // No-op
    }

    /// Get the number of active pools (always 1)
    pub async fn pool_count(&self) -> usize {
        1
    }

    /// Get registry service
    pub fn registry(&self) -> &RegistryService {
        &self.registry
    }

    /// Preload pools (no-op)
    pub async fn preload_all_pools(&self) -> Result<(), crate::PoolManagerError> {
        Ok(())
    }
}

/// Errors that can occur in pool management
#[derive(Debug, thiserror::Error)]
pub enum PoolManagerError {
    #[error("Team not found: {0}")]
    TeamNotFound(String),

    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Migration error: {0}")]
    Migration(String),
}

