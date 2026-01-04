use std::time::Duration;

use db::{
    DBService,
    models::{
        merge::{Merge, MergeStatus, PrMerge},
        project::Project,
        scratch::DraftFollowUpData,
        session::Session,
        task::{Task, TaskStatus},
        workspace::{Workspace, WorkspaceError},
    },
};
use serde_json::json;
use sqlx::error::Error as SqlxError;
use thiserror::Error;
use tokio::time::interval;
use tracing::{debug, error, info, warn};

use crate::services::{
    analytics::AnalyticsContext,
    github::{
        GitHubRepoInfo, GitHubService, GitHubServiceError, PrCheckStatus, PrMergeableStatus,
        PrStatusDetails,
    },
    queued_message::QueuedMessageService,
    share::SharePublisher,
};

#[derive(Debug, Error)]
enum PrMonitorError {
    #[error(transparent)]
    GitHubServiceError(#[from] GitHubServiceError),
    #[error(transparent)]
    WorkspaceError(#[from] WorkspaceError),
    #[error(transparent)]
    Sqlx(#[from] SqlxError),
}

/// Service to monitor GitHub PRs and update task status when they are merged
pub struct PrMonitorService {
    db: DBService,
    poll_interval: Duration,
    analytics: Option<AnalyticsContext>,
    publisher: Option<SharePublisher>,
    queued_message_service: QueuedMessageService,
}

impl PrMonitorService {
    pub async fn spawn(
        db: DBService,
        analytics: Option<AnalyticsContext>,
        publisher: Option<SharePublisher>,
        queued_message_service: QueuedMessageService,
    ) -> tokio::task::JoinHandle<()> {
        let service = Self {
            db,
            poll_interval: Duration::from_secs(60), // Check every minute
            analytics,
            publisher,
            queued_message_service,
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
        // GitHubService now uses gh CLI, no token needed
        let github_service = GitHubService::new()?;
        let repo_info = GitHubRepoInfo::from_remote_url(&pr_merge.pr_info.url)?;

        let pr_status = github_service
            .update_pr_status(&repo_info, pr_merge.pr_info.number)
            .await?;

        debug!(
            "PR #{} status: {:?} (was open)",
            pr_merge.pr_info.number, pr_status.status
        );

        // Update the PR status in the database
        if !matches!(&pr_status.status, MergeStatus::Open) {
            // Update merge status with the latest information from GitHub
            Merge::update_status(
                &self.db.pool,
                pr_merge.id,
                pr_status.status.clone(),
                pr_status.merge_commit_sha,
            )
            .await?;

            // If the PR was merged, update the task status to done
            if matches!(&pr_status.status, MergeStatus::Merged)
                && let Some(workspace) =
                    Workspace::find_by_id(&self.db.pool, pr_merge.workspace_id).await?
            {
                info!(
                    "PR #{} was merged, updating task {} to done",
                    pr_merge.pr_info.number, workspace.task_id
                );
                Task::update_status(&self.db.pool, workspace.task_id, TaskStatus::Done).await?;

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
        } else {
            // PR is still open - check if we need to auto-fix issues
            if let Err(e) = self
                .check_and_auto_fix_pr_issues(&github_service, &repo_info, pr_merge)
                .await
            {
                warn!(
                    "Error checking PR #{} for auto-fix issues: {}",
                    pr_merge.pr_info.number, e
                );
            }
        }

        Ok(())
    }

    /// Check if PR has CI failures or conflicts, and queue auto-fix prompt if enabled
    async fn check_and_auto_fix_pr_issues(
        &self,
        github_service: &GitHubService,
        repo_info: &GitHubRepoInfo,
        pr_merge: &PrMerge,
    ) -> Result<(), PrMonitorError> {
        // Get workspace and task to check if auto-fix is enabled
        let workspace = match Workspace::find_by_id(&self.db.pool, pr_merge.workspace_id).await? {
            Some(w) => w,
            None => return Ok(()), // No workspace found
        };

        let task = match Task::find_by_id(&self.db.pool, workspace.task_id).await? {
            Some(t) => t,
            None => return Ok(()), // No task found
        };

        let project = match Project::find_by_id(&self.db.pool, task.project_id).await? {
            Some(p) => p,
            None => return Ok(()), // No project found
        };

        // Check if auto-fix is enabled for this project
        if !project.pr_auto_fix_enabled {
            return Ok(());
        }

        // Get detailed PR status
        let status_details = match github_service
            .get_pr_status_details(repo_info, pr_merge.pr_info.number)
            .await
        {
            Ok(details) => details,
            Err(e) => {
                debug!(
                    "Could not get PR #{} status details: {}",
                    pr_merge.pr_info.number, e
                );
                return Ok(());
            }
        };

        // Build the auto-fix message if there are issues
        let message = self.build_auto_fix_message(&status_details, pr_merge);
        if message.is_none() {
            return Ok(()); // No issues to fix
        }

        let message = message.unwrap();

        // Find the latest session for this workspace
        let session = match Session::find_latest_by_workspace_id(&self.db.pool, workspace.id).await?
        {
            Some(s) => s,
            None => {
                debug!(
                    "No session found for workspace {}, cannot queue auto-fix message",
                    workspace.id
                );
                return Ok(());
            }
        };

        // Check if there's already a queued message for this session
        if self.queued_message_service.has_queued(session.id) {
            debug!(
                "Session {} already has a queued message, skipping auto-fix",
                session.id
            );
            return Ok(());
        }

        // Queue the auto-fix message
        info!(
            "Queueing auto-fix message for PR #{} (workspace {}): CI failures or conflicts detected",
            pr_merge.pr_info.number, workspace.id
        );

        self.queued_message_service.queue_message(
            session.id,
            DraftFollowUpData {
                message,
                variant: None,
            },
        );

        // Track analytics event
        if let Some(analytics) = &self.analytics {
            analytics.analytics_service.track_event(
                &analytics.user_id,
                "pr_auto_fix_queued",
                Some(json!({
                    "task_id": task.id.to_string(),
                    "workspace_id": workspace.id.to_string(),
                    "project_id": project.id.to_string(),
                    "pr_number": pr_merge.pr_info.number,
                    "has_ci_failures": status_details.check_status == PrCheckStatus::Failure,
                    "has_conflicts": status_details.mergeable_status == PrMergeableStatus::Conflicting,
                })),
            );
        }

        Ok(())
    }

    /// Build an auto-fix message based on PR issues
    fn build_auto_fix_message(
        &self,
        status_details: &PrStatusDetails,
        pr_merge: &PrMerge,
    ) -> Option<String> {
        let mut issues = Vec::new();

        // Check for CI failures
        if status_details.check_status == PrCheckStatus::Failure {
            let failed_checks = if status_details.failed_checks.is_empty() {
                "some checks".to_string()
            } else {
                status_details.failed_checks.join(", ")
            };
            issues.push(format!(
                "CI checks are failing: {}",
                failed_checks
            ));
        }

        // Check for merge conflicts
        if status_details.mergeable_status == PrMergeableStatus::Conflicting {
            issues.push("The PR has merge conflicts that need to be resolved".to_string());
        }

        if issues.is_empty() {
            return None;
        }

        let pr_url = &pr_merge.pr_info.url;
        let issue_list = issues
            .iter()
            .map(|i| format!("- {}", i))
            .collect::<Vec<_>>()
            .join("\n");

        Some(format!(
            "The PR ({}) has issues that need to be fixed:\n\n{}\n\nPlease investigate and fix these issues.",
            pr_url, issue_list
        ))
    }
}
