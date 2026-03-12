use std::time::Duration;

use api_types::{PullRequestStatus, UpdatePullRequestApiRequest, UpsertPullRequestRequest};
use chrono::Utc;
use db::{
    DBService,
    models::{
        merge::MergeStatus,
        tracked_pr::TrackedPr,
        workspace::{Workspace, WorkspaceError},
    },
};
use git_host::{GitHostError, GitHostProvider, GitHostService};
use serde_json::json;
use sqlx::error::Error as SqlxError;
use thiserror::Error;
use tokio::time::interval;
use tracing::{debug, error, info, warn};

use crate::services::{
    analytics::AnalyticsContext, container::ContainerService, remote_client::RemoteClient,
    remote_sync,
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

impl PrMonitorError {
    fn is_environmental(&self) -> bool {
        matches!(
            self,
            PrMonitorError::GitHostError(
                GitHostError::CliNotInstalled { .. } | GitHostError::NotAGitRepository(_)
            )
        )
    }
}

/// Service to monitor PRs and update task status when they are merged
pub struct PrMonitorService<C: ContainerService> {
    db: DBService,
    poll_interval: Duration,
    analytics: Option<AnalyticsContext>,
    container: C,
    remote_client: Option<RemoteClient>,
}

impl<C: ContainerService + Send + Sync + 'static> PrMonitorService<C> {
    pub async fn spawn(
        db: DBService,
        analytics: Option<AnalyticsContext>,
        container: C,
        remote_client: Option<RemoteClient>,
    ) -> tokio::task::JoinHandle<()> {
        let service = Self {
            db,
            poll_interval: Duration::from_secs(60), // Check every minute
            analytics,
            container,
            remote_client,
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

    /// Check all open PRs for updates
    async fn check_all_open_prs(&self) -> Result<(), PrMonitorError> {
        let open_prs = TrackedPr::get_open(&self.db.pool).await?;

        if open_prs.is_empty() {
            debug!("No open PRs to check");
            return Ok(());
        }

        info!("Checking {} open PRs", open_prs.len());
        for pr in &open_prs {
            if let Err(e) = self.check_open_pr(pr).await {
                if e.is_environmental() {
                    warn!(
                        "Skipping PR #{} due to environmental error: {}",
                        pr.pr_number, e
                    );
                } else {
                    error!("Error checking PR #{}: {}", pr.pr_number, e);
                }
            }
        }

        Ok(())
    }

    /// Check the status of a single open PR and handle state changes.
    async fn check_open_pr(&self, pr: &TrackedPr) -> Result<(), PrMonitorError> {
        let git_host = GitHostService::from_url(&pr.pr_url)?;
        let status = git_host.get_pr_status(&pr.pr_url).await?;

        debug!(
            "PR #{} status: {:?} (was open)",
            pr.pr_number, status.status
        );

        if matches!(&status.status, MergeStatus::Open) {
            return Ok(());
        }

        let merged_at = if matches!(&status.status, MergeStatus::Merged) {
            Some(status.merged_at.unwrap_or_else(Utc::now))
        } else {
            None
        };

        TrackedPr::update_status(
            &self.db.pool,
            &pr.pr_url,
            &status.status,
            merged_at,
            status.merge_commit_sha.clone(),
        )
        .await?;

        self.sync_pr_to_remote(pr, &status).await;

        // If this is a workspace PR and it was merged, try to archive
        if matches!(&status.status, MergeStatus::Merged)
            && let Some(workspace_id) = pr.workspace_id
        {
            self.try_archive_workspace(workspace_id, pr.pr_number)
                .await?;
        }

        info!("PR #{} status changed to {:?}", pr.pr_number, status.status);

        Ok(())
    }

    /// Archive workspace if all its PRs are merged/closed
    async fn try_archive_workspace(
        &self,
        workspace_id: uuid::Uuid,
        pr_number: i64,
    ) -> Result<(), PrMonitorError> {
        let Some(workspace) = Workspace::find_by_id(&self.db.pool, workspace_id).await? else {
            return Ok(());
        };

        let open_pr_count =
            TrackedPr::count_open_for_workspace(&self.db.pool, workspace_id).await?;

        if open_pr_count == 0 {
            info!(
                "PR #{} was merged, archiving workspace {}",
                pr_number, workspace.id
            );
            if !workspace.pinned
                && let Err(e) = self.container.archive_workspace(workspace.id).await
            {
                error!("Failed to archive workspace {}: {}", workspace.id, e);
            }
        } else {
            info!(
                "PR #{} was merged, leaving workspace {} active with {} open PR(s)",
                pr_number, workspace.id, open_pr_count
            );
        }

        if let Some(analytics) = &self.analytics {
            analytics.analytics_service.track_event(
                &analytics.user_id,
                "pr_merged",
                Some(json!({
                    "workspace_id": workspace.id.to_string(),
                })),
            );
        }

        Ok(())
    }

    /// Sync PR status change to remote server.
    async fn sync_pr_to_remote(
        &self,
        tracked_pr: &TrackedPr,
        status_info: &db::models::merge::PullRequestInfo,
    ) {
        let Some(client) = &self.remote_client else {
            return;
        };

        let pr_api_status = match &status_info.status {
            MergeStatus::Open => PullRequestStatus::Open,
            MergeStatus::Merged => PullRequestStatus::Merged,
            MergeStatus::Closed => PullRequestStatus::Closed,
            MergeStatus::Unknown => return,
        };

        let merged_at = if matches!(&status_info.status, MergeStatus::Merged) {
            Some(status_info.merged_at.unwrap_or_else(Utc::now))
        } else {
            None
        };

        if let Some(workspace_id) = tracked_pr.workspace_id {
            let client = client.clone();
            let request = UpsertPullRequestRequest {
                url: tracked_pr.pr_url.clone(),
                number: tracked_pr.pr_number as i32,
                status: pr_api_status,
                merged_at,
                merge_commit_sha: status_info.merge_commit_sha.clone(),
                target_branch_name: tracked_pr.target_branch_name.clone(),
                local_workspace_id: workspace_id,
            };
            tokio::spawn(async move {
                remote_sync::sync_pr_to_remote(&client, request).await;
            });
        } else {
            let client = client.clone();
            let request = UpdatePullRequestApiRequest {
                url: tracked_pr.pr_url.clone(),
                status: Some(pr_api_status),
                merged_at: merged_at.map(Some),
                merge_commit_sha: status_info.merge_commit_sha.clone().map(Some),
            };
            tokio::spawn(async move {
                if let Err(e) = client.update_pull_request(request).await {
                    error!("Failed to sync tracked PR status to remote: {}", e);
                }
            });
        }
    }
}
