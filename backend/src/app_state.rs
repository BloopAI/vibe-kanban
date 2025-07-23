use std::{collections::HashMap, path::PathBuf, sync::Arc};

use tokio::sync::{Mutex, RwLock as TokioRwLock};
use uuid::Uuid;

use crate::{
    command_runner,
    models::Environment,
    services::{generate_user_id, AnalyticsConfig, AnalyticsService},
};

#[derive(Debug)]
pub enum ExecutionType {
    SetupScript,
    CleanupScript,
    CodingAgent,
    DevServer,
}

#[derive(Debug)]
pub struct RunningExecution {
    pub task_attempt_id: Uuid,
    pub _execution_type: ExecutionType,
    pub child: command_runner::CommandProcess,
}

#[derive(Debug, Clone)]
pub struct AppState {
    running_executions: Arc<Mutex<HashMap<Uuid, RunningExecution>>>,
    pub db_pool: sqlx::SqlitePool,
    config: Arc<tokio::sync::RwLock<crate::models::config::Config>>,
    pub analytics: Arc<TokioRwLock<AnalyticsService>>,
    user_id: String,
    pub mode: Environment,
}

impl AppState {
    pub async fn new(
        db_pool: sqlx::SqlitePool,
        config: Arc<tokio::sync::RwLock<crate::models::config::Config>>,
        mode: Environment,
    ) -> Self {
        // Initialize analytics with user preferences
        let user_enabled = {
            let config_guard = config.read().await;
            config_guard.analytics_enabled.unwrap_or(true)
        };

        let analytics_config = AnalyticsConfig::new(user_enabled);
        let analytics = Arc::new(TokioRwLock::new(AnalyticsService::new(analytics_config)));

        Self {
            running_executions: Arc::new(Mutex::new(HashMap::new())),
            db_pool,
            config,
            analytics,
            user_id: generate_user_id(),
            mode,
        }
    }

    pub async fn update_analytics_config(&self, user_enabled: bool) {
        // Check if analytics was disabled before this update
        let was_analytics_disabled = {
            let analytics = self.analytics.read().await;
            !analytics.is_enabled()
        };

        let new_config = AnalyticsConfig::new(user_enabled);
        let new_service = AnalyticsService::new(new_config);
        let mut analytics = self.analytics.write().await;
        *analytics = new_service;

        // If analytics was disabled and is now enabled, fire a session_start event
        if was_analytics_disabled && analytics.is_enabled() {
            analytics.track_event(&self.user_id, "session_start", None);
        }
    }

    // Running executions getters
    pub async fn has_running_execution(&self, attempt_id: Uuid) -> bool {
        let executions = self.running_executions.lock().await;
        executions
            .values()
            .any(|exec| exec.task_attempt_id == attempt_id)
    }

    pub async fn get_running_executions_for_monitor(&self) -> Vec<(Uuid, Uuid, bool, Option<i64>)> {
        let mut executions = self.running_executions.lock().await;
        let mut completed_executions = Vec::new();

        for (execution_id, running_exec) in executions.iter_mut() {
            match running_exec.child.try_wait().await {
                Ok(Some(status)) => {
                    let success = status.success();
                    let exit_code = status.code().map(|c| c as i64);
                    completed_executions.push((
                        *execution_id,
                        running_exec.task_attempt_id,
                        success,
                        exit_code,
                    ));
                }
                Ok(None) => {
                    // Still running
                }
                Err(e) => {
                    tracing::error!("Error checking process status: {}", e);
                    completed_executions.push((
                        *execution_id,
                        running_exec.task_attempt_id,
                        false,
                        None,
                    ));
                }
            }
        }

        // Remove completed executions from the map
        for (execution_id, _, _, _) in &completed_executions {
            executions.remove(execution_id);
        }

        completed_executions
    }

    // Running executions setters
    pub async fn add_running_execution(&self, execution_id: Uuid, execution: RunningExecution) {
        let mut executions = self.running_executions.lock().await;
        executions.insert(execution_id, execution);
    }

    pub async fn stop_running_execution_by_id(
        &self,
        execution_id: Uuid,
    ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
        let mut executions = self.running_executions.lock().await;
        let Some(exec) = executions.get_mut(&execution_id) else {
            return Ok(false);
        };

        // Kill the process using CommandRunner's kill method
        exec.child
            .kill()
            .await
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?;

        // only NOW remove it
        executions.remove(&execution_id);
        Ok(true)
    }

    // Config getters
    pub async fn get_sound_alerts_enabled(&self) -> bool {
        let config = self.config.read().await;
        config.sound_alerts
    }

    pub async fn get_push_notifications_enabled(&self) -> bool {
        let config = self.config.read().await;
        config.push_notifications
    }

    pub async fn get_sound_file(&self) -> crate::models::config::SoundFile {
        let config = self.config.read().await;
        config.sound_file.clone()
    }

    pub fn get_config(&self) -> &Arc<tokio::sync::RwLock<crate::models::config::Config>> {
        &self.config
    }

    pub async fn track_analytics_event(
        &self,
        event_name: &str,
        properties: Option<serde_json::Value>,
    ) {
        let analytics = self.analytics.read().await;
        if analytics.is_enabled() {
            analytics.track_event(&self.user_id, event_name, properties);
        } else {
            tracing::debug!("Analytics disabled, skipping event: {}", event_name);
        }
    }

    pub async fn update_sentry_scope(&self) {
        let config = self.get_config().read().await;
        let username = config.github.username.clone();
        let email = config.github.primary_email.clone();
        drop(config);

        let sentry_user = if username.is_some() || email.is_some() {
            sentry::User {
                id: Some(self.user_id.clone()),
                username,
                email,
                ..Default::default()
            }
        } else {
            sentry::User {
                id: Some(self.user_id.clone()),
                ..Default::default()
            }
        };

        sentry::configure_scope(|scope| {
            scope.set_user(Some(sentry_user));
        });
    }

    /// Get the workspace directory path, creating it if it doesn't exist in cloud mode
    pub async fn get_workspace_path(
        &self,
    ) -> Result<PathBuf, Box<dyn std::error::Error + Send + Sync>> {
        if !self.mode.is_cloud() {
            return Err("Workspace directory only available in cloud mode".into());
        }

        let workspace_path = {
            let config = self.config.read().await;
            match &config.workspace_dir {
                Some(dir) => PathBuf::from(dir),
                None => {
                    // Use default workspace directory
                    let home_dir = dirs::home_dir().ok_or("Could not find home directory")?;
                    home_dir.join(".vibe-kanban").join("projects")
                }
            }
        };

        // Create the workspace directory if it doesn't exist
        if !workspace_path.exists() {
            std::fs::create_dir_all(&workspace_path)
                .map_err(|e| format!("Failed to create workspace directory: {}", e))?;
            tracing::info!("Created workspace directory: {}", workspace_path.display());
        }

        Ok(workspace_path)
    }
}
