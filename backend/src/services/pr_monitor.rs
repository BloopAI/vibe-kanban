use std::collections::HashMap;
use std::time::Duration;

use chrono::Utc;
use octocrab::{models::IssueState, Octocrab};
use sqlx::SqlitePool;
use tokio::time::interval;
use tracing::{debug, error, info, warn};
use uuid::Uuid;

use crate::models::{
    task::{Task, TaskStatus},
    task_attempt::TaskAttempt,
};

/// Service to monitor GitHub PRs and update task status when they are merged
pub struct PrMonitorService {
    pool: SqlitePool,
    github_tokens: HashMap<String, String>, // repo -> token mapping
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
            github_tokens: HashMap::new(),
            poll_interval: Duration::from_secs(60), // Check every minute
        }
    }

    /// Add a GitHub token for a specific repository
    pub fn add_github_token(&mut self, repo_key: String, token: String) {
        self.github_tokens.insert(repo_key, token);
    }

    /// Start the PR monitoring service
    pub async fn start(&self) {
        info!("Starting PR monitoring service with interval {:?}", self.poll_interval);
        
        let mut interval = interval(self.poll_interval);
        
        loop {
            interval.tick().await;
            
            if let Err(e) = self.check_all_open_prs().await {
                error!("Error checking PRs: {}", e);
            }
        }
    }

    /// Check all open PRs for updates
    async fn check_all_open_prs(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let open_prs = self.get_open_prs().await?;
        
        if open_prs.is_empty() {
            debug!("No open PRs to check");
            return Ok(());
        }

        info!("Checking {} open PRs", open_prs.len());

        for pr_info in open_prs {
            if let Err(e) = self.check_pr_status(&pr_info).await {
                error!("Error checking PR #{} for attempt {}: {}", 
                      pr_info.pr_number, pr_info.attempt_id, e);
            }
        }

        Ok(())
    }

    /// Get all task attempts with open PRs
    async fn get_open_prs(&self) -> Result<Vec<PrInfo>, sqlx::Error> {
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
            // Extract owner and repo from git_repo_path
            if let Ok((owner, repo_name)) = Self::extract_github_repo_info(&row.git_repo_path) {
                // Create a repo key for token lookup
                let repo_key = format!("{}/{}", owner, repo_name);
                
                // For now, use a generic token or environment variable
                // In a real implementation, you would have per-repo tokens
                let github_token = self.github_tokens.get(&repo_key)
                    .cloned()
                    .or_else(|| std::env::var("GITHUB_TOKEN").ok());
                
                if let Some(token) = github_token {
                    pr_infos.push(PrInfo {
                        attempt_id: row.attempt_id,
                        task_id: row.task_id,
                        project_id: row.project_id,
                        pr_number: row.pr_number,
                        repo_owner: owner,
                        repo_name,
                        github_token: token,
                    });
                } else {
                    warn!("No GitHub token found for repository: {} (set GITHUB_TOKEN environment variable)", repo_key);
                }
            } else {
                warn!("Could not extract repo info from git path: {}", row.git_repo_path);
            }
        }

        Ok(pr_infos)
    }

    /// Check the status of a specific PR
    async fn check_pr_status(&self, pr_info: &PrInfo) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let octocrab = Octocrab::builder()
            .personal_token(pr_info.github_token.clone())
            .build()?;

        let pr = octocrab
            .pulls(&pr_info.repo_owner, &pr_info.repo_name)
            .get(pr_info.pr_number as u64)
            .await?;

        let new_status = match pr.state {
            Some(IssueState::Open) => "open",
            Some(IssueState::Closed) => {
                if pr.merged_at.is_some() {
                    "merged"
                } else {
                    "closed"
                }
            }
            None => "unknown", // Should not happen for PRs
            Some(_) => "unknown", // Handle any other states
        };

        debug!("PR #{} status: {} (was open)", pr_info.pr_number, new_status);

        // Update the PR status in the database
        if new_status != "open" {
            TaskAttempt::update_pr_status(
                &self.pool,
                pr_info.attempt_id,
                new_status,
                pr.merged_at.map(|dt| dt.with_timezone(&Utc)),
            ).await?;

            // If the PR was merged, update the task status to done
            if new_status == "merged" {
                info!("PR #{} was merged, updating task {} to done", 
                      pr_info.pr_number, pr_info.task_id);
                
                Task::update_status(
                    &self.pool,
                    pr_info.task_id,
                    pr_info.project_id,
                    TaskStatus::Done,
                ).await?;
            }
        }

        Ok(())
    }



    /// Extract GitHub owner and repo name from git repo path (reused from TaskAttempt)
    fn extract_github_repo_info(git_repo_path: &str) -> Result<(String, String), Box<dyn std::error::Error + Send + Sync>> {
        use git2::Repository;
        
        // Try to extract from remote origin URL
        let repo = Repository::open(git_repo_path)?;
        let remote = repo.find_remote("origin")
            .map_err(|_| "No 'origin' remote found")?;

        let url = remote.url()
            .ok_or("Remote origin has no URL")?;

        // Parse GitHub URL (supports both HTTPS and SSH formats)
        let github_regex = regex::Regex::new(r"github\.com[:/]([^/]+)/(.+?)(?:\.git)?/?$")?;

        if let Some(captures) = github_regex.captures(url) {
            let owner = captures.get(1).unwrap().as_str().to_string();
            let repo_name = captures.get(2).unwrap().as_str().to_string();
            Ok((owner, repo_name))
        } else {
            Err(format!("Not a GitHub repository: {}", url).into())
        }
    }
}
