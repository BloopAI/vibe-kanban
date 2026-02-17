use std::sync::Arc;

use anyhow::Error as AnyhowError;
use async_trait::async_trait;
use axum::response::sse::Event;
use db::{DBService, models::workspace::WorkspaceError};
use executors::executors::ExecutorError;
use futures::{StreamExt, TryStreamExt};
use git::{GitService, GitServiceError};
use git2::Error as Git2Error;
use serde_json::Value;
use services::services::{
    analytics::AnalyticsService,
    approvals::Approvals,
    auth::AuthContext,
    config::{Config, ConfigError},
    container::{ContainerError, ContainerService},
    events::{EventError, EventService},
    file_search::FileSearchCache,
    filesystem::{FilesystemError, FilesystemService},
    filesystem_watcher::FilesystemWatcherError,
    image::{ImageError, ImageService},
    queued_message::QueuedMessageService,
    remote_client::RemoteClient,
    repo::RepoService,
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

    fn repo(&self) -> &RepoService;

    fn image(&self) -> &ImageService;

    fn filesystem(&self) -> &FilesystemService;

    fn events(&self) -> &EventService;

    fn file_search_cache(&self) -> &Arc<FileSearchCache>;

    fn approvals(&self) -> &Approvals;

    fn queued_message_service(&self) -> &QueuedMessageService;

    fn auth_context(&self) -> &AuthContext;

    fn remote_client(&self) -> Result<RemoteClient, RemoteClientNotConfigured> {
        Err(RemoteClientNotConfigured)
    }

    fn shared_api_base(&self) -> Option<String> {
        None
    }

    async fn update_sentry_scope(&self) -> Result<(), DeploymentError> {
        let user_id = self.user_id();
        let config = self.config().read().await;
        let username = config.github.username.as_deref();
        let email = config.github.primary_email.as_deref();
        sentry_utils::configure_user_scope(user_id, username, email);

        Ok(())
    }

    async fn track_if_analytics_allowed(&self, event_name: &str, properties: Value) {
        let analytics_enabled = self.config().read().await.analytics_enabled;
        // Track events unless user has explicitly opted out
        if analytics_enabled && let Some(analytics) = self.analytics() {
            analytics.track_event(self.user_id(), event_name, Some(properties.clone()));
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
