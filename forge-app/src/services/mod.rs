//! Forge Services
//!
//! Service composition layer that wraps upstream services with forge extensions.
//! Provides unified access to both upstream functionality and forge-specific features.

use anyhow::Result;
use sqlx::SqlitePool;
use std::sync::Arc;

// Import forge extension services
use forge_branch_templates::BranchTemplateService;
use forge_config::ForgeConfigService;
use forge_genie::GenieService;
use forge_omni::{OmniConfig, OmniService};

/// Main forge services container
#[derive(Clone)]
pub struct ForgeServices {
    pub omni: Arc<OmniService>,
    pub branch_templates: Arc<BranchTemplateService>,
    pub config: Arc<ForgeConfigService>,
    pub genie: Arc<GenieService>,
    pub pool: SqlitePool,
}

impl ForgeServices {
    pub async fn new(database_url: &str) -> Result<Self> {
        // Initialize database connection
        let pool = SqlitePool::connect(database_url).await?;

        // Run migrations
        sqlx::migrate!("./migrations").run(&pool).await?;

        // Initialize forge extension services
        let omni_config = OmniConfig {
            enabled: false, // Will be loaded from project/user config
            host: None,
            api_key: None,
            instance: None,
            recipient: None,
            recipient_type: None,
        };

        let omni = Arc::new(OmniService::new(omni_config));
        let branch_templates = Arc::new(BranchTemplateService::new(pool.clone()));
        let config = Arc::new(ForgeConfigService::new(pool.clone()));
        let genie = Arc::new(GenieService::new("./genie/wishes".to_string()));

        Ok(Self {
            omni,
            branch_templates,
            config,
            genie,
            pool,
        })
    }

    /// Get database connection pool for direct access
    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }
}
