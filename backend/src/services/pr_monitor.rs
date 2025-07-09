use std::{sync::Arc, time::Duration};

use sqlx::SqlitePool;
use tokio::{sync::RwLock, time::interval};
use tracing::{debug, error, info, warn};
use uuid::Uuid;

use crate::{
    models::{
        config::Config,
        task::{Task, TaskStatus},
        task_attempt::TaskAttempt,
    },
    services::{GitHubRepoInfo, GitHubService, GitService},
};

/// Service to monitor GitHub PRs and update task status when they are merged
pub struct PrMonitorService {
    pool: SqlitePool,
    poll_interval: Duration,
}

#[derive(Debug)]
pub struct PrInfo {
    pub attempt_id: Uuid,
    pub task_id: Uuid,
    pub project_id: Uuid,
    pub pr_number: i64,
    pub repo_owner: String,
    pub repo_name: String,
    pub github_token: String,
}

impl PrMonitorService {
    pub fn new(pool: SqlitePool) -> Self {
        Self {
            pool,
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
                let config_read = config.read().await;
                if config_read.github.pat.is_some() {
                    config_read.github.pat.clone()
                } else {
                    config_read.github.token.clone()
                }
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
        let open_prs = self.get_open_prs_with_token(github_token).await?;

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

    /// Get all task attempts with open PRs using the provided GitHub token
    async fn get_open_prs_with_token(
        &self,
        github_token: &str,
    ) -> Result<Vec<PrInfo>, sqlx::Error> {
        let rows = sqlx::query!(
            r#"SELECT 
                ta.id as "attempt_id!: Uuid",
                ta.task_id as "task_id!: Uuid",
                ta.pr_number as "pr_number!: i64",
                ta.pr_url,
                t.project_id as "project_id!: Uuid",
                p.git_repo_path
               FROM task_attempts ta
               JOIN tasks t ON ta.task_id = t.id  
               JOIN projects p ON t.project_id = p.id
               WHERE ta.pr_status = 'open' AND ta.pr_number IS NOT NULL"#
        )
        .fetch_all(&self.pool)
        .await?;

        let mut pr_infos = Vec::new();

        for row in rows {
            // Get GitHub repo info from local git repository
            match GitService::new(&row.git_repo_path) {
                Ok(git_service) => match git_service.get_github_repo_info() {
                    Ok((owner, repo_name)) => {
                        pr_infos.push(PrInfo {
                            attempt_id: row.attempt_id,
                            task_id: row.task_id,
                            project_id: row.project_id,
                            pr_number: row.pr_number,
                            repo_owner: owner,
                            repo_name,
                            github_token: github_token.to_string(),
                        });
                    }
                    Err(e) => {
                        warn!(
                            "Could not extract repo info from git path {}: {}",
                            row.git_repo_path, e
                        );
                    }
                },
                Err(e) => {
                    warn!(
                        "Could not create git service for path {}: {}",
                        row.git_repo_path, e
                    );
                }
            }
        }

        Ok(pr_infos)
    }

    /// Check the status of a specific PR
    async fn check_pr_status(
        &self,
        pr_info: &PrInfo,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let github_service = GitHubService::new(&pr_info.github_token)?;

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
            let merge_commit_sha = pr_status.merge_commit_sha.as_deref();

            TaskAttempt::update_pr_status(
                &self.pool,
                pr_info.attempt_id,
                &pr_status.status,
                pr_status.merged_at,
                merge_commit_sha,
            )
            .await?;

            // If the PR was merged, update the task status to done
            if pr_status.merged {
                info!(
                    "PR #{} was merged, updating task {} to done",
                    pr_info.pr_number, pr_info.task_id
                );

                Task::update_status(
                    &self.pool,
                    pr_info.task_id,
                    pr_info.project_id,
                    TaskStatus::Done,
                )
                .await?;
            }
        }

        Ok(())
    }
}
