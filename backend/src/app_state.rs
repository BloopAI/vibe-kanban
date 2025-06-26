use std::{collections::HashMap, sync::Arc};

use tokio::sync::Mutex;
use uuid::Uuid;

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
}

impl AppState {
    pub fn new(
        db_pool: sqlx::SqlitePool,
        config: Arc<tokio::sync::RwLock<crate::models::config::Config>>,
    ) -> Self {
        Self {
            running_executions: Arc::new(Mutex::new(HashMap::new())),
            db_pool,
            config,
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
            // Also kill the direct child process as fallback
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
}
