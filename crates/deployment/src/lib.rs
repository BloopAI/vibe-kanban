use std::{collections::HashMap, sync::Arc};

use ::services::services::{analytics::AnalyticsService, config::Config, sentry::SentryService};
use anyhow::Error as AnyhowError;
use async_trait::async_trait;
use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use db::{DBService, models::task_attempt::TaskAttemptError};
use executors::executors::ExecutorError;
use git2::Error as Git2Error;
use serde_json::Value;
use services::services::{
    auth::{AuthError, AuthService},
    container::{ContainerError, ContainerService},
    filesystem::{FilesystemError, FilesystemService},
    git::{GitService, GitServiceError},
};
use sqlx::{Error as SqlxError, types::Uuid};
use thiserror::Error;
use tokio::sync::RwLock;
use utils::{msg_store::MsgStore, response::ApiResponse};

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
    TaskAttempt(#[from] TaskAttemptError),
    #[error(transparent)]
    Container(#[from] ContainerError),
    #[error(transparent)]
    Executor(#[from] ExecutorError),
    #[error(transparent)]
    Auth(#[from] AuthError),
    #[error(transparent)]
    Filesystem(#[from] FilesystemError),
    #[error(transparent)]
    Other(#[from] AnyhowError),
}

impl IntoResponse for DeploymentError {
    fn into_response(self) -> Response {
        tracing::error!("Internal error occurred: {:?}", self);
        let code = StatusCode::INTERNAL_SERVER_ERROR;
        let body = Json(ApiResponse::<()>::error(&self.to_string()));
        (code, body).into_response()
    }
}

#[async_trait]
pub trait Deployment: Clone + Send + Sync + 'static {
    async fn new() -> Result<Self, DeploymentError>;

    fn user_id(&self) -> &str;

    fn shared_types() -> Vec<String>;

    fn config(&self) -> &Arc<RwLock<Config>>;

    fn sentry(&self) -> &SentryService;

    fn db(&self) -> &DBService;

    fn analytics(&self) -> &Option<AnalyticsService>;

    fn container(&self) -> &impl ContainerService;

    fn auth(&self) -> &AuthService;

    fn git(&self) -> &GitService;

    fn filesystem(&self) -> &FilesystemService;

    fn msg_stores(&self) -> &Arc<RwLock<HashMap<Uuid, Arc<MsgStore>>>>;

    async fn update_sentry_scope(&self) -> Result<(), DeploymentError> {
        let user_id = self.user_id();
        let config = self.config().read().await;
        let username = config.github.username.as_deref();
        let email = config.github.primary_email.as_deref();

        self.sentry()
            .update_scope(user_id, username.as_deref(), email.as_deref())
            .await;

        Ok(())
    }

    async fn track_if_analytics_allowed(&self, event_name: &str, properties: Value) {
        if let Some(true) = self.config().read().await.analytics_enabled {
            // Does the user allow analytics?
            if let Some(analytics) = self.analytics() {
                // Is analytics setup?
                analytics.track_event(self.user_id(), event_name, Some(properties.clone()));
            }
        }
    }
}
