//! Turso (distributed SQLite) integration module.
//!
//! This module provides sync capabilities between local SQLite and Turso cloud.
//! It uses embedded replicas for offline support and low-latency reads.

#[cfg(feature = "turso")]
use libsql::{Builder, Database};
use std::path::PathBuf;
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

    /// Create config from a team-specific .env file
    ///
    /// Looks for `.env.{slug}` in the project root directory.
    /// Example: `.env.schild` for team with slug "schild"
    pub fn from_env_file(slug: &str, replica_path: PathBuf) -> Option<Self> {
        // Look for .env.{slug} file in current directory or project root
        let env_file_name = format!(".env.{}", slug);

        // Try current directory first
        let mut env_path = std::env::current_dir().ok()?.join(&env_file_name);

        // If not found, try the project root (for development)
        if !env_path.exists() {
            if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
                // Go up from crates/db to project root
                let project_root = PathBuf::from(manifest_dir)
                    .parent()?
                    .parent()?
                    .to_path_buf();
                env_path = project_root.join(&env_file_name);
            }
        }

        if !env_path.exists() {
            tracing::debug!("Team env file not found: {}", env_path.display());
            return None;
        }

        tracing::info!("Loading Turso config from: {}", env_path.display());

        // Parse the .env file
        let contents = std::fs::read_to_string(&env_path).ok()?;
        let mut database_url = None;
        let mut auth_token = None;
        let mut sync_interval_secs = 60u64;

        for line in contents.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }

            if let Some((key, value)) = line.split_once('=') {
                let key = key.trim();
                let value = value.trim();

                match key {
                    "TURSO_DATABASE_URL" => database_url = Some(value.to_string()),
                    "TURSO_AUTH_TOKEN" => auth_token = Some(value.to_string()),
                    "TURSO_SYNC_INTERVAL" => {
                        sync_interval_secs = value.parse().unwrap_or(60);
                    }
                    _ => {}
                }
            }
        }

        let database_url = database_url?;
        let auth_token = auth_token?;

        Some(Self {
            database_url,
            auth_token,
            replica_path,
            sync_interval_secs,
        })
    }

    /// Check if Turso is configured
    pub fn is_configured() -> bool {
        std::env::var("TURSO_DATABASE_URL").is_ok()
            && std::env::var("TURSO_AUTH_TOKEN").is_ok()
    }

    /// Check if a team-specific Turso config exists
    pub fn team_config_exists(slug: &str) -> bool {
        let env_file_name = format!(".env.{}", slug);

        // Check current directory
        if let Ok(cwd) = std::env::current_dir() {
            if cwd.join(&env_file_name).exists() {
                return true;
            }
        }

        // Check project root (for development)
        if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
            if let Some(project_root) = PathBuf::from(manifest_dir).parent().and_then(|p| p.parent()) {
                if project_root.join(&env_file_name).exists() {
                    return true;
                }
            }
        }

        false
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

/// Manager for per-team Turso sync connections
#[cfg(feature = "turso")]
pub struct TeamTursoManager {
    syncs: Arc<RwLock<std::collections::HashMap<String, Arc<TursoSync>>>>,
    registry: Arc<crate::RegistryService>,
}

#[cfg(feature = "turso")]
impl TeamTursoManager {
    /// Create a new TeamTursoManager
    pub fn new(registry: Arc<crate::RegistryService>) -> Self {
        Self {
            syncs: Arc::new(RwLock::new(std::collections::HashMap::new())),
            registry,
        }
    }

    /// Get or create a TursoSync for a team by slug
    pub async fn get_or_create_sync(&self, slug: &str) -> Result<Arc<TursoSync>, TeamTursoError> {
        // Check if we already have a sync for this team
        {
            let syncs = self.syncs.read().await;
            if let Some(sync) = syncs.get(slug) {
                return Ok(sync.clone());
            }
        }

        // Look up team in registry
        let team = self.registry.find_by_slug(slug).await
            .map_err(|e| TeamTursoError::RegistryError(e.to_string()))?
            .ok_or_else(|| TeamTursoError::TeamNotFound(slug.to_string()))?;

        // Load config from .env.{slug}
        let replica_path = PathBuf::from(&team.db_path);
        let config = TursoConfig::from_env_file(slug, replica_path)
            .ok_or_else(|| TeamTursoError::ConfigNotFound(slug.to_string()))?;

        // Create new TursoSync
        let sync = TursoSync::new(config).await
            .map_err(|e| TeamTursoError::SyncError(e.to_string()))?;
        let sync = Arc::new(sync);

        // Store in cache
        {
            let mut syncs = self.syncs.write().await;
            syncs.insert(slug.to_string(), sync.clone());
        }

        // Update registry with turso_db name (extract from URL)
        if let Some(db_name) = self.extract_db_name_from_url(slug) {
            if let Err(e) = self.registry.update_turso_db(&team.id, &db_name).await {
                tracing::warn!("Failed to update turso_db in registry: {}", e);
            }
        }

        Ok(sync)
    }

    /// Extract Turso database name from the config URL
    fn extract_db_name_from_url(&self, slug: &str) -> Option<String> {
        // Load config just to get the URL
        let config = TursoConfig::from_env_file(slug, PathBuf::new())?;
        // URL format: libsql://db-name-user.region.turso.io
        let url = config.database_url;
        if let Some(start) = url.strip_prefix("libsql://") {
            if let Some(end) = start.find('.') {
                return Some(start[..end].to_string());
            }
        }
        None
    }

    /// Sync a specific team's database
    pub async fn sync_team(&self, slug: &str) -> Result<(), TeamTursoError> {
        let sync = self.get_or_create_sync(slug).await?;
        sync.sync().await
            .map_err(|e| TeamTursoError::SyncError(e.to_string()))?;

        // Update last_synced_at in registry
        if let Ok(Some(team)) = self.registry.find_by_slug(slug).await {
            if let Err(e) = self.registry.update_last_synced(&team.id).await {
                tracing::warn!("Failed to update last_synced_at: {}", e);
            }
        }

        Ok(())
    }

    /// Sync all teams that have Turso configured
    pub async fn sync_all_teams(&self) -> Result<Vec<(String, Result<(), TeamTursoError>)>, TeamTursoError> {
        let teams = self.registry.find_all().await
            .map_err(|e| TeamTursoError::RegistryError(e.to_string()))?;

        let mut results = Vec::new();

        for team in teams {
            // Only sync teams that have a .env.{slug} file
            if TursoConfig::team_config_exists(&team.slug) {
                tracing::info!("Syncing team: {}", team.slug);
                let result = self.sync_team(&team.slug).await;
                results.push((team.slug, result));
            } else {
                tracing::debug!("Skipping team {} - no Turso config found", team.slug);
            }
        }

        Ok(results)
    }

    /// Get sync status for all teams
    pub async fn get_sync_status(&self) -> Vec<TeamSyncStatus> {
        let mut status = Vec::new();

        if let Ok(teams) = self.registry.find_all().await {
            for team in teams {
                let has_config = TursoConfig::team_config_exists(&team.slug);
                let is_synced = {
                    let syncs = self.syncs.read().await;
                    syncs.contains_key(&team.slug)
                };

                status.push(TeamSyncStatus {
                    slug: team.slug,
                    name: team.name,
                    has_turso_config: has_config,
                    turso_db: team.turso_db,
                    last_synced_at: team.last_synced_at,
                    is_active: is_synced,
                });
            }
        }

        status
    }
}

/// Sync status for a team
#[derive(Debug, Clone)]
pub struct TeamSyncStatus {
    pub slug: String,
    pub name: String,
    pub has_turso_config: bool,
    pub turso_db: Option<String>,
    pub last_synced_at: Option<chrono::DateTime<chrono::Utc>>,
    pub is_active: bool,
}

/// Errors that can occur during team Turso operations
#[derive(Debug, Clone)]
pub enum TeamTursoError {
    TeamNotFound(String),
    ConfigNotFound(String),
    RegistryError(String),
    SyncError(String),
}

impl std::fmt::Display for TeamTursoError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::TeamNotFound(slug) => write!(f, "Team not found: {}", slug),
            Self::ConfigNotFound(slug) => write!(f, "Turso config not found for team: {} (missing .env.{})", slug, slug),
            Self::RegistryError(msg) => write!(f, "Registry error: {}", msg),
            Self::SyncError(msg) => write!(f, "Sync error: {}", msg),
        }
    }
}

impl std::error::Error for TeamTursoError {}

/// Stub implementation when turso feature is disabled
#[cfg(not(feature = "turso"))]
pub struct TeamTursoManager;

#[cfg(not(feature = "turso"))]
impl TeamTursoManager {
    pub fn new(_registry: Arc<crate::RegistryService>) -> Self {
        Self
    }

    pub async fn sync_team(&self, _slug: &str) -> Result<(), TeamTursoError> {
        Err(TeamTursoError::SyncError("Turso feature not enabled".to_string()))
    }

    pub async fn sync_all_teams(&self) -> Result<Vec<(String, Result<(), TeamTursoError>)>, TeamTursoError> {
        Err(TeamTursoError::SyncError("Turso feature not enabled".to_string()))
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
