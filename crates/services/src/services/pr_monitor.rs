use std::{sync::Arc, time::Duration};

use db::{
    DBService,
    models::{
        task::{Task, TaskStatus},
        task_attempt::{PrInfo, TaskAttempt},
    },
};
use tokio::{sync::RwLock, time::interval};
use tracing::{debug, error, info};

use crate::services::{
    config::Config,
    github_service::{GitHubRepoInfo, GitHubService},
};

/// Service to monitor GitHub PRs and update task status when they are merged
pub struct PrMonitorService {
    db: DBService,
    poll_interval: Duration,
}

impl PrMonitorService {
    pub fn new(db: DBService) -> Self {
        Self {
            db,
            poll_interval: Duration::from_secs(60), // Check every minute
        }
    }

    /// Start the PR monitoring service with config
    pub async fn start_with_config(&self, config: Arc<RwLock<Config>>) {
        info!(
            "Starting PR monitoring service with interval {:?}",
            self.poll_interval
        );

        let mut interval = interval(self.poll_interval);

        loop {
            interval.tick().await;

            // Get GitHub token from config
            let github_token = {
                let github_config = config.read().await.github.clone();
                github_config.pat.or(github_config.token)
            };

            match github_token {
                Some(token) => {
                    if let Err(e) = self.check_all_open_prs_with_token(&token).await {
                        error!("Error checking PRs: {}", e);
                    }
                }
                None => {
                    debug!("No GitHub token configured, skipping PR monitoring");
                }
            }
        }
    }

    /// Check all open PRs for updates with the provided GitHub token
    async fn check_all_open_prs_with_token(
        &self,
        github_token: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let open_prs = TaskAttempt::get_open_prs(&self.db.pool).await?;

        if open_prs.is_empty() {
            debug!("No open PRs to check");
            return Ok(());
        }

        info!("Checking {} open PRs", open_prs.len());

        for pr_info in open_prs {
            if let Err(e) = self.check_pr_status(&pr_info, github_token).await {
                error!(
                    "Error checking PR #{} for attempt {}: {}",
                    pr_info.pr_number, pr_info.attempt_id, e
                );
            }
        }

        Ok(())
    }

    /// Check the status of a specific PR
    async fn check_pr_status(
        &self,
        pr_info: &PrInfo,
        github_token: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let github_service = GitHubService::new(github_token)?;

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
