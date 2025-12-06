use std::sync::Arc;

use anyhow::Error as AnyhowError;
use async_trait::async_trait;
use axum::response::sse::Event;
use db::{
    DBService,
    models::{
        project::{CreateProject, Project},
        task_attempt::TaskAttemptError,
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
    queued_message::QueuedMessageService,
    share::SharePublisher,
    worktree_manager::WorktreeError,
};
use sqlx::{Error as SqlxError, types::Uuid};
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
    TaskAttempt(#[from] TaskAttemptError),
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
                    let project_name = repo.name;

                    let create_data = CreateProject {
                        name: project_name,
                        git_repo_path: repo.path.to_string_lossy().to_string(),
                        use_existing_repo: true,
                        setup_script: None,
                        dev_script: None,
                        cleanup_script: None,
                        copy_files: None,
                        parallel_setup_script: None,
                    };
                    // Ensure existing repo has a main branch if it's empty
                    if let Err(e) = self.git().ensure_main_branch_exists(&repo.path) {
                        tracing::error!("Failed to ensure main branch exists: {}", e);
                        continue;
                    }

                    // Create project (ignore individual failures)
                    let project_id = Uuid::new_v4();

                    match Project::create(&self.db().pool, &create_data, project_id).await {
                        Ok(project) => {
                            tracing::info!(
                                "Auto-created project '{}' from {}",
                                create_data.name,
                                create_data.git_repo_path
                            );

                            // Track project creation event
                            self.track_if_analytics_allowed(
                                "project_created",
                                serde_json::json!({
                                    "project_id": project.id.to_string(),
                                    "use_existing_repo": create_data.use_existing_repo,
                                    "has_setup_script": create_data.setup_script.is_some(),
                                    "has_dev_script": create_data.dev_script.is_some(),
                                    "trigger": "auto_setup",
                                }),
                            )
                            .await;
                        }
                        Err(e) => {
                            tracing::warn!(
                                "Failed to auto-create project '{}': {}",
                                create_data.name,
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
