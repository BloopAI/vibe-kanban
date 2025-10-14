use std::{sync::Arc, time::Duration};

use db::{
    DBService,
    models::{
        merge::{Merge, MergeStatus, PrMerge},
        task::{Task, TaskStatus},
        task_attempt::{TaskAttempt, TaskAttemptError},
    },
};
use serde_json::json;
use sqlx::error::Error as SqlxError;
use thiserror::Error;
use tokio::{sync::RwLock, time::interval};
use tracing::{debug, error, info};

use crate::services::{
    analytics::AnalyticsContext,
    config::{Config, GitPlatformType},
    git_platform::{GitPlatformError, GitPlatformService},
    gitea_service::GiteaService,
    github_service::GitHubService,
};

#[derive(Debug, Error)]
enum PrMonitorError {
    #[error("No git platform token configured")]
    NoToken,
    #[error(transparent)]
    GitPlatformError(#[from] GitPlatformError),
    #[error(transparent)]
    TaskAttemptError(#[from] TaskAttemptError),
    #[error(transparent)]
    Sqlx(#[from] SqlxError),
    #[error("Gitea URL not configured")]
    GiteaUrlNotConfigured,
}

/// Service to monitor Git platform PRs (GitHub/Gitea) and update task status when they are merged
pub struct PrMonitorService {
    db: DBService,
    config: Arc<RwLock<Config>>,
    poll_interval: Duration,
    analytics: Option<AnalyticsContext>,
}

impl PrMonitorService {
    pub async fn spawn(
        db: DBService,
        config: Arc<RwLock<Config>>,
        analytics: Option<AnalyticsContext>,
    ) -> tokio::task::JoinHandle<()> {
        let service = Self {
            db,
            config,
            poll_interval: Duration::from_secs(60), // Check every minute
            analytics,
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
                    "Error checking PR #{} for attempt {}: {}",
                    pr_merge.pr_info.number, pr_merge.task_attempt_id, e
                );
            }
        }
        Ok(())
    }

    /// Check the status of a specific PR
    async fn check_pr_status(&self, pr_merge: &PrMerge) -> Result<(), PrMonitorError> {
        let platform_config = self.config.read().await.git_platform.clone();
        let token = platform_config.token().ok_or(PrMonitorError::NoToken)?;

        // Create the appropriate service based on platform type and get PR status
        let service: Box<dyn GitPlatformService> = match platform_config.platform_type {
            GitPlatformType::GitHub => {
                let service = GitHubService::new(&token).map_err(GitPlatformError::from)?;
                Box::new(service)
            }
            GitPlatformType::Gitea => {
                let gitea_url = platform_config.gitea_url.ok_or(PrMonitorError::GiteaUrlNotConfigured)?;
                let service = GiteaService::new(&token, &gitea_url)?;
                Box::new(service)
            }
        };

        let repo_info = service.parse_repo_url(&pr_merge.pr_info.url)?;
        let pr_status = service.update_pr_status(&repo_info, pr_merge.pr_info.number).await?;

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
                && let Some(task_attempt) =
                    TaskAttempt::find_by_id(&self.db.pool, pr_merge.task_attempt_id).await?
            {
                info!(
                    "PR #{} was merged, updating task {} to done",
                    pr_merge.pr_info.number, task_attempt.task_id
                );
                Task::update_status(&self.db.pool, task_attempt.task_id, TaskStatus::Done).await?;

                // Track analytics event
                if let Some(analytics) = &self.analytics
                    && let Ok(Some(task)) =
                        Task::find_by_id(&self.db.pool, task_attempt.task_id).await
                {
                    analytics.analytics_service.track_event(
                        &analytics.user_id,
                        "pr_merged",
                        Some(json!({
                            "task_id": task_attempt.task_id.to_string(),
                            "task_attempt_id": task_attempt.id.to_string(),
                            "project_id": task.project_id.to_string(),
                        })),
                    );
                }
            }
        }

        Ok(())
    }
}
