use std::{
    sync::{Arc, Mutex},
    time::Duration,
};

use api_types::{PullRequestStatus, UpdatePullRequestApiRequest, UpsertPullRequestRequest};
use chrono::{DateTime, Utc};
use db::{
    DBService,
    models::{
        merge::{ActiveWorkspaceRepo, Merge, MergeStatus},
        pull_request::PullRequest,
        repo::Repo,
        workspace::{Workspace, WorkspaceError},
    },
};
use git::GitServiceError;
use git_host::{GitHostError, GitHostProvider, GitHostService};
use serde_json::json;
use sqlx::error::Error as SqlxError;
use thiserror::Error;
use tokio::{sync::Notify, time::interval};
use tracing::{debug, error, info, warn};

use crate::services::{
    analytics::AnalyticsContext,
    container::ContainerService,
    remote_client::{RemoteClient, RemoteClientError},
    remote_sync,
};

#[derive(Debug, Error)]
enum PrMonitorError {
    #[error(transparent)]
    GitHostError(#[from] GitHostError),
    #[error(transparent)]
    GitServiceError(#[from] GitServiceError),
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
            ) | PrMonitorError::GitServiceError(_)
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
    sync_notify: Arc<Notify>,
    /// Tracks when we last ran PR discovery so we only poll workspaces
    /// that have been updated since then, avoiding unnecessary GitHub API calls
    /// that could exhaust rate limits for users with many active workspaces.
    last_discovery_at: Mutex<Option<DateTime<Utc>>>,
}

impl<C: ContainerService + Send + Sync + 'static> PrMonitorService<C> {
    pub async fn spawn(
        db: DBService,
        analytics: Option<AnalyticsContext>,
        container: C,
        remote_client: Option<RemoteClient>,
        sync_notify: Arc<Notify>,
    ) -> tokio::task::JoinHandle<()> {
        let service = Self {
            db,
            poll_interval: Duration::from_secs(60),
            analytics,
            container,
            remote_client,
            sync_notify,
            last_discovery_at: Mutex::new(None),
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
            tokio::select! {
                _ = interval.tick() => {
                    // Discover new PRs first so check_all_open_prs can handle
                    // their status updates in the same cycle.
                    if let Err(e) = self.discover_new_prs().await {
                        error!("Error discovering new PRs: {}", e);
                    }
                    if let Err(e) = self.check_all_open_prs().await {
                        error!("Error checking open PRs: {}", e);
                    }
                }
                _ = self.sync_notify.notified() => {
                    debug!("PR sync triggered externally");
                }
            }
            self.sync_pending_to_remote().await;
        }
    }

    /// Check all open PRs for updates
    async fn check_all_open_prs(&self) -> Result<(), PrMonitorError> {
        let open_prs = PullRequest::get_open(&self.db.pool).await?;

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

    /// Discover PRs created outside of VK on workspace branches.
    /// On the first run, scans all active workspaces; on subsequent runs,
    /// only checks workspaces updated since the last discovery cycle.
    /// Links any PRs not already known. Runs before check_all_open_prs so
    /// newly discovered PRs get their status checked in the same cycle.
    async fn discover_new_prs(&self) -> Result<(), PrMonitorError> {
        let updated_since = *self.last_discovery_at.lock().unwrap();

        // Capture the timestamp before the DB query to prevent a race condition:
        // a workspace updated between the query and this timestamp would be missed
        // by both the current and future discovery cycles. Capturing early may
        // re-query some workspaces, but that is safe since discovery is idempotent.
        let discovery_started_at = Utc::now();
        let candidates = Merge::get_active_workspace_repos(&self.db.pool, updated_since).await?;

        if candidates.is_empty() {
            debug!("No active workspace repos to check for PRs");
            *self.last_discovery_at.lock().unwrap() = Some(discovery_started_at);
            return Ok(());
        }

        debug!(
            "Checking {} workspace-repo pairs for new PRs (since {:?})",
            candidates.len(),
            updated_since,
        );

        let mut had_failures = false;
        for candidate in &candidates {
            if let Err(e) = self.discover_prs_for_workspace_repo(candidate).await {
                if e.is_environmental() {
                    debug!(
                        "Skipping PR discovery for workspace {} repo {} due to environmental error: {}",
                        candidate.workspace_id, candidate.repo_id, e
                    );
                } else {
                    warn!(
                        "Error discovering PR for workspace {} repo {}: {}",
                        candidate.workspace_id, candidate.repo_id, e
                    );
                    had_failures = true;
                }
            }
        }

        // Only advance the watermark if all candidates were successfully processed,
        // so that failed candidates are retried in the next discovery cycle.
        if !had_failures {
            *self.last_discovery_at.lock().unwrap() = Some(discovery_started_at);
        }
        Ok(())
    }

    /// Query GitHub for PRs on a workspace branch and link any we don't already know about.
    /// Only creates pull request records; status updates and archival are handled by
    /// check_all_open_prs later in the same cycle.
    async fn discover_prs_for_workspace_repo(
        &self,
        candidate: &ActiveWorkspaceRepo,
    ) -> Result<(), PrMonitorError> {
        let repo = Repo::find_by_id(&self.db.pool, candidate.repo_id)
            .await?
            .ok_or_else(|| {
                PrMonitorError::GitHostError(GitHostError::PullRequest(format!(
                    "Repo {} not found",
                    candidate.repo_id
                )))
            })?;

        let git = self.container.git();
        let remote = git.resolve_remote_for_branch(&repo.path, &candidate.target_branch)?;

        let git_host = GitHostService::from_url(&remote.url)?;
        let prs = git_host
            .list_prs_for_branch(&repo.path, &remote.url, &candidate.workspace_branch)
            .await?;

        if prs.is_empty() {
            return Ok(());
        }

        let known_pr_numbers = PullRequest::get_known_pr_numbers(
            &self.db.pool,
            candidate.workspace_id,
            candidate.repo_id,
        )
        .await?;

        for pr_info in prs {
            if known_pr_numbers.contains(&pr_info.number) {
                continue;
            }

            info!(
                "Auto-discovered PR #{} ({:?}) for workspace {} repo {}",
                pr_info.number, pr_info.status, candidate.workspace_id, candidate.repo_id
            );

            // Created as 'open' — check_all_open_prs will pick it up on the
            // next cycle, detect the actual status, and run the full lifecycle
            // (archival, remote sync, analytics) if already merged/closed.
            PullRequest::create_for_workspace(
                &self.db.pool,
                candidate.workspace_id,
                candidate.repo_id,
                &candidate.target_branch,
                pr_info.number,
                &pr_info.url,
            )
            .await?;
        }

        Ok(())
    }

    /// Check the status of a single open PR and handle state changes.
    async fn check_open_pr(&self, pr: &PullRequest) -> Result<(), PrMonitorError> {
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

        PullRequest::update_status(
            &self.db.pool,
            &pr.pr_url,
            &status.status,
            merged_at,
            status.merge_commit_sha.clone(),
        )
        .await?;

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
            PullRequest::count_open_for_workspace(&self.db.pool, workspace_id).await?;

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

            if let Some(analytics) = &self.analytics {
                analytics.analytics_service.track_event(
                    &analytics.user_id,
                    "pr_merged",
                    Some(json!({
                        "workspace_id": workspace.id.to_string(),
                    })),
                );
            }
        } else {
            info!(
                "PR #{} was merged, leaving workspace {} active with {} open PR(s)",
                pr_number, workspace.id, open_pr_count
            );
        }

        Ok(())
    }

    /// Sync pending PR status changes to remote server.
    async fn sync_pending_to_remote(&self) {
        let Some(client) = &self.remote_client else {
            return;
        };

        let pending = match PullRequest::get_pending_sync(&self.db.pool).await {
            Ok(prs) => prs,
            Err(e) => {
                error!("Failed to query pending sync PRs: {}", e);
                return;
            }
        };

        if pending.is_empty() {
            return;
        }

        debug!("Syncing {} pending PRs to remote", pending.len());

        for pr in &pending {
            let pr_api_status = match &pr.pr_status {
                MergeStatus::Open => PullRequestStatus::Open,
                MergeStatus::Merged => PullRequestStatus::Merged,
                MergeStatus::Closed => PullRequestStatus::Closed,
                MergeStatus::Unknown => continue,
            };

            let request = UpdatePullRequestApiRequest {
                url: pr.pr_url.clone(),
                status: Some(pr_api_status),
                merged_at: pr.merged_at.map(Some),
                merge_commit_sha: pr.merge_commit_sha.clone().map(Some),
            };

            match client.update_pull_request(request).await {
                Ok(_) => {
                    if let Err(e) = PullRequest::mark_synced(&self.db.pool, &pr.id).await {
                        error!("Failed to mark PR #{} as synced: {}", pr.pr_number, e);
                    }
                }
                Err(RemoteClientError::Http { status: 404, .. }) => {
                    if let Some(workspace_id) = pr.workspace_id {
                        let request = UpsertPullRequestRequest {
                            url: pr.pr_url.clone(),
                            number: pr.pr_number as i32,
                            status: pr_api_status,
                            merged_at: pr.merged_at,
                            merge_commit_sha: pr.merge_commit_sha.clone(),
                            target_branch_name: pr.target_branch_name.clone(),
                            local_workspace_id: workspace_id,
                        };
                        remote_sync::sync_pr_to_remote(client, request).await;
                        if let Err(e) = PullRequest::mark_synced(&self.db.pool, &pr.id).await {
                            error!("Failed to mark PR #{} as synced: {}", pr.pr_number, e);
                        }
                    } else {
                        warn!(
                            "PR #{} not found on remote and has no workspace, removing local record",
                            pr.pr_number
                        );
                        if let Err(e) = PullRequest::delete(&self.db.pool, &pr.id).await {
                            error!("Failed to delete orphaned local PR: {}", e);
                        }
                    }
                }
                Err(RemoteClientError::Auth) => {
                    debug!("PR sync sweep stopped: not authenticated");
                    return;
                }
                Err(e) => {
                    error!(
                        "Failed to sync PR #{} status to remote: {}",
                        pr.pr_number, e
                    );
                }
            }
        }
    }
}
