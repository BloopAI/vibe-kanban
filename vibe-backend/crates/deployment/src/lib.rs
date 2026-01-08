use std::sync::Arc;

use anyhow::Error as AnyhowError;
use async_trait::async_trait;
use axum::response::sse::Event;
use db::{
    DBService,
    models::{
        project::{CreateProject, Project},
        project_repo::CreateProjectRepo,
        workspace::WorkspaceError,
    },
};
use executors::executors::ExecutorError;
use futures::{StreamExt, TryStreamExt};
use git2::Error as Git2Error;
use serde_json::Value;
use services::services::{
    analytics::{AnalyticsContext, AnalyticsService},
    approvals::Approvals,
    auth::AuthContext,
    config::{Config, ConfigError},
    container::{ContainerError, ContainerService},
    events::{EventError, EventService},
    file_search_cache::FileSearchCache,
    filesystem::{FilesystemError, FilesystemService},
    filesystem_watcher::FilesystemWatcherError,
    git::{GitService, GitServiceError},
    image::{ImageError, ImageService},
    pr_monitor::PrMonitorService,
    project::ProjectService,
    queued_message::QueuedMessageService,
    repo::RepoService,
    share::SharePublisher,
    worktree_manager::WorktreeError,
};
use sqlx::Error as SqlxError;
use thiserror::Error;
use tokio::sync::RwLock;
use utils::sentry as sentry_utils;

#[derive(Debug, Clone, Copy, Error)]
#[error("Remote client not configured")]
pub struct RemoteClientNotConfigured;

#[derive(Debug, Error)]
pub enum DeploymentError {
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Sqlx(#[from] SqlxError),
    #[error(transparent)]
    Git2(#[from] Git2Error),
    #[error(transparent)]
    GitServiceError(#[from] GitServiceError),
    #[error(transparent)]
    FilesystemWatcherError(#[from] FilesystemWatcherError),
    #[error(transparent)]
    Workspace(#[from] WorkspaceError),
    #[error(transparent)]
    Container(#[from] ContainerError),
    #[error(transparent)]
    Executor(#[from] ExecutorError),
    #[error(transparent)]
    Image(#[from] ImageError),
    #[error(transparent)]
    Filesystem(#[from] FilesystemError),
    #[error(transparent)]
    Worktree(#[from] WorktreeError),
    #[error(transparent)]
    Event(#[from] EventError),
    #[error(transparent)]
    Config(#[from] ConfigError),
    #[error(transparent)]
    PoolManager(#[from] db::PoolManagerError),
    #[error("Remote client not configured")]
    RemoteClientNotConfigured,
    #[error(transparent)]
    Other(#[from] AnyhowError),
}

#[async_trait]
pub trait Deployment: Clone + Send + Sync + 'static {
    async fn new() -> Result<Self, DeploymentError>;

    fn user_id(&self) -> &str;

    fn config(&self) -> &Arc<RwLock<Config>>;

    fn db(&self) -> &DBService;

    fn analytics(&self) -> &Option<AnalyticsService>;

    fn container(&self) -> &impl ContainerService;

    fn git(&self) -> &GitService;

    fn project(&self) -> &ProjectService;

    fn repo(&self) -> &RepoService;

    fn image(&self) -> &ImageService;

    fn filesystem(&self) -> &FilesystemService;

    fn events(&self) -> &EventService;

    fn file_search_cache(&self) -> &Arc<FileSearchCache>;

    fn approvals(&self) -> &Approvals;

    fn queued_message_service(&self) -> &QueuedMessageService;

    fn auth_context(&self) -> &AuthContext;

    fn share_publisher(&self) -> Result<SharePublisher, RemoteClientNotConfigured>;

    async fn update_sentry_scope(&self) -> Result<(), DeploymentError> {
        let user_id = self.user_id();
        let config = self.config().read().await;
        let username = config.github.username.as_deref();
        let email = config.github.primary_email.as_deref();
        sentry_utils::configure_user_scope(user_id, username, email);

        Ok(())
    }

    async fn spawn_pr_monitor_service(&self) -> tokio::task::JoinHandle<()> {
        let db = self.db().clone();
        let analytics = self
            .analytics()
            .as_ref()
            .map(|analytics_service| AnalyticsContext {
                user_id: self.user_id().to_string(),
                analytics_service: analytics_service.clone(),
            });
        let publisher = self.share_publisher().ok();
        PrMonitorService::spawn(db, analytics, publisher).await
    }

    async fn track_if_analytics_allowed(&self, event_name: &str, properties: Value) {
        let analytics_enabled = self.config().read().await.analytics_enabled;
        // Track events unless user has explicitly opted out
        if analytics_enabled && let Some(analytics) = self.analytics() {
            analytics.track_event(self.user_id(), event_name, Some(properties.clone()));
        }
    }

    /// Trigger background auto-setup of default projects for new users
    async fn trigger_auto_project_setup(&self) {
        // soft timeout to give the filesystem search a chance to complete
        let soft_timeout_ms = 2_000;
        // hard timeout to ensure the background task doesn't run indefinitely
        let hard_timeout_ms = 2_300;
        let project_count = Project::count(&self.db().pool).await.unwrap_or(0);

        // Only proceed if no projects exist
        if project_count == 0 {
            // Discover local git repositories
            if let Ok(repos) = self
                .filesystem()
                .list_common_git_repos(soft_timeout_ms, hard_timeout_ms, Some(4))
                .await
            {
                // Take first 3 repositories and create projects
                for repo in repos.into_iter().take(3) {
                    // Generate clean project name from path
                    let project_name = repo.name.clone();
                    let repo_path = repo.path.to_string_lossy().to_string();

                    let create_data = CreateProject {
                        name: project_name,
                        repositories: vec![CreateProjectRepo {
                            display_name: repo.name,
                            git_repo_path: repo_path.clone(),
                        }],
                        priority: None,
                        lead_id: None,
                        start_date: None,
                        target_date: None,
                        status: None,
                        description: None,
                        summary: None,
                        icon: None,
                    };

                    match self
                        .project()
                        .create_project(&self.db().pool, self.repo(), create_data.clone())
                        .await
                    {
                        Ok(project) => {
                            tracing::info!(
                                "Auto-created project '{}' from {}",
                                project.name,
                                repo_path
                            );

                            // Track project creation event
                            self.track_if_analytics_allowed(
                                "project_created",
                                serde_json::json!({
                                    "project_id": project.id.to_string(),
                                    "repository_count": 1,
                                    "trigger": "auto_setup",
                                }),
                            )
                            .await;
                        }
                        Err(e) => {
                            tracing::warn!(
                                "Failed to auto-create project from {}: {}",
                                repo.path.display(),
                                e
                            );
                        }
                    }
                }
            }
        }
    }

    async fn stream_events(
        &self,
    ) -> futures::stream::BoxStream<'static, Result<Event, std::io::Error>> {
        self.events()
            .msg_store()
            .history_plus_stream()
            .map_ok(|m| m.to_sse_event())
            .boxed()
    }
}
