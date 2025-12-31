//! Service to monitor GitHub issues and sync them with Vibe Kanban tasks.
//!
//! This service periodically polls GitHub for open issues in repositories
//! that have issue sync enabled, and creates/updates corresponding tasks.

use std::time::Duration;

use db::{
    DBService,
    models::{
        project_repo::ProjectRepo,
        repo::Repo,
        task::{CreateTask, Task, TaskStatus},
    },
};
use sqlx::error::Error as SqlxError;
use thiserror::Error;
use tokio::time::interval;
use tracing::{debug, error, info, warn};
use uuid::Uuid;

use crate::services::github::{cli::GitHubIssue, GitHubRepoInfo, GitHubService, GitHubServiceError};

#[derive(Debug, Error)]
pub enum IssueMonitorError {
    #[error(transparent)]
    GitHubServiceError(#[from] GitHubServiceError),
    #[error(transparent)]
    Sqlx(#[from] SqlxError),
    #[error("Repository not found: {0}")]
    RepoNotFound(Uuid),
    #[error("Failed to parse repo URL: {0}")]
    InvalidRepoUrl(String),
}

/// Service to monitor GitHub issues and sync them with Vibe Kanban tasks
pub struct IssueMonitorService {
    db: DBService,
    poll_interval: Duration,
}

impl IssueMonitorService {
    pub async fn spawn(db: DBService) -> tokio::task::JoinHandle<()> {
        let service = Self {
            db,
            poll_interval: Duration::from_secs(60), // Check every minute
        };
        tokio::spawn(async move {
            service.start().await;
        })
    }

    async fn start(&self) {
        info!(
            "Starting GitHub Issue monitoring service with interval {:?}",
            self.poll_interval
        );

        let mut interval = interval(self.poll_interval);

        loop {
            interval.tick().await;
            if let Err(e) = self.sync_all_enabled_repos().await {
                error!("Error syncing GitHub issues: {}", e);
            }
        }
    }

    /// Sync issues for all repos with GitHub issue sync enabled
    async fn sync_all_enabled_repos(&self) -> Result<(), IssueMonitorError> {
        let enabled_repos = ProjectRepo::find_with_github_sync_enabled(&self.db.pool).await?;

        if enabled_repos.is_empty() {
            debug!("No repositories with GitHub issue sync enabled");
            return Ok(());
        }

        info!(
            "Syncing GitHub issues for {} repositories",
            enabled_repos.len()
        );

        for project_repo in enabled_repos {
            if let Err(e) = self.sync_repo_issues(&project_repo).await {
                error!(
                    "Error syncing issues for project_repo {}: {}",
                    project_repo.id, e
                );
            }
        }

        Ok(())
    }

    /// Sync issues for a specific repository
    async fn sync_repo_issues(&self, project_repo: &ProjectRepo) -> Result<(), IssueMonitorError> {
        // Get the repo to find the Git URL
        let repo = Repo::find_by_id(&self.db.pool, project_repo.repo_id)
            .await?
            .ok_or(IssueMonitorError::RepoNotFound(project_repo.repo_id))?;

        // Parse the repo to get owner/repo for GitHub API
        let repo_path_str = repo.path.to_string_lossy();
        let repo_info = match GitHubRepoInfo::from_repo_path(&repo_path_str) {
            Ok(info) => info,
            Err(_) => {
                debug!(
                    "Skipping repo {} - not a GitHub repo or can't parse URL",
                    repo.display_name
                );
                return Ok(());
            }
        };

        // Only import issues if enabled
        if project_repo.github_issue_import_to_todo {
            self.import_issues_from_github(project_repo, &repo_info)
                .await?;
        }

        Ok(())
    }

    /// Import open issues from GitHub and create tasks for them
    async fn import_issues_from_github(
        &self,
        project_repo: &ProjectRepo,
        repo_info: &GitHubRepoInfo,
    ) -> Result<(), IssueMonitorError> {
        let github_service = GitHubService::new()?;

        // Fetch open issues from GitHub
        let issues = match github_service
            .list_issues(&repo_info.owner, &repo_info.repo_name, "open")
            .await
        {
            Ok(issues) => issues,
            Err(e) => {
                warn!("Failed to fetch issues from GitHub: {}", e);
                return Err(e.into());
            }
        };

        debug!(
            "Found {} open issues in {}/{}",
            issues.len(),
            repo_info.owner,
            repo_info.repo_name
        );

        for issue in issues {
            if let Err(e) = self
                .sync_single_issue(project_repo, &issue)
                .await
            {
                warn!(
                    "Failed to sync issue #{}: {}",
                    issue.number, e
                );
            }
        }

        Ok(())
    }

    /// Sync a single issue - create task if not exists, update if exists
    async fn sync_single_issue(
        &self,
        project_repo: &ProjectRepo,
        issue: &GitHubIssue,
    ) -> Result<(), IssueMonitorError> {
        // Check if we already have a task linked to this issue
        let existing_task =
            Task::find_by_github_issue(&self.db.pool, project_repo.repo_id, issue.number).await?;

        let first_assignee = issue.assignees.first().map(|a| a.login.as_str());

        if let Some(task) = existing_task {
            // Update existing task with latest issue data
            debug!(
                "Updating existing task {} for issue #{}",
                task.id, issue.number
            );
            Task::update_github_issue_sync(
                &self.db.pool,
                task.id,
                &issue.title,
                issue.body.as_deref(),
                &issue.state,
                first_assignee,
            )
            .await?;
        } else {
            // Create a new task for this issue
            info!(
                "Creating new task for issue #{}: {}",
                issue.number, issue.title
            );
            let task_id = Uuid::new_v4();
            let create_task = CreateTask {
                project_id: project_repo.project_id,
                title: issue.title.clone(),
                description: issue.body.clone(),
                status: Some(TaskStatus::Todo),
                parent_workspace_id: None,
                image_ids: None,
                shared_task_id: None,
            };

            let task = Task::create(&self.db.pool, &create_task, task_id).await?;

            // Link the task to the GitHub issue
            Task::link_github_issue(
                &self.db.pool,
                task.id,
                project_repo.repo_id,
                issue.number,
                &issue.url,
                &issue.state,
                first_assignee,
            )
            .await?;
        }

        Ok(())
    }
}

impl IssueMonitorService {
    /// Manually trigger a sync for a specific project repo
    /// Called from API endpoint for on-demand sync
    pub async fn sync_project_repo(
        db: &DBService,
        project_repo: &ProjectRepo,
    ) -> Result<(), IssueMonitorError> {
        let service = Self {
            db: db.clone(),
            poll_interval: Duration::from_secs(60),
        };
        service.sync_repo_issues(project_repo).await
    }
}
