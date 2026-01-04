//! Turso (distributed SQLite) integration module.
//!
//! This module provides sync capabilities between local SQLite and Turso cloud.
//! It uses embedded replicas for offline support and low-latency reads.

#[cfg(feature = "turso")]
use libsql::{Builder, Database};
use std::path::PathBuf;
#[cfg(feature = "turso")]
use std::sync::Arc;
#[cfg(feature = "turso")]
use std::time::Duration;
#[cfg(feature = "turso")]
use tokio::sync::RwLock;

/// Configuration for Turso connection
#[derive(Clone, Debug)]
pub struct TursoConfig {
    /// Turso database URL (libsql://your-db.turso.io)
    pub database_url: String,
    /// Auth token for Turso
    pub auth_token: String,
    /// Path to local replica file
    pub replica_path: PathBuf,
    /// Sync interval in seconds (0 = manual sync only)
    pub sync_interval_secs: u64,
}

impl TursoConfig {
    /// Create config from environment variables
    pub fn from_env(replica_path: PathBuf) -> Option<Self> {
        let database_url = std::env::var("TURSO_DATABASE_URL").ok()?;
        let auth_token = std::env::var("TURSO_AUTH_TOKEN").ok()?;

        Some(Self {
            database_url,
            auth_token,
            replica_path,
            sync_interval_secs: std::env::var("TURSO_SYNC_INTERVAL")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(60), // Default: sync every 60 seconds
        })
    }

    /// Check if Turso is configured
    pub fn is_configured() -> bool {
        std::env::var("TURSO_DATABASE_URL").is_ok()
            && std::env::var("TURSO_AUTH_TOKEN").is_ok()
    }
}

/// Turso sync service for distributed database operations
#[cfg(feature = "turso")]
pub struct TursoSync {
    db: Database,
    config: TursoConfig,
    last_sync: Arc<RwLock<Option<std::time::Instant>>>,
}

#[cfg(feature = "turso")]
impl TursoSync {
    /// Create a new TursoSync instance with embedded replica
    pub async fn new(config: TursoConfig) -> Result<Self, libsql::Error> {
        tracing::info!(
            "Initializing Turso sync with replica at {:?}",
            config.replica_path
        );

        let db = Builder::new_remote_replica(
            config.replica_path.to_string_lossy().to_string(),
            config.database_url.clone(),
            config.auth_token.clone(),
        )
        .build()
        .await?;

        // Initial sync
        tracing::info!("Performing initial sync with Turso cloud...");
        db.sync().await?;
        tracing::info!("Initial sync complete");

        Ok(Self {
            db,
            config,
            last_sync: Arc::new(RwLock::new(Some(std::time::Instant::now()))),
        })
    }

    /// Manually trigger a sync with Turso cloud
    pub async fn sync(&self) -> Result<(), libsql::Error> {
        tracing::debug!("Syncing with Turso cloud...");
        self.db.sync().await?;

        let mut last_sync = self.last_sync.write().await;
        *last_sync = Some(std::time::Instant::now());

        tracing::debug!("Sync complete");
        Ok(())
    }

    /// Get time since last sync
    pub async fn time_since_sync(&self) -> Option<Duration> {
        let last_sync = self.last_sync.read().await;
        last_sync.map(|t| t.elapsed())
    }

    /// Start background sync task
    pub fn start_background_sync(self: Arc<Self>) -> tokio::task::JoinHandle<()> {
        let interval = self.config.sync_interval_secs;

        if interval == 0 {
            tracing::info!("Background sync disabled (interval = 0)");
            return tokio::spawn(async {});
        }

        tracing::info!("Starting background sync every {} seconds", interval);

        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(interval));

            loop {
                interval.tick().await;

                if let Err(e) = self.sync().await {
                    tracing::error!("Background sync failed: {}", e);
                }
            }
        })
    }

    /// Get the underlying database for direct queries
    pub fn database(&self) -> &Database {
        &self.db
    }

    /// Execute a write query and sync
    pub async fn execute_and_sync(&self, sql: &str) -> Result<u64, libsql::Error> {
        let conn = self.db.connect()?;
        let rows_affected = conn.execute(sql, ()).await?;
        self.sync().await?;
        Ok(rows_affected)
    }
}

/// Stub implementation when turso feature is disabled
#[cfg(not(feature = "turso"))]
pub struct TursoSync;

#[cfg(not(feature = "turso"))]
impl TursoSync {
    pub async fn new(_config: TursoConfig) -> Result<Self, std::io::Error> {
        Err(std::io::Error::new(
            std::io::ErrorKind::Other,
            "Turso feature not enabled. Compile with --features turso",
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_from_env_missing() {
        // Should return None when env vars not set
        std::env::remove_var("TURSO_DATABASE_URL");
        std::env::remove_var("TURSO_AUTH_TOKEN");

        let config = TursoConfig::from_env(PathBuf::from("/tmp/test.db"));
        assert!(config.is_none());
    }

    #[test]
    fn test_is_configured() {
        std::env::remove_var("TURSO_DATABASE_URL");
        assert!(!TursoConfig::is_configured());
    }
}
