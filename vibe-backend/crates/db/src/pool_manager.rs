//! Database Pool Manager
//!
//! Manages multiple SQLite connection pools for multi-tenant database architecture.
//! Each team gets their own database file and connection pool.

use std::{
    collections::HashMap,
    path::PathBuf,
    sync::Arc,
};

use sqlx::{SqlitePool, sqlite::SqliteConnectOptions};
use std::str::FromStr;
use tokio::sync::RwLock;

use crate::{DBService, registry::RegistryService};

/// Manages database connection pools for multiple teams
#[derive(Clone)]
pub struct DBPoolManager {
    /// Map of team_id -> DBService
    pools: Arc<RwLock<HashMap<String, Arc<DBService>>>>,
    /// Registry service for looking up team info
    registry: Arc<RegistryService>,
}

impl DBPoolManager {
    /// Create a new pool manager with a registry service
    pub fn new(registry: Arc<RegistryService>) -> Self {
        Self {
            pools: Arc::new(RwLock::new(HashMap::new())),
            registry,
        }
    }

    /// Get or create a connection pool for a team
    pub async fn get_pool(&self, team_id: &str) -> Result<Arc<DBService>, PoolManagerError> {
        // First, check if we already have a pool
        {
            let pools = self.pools.read().await;
            if let Some(pool) = pools.get(team_id) {
                return Ok(pool.clone());
            }
        }

        // Look up team in registry
        let team_entry = self
            .registry
            .find_by_id(team_id)
            .await
            .map_err(PoolManagerError::Database)?
            .ok_or_else(|| PoolManagerError::TeamNotFound(team_id.to_string()))?;

        // Create new pool
        let db_path = PathBuf::from(&team_entry.db_path);
        let db_service = self.create_pool_for_path(db_path).await?;
        let db_service = Arc::new(db_service);

        // Store in cache
        {
            let mut pools = self.pools.write().await;
            pools.insert(team_id.to_string(), db_service.clone());
        }

        Ok(db_service)
    }

    /// Get pool by team slug (alternative lookup method)
    pub async fn get_pool_by_slug(&self, slug: &str) -> Result<Arc<DBService>, PoolManagerError> {
        let team_entry = self
            .registry
            .find_by_slug(slug)
            .await
            .map_err(PoolManagerError::Database)?
            .ok_or_else(|| PoolManagerError::TeamNotFound(slug.to_string()))?;

        self.get_pool(&team_entry.id).await
    }

    /// Create a new pool for a team (used when creating a new team)
    pub async fn create_pool_for_team(
        &self,
        team_id: &str,
        slug: &str,
    ) -> Result<Arc<DBService>, PoolManagerError> {
        let db_path = RegistryService::get_team_db_path(slug);
        let db_service = self.create_pool_for_path(db_path).await?;
        let db_service = Arc::new(db_service);

        // Store in cache
        {
            let mut pools = self.pools.write().await;
            pools.insert(team_id.to_string(), db_service.clone());
        }

        Ok(db_service)
    }

    /// Create a connection pool for a specific database path
    async fn create_pool_for_path(&self, db_path: PathBuf) -> Result<DBService, PoolManagerError> {
        tracing::info!("Creating pool for team database: {}", db_path.display());

        let database_url = format!("sqlite://{}", db_path.to_string_lossy());
        let options = SqliteConnectOptions::from_str(&database_url)
            .map_err(|e| PoolManagerError::Database(e))?
            .create_if_missing(true);

        let pool = SqlitePool::connect_with(options)
            .await
            .map_err(PoolManagerError::Database)?;

        // Run migrations on the team database
        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .map_err(|e| PoolManagerError::Migration(e.to_string()))?;

        Ok(DBService { pool })
    }

    /// Remove a pool from cache (e.g., when team is deleted)
    pub async fn remove_pool(&self, team_id: &str) {
        let mut pools = self.pools.write().await;
        pools.remove(team_id);
    }

    /// Get the number of active pools
    pub async fn pool_count(&self) -> usize {
        let pools = self.pools.read().await;
        pools.len()
    }

    /// Get registry service
    pub fn registry(&self) -> &RegistryService {
        &self.registry
    }

    /// Preload pools for all registered teams
    pub async fn preload_all_pools(&self) -> Result<(), PoolManagerError> {
        let teams = self
            .registry
            .find_all()
            .await
            .map_err(PoolManagerError::Database)?;

        tracing::info!("Preloading pools for {} teams", teams.len());

        for team in teams {
            if let Err(e) = self.get_pool(&team.id).await {
                tracing::warn!("Failed to preload pool for team {}: {}", team.slug, e);
            }
        }

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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::registry::CreateTeamRegistry;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_pool_manager() {
        // Use temp directory for test
        let temp_dir = TempDir::new().unwrap();
        std::env::set_var("VK_ASSET_DIR", temp_dir.path().to_string_lossy().to_string());

        // Create registry and register a team
        let registry = Arc::new(RegistryService::new().await.unwrap());
        registry
            .create(&CreateTeamRegistry {
                id: "team-123".to_string(),
                slug: "test-team".to_string(),
                name: "Test Team".to_string(),
                turso_db: None,
            })
            .await
            .unwrap();

        // Create pool manager
        let manager = DBPoolManager::new(registry);

        // Get pool (should create it)
        let pool1 = manager.get_pool("team-123").await.unwrap();
        assert_eq!(manager.pool_count().await, 1);

        // Get same pool again (should return cached)
        let pool2 = manager.get_pool("team-123").await.unwrap();
        assert_eq!(manager.pool_count().await, 1);

        // Both should be the same Arc
        assert!(Arc::ptr_eq(&pool1, &pool2));

        // Get by slug
        let pool3 = manager.get_pool_by_slug("test-team").await.unwrap();
        assert!(Arc::ptr_eq(&pool1, &pool3));

        // Remove pool
        manager.remove_pool("team-123").await;
        assert_eq!(manager.pool_count().await, 0);
    }
}
