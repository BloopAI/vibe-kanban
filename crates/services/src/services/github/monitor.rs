//! GitHub sync monitor service.
//!
//! This service periodically polls GitHub Projects and syncs issues to Vibe tasks.
//! It follows the same pattern as `pr_monitor.rs`.

use std::time::Duration;

use db::{DBService, models::github_project_link::GitHubProjectLink};
use thiserror::Error;
use tokio::time::interval;
use tracing::{debug, error, info, warn};

use super::sync::{GitHubSyncError, GitHubSyncService};

#[derive(Debug, Error)]
pub enum GitHubMonitorError {
    #[error(transparent)]
    Sync(#[from] GitHubSyncError),
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

/// Service to periodically sync GitHub Issues to Vibe tasks
pub struct GitHubSyncMonitor {
    db: DBService,
    poll_interval: Duration,
    sync_service: GitHubSyncService,
}

impl GitHubSyncMonitor {
    /// Spawn the monitor service as a background task.
    ///
    /// Returns a JoinHandle that can be used to await the task.
    pub async fn spawn(db: DBService) -> tokio::task::JoinHandle<()> {
        let service = Self {
            db,
            poll_interval: Duration::from_secs(300), // Check every 5 minutes
            sync_service: GitHubSyncService::new(),
        };

        tokio::spawn(async move {
            service.start().await;
        })
    }

    /// Start the monitoring loop.
    async fn start(&self) {
        // Check if GitHub CLI is available before starting
        if let Err(e) = self.sync_service.check_available() {
            warn!(
                "GitHub CLI not available, sync monitor will not start: {}",
                e
            );
            return;
        }

        info!(
            "Starting GitHub sync monitor service with interval {:?}",
            self.poll_interval
        );

        let mut interval = interval(self.poll_interval);

        loop {
            interval.tick().await;
            if let Err(e) = self.sync_all_enabled_links().await {
                error!("Error syncing GitHub projects: {}", e);
            }
        }
    }

    /// Sync all enabled GitHub project links.
    async fn sync_all_enabled_links(&self) -> Result<(), GitHubMonitorError> {
        let enabled_links = GitHubProjectLink::find_all_enabled(&self.db.pool).await?;

        if enabled_links.is_empty() {
            debug!("No enabled GitHub links to sync");
            return Ok(());
        }

        info!("Syncing {} enabled GitHub project links", enabled_links.len());

        for link in enabled_links {
            if let Err(e) = self.sync_link(&link).await {
                error!(
                    "Error syncing GitHub link {} (project {}): {}",
                    link.id, link.github_project_id, e
                );
            }
        }

        Ok(())
    }

    /// Sync a single GitHub project link.
    async fn sync_link(&self, link: &GitHubProjectLink) -> Result<(), GitHubMonitorError> {
        debug!(
            "Syncing GitHub link {} (project: {})",
            link.id, link.github_project_id
        );

        let result = self
            .sync_service
            .sync_from_github(&self.db.pool, link, link.project_id)
            .await?;

        if result.items_synced > 0 {
            info!(
                "Synced {} items from GitHub project {} ({} created, {} updated)",
                result.items_synced,
                link.github_project_id,
                result.items_created,
                result.items_updated
            );
        }

        if !result.errors.is_empty() {
            warn!(
                "Sync completed with {} errors for GitHub project {}",
                result.errors.len(),
                link.github_project_id
            );
        }

        Ok(())
    }
}
