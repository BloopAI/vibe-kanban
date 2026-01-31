pub mod error;
pub mod mcp;
pub mod middleware;
pub mod routes;

use std::sync::Arc;

use services::services::swarm::BroadcastManager;
use sqlx::SqlitePool;

// #[cfg(feature = "cloud")]
// type DeploymentImpl = vibe_kanban_cloud::deployment::CloudDeployment;
// #[cfg(not(feature = "cloud"))]
pub type DeploymentImpl = local_deployment::LocalDeployment;

/// Application state for swarm routes
#[derive(Clone)]
pub struct AppState {
    pub db_pool: SqlitePool,
    /// Broadcast manager for WebSocket streams
    pub broadcast: Arc<BroadcastManager>,
}

impl AppState {
    pub fn new(db_pool: SqlitePool) -> Self {
        Self {
            db_pool,
            broadcast: Arc::new(BroadcastManager::new()),
        }
    }

    /// Create with a custom broadcast manager
    pub fn with_broadcast(db_pool: SqlitePool, broadcast: Arc<BroadcastManager>) -> Self {
        Self { db_pool, broadcast }
    }
}
