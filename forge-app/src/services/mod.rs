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
use tokio::sync::RwLock;
use uuid::Uuid;

// Import forge extension services
use forge_branch_templates::BranchTemplateService;
use forge_config::ForgeConfigService;
use forge_omni::{OmniConfig, OmniService};

/// Main forge services container
#[derive(Clone)]
pub struct ForgeServices {
    #[allow(dead_code)]
    pub deployment: Arc<DeploymentImpl>,
    pub omni: Arc<RwLock<OmniService>>,
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
        let config = Arc::new(ForgeConfigService::new(pool.clone()));
        let global_settings = config.get_global_settings().await?;
        let omni_config = config.effective_omni_config(None).await?;
        let omni = Arc::new(RwLock::new(OmniService::new(omni_config)));

        tracing::info!(
            forge_branch_templates_enabled = global_settings.branch_templates_enabled,
            forge_omni_enabled = global_settings.omni_enabled,
            "Loaded forge extension settings from auxiliary schema"
        );
        let branch_templates = Arc::new(BranchTemplateService::new(pool.clone()));

        Ok(Self {
            deployment,
            omni,
            branch_templates,
            config,
            pool,
        })
    }

    #[allow(dead_code)]
    /// Get database connection pool for direct access
    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }

    pub async fn apply_global_omni_config(&self) -> Result<()> {
        let omni_config = self.config.effective_omni_config(None).await?;
        let mut omni = self.omni.write().await;
        omni.apply_config(omni_config);
        Ok(())
    }

    #[allow(dead_code)]
    pub async fn effective_omni_config(&self, project_id: Option<Uuid>) -> Result<OmniConfig> {
        self.config.effective_omni_config(project_id).await
    }
}
