use std::time::Duration;

use api_types::{PullRequestStatus, UpsertPullRequestRequest};
use chrono::Utc;
use db::{
    DBService,
    models::{
        merge::{Merge, MergeStatus, PrMerge},
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
    container::ContainerService,
    git_host::{self, GitHostError, GitHostProvider},
    remote_client::RemoteClient,
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

        debug!(
            "PR #{} status: {:?} (was open)",
            pr_merge.pr_info.number, pr_status.status
        );

        // Update the PR status in the database
        if !matches!(&pr_status.status, MergeStatus::Open) {
            // Update merge status with the latest information from git host
            Merge::update_status(
                &self.db.pool,
                pr_merge.id,
                pr_status.status.clone(),
                pr_status.merge_commit_sha.clone(),
            )
            .await?;

            self.sync_pr_to_remote(pr_merge, &pr_status.status, pr_status.merge_commit_sha)
                .await;

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
                if !workspace.pinned
                    && let Err(e) = self.container.archive_workspace(workspace.id).await
                {
                    error!("Failed to archive workspace {}: {}", workspace.id, e);
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
            }
        }

        Ok(())
    }

    /// Sync PR status to remote server
    async fn sync_pr_to_remote(
        &self,
        pr_merge: &PrMerge,
        status: &MergeStatus,
        merge_commit_sha: Option<String>,
    ) {
        let Some(client) = &self.remote_client else {
            return;
        };

        let pr_status = match status {
            MergeStatus::Open => PullRequestStatus::Open,
            MergeStatus::Merged => PullRequestStatus::Merged,
            MergeStatus::Closed => PullRequestStatus::Closed,
            MergeStatus::Unknown => return,
        };

        let merged_at = if matches!(status, MergeStatus::Merged) {
            Some(Utc::now())
        } else {
            None
        };

        let client = client.clone();
        let request = UpsertPullRequestRequest {
            url: pr_merge.pr_info.url.clone(),
            number: pr_merge.pr_info.number as i32,
            status: pr_status,
            merged_at,
            merge_commit_sha,
            target_branch_name: pr_merge.target_branch_name.clone(),
            local_workspace_id: pr_merge.workspace_id,
        };
        tokio::spawn(async move {
            remote_sync::sync_pr_to_remote(&client, request).await;
        });
    }
}
