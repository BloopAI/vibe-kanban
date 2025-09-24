//! Forge Services
//!
//! Service composition layer that wraps upstream services with forge extensions.
//! Provides unified access to both upstream functionality and forge-specific features.

use anyhow::Result;
use deployment::Deployment;
use serde_json::json;
use server::DeploymentImpl;
use sqlx::SqlitePool;
use std::sync::Arc;

// Import forge extension services
use forge_branch_templates::BranchTemplateService;
use forge_config::ForgeConfigService;
use forge_omni::{OmniConfig, OmniService};

/// Main forge services container
#[derive(Clone)]
pub struct ForgeServices {
    pub deployment: Arc<DeploymentImpl>,
    pub omni: Arc<OmniService>,
    pub branch_templates: Arc<BranchTemplateService>,
    pub config: Arc<ForgeConfigService>,
    pub pool: SqlitePool,
}

impl ForgeServices {
    pub async fn new() -> Result<Self> {
        // Initialize upstream deployment (handles DB, sentry, analytics, etc.)
        let deployment = DeploymentImpl::new().await?;

        deployment.update_sentry_scope().await?;
        deployment.cleanup_orphan_executions().await?;
        deployment.backfill_before_head_commits().await?;
        deployment.spawn_pr_monitor_service().await;

        let deployment_for_cache = deployment.clone();
        tokio::spawn(async move {
            if let Err(e) = deployment_for_cache
                .file_search_cache()
                .warm_most_active(&deployment_for_cache.db().pool, 3)
                .await
            {
                tracing::warn!("Failed to warm file search cache: {}", e);
            }
        });

        deployment
            .track_if_analytics_allowed("session_start", json!({}))
            .await;

        let deployment = Arc::new(deployment);

        // Reuse upstream pool for forge migrations/features
        let pool = deployment.db().pool.clone();

        // Run forge-specific migrations on top of upstream schema
        sqlx::migrate!("./migrations").run(&pool).await?;

        // Initialize forge extension services
        let omni_config = OmniConfig {
            enabled: false, // TODO: Load from forge config (Phase B)
            host: None,
            api_key: None,
            instance: None,
            recipient: None,
            recipient_type: None,
        };

        let omni = Arc::new(OmniService::new(omni_config));
        let branch_templates = Arc::new(BranchTemplateService::new(pool.clone()));
        let config = Arc::new(ForgeConfigService::new(pool.clone()));

        Ok(Self {
            deployment,
            omni,
            branch_templates,
            config,
            pool,
        })
    }

    /// Get database connection pool for direct access
    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }
}
