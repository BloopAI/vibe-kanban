use std::time::Duration;

use db::{
    DBService,
    models::{
        merge::{CiStatus, Merge, MergeStatus, PrMerge},
        task::{Task, TaskStatus},
        workspace::{Workspace, WorkspaceError},
    },
};
use serde_json::json;
use sqlx::error::Error as SqlxError;
use thiserror::Error;
use tokio::time::interval;
use tracing::{debug, error, info};

use crate::services::{
    analytics::AnalyticsContext,
    git_host::{self, GitHostError, GitHostProvider},
    share::SharePublisher,
};

#[derive(Debug, Error)]
enum PrMonitorError {
    #[error(transparent)]
    GitHostError(#[from] GitHostError),
    #[error(transparent)]
    WorkspaceError(#[from] WorkspaceError),
    #[error(transparent)]
    Sqlx(#[from] SqlxError),
}

/// Service to monitor PRs and update task status when they are merged
pub struct PrMonitorService {
    db: DBService,
    poll_interval: Duration,
    analytics: Option<AnalyticsContext>,
    publisher: Option<SharePublisher>,
}

impl PrMonitorService {
    pub async fn spawn(
        db: DBService,
        analytics: Option<AnalyticsContext>,
        publisher: Option<SharePublisher>,
    ) -> tokio::task::JoinHandle<()> {
        let service = Self {
            db,
            poll_interval: Duration::from_secs(60), // Check every minute
            analytics,
            publisher,
        };
        tokio::spawn(async move {
            service.start().await;
        })
    }

    async fn start(&self) {
        info!(
            "Starting PR monitoring service with interval {:?}",
            self.poll_interval
        );

        let mut interval = interval(self.poll_interval);

        loop {
            interval.tick().await;
            if let Err(e) = self.check_all_open_prs().await {
                error!("Error checking open PRs: {}", e);
            }
        }
    }

    /// Check all open PRs for updates with the provided GitHub token
    async fn check_all_open_prs(&self) -> Result<(), PrMonitorError> {
        let open_prs = Merge::get_open_prs(&self.db.pool).await?;

        if open_prs.is_empty() {
            debug!("No open PRs to check");
            return Ok(());
        }

        info!("Checking {} open PRs", open_prs.len());

        for pr_merge in open_prs {
            if let Err(e) = self.check_pr_status(&pr_merge).await {
                error!(
                    "Error checking PR #{} for workspace {}: {}",
                    pr_merge.pr_info.number, pr_merge.workspace_id, e
                );
            }
        }
        Ok(())
    }

    /// Check the status of a specific PR
    async fn check_pr_status(&self, pr_merge: &PrMerge) -> Result<(), PrMonitorError> {
        let git_host = git_host::GitHostService::from_url(&pr_merge.pr_info.url)?;
        let pr_status = git_host.get_pr_status(&pr_merge.pr_info.url).await?;

        // Fetch CI status for open PRs
        let ci_status = if matches!(&pr_status.status, MergeStatus::Open) {
            match git_host.get_ci_status(&pr_merge.pr_info.url).await {
                Ok(status) => status,
                Err(e) => {
                    debug!(
                        "Failed to fetch CI status for PR #{}: {}",
                        pr_merge.pr_info.number, e
                    );
                    CiStatus::Unknown
                }
            }
        } else {
            // For merged/closed PRs, preserve existing CI status or set to Unknown
            pr_merge.pr_info.ci_status.clone()
        };

        debug!(
            "PR #{} status: {:?}, CI: {:?} (was open)",
            pr_merge.pr_info.number, pr_status.status, ci_status
        );

        // Always update CI status for open PRs, or update everything if PR status changed
        let pr_status_changed = !matches!(&pr_status.status, MergeStatus::Open);
        let ci_status_changed = ci_status != pr_merge.pr_info.ci_status;

        if pr_status_changed {
            // Update merge status with the latest information from git host
            Merge::update_status(
                &self.db.pool,
                pr_merge.id,
                pr_status.status.clone(),
                pr_status.merge_commit_sha,
                ci_status,
            )
            .await?;

            // If the PR was merged, update the task status to done
            if matches!(&pr_status.status, MergeStatus::Merged)
                && let Some(workspace) =
                    Workspace::find_by_id(&self.db.pool, pr_merge.workspace_id).await?
            {
                info!(
                    "PR #{} was merged, updating task {} to done and archiving workspace",
                    pr_merge.pr_info.number, workspace.task_id
                );
                Task::update_status(&self.db.pool, workspace.task_id, TaskStatus::Done).await?;

                // Archive workspace unless pinned
                if !workspace.pinned {
                    Workspace::set_archived(&self.db.pool, workspace.id, true).await?;
                }

                // Track analytics event
                if let Some(analytics) = &self.analytics
                    && let Ok(Some(task)) = Task::find_by_id(&self.db.pool, workspace.task_id).await
                {
                    analytics.analytics_service.track_event(
                        &analytics.user_id,
                        "pr_merged",
                        Some(json!({
                            "task_id": workspace.task_id.to_string(),
                            "workspace_id": workspace.id.to_string(),
                            "project_id": task.project_id.to_string(),
                        })),
                    );
                }

                if let Some(publisher) = &self.publisher
                    && let Err(err) = publisher.update_shared_task_by_id(workspace.task_id).await
                {
                    tracing::warn!(
                        ?err,
                        "Failed to propagate shared task update for {}",
                        workspace.task_id
                    );
                }
            }
        } else if ci_status_changed {
            // Only CI status changed, update just that
            Merge::update_ci_status(&self.db.pool, pr_merge.id, ci_status).await?;
        }

        Ok(())
    }
}
