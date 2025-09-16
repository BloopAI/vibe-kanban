use std::{sync::Arc, time::Duration};

use db::{
    DBService,
    models::{
        github_issue_link::GitHubIssueLink,
        project::Project,
        task::{Task, TaskStatus},
    },
};
use thiserror::Error;
use tokio::{sync::RwLock, time::interval};
use tracing::{debug, error, info};

use crate::services::{
    config::Config,
    git::GitService,
    github_service::{GitHubService, GitHubServiceError, IssueStateFilter},
};

#[derive(Debug, Error)]
enum IssueMonitorError {
    #[error("No GitHub token configured")]
    NoGitHubToken,
    #[error(transparent)]
    GitHub(#[from] GitHubServiceError),
    #[error(transparent)]
    Sqlx(#[from] sqlx::Error),
}

/// Periodically sync GitHub Issues <-> Vibe Kanban tasks for projects that enabled it
pub struct IssueMonitorService {
    db: DBService,
    config: Arc<RwLock<Config>>,
    git: GitService,
    poll_interval: Duration,
}

impl IssueMonitorService {
    pub async fn spawn(
        db: DBService,
        config: Arc<RwLock<Config>>,
        git: GitService,
    ) -> tokio::task::JoinHandle<()> {
        let svc = Self {
            db,
            config,
            git,
            poll_interval: Duration::from_secs(90),
        };
        tokio::spawn(async move { svc.run().await })
    }

    async fn run(self) {
        info!(
            "Starting GitHub Issues monitor (interval {:?})",
            self.poll_interval
        );
        let mut ticker = interval(self.poll_interval);
        // Run immediately on startup
        if let Err(e) = self.sync_once().await {
            error!("error: {}", e);
        }
        loop {
            ticker.tick().await;
            if let Err(e) = self.sync_once().await {
                error!("error: {}", e);
            }
        }
    }

    async fn sync_once(&self) -> Result<(), IssueMonitorError> {
        // Read token
        let gh_token = self
            .config
            .read()
            .await
            .github
            .token()
            .ok_or(IssueMonitorError::NoGitHubToken)?;
        let token = gh_token.to_string();

        // Find projects that enabled sync (avoid sqlx offline macros here)
        use sqlx::Row;
        let rows = sqlx::query(
            r#"SELECT id, name, git_repo_path, setup_script, dev_script, cleanup_script, copy_files,
                       github_issues_sync_enabled, github_issues_create_on_new_tasks, github_issues_last_sync_at,
                       created_at, updated_at
                FROM projects WHERE github_issues_sync_enabled = 1"#,
        )
        .fetch_all(&self.db.pool)
        .await?;

        let projects: Vec<Project> = rows
            .into_iter()
            .map(|row| Project {
                id: row.get("id"),
                name: row.get::<String, _>("name"),
                git_repo_path: std::path::PathBuf::from(
                    row.get::<String, _>("git_repo_path"),
                ),
                setup_script: row.get("setup_script"),
                dev_script: row.get("dev_script"),
                cleanup_script: row.get("cleanup_script"),
                copy_files: row.get("copy_files"),
                github_issues_sync_enabled: row
                    .get::<bool, _>("github_issues_sync_enabled"),
                github_issues_create_on_new_tasks: row
                    .get::<bool, _>("github_issues_create_on_new_tasks"),
                github_issues_last_sync_at: row.get("github_issues_last_sync_at"),
                created_at: row.get("created_at"),
                updated_at: row.get("updated_at"),
            })
            .collect();

        if projects.is_empty() {
            debug!("no projects with GitHub Issues sync enabled");
            return Ok(());
        }

        debug!("IssueMonitor: syncing {} project(s)", projects.len());
        use futures::stream::{self, StreamExt};
        stream::iter(projects)
            .for_each_concurrent(4, |p| {
                let this = self;
                let token = token.clone();
                async move {
                    match GitHubService::new(&token) {
                        Ok(gh) => {
                            if let Err(e) = this.sync_project(&gh, &p).await {
                                error!("IssueMonitor: project {} sync failed: {}", p.id, e);
                            }
                        }
                        Err(e) => error!("IssueMonitor: cannot create GitHub client: {}", e),
                    }
                }
            })
            .await;
        Ok(())
    }

    async fn sync_project(
        &self,
        gh: &GitHubService,
        project: &Project,
    ) -> Result<(), IssueMonitorError> {
        // Determine owner/repo from project.remote
        let repo_info = self
            .git
            .get_github_repo_info(&project.git_repo_path)
            .map_err(GitHubServiceError::from)?;

        debug!(
            "IssueMonitor: project {} repo {}/{} sync start",
            project.id, repo_info.owner, repo_info.repo_name
        );
        let since = project.github_issues_last_sync_at;

        // 1) Import all open issues not yet linked (incremental)
        let mut gh_open = Vec::new();
        {
            let mut page: u32 = 1;
            loop {
                let batch = gh
                    .list_issues(
                        &repo_info.owner,
                        &repo_info.repo_name,
                        IssueStateFilter::Open,
                        None,
                        since,
                        Some(page),
                        Some(100),
                    )
                    .await?;
                if batch.is_empty() { break; }
                let len = batch.len();
                gh_open.extend(batch);
                if len < 100 { break; }
                page += 1;
            }
        }

        let links = GitHubIssueLink::list_for_project(&self.db.pool, project.id).await?;
        let linked_by_issue_id = links
            .iter()
            .map(|l| (l.issue_id, l))
            .collect::<std::collections::HashMap<_, _>>();

        let mut imported_count = 0usize;
        for issue in gh_open {
            if linked_by_issue_id.contains_key(&issue.id) {
                continue;
            }

            // Create new task and link in a transaction
            let mut tx = self.db.pool.begin().await?;
            let task_id = uuid::Uuid::new_v4();
            let task = Task::create_tx(
                &mut tx,
                &db::models::task::CreateTask {
                    project_id: project.id,
                    title: issue.title.clone(),
                    description: issue.body.clone(),
                    parent_task_attempt: None,
                    image_ids: None,
                },
                task_id,
            )
            .await?;
            let _ = GitHubIssueLink::create_tx(
                &mut tx,
                &db::models::github_issue_link::NewGitHubIssueLink {
                    project_id: project.id,
                    task_id: task.id,
                    issue_id: issue.id,
                    issue_number: issue.number,
                    repo_owner: repo_info.owner.clone(),
                    repo_name: repo_info.repo_name.clone(),
                    html_url: issue.html_url.clone(),
                    title: issue.title.clone(),
                    state: match issue.state { crate::services::github_service::IssueState::Open => "open".into(), crate::services::github_service::IssueState::Closed => "closed".into() },
                    created_at: issue.created_at,
                    updated_at: issue.updated_at,
                },
            )
            .await?;
            tx.commit().await?;
            imported_count += 1;
        }

        if imported_count > 0 {
            debug!(
                "IssueMonitor: project {} imported {} new issue(s)",
                project.id, imported_count
            );
        }

        // 2) Push VK task status -> GitHub issue state (close when done)
        let mut closed_on_github = 0usize;
        for link in links.iter() {
            if let Some(task) = Task::find_by_id(&self.db.pool, link.task_id).await? {
                match (&task.status, link.state.as_str()) {
                    (TaskStatus::Done, "open") => {
                        let current = gh
                            .get_issue(
                                &repo_info.owner,
                                &repo_info.repo_name,
                                link.issue_number,
                            )
                            .await?;
                        if matches!(current.state, crate::services::github_service::IssueState::Open) {
                            let _ = gh
                                .update_issue_state(
                                    &repo_info.owner,
                                    &repo_info.repo_name,
                                    link.issue_number,
                                    false,
                                )
                                .await?;
                            // mark link closed and synced
                            GitHubIssueLink::update_state_and_synced(
                                &self.db.pool,
                                link.id,
                                "closed",
                                chrono::Utc::now(),
                            )
                            .await?;
                            closed_on_github += 1;
                        }
                    }
                    (TaskStatus::Todo, "closed")
                    | (TaskStatus::InProgress, "closed")
                    | (TaskStatus::InReview, "closed") => {
                        // If reopened on GitHub later, we'll pull it in next step; we don't reopen issues automatically from VK
                    }
                    _ => {}
                }
            }
        }
        if closed_on_github > 0 {
            debug!(
                "IssueMonitor: project {} closed {} issue(s) on GitHub from Done tasks",
                project.id, closed_on_github
            );
        }

        // 3) Pull GitHub state -> VK (closed -> Done)
        let gh_all = {
            let mut all = Vec::new();
            let mut page: u32 = 1;
            loop {
                let batch = gh
                    .list_issues(
                        &repo_info.owner,
                        &repo_info.repo_name,
                        IssueStateFilter::All,
                        None,
                        since,
                        Some(page),
                        Some(100),
                    )
                    .await?;
                if batch.is_empty() { break; }
                let len = batch.len();
                all.extend(batch);
                if len < 100 { break; }
                page += 1;
            }
            all
        };
        let by_issue_id = gh_all
            .into_iter()
            .map(|i| (i.id, i))
            .collect::<std::collections::HashMap<_, _>>();

        let mut marked_done = 0usize;
        for link in links.iter() {
            if let Some(issue) = by_issue_id.get(&link.issue_id)
                && matches!(issue.state, crate::services::github_service::IssueState::Closed)
            {
                if let Some(task) = Task::find_by_id(&self.db.pool, link.task_id).await? {
                        let _ = Task::update_status(&self.db.pool, task.id, TaskStatus::Done)
                            .await?;
                        // Keep link in sync with GitHub
                        GitHubIssueLink::update_state_and_synced(
                            &self.db.pool,
                            link.id,
                            "closed",
                            issue.updated_at, // use GH timestamp
                        )
                        .await?;
                        marked_done += 1;
                    }
                }
            }
        if marked_done > 0 {
            debug!(
                "IssueMonitor: project {} marked {} task(s) Done from GitHub",
                project.id, marked_done
            );
        }

        // Record last-sync time
        let _ = Project::update_github_issues_last_sync(
            &self.db.pool,
            project.id,
            chrono::Utc::now(),
        )
        .await;
        debug!(
            "IssueMonitor: project {} sync complete (imported: {}, closed_on_github: {}, marked_done: {})",
            project.id, imported_count, closed_on_github, marked_done
        );
        Ok(())
    }
}
