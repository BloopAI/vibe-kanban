use std::{collections::HashMap, sync::Arc};

use anyhow::Error as AnyhowError;
use async_trait::async_trait;
use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use db::{
    DBService,
    models::{
        execution_process::{ExecutionProcess, ExecutionProcessRunReason, ExecutionProcessStatus},
        task::{Task, TaskStatus},
        task_attempt::{TaskAttempt, TaskAttemptError},
    },
};
use executors::executors::ExecutorError;
use git2::Error as Git2Error;
use serde_json::Value;
use services::services::{
    analytics::AnalyticsService,
    auth::{AuthError, AuthService},
    config::Config,
    container::{ContainerError, ContainerService},
    filesystem::{FilesystemError, FilesystemService},
    git::{GitService, GitServiceError},
    sentry::SentryService,
};
use sqlx::{Error as SqlxError, types::Uuid};
use thiserror::Error;
use tokio::sync::RwLock;
use utils::msg_store::MsgStore;

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

    /// Cleanup executions marked as running in the db, call at startup
    async fn cleanup_orphan_executions(&self) -> Result<(), DeploymentError> {
        let running_processes = ExecutionProcess::find_running(&self.db().pool).await?;
        for process in running_processes {
            tracing::info!(
                "Found orphaned execution process {} for task attempt {}",
                process.id,
                process.task_attempt_id
            );
            // Update the execution process status first
            if let Err(e) = ExecutionProcess::update_completion(
                &self.db().pool,
                process.id,
                ExecutionProcessStatus::Failed,
                None, // No exit code for orphaned processes
            )
            .await
            {
                tracing::error!(
                    "Failed to update orphaned execution process {} status: {}",
                    process.id,
                    e
                );
                continue;
            }
            // Process marked as failed
            tracing::info!("Marked orphaned execution process {} as failed", process.id);
            // Update task status to InReview for coding agent and setup script failures
            if matches!(
                process.run_reason,
                ExecutionProcessRunReason::CodingAgent
                    | ExecutionProcessRunReason::SetupScript
                    | ExecutionProcessRunReason::CleanupScript
            ) {
                if let Ok(Some(task_attempt)) =
                    TaskAttempt::find_by_id(&self.db().pool, process.task_attempt_id).await
                {
                    if let Ok(Some(task)) =
                        Task::find_by_id(&self.db().pool, task_attempt.task_id).await
                    {
                        if let Err(e) = Task::update_status(
                            &self.db().pool,
                            task.id,
                            task.project_id,
                            TaskStatus::InReview,
                        )
                        .await
                        {
                            tracing::error!(
                                "Failed to update task status to InReview for orphaned attempt: {}",
                                e
                            );
                        }
                    }
                }
            }
        }
        Ok(())
    }
}
