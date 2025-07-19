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
    services::{GitHubRepoInfo, GitHubService, GitService, GitLabRepoInfo, GitLabService, RepoProvider},
};

/// Service to monitor GitHub PRs and GitLab MRs and update task status when they are merged
pub struct PrMonitorService {
    pool: SqlitePool,
    poll_interval: Duration,
}

#[derive(Debug)]
pub enum PrInfo {
    GitHub {
        attempt_id: Uuid,
        task_id: Uuid,
        project_id: Uuid,
        pr_number: i64,
        repo_owner: String,
        repo_name: String,
        github_token: String,
    },
    GitLab {
        attempt_id: Uuid,
        task_id: Uuid,
        project_id: Uuid,
        mr_iid: i64,
        project_path: String,
        gitlab_token: String,
        gitlab_url: String,
    },
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
            "Starting PR/MR monitoring service with interval {:?}",
            self.poll_interval
        );

        let mut interval = interval(self.poll_interval);

        loop {
            interval.tick().await;

            // Get tokens from config
            let (github_token, gitlab_token, gitlab_url) = {
                let config_read = config.read().await;
                let github_token = if config_read.github.pat.is_some() {
                    config_read.github.pat.clone()
                } else {
                    config_read.github.token.clone()
                };
                let gitlab_token = config_read.gitlab.pat.clone();
                let gitlab_url = config_read.gitlab.gitlab_url.clone()
                    .unwrap_or_else(|| "https://gitlab.com".to_string());
                (github_token, gitlab_token, gitlab_url)
            };

            if let Err(e) = self.check_all_open_prs_with_tokens(
                github_token.as_deref(),
                gitlab_token.as_deref(),
                &gitlab_url,
            ).await {
                error!("Error checking PRs/MRs: {}", e);
            }
        }
    }

    /// Check all open PRs/MRs for updates with the provided tokens
    async fn check_all_open_prs_with_tokens(
        &self,
        github_token: Option<&str>,
        gitlab_token: Option<&str>,
        gitlab_url: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let open_prs = self.get_open_prs_with_tokens(github_token, gitlab_token, gitlab_url).await?;

        if open_prs.is_empty() {
            debug!("No open PRs/MRs to check");
            return Ok(());
        }

        info!("Checking {} open PRs/MRs", open_prs.len());

        for pr_info in open_prs {
            if let Err(e) = self.check_pr_status(&pr_info).await {
                match &pr_info {
                    PrInfo::GitHub { pr_number, attempt_id, .. } => {
                        error!(
                            "Error checking GitHub PR #{} for attempt {}: {}",
                            pr_number, attempt_id, e
                        );
                    }
                    PrInfo::GitLab { mr_iid, attempt_id, .. } => {
                        error!(
                            "Error checking GitLab MR !{} for attempt {}: {}",
                            mr_iid, attempt_id, e
                        );
                    }
                }
            }
        }

        Ok(())
    }

    /// Get all task attempts with open PRs/MRs using the provided tokens
    async fn get_open_prs_with_tokens(
        &self,
        github_token: Option<&str>,
        gitlab_token: Option<&str>,
        gitlab_url: &str,
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
            // Get repo provider from local git repository
            match GitService::new(&row.git_repo_path) {
                Ok(git_service) => match git_service.get_repo_provider() {
                    Ok(RepoProvider::GitHub) => {
                        if let Some(token) = github_token {
                            match git_service.get_github_repo_info() {
                                Ok((owner, repo_name)) => {
                                    pr_infos.push(PrInfo::GitHub {
                                        attempt_id: row.attempt_id,
                                        task_id: row.task_id,
                                        project_id: row.project_id,
                                        pr_number: row.pr_number,
                                        repo_owner: owner,
                                        repo_name,
                                        github_token: token.to_string(),
                                    });
                                }
                                Err(e) => {
                                    warn!(
                                        "Could not extract GitHub repo info from git path {}: {}",
                                        row.git_repo_path, e
                                    );
                                }
                            }
                        }
                    }
                    Ok(RepoProvider::GitLab) => {
                        if let Some(token) = gitlab_token {
                            match git_service.get_gitlab_repo_info() {
                                Ok(project_path) => {
                                    pr_infos.push(PrInfo::GitLab {
                                        attempt_id: row.attempt_id,
                                        task_id: row.task_id,
                                        project_id: row.project_id,
                                        mr_iid: row.pr_number,
                                        project_path,
                                        gitlab_token: token.to_string(),
                                        gitlab_url: gitlab_url.to_string(),
                                    });
                                }
                                Err(e) => {
                                    warn!(
                                        "Could not extract GitLab repo info from git path {}: {}",
                                        row.git_repo_path, e
                                    );
                                }
                            }
                        }
                    }
                    Ok(RepoProvider::Other) => {
                        debug!(
                            "Skipping unsupported repository type for {}",
                            row.git_repo_path
                        );
                    }
                    Err(e) => {
                        warn!(
                            "Could not determine repo provider for {}: {}",
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

    /// Check the status of a specific PR/MR
    async fn check_pr_status(
        &self,
        pr_info: &PrInfo,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        match pr_info {
            PrInfo::GitHub {
                attempt_id,
                task_id,
                project_id,
                pr_number,
                repo_owner,
                repo_name,
                github_token,
            } => {
                let github_service = GitHubService::new(github_token)?;

                let repo_info = GitHubRepoInfo {
                    owner: repo_owner.clone(),
                    repo_name: repo_name.clone(),
                };

                let pr_status = github_service
                    .update_pr_status(&repo_info, *pr_number)
                    .await?;

                debug!(
                    "GitHub PR #{} status: {} (was open)",
                    pr_number, pr_status.status
                );

                // Update the PR status in the database
                if pr_status.status != "open" {
                    // Extract merge commit SHA if the PR was merged
                    let merge_commit_sha = pr_status.merge_commit_sha.as_deref();

                    TaskAttempt::update_pr_status(
                        &self.pool,
                        *attempt_id,
                        &pr_status.status,
                        pr_status.merged_at,
                        merge_commit_sha,
                    )
                    .await?;

                    // If the PR was merged, update the task status to done
                    if pr_status.merged {
                        info!(
                            "GitHub PR #{} was merged, updating task {} to done",
                            pr_number, task_id
                        );

                        Task::update_status(
                            &self.pool,
                            *task_id,
                            *project_id,
                            TaskStatus::Done,
                        )
                        .await?;
                    }
                }
            }
            PrInfo::GitLab {
                attempt_id,
                task_id,
                project_id,
                mr_iid,
                project_path,
                gitlab_token,
                gitlab_url,
            } => {
                let gitlab_service = GitLabService::new(gitlab_url, gitlab_token)?;

                let repo_info = GitLabRepoInfo {
                    project_id: project_path.clone(),
                };

                let mr_status = gitlab_service
                    .update_mr_status(&repo_info, *mr_iid)
                    .await?;

                debug!(
                    "GitLab MR !{} status: {} (was open)",
                    mr_iid, mr_status.state
                );

                // Update the MR status in the database
                if mr_status.state != "opened" {
                    // Extract merge commit SHA if the MR was merged
                    let merge_commit_sha = mr_status.merge_commit_sha.as_deref();

                    TaskAttempt::update_pr_status(
                        &self.pool,
                        *attempt_id,
                        &mr_status.state,
                        mr_status.merged_at,
                        merge_commit_sha,
                    )
                    .await?;

                    // If the MR was merged, update the task status to done
                    if mr_status.merged {
                        info!(
                            "GitLab MR !{} was merged, updating task {} to done",
                            mr_iid, task_id
                        );

                        Task::update_status(
                            &self.pool,
                            *task_id,
                            *project_id,
                            TaskStatus::Done,
                        )
                        .await?;
                    }
                }
            }
        }

        Ok(())
    }
}
