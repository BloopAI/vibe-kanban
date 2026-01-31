//! Trigger Engine for Swarm Task Processing
//!
//! Automatically monitors pending tasks and dispatches them to available sandboxes.
//! Implements the TriggerEngine pattern from the original Node.js backend.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use db::models::sandbox::Sandbox;
use db::models::swarm::Swarm;
use db::models::swarm_config::SwarmConfig;
use db::models::swarm_task::SwarmTask;
use sqlx::SqlitePool;
use tokio::sync::RwLock;
use tracing::{debug, error, info, warn};
use uuid::Uuid;

use super::daytona::DaytonaClient;
use super::pool::PoolManager;

/// Configuration for the trigger engine
#[derive(Debug, Clone)]
pub struct TriggerConfig {
    /// Interval between trigger checks in seconds
    pub check_interval_secs: u64,
    /// Maximum number of concurrent task executions
    pub max_concurrent: usize,
    /// Maximum retries for failed tasks
    pub max_retries: i32,
    /// Execution timeout in minutes
    pub execution_timeout_minutes: i32,
}

impl Default for TriggerConfig {
    fn default() -> Self {
        Self {
            check_interval_secs: 10,
            max_concurrent: 5,
            max_retries: 3,
            execution_timeout_minutes: 30,
        }
    }
}

/// Trigger Engine for automatic task processing
pub struct TriggerEngine {
    db_pool: SqlitePool,
    pool_manager: Arc<PoolManager>,
    daytona: Arc<DaytonaClient>,
    config: TriggerConfig,
    shutdown: RwLock<bool>,
    processing_tasks: Arc<RwLock<HashMap<Uuid, bool>>>,
}

impl TriggerEngine {
    /// Create a new TriggerEngine
    pub fn new(
        db_pool: SqlitePool,
        pool_manager: Arc<PoolManager>,
        daytona: Arc<DaytonaClient>,
        config: TriggerConfig,
    ) -> Self {
        Self {
            db_pool,
            pool_manager,
            daytona,
            config,
            shutdown: RwLock::new(false),
            processing_tasks: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Start the trigger engine loop
    pub fn start(self: Arc<Self>) {
        let engine = self.clone();

        tokio::spawn(async move {
            let mut interval =
                tokio::time::interval(Duration::from_secs(engine.config.check_interval_secs));

            info!(
                interval_secs = engine.config.check_interval_secs,
                "Trigger engine started"
            );

            loop {
                interval.tick().await;

                if *engine.shutdown.read().await {
                    break;
                }

                if let Err(e) = engine.check_triggers().await {
                    error!(error = %e, "Error in trigger check");
                }
            }

            info!("Trigger engine stopped");
        });
    }

    /// Stop the trigger engine
    pub async fn stop(&self) {
        let mut shutdown = self.shutdown.write().await;
        *shutdown = true;
        info!("Trigger engine stop requested");
    }

    /// Check if the trigger engine is enabled
    pub async fn is_enabled(&self) -> Result<bool> {
        let config = SwarmConfig::get(&self.db_pool).await?;
        Ok(config.trigger_enabled)
    }

    /// Main trigger check loop
    async fn check_triggers(&self) -> Result<()> {
        // Check if triggers are enabled
        if !self.is_enabled().await? {
            debug!("Triggers disabled, skipping check");
            return Ok(());
        }

        // Get all active swarms
        let swarms = Swarm::find_active(&self.db_pool).await?;

        for swarm in swarms {
            if let Err(e) = self.process_swarm_triggers(&swarm).await {
                error!(swarm_id = %swarm.id, error = %e, "Error processing swarm triggers");
            }
        }

        Ok(())
    }

    /// Process triggers for a single swarm
    async fn process_swarm_triggers(&self, swarm: &Swarm) -> Result<()> {
        let swarm_id = swarm.id;

        // Get pending tasks for this swarm
        let pending_tasks = self.get_pending_tasks(swarm_id).await?;

        for task in pending_tasks {
            // Atomic check-and-insert to prevent race condition
            // Previously, read lock for check and write lock for insert were separate,
            // allowing another thread to process the same task between the two operations
            {
                let mut processing = self.processing_tasks.write().await;
                if processing.contains_key(&task.id) {
                    continue;
                }
                // Mark as processing immediately to prevent other threads from picking it up
                processing.insert(task.id, true);
            }

            // Check dependencies
            if !self.are_dependencies_complete(&task).await? {
                debug!(task_id = %task.id, "Task dependencies not complete");
                // Remove from processing since we're not actually processing it
                let mut processing = self.processing_tasks.write().await;
                processing.remove(&task.id);
                continue;
            }

            // Find or create sandbox
            match self.process_pending_task(swarm, &task).await {
                Ok(true) => {
                    // Task was successfully dispatched, processing flag will be
                    // cleared by the spawned execution task
                }
                Ok(false) => {
                    // No sandbox available, remove from processing so it can be retried
                    debug!(task_id = %task.id, "No sandbox available, will retry later");
                    let mut processing = self.processing_tasks.write().await;
                    processing.remove(&task.id);
                }
                Err(e) => {
                    error!(task_id = %task.id, error = %e, "Error processing pending task");
                    // Remove from processing on error so it can be retried
                    let mut processing = self.processing_tasks.write().await;
                    processing.remove(&task.id);
                }
            }
        }

        Ok(())
    }

    /// Process a pending task - find sandbox and dispatch
    /// Returns Err only on actual failures that should trigger cleanup
    /// Returns Ok(false) when no sandbox available (task should be removed from processing)
    /// Returns Ok(true) when task was successfully dispatched
    async fn process_pending_task(&self, swarm: &Swarm, task: &SwarmTask) -> Result<bool> {
        let swarm_id = swarm.id;

        // Try to find an idle sandbox first
        let sandbox = Sandbox::find_idle(&self.db_pool).await?;

        let sandbox = if let Some(sb) = sandbox.first() {
            sb.clone()
        } else {
            // Check pool capacity
            let active_count = Sandbox::count_active(&self.db_pool).await?;
            let config = SwarmConfig::get(&self.db_pool).await?;

            if active_count >= config.pool_max_sandboxes as i64 {
                info!(swarm_id = %swarm_id, "Pool at capacity, waiting for sandbox");
                return Ok(false); // No sandbox available, signal to release from processing
            }

            // Would create new sandbox here via PoolManager
            // For now, just log
            info!(
                swarm_id = %swarm_id,
                task_id = %task.id,
                "Would create new sandbox for task"
            );
            return Ok(false); // No sandbox available, signal to release from processing
        };

        // Dispatch the task
        self.dispatch_task(task, &sandbox).await?;
        Ok(true)
    }

    /// Dispatch a task to a sandbox - update status and start execution
    async fn dispatch_task(&self, task: &SwarmTask, sandbox: &Sandbox) -> Result<()> {
        let task_id = task.id;
        let sandbox_id = sandbox.id;
        let daytona_id = sandbox.daytona_id.clone();

        // Note: Task is already marked as processing in process_swarm_triggers
        // via atomic check-and-insert to prevent race conditions

        // Update task status to running and assign sandbox
        SwarmTask::start_task(&self.db_pool, task_id, &daytona_id)
            .await
            .map_err(|e| anyhow::anyhow!("Failed to start task: {}", e))?;

        // Assign task to sandbox in sandbox table
        // If this fails, we need to rollback the task state
        if let Err(e) = Sandbox::assign_task(&self.db_pool, sandbox_id, task_id).await {
            // Rollback: try to release the sandbox from the task
            error!(
                task_id = %task_id,
                sandbox_id = %sandbox_id,
                error = %e,
                "Failed to assign task to sandbox, attempting rollback"
            );
            if let Err(rollback_err) = SwarmTask::release_sandbox(&self.db_pool, task_id).await {
                error!(
                    task_id = %task_id,
                    error = %rollback_err,
                    "Failed to rollback task sandbox assignment"
                );
            }
            return Err(anyhow::anyhow!("Failed to assign task to sandbox: {}", e));
        }

        info!(
            task_id = %task_id,
            sandbox_id = %sandbox_id,
            daytona_id = %daytona_id,
            "Task dispatched"
        );

        // Spawn execution task
        let processing_tasks = self.processing_tasks.clone();
        let db_pool = self.db_pool.clone();
        let _daytona = self.daytona.clone();
        let timeout_minutes = self.config.execution_timeout_minutes;

        tokio::spawn(async move {
            // TODO: Execute task via TaskExecutor
            // For now, simulate execution with timeout
            let execution_result = tokio::time::timeout(
                Duration::from_secs(timeout_minutes as u64 * 60),
                async {
                    // Placeholder for actual execution
                    tokio::time::sleep(Duration::from_secs(5)).await;
                    Ok::<Option<String>, String>(Some("Task completed successfully".to_string()))
                }
            ).await;

            // Handle execution result
            match execution_result {
                Ok(Ok(result)) => {
                    // Task completed successfully
                    if let Err(e) = SwarmTask::complete_task(&db_pool, task_id, result.as_deref()).await {
                        error!(task_id = %task_id, error = %e, "Failed to mark task as completed");
                    }
                    info!(task_id = %task_id, "Task completed successfully");
                }
                Ok(Err(error)) => {
                    // Task failed
                    if let Err(e) = SwarmTask::fail_task(&db_pool, task_id, &error).await {
                        error!(task_id = %task_id, error = %e, "Failed to mark task as failed");
                    }
                    warn!(task_id = %task_id, error = %error, "Task failed");
                }
                Err(_) => {
                    // Task timed out
                    let error = format!("Task timed out after {} minutes", timeout_minutes);
                    if let Err(e) = SwarmTask::fail_task(&db_pool, task_id, &error).await {
                        error!(task_id = %task_id, error = %e, "Failed to mark task as timed out");
                    }
                    warn!(task_id = %task_id, "Task timed out");
                }
            }

            // Release sandbox
            if let Err(e) = SwarmTask::release_sandbox(&db_pool, task_id).await {
                error!(task_id = %task_id, error = %e, "Failed to release sandbox from task");
            }
            if let Err(e) = Sandbox::release_task(&db_pool, sandbox_id).await {
                error!(sandbox_id = %sandbox_id, error = %e, "Failed to release sandbox");
            }

            // Clear processing flag
            {
                let mut processing = processing_tasks.write().await;
                processing.remove(&task_id);
            }
        });

        Ok(())
    }

    /// Release sandbox associated with a task
    async fn release_task_sandbox(&self, task_id: Uuid) -> Result<()> {
        // Release sandbox from task record
        SwarmTask::release_sandbox(&self.db_pool, task_id)
            .await
            .map_err(|e| anyhow::anyhow!("Failed to release sandbox: {}", e))?;

        // Find and release the sandbox
        if let Some(task) = SwarmTask::find_by_id(&self.db_pool, task_id).await? {
            if let Some(sandbox_id_str) = &task.sandbox_id {
                if let Some(sandbox) = Sandbox::find_by_daytona_id(&self.db_pool, sandbox_id_str).await? {
                    Sandbox::release_task(&self.db_pool, sandbox.id).await?;
                }
            }
        }

        // Clear processing flag
        {
            let mut processing = self.processing_tasks.write().await;
            processing.remove(&task_id);
        }

        Ok(())
    }

    /// Complete a task with a result
    pub async fn complete_task(&self, task_id: Uuid, result: Option<&str>) -> Result<()> {
        // Update task status to completed
        SwarmTask::complete_task(&self.db_pool, task_id, result)
            .await
            .map_err(|e| anyhow::anyhow!("Failed to complete task: {}", e))?;

        // Release sandbox
        self.release_task_sandbox(task_id).await?;

        info!(task_id = %task_id, "Task marked as completed");
        Ok(())
    }

    /// Fail a task with an error
    pub async fn fail_task(&self, task_id: Uuid, error: &str) -> Result<()> {
        // Update task status to failed
        SwarmTask::fail_task(&self.db_pool, task_id, error)
            .await
            .map_err(|e| anyhow::anyhow!("Failed to fail task: {}", e))?;

        // Release sandbox
        self.release_task_sandbox(task_id).await?;

        warn!(task_id = %task_id, error = %error, "Task marked as failed");
        Ok(())
    }

    /// Get pending tasks for a swarm from the database
    async fn get_pending_tasks(&self, swarm_id: Uuid) -> Result<Vec<SwarmTask>> {
        let tasks = SwarmTask::find_pending_by_swarm_id(&self.db_pool, swarm_id)
            .await
            .map_err(|e| anyhow::anyhow!("Failed to fetch pending tasks: {}", e))?;
        Ok(tasks)
    }

    /// Check if all task dependencies are complete
    async fn are_dependencies_complete(&self, task: &SwarmTask) -> Result<bool> {
        SwarmTask::are_dependencies_complete(&self.db_pool, task)
            .await
            .map_err(|e| anyhow::anyhow!("Failed to check dependencies: {}", e))
    }

    /// Get current processing stats
    pub async fn get_stats(&self) -> TriggerStats {
        let processing = self.processing_tasks.read().await;
        let is_running = !*self.shutdown.read().await;

        // Get task counts from all active swarms
        let mut total_pending = 0;
        let mut total_running = 0;
        let mut total_completed = 0;
        let mut total_failed = 0;

        if let Ok(swarms) = Swarm::find_active(&self.db_pool).await {
            for swarm in swarms {
                if let Ok(counts) = SwarmTask::count_by_status(&self.db_pool, swarm.id).await {
                    total_pending += counts.pending;
                    total_running += counts.running;
                    total_completed += counts.completed;
                    total_failed += counts.failed;
                }
            }
        }

        TriggerStats {
            processing_count: processing.len(),
            is_running,
            tasks_completed: total_completed,
            tasks_failed: total_failed,
            tasks_pending: total_pending,
            tasks_running: total_running,
        }
    }
}

/// Statistics for the trigger engine
#[derive(Debug, Clone, Default)]
pub struct TriggerStats {
    pub processing_count: usize,
    pub is_running: bool,
    pub tasks_completed: usize,
    pub tasks_failed: usize,
    pub tasks_pending: usize,
    pub tasks_running: usize,
}
