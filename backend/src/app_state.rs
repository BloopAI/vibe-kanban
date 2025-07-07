use std::{collections::HashMap, sync::Arc, time::Duration};

#[cfg(unix)]
use nix::{
    sys::signal::{kill, Signal},
    unistd::Pid,
};
use tokio::sync::{Mutex, RwLock as TokioRwLock};
use uuid::Uuid;

use crate::services::{generate_user_id, AnalyticsConfig, AnalyticsService};

#[derive(Debug)]
pub enum ExecutionType {
    SetupScript,
    CodingAgent,
    DevServer,
}

#[derive(Debug)]
pub struct RunningExecution {
    pub task_attempt_id: Uuid,
    pub _execution_type: ExecutionType,
    pub child: command_group::AsyncGroupChild,
}

#[derive(Debug, Clone)]
pub struct AppState {
    running_executions: Arc<Mutex<HashMap<Uuid, RunningExecution>>>,
    pub db_pool: sqlx::SqlitePool,
    config: Arc<tokio::sync::RwLock<crate::models::config::Config>>,
    pub analytics: Arc<TokioRwLock<AnalyticsService>>,
    user_id: String,
}

impl AppState {
    pub async fn new(
        db_pool: sqlx::SqlitePool,
        config: Arc<tokio::sync::RwLock<crate::models::config::Config>>,
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
            match running_exec.child.try_wait() {
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

        if let Some(mut execution) = executions.remove(&execution_id) {
            // Graceful shutdown sequence: SIGTERM -> SIGKILL -> kill()
            let process_id = execution.child.id();

            #[cfg(unix)]
            {
                if let Some(pid) = process_id {
                    let pid = Pid::from_raw(pid as i32);

                    // Step 1: Send SIGTERM for graceful shutdown
                    tracing::info!("Sending SIGTERM to execution process {}", execution_id);
                    if let Err(e) = kill(pid, Signal::SIGTERM) {
                        tracing::warn!("Failed to send SIGTERM to process {}: {}", execution_id, e);
                    } else {
                        // Wait 2 seconds for graceful shutdown
                        tokio::time::sleep(Duration::from_secs(2)).await;

                        // Check if process is still running
                        if execution
                            .child
                            .try_wait()
                            .is_ok_and(|status| status.is_some())
                        {
                            tracing::info!(
                                "Process {} exited gracefully after SIGTERM",
                                execution_id
                            );
                            return Ok(true);
                        }
                    }

                    // Step 2: Send SIGKILL for forceful termination
                    tracing::info!("Sending SIGKILL to execution process {}", execution_id);
                    if let Err(e) = kill(pid, Signal::SIGKILL) {
                        tracing::warn!("Failed to send SIGKILL to process {}: {}", execution_id, e);
                    } else {
                        // Wait 1 second for SIGKILL to take effect
                        tokio::time::sleep(Duration::from_secs(1)).await;

                        // Check if process is still running
                        if execution
                            .child
                            .try_wait()
                            .is_ok_and(|status| status.is_some())
                        {
                            tracing::info!("Process {} terminated after SIGKILL", execution_id);
                            return Ok(true);
                        }
                    }
                }
            }

            // Step 3: Fallback to kill() method
            tracing::info!(
                "Using fallback kill() for execution process {}",
                execution_id
            );
            match execution.child.kill().await {
                Ok(_) => {
                    tracing::info!(
                        "Stopped execution process {} and its process group",
                        execution_id
                    );
                    Ok(true)
                }
                Err(e) => {
                    tracing::error!("Failed to kill execution process {}: {}", execution_id, e);
                    // Re-insert the execution since we failed to kill it
                    executions.insert(execution_id, execution);
                    Err(Box::new(e))
                }
            }
        } else {
            // Execution not found (might already be finished)
            Ok(false)
        }
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
}
