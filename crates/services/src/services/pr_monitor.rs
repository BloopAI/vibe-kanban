use std::{collections::HashMap, time::Duration};

use api_types::{PullRequestStatus, UpsertPullRequestRequest};
use chrono::Utc;
use db::{
    DBService,
    models::{
        merge::{Merge, MergeStatus, PrMerge, PullRequestInfo},
        repo::Repo,
        task::{Task, TaskStatus},
        workspace::{Workspace, WorkspaceError},
    },
};
use git::{GitService, GitServiceError};
use serde_json::json;
use sqlx::error::Error as SqlxError;
use thiserror::Error;
use tokio::time::interval;
use tracing::{debug, error, info, warn};
use uuid::Uuid;

use crate::services::{
    analytics::AnalyticsContext,
    container::ContainerService,
    git_host::{self, GitHostError, GitHostProvider, github::GitHubProvider},
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
    #[error(transparent)]
    Git(#[from] GitServiceError),
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

    /// Check all open PRs for updates, batching by repo to reduce API calls.
    async fn check_all_open_prs(&self) -> Result<(), PrMonitorError> {
        let open_prs = Merge::get_open_prs(&self.db.pool).await?;

        if open_prs.is_empty() {
            debug!("No open PRs to check");
            return Ok(());
        }

        info!("Checking {} open PRs", open_prs.len());

        // Group PRs by repo_id for bulk fetching
        let mut prs_by_repo: HashMap<Uuid, Vec<&PrMerge>> = HashMap::new();
        for pr_merge in &open_prs {
            prs_by_repo
                .entry(pr_merge.repo_id)
                .or_default()
                .push(pr_merge);
        }

        for (repo_id, prs) in &prs_by_repo {
            // For single-PR repos, use the existing individual check (1 call vs 2)
            if prs.len() == 1 {
                if let Err(e) = self.check_pr_status(prs[0]).await {
                    error!(
                        "Error checking PR #{} for workspace {}: {}",
                        prs[0].pr_info.number, prs[0].workspace_id, e
                    );
                }
                continue;
            }

            // Try bulk fetch for repos with multiple PRs
            if let Err(e) = self.bulk_check_prs(*repo_id, prs).await {
                warn!(
                    "Bulk PR fetch failed for repo {}, falling back to individual checks: {}",
                    repo_id, e
                );
                for pr_merge in prs {
                    if let Err(e) = self.check_pr_status(pr_merge).await {
                        error!(
                            "Error checking PR #{} for workspace {}: {}",
                            pr_merge.pr_info.number, pr_merge.workspace_id, e
                        );
                    }
                }
            }
        }

        Ok(())
    }

    /// Bulk-fetch PR statuses for multiple PRs in a single repo.
    async fn bulk_check_prs(&self, repo_id: Uuid, prs: &[&PrMerge]) -> Result<(), PrMonitorError> {
        let repo = Repo::find_by_id(&self.db.pool, repo_id)
            .await?
            .ok_or_else(|| {
                PrMonitorError::GitHostError(GitHostError::Repository(format!(
                    "Repo {} not found",
                    repo_id
                )))
            })?;

        let git = GitService::new();
        let remote = git.resolve_remote_for_branch(&repo.path, &prs[0].target_branch_name)?;

        let provider = GitHubProvider::new()?;
        let repo_info = provider.get_repo_info(&remote.url, &repo.path).await?;

        let pr_numbers: std::collections::HashSet<i64> =
            prs.iter().map(|p| p.pr_info.number).collect();

        let statuses = provider
            .get_pr_statuses_for_repo(&repo_info, &pr_numbers)
            .await?;

        info!(
            "Bulk-fetched {} PR statuses for repo {}",
            statuses.len(),
            repo.display_name
        );

        for pr_merge in prs {
            if let Some(pr_status) = statuses.get(&pr_merge.pr_info.number) {
                if let Err(e) = self.handle_pr_status_update(pr_merge, pr_status).await {
                    error!(
                        "Error handling PR #{} for workspace {}: {}",
                        pr_merge.pr_info.number, pr_merge.workspace_id, e
                    );
                }
            } else {
                // PR not found in bulk results, fall back to individual check
                debug!(
                    "PR #{} not found in bulk results, checking individually",
                    pr_merge.pr_info.number
                );
                if let Err(e) = self.check_pr_status(pr_merge).await {
                    error!(
                        "Error checking PR #{} for workspace {}: {}",
                        pr_merge.pr_info.number, pr_merge.workspace_id, e
                    );
                }
            }
        }

        Ok(())
    }

    /// Check the status of a specific PR individually.
    async fn check_pr_status(&self, pr_merge: &PrMerge) -> Result<(), PrMonitorError> {
        let git_host = git_host::GitHostService::from_url(&pr_merge.pr_info.url)?;
        let pr_status = git_host.get_pr_status(&pr_merge.pr_info.url).await?;
        self.handle_pr_status_update(pr_merge, &pr_status).await
    }

    /// Handle a PR status update: update DB, sync to remote, archive if merged.
    async fn handle_pr_status_update(
        &self,
        pr_merge: &PrMerge,
        pr_status: &PullRequestInfo,
    ) -> Result<(), PrMonitorError> {
        debug!(
            "PR #{} status: {:?} (was open)",
            pr_merge.pr_info.number, pr_status.status
        );

        if !matches!(&pr_status.status, MergeStatus::Open) {
            Merge::update_status(
                &self.db.pool,
                pr_merge.id,
                pr_status.status.clone(),
                pr_status.merge_commit_sha.clone(),
            )
            .await?;

            self.sync_pr_to_remote(
                pr_merge,
                &pr_status.status,
                pr_status.merge_commit_sha.clone(),
            )
            .await;

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
