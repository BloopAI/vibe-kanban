use std::{sync::Arc, time::Duration};

use db::{
    DBService,
    models::{
        task::{Task, TaskStatus},
        task_attempt::{PrInfo, TaskAttempt, TaskAttemptError},
    },
};
use sqlx::error::Error as SqlxError;
use thiserror::Error;
use tokio::{sync::RwLock, time::interval};
use tracing::{debug, error, info};

use crate::services::{
    config::Config,
    github_service::{GitHubRepoInfo, GitHubService, GitHubServiceError},
};

#[derive(Debug, Error)]
enum PrMonitorError {
    #[error("No GitHub token configured")]
    NoGitHubToken,
    #[error(transparent)]
    GitHubServiceError(#[from] GitHubServiceError),
    #[error(transparent)]
    TaskAttemptError(#[from] TaskAttemptError),
    #[error(transparent)]
    Sqlx(#[from] SqlxError),
}

/// Service to monitor GitHub PRs and update task status when they are merged
pub struct PrMonitorService {
    db: DBService,
    config: Arc<RwLock<Config>>,
    poll_interval: Duration,
}

impl PrMonitorService {
    pub async fn spawn(db: DBService, config: Arc<RwLock<Config>>) -> tokio::task::JoinHandle<()> {
        let service = Self {
            db,
            config,
            poll_interval: Duration::from_secs(60), // Check every minute
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
        let open_prs = TaskAttempt::get_open_prs(&self.db.pool).await?;

        if open_prs.is_empty() {
            debug!("No open PRs to check");
            return Ok(());
        }

        info!("Checking {} open PRs", open_prs.len());

        for pr_info in open_prs {
            if let Err(e) = self.check_pr_status(&pr_info).await {
                error!(
                    "Error checking PR #{} for attempt {}: {}",
                    pr_info.pr_number, pr_info.attempt_id, e
                );
            }
        }

        Ok(())
    }

    /// Check the status of a specific PR
    async fn check_pr_status(&self, pr_info: &PrInfo) -> Result<(), PrMonitorError> {
        let github_config = self.config.read().await.github.clone();
        let github_token = github_config.token().ok_or(PrMonitorError::NoGitHubToken)?;

        let github_service = GitHubService::new(&github_token)?;

        let repo_info = GitHubRepoInfo {
            owner: pr_info.repo_owner.clone(),
            repo_name: pr_info.repo_name.clone(),
        };

        let pr_status = github_service
            .update_pr_status(&repo_info, pr_info.pr_number)
            .await?;

        debug!(
            "PR #{} status: {} (was open)",
            pr_info.pr_number, pr_status.status
        );

        // Update the PR status in the database
        if pr_status.status != "open" {
            // Extract merge commit SHA if the PR was merged
            TaskAttempt::update_pr_status(
                &self.db.pool,
                pr_info.attempt_id,
                pr_status.url,
                pr_status.number,
                pr_status.status,
            )
            .await?;

            // If the PR was merged, update the task status to done
            if pr_status.merged {
                info!(
                    "PR #{} was merged, updating task {} to done",
                    pr_info.pr_number, pr_info.task_id
                );
                let merge_commit_sha = pr_status.merge_commit_sha.as_deref().unwrap_or("unknown");
                Task::update_status(&self.db.pool, pr_info.task_id, TaskStatus::Done).await?;
                TaskAttempt::update_merge_commit(
                    &self.db.pool,
                    pr_info.attempt_id,
                    merge_commit_sha,
                )
                .await?;
            }
        }

        Ok(())
    }
}
