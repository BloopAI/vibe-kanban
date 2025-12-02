//! Assignment handler for processing task assignments from the hive.
//!
//! This module handles incoming task assignments from the hive server,
//! creating local tasks and attempts, and starting execution.

use chrono::Utc;
use db::{
    DBService,
    models::{
        project::Project,
        task::{CreateTask, Task, TaskStatus},
        task_attempt::{CreateTaskAttempt, TaskAttempt, TaskAttemptError},
    },
};
use executors::{executors::BaseCodingAgent, profile::ExecutorProfileId};
use tokio::sync::{RwLock, mpsc};
use uuid::Uuid;

use std::sync::Arc;

use super::{
    container::ContainerService,
    hive_client::{
        HiveClientError, NodeMessage, TaskAssignMessage, TaskExecutionStatus, TaskStatusMessage,
    },
    node_runner::NodeRunnerState,
};

/// Handler for processing task assignments from the hive.
pub struct AssignmentHandler<C: ContainerService + Sync> {
    db: DBService,
    container: C,
    node_state: Arc<RwLock<NodeRunnerState>>,
    command_tx: mpsc::Sender<NodeMessage>,
}

impl<C: ContainerService + Sync> AssignmentHandler<C> {
    /// Create a new assignment handler.
    pub fn new(
        db: DBService,
        container: C,
        node_state: Arc<RwLock<NodeRunnerState>>,
        command_tx: mpsc::Sender<NodeMessage>,
    ) -> Self {
        Self {
            db,
            container,
            node_state,
            command_tx,
        }
    }

    /// Handle an incoming task assignment.
    pub async fn handle_assignment(
        &self,
        assignment: TaskAssignMessage,
    ) -> Result<(), AssignmentError> {
        let assignment_id = assignment.assignment_id;

        // Send starting status
        self.send_status(assignment_id, TaskExecutionStatus::Starting, None)
            .await?;

        // Look up the local project using the local_project_id from the assignment
        let project = Project::find_by_id(&self.db.pool, assignment.local_project_id)
            .await?
            .ok_or_else(|| AssignmentError::ProjectNotFound(assignment.local_project_id))?;

        // Create the local task
        let task_id = Uuid::new_v4();
        let task = Task::create(
            &self.db.pool,
            &CreateTask {
                project_id: project.id,
                title: assignment.task.title.clone(),
                description: assignment.task.description.clone(),
                status: Some(TaskStatus::InProgress),
                parent_task_attempt: None,
                image_ids: None,
                shared_task_id: Some(assignment.task_id), // Link to the shared task
            },
            task_id,
        )
        .await?;

        tracing::info!(
            assignment_id = %assignment_id,
            local_task_id = %task.id,
            "created local task for assignment"
        );

        // Parse the executor from the assignment
        let executor = parse_executor(&assignment.task.executor)?;

        // Create a task attempt
        let attempt_id = Uuid::new_v4();
        let branch_name = self
            .container
            .git_branch_from_task_attempt(&attempt_id, &task.title)
            .await;

        let task_attempt = TaskAttempt::create(
            &self.db.pool,
            &CreateTaskAttempt {
                executor,
                base_branch: assignment.task.base_branch.clone(),
                branch: branch_name,
            },
            attempt_id,
            task.id,
        )
        .await?;

        // Update the node state with local IDs
        {
            let mut state = self.node_state.write().await;
            if let Some(active) = state.active_assignments.get_mut(&assignment_id) {
                active.local_task_id = Some(task.id);
                active.local_attempt_id = Some(task_attempt.id);
                active.status = TaskExecutionStatus::Starting;
            }
        }

        // Build executor profile
        let executor_profile_id = ExecutorProfileId {
            executor,
            variant: assignment.task.executor_variant.clone(),
        };

        // Start the attempt
        match self
            .container
            .start_attempt(&task_attempt, executor_profile_id)
            .await
        {
            Ok(_) => {
                tracing::info!(
                    assignment_id = %assignment_id,
                    attempt_id = %task_attempt.id,
                    "started task attempt"
                );

                self.send_status(assignment_id, TaskExecutionStatus::Running, None)
                    .await?;

                // Update node state
                {
                    let mut state = self.node_state.write().await;
                    if let Some(active) = state.active_assignments.get_mut(&assignment_id) {
                        active.status = TaskExecutionStatus::Running;
                    }
                }
            }
            Err(e) => {
                tracing::error!(
                    assignment_id = %assignment_id,
                    error = %e,
                    "failed to start task attempt"
                );

                self.send_status(
                    assignment_id,
                    TaskExecutionStatus::Failed,
                    Some(format!("Failed to start: {}", e)),
                )
                .await?;

                // Update node state
                {
                    let mut state = self.node_state.write().await;
                    if let Some(active) = state.active_assignments.get_mut(&assignment_id) {
                        active.status = TaskExecutionStatus::Failed;
                    }
                }

                return Err(AssignmentError::ExecutionFailed(e.to_string()));
            }
        }

        Ok(())
    }

    /// Handle a task cancellation request.
    pub async fn handle_cancellation(&self, assignment_id: Uuid) -> Result<(), AssignmentError> {
        let state = self.node_state.read().await;
        let assignment = state
            .active_assignments
            .get(&assignment_id)
            .cloned()
            .ok_or(AssignmentError::AssignmentNotFound(assignment_id))?;
        drop(state);

        if let Some(attempt_id) = assignment.local_attempt_id {
            // Find the attempt and stop it
            if let Some(_attempt) = TaskAttempt::find_by_id(&self.db.pool, attempt_id).await? {
                // Find running execution processes for this attempt
                let processes =
                    db::models::execution_process::ExecutionProcess::find_by_task_attempt_id(
                        &self.db.pool,
                        attempt_id,
                        false,
                    )
                    .await?;

                for process in processes {
                    if matches!(
                        process.status,
                        db::models::execution_process::ExecutionProcessStatus::Running
                    ) {
                        // Stop the process (use Killed status since Stopped doesn't exist)
                        self.container
                            .stop_execution(
                                &process,
                                db::models::execution_process::ExecutionProcessStatus::Killed,
                            )
                            .await?;
                    }
                }

                tracing::info!(
                    assignment_id = %assignment_id,
                    attempt_id = %attempt_id,
                    "cancelled task attempt"
                );
            }
        }

        // Update node state
        {
            let mut state = self.node_state.write().await;
            if let Some(active) = state.active_assignments.get_mut(&assignment_id) {
                active.status = TaskExecutionStatus::Cancelled;
            }
        }

        self.send_status(assignment_id, TaskExecutionStatus::Cancelled, None)
            .await?;

        Ok(())
    }

    /// Send a status update to the hive.
    async fn send_status(
        &self,
        assignment_id: Uuid,
        status: TaskExecutionStatus,
        message: Option<String>,
    ) -> Result<(), AssignmentError> {
        let state = self.node_state.read().await;
        let assignment = state.active_assignments.get(&assignment_id);

        let status_msg = TaskStatusMessage {
            assignment_id,
            local_task_id: assignment.and_then(|a| a.local_task_id),
            local_attempt_id: assignment.and_then(|a| a.local_attempt_id),
            status,
            message,
            timestamp: Utc::now(),
        };

        drop(state);

        self.command_tx
            .send(NodeMessage::TaskStatus(status_msg))
            .await
            .map_err(|_| AssignmentError::ChannelClosed)?;

        Ok(())
    }
}

/// Parse an executor string to a BaseCodingAgent.
fn parse_executor(executor: &str) -> Result<BaseCodingAgent, AssignmentError> {
    match executor.to_uppercase().as_str() {
        "CLAUDE_CODE" => Ok(BaseCodingAgent::ClaudeCode),
        "CODEX" => Ok(BaseCodingAgent::Codex),
        "GEMINI" => Ok(BaseCodingAgent::Gemini),
        "CURSOR_AGENT" | "CURSOR" => Ok(BaseCodingAgent::CursorAgent),
        "OPENCODE" => Ok(BaseCodingAgent::Opencode),
        "AMP" => Ok(BaseCodingAgent::Amp),
        "QWEN_CODE" => Ok(BaseCodingAgent::QwenCode),
        "COPILOT" => Ok(BaseCodingAgent::Copilot),
        "DROID" => Ok(BaseCodingAgent::Droid),
        _ => Err(AssignmentError::UnknownExecutor(executor.to_string())),
    }
}

/// Errors from assignment handling.
#[derive(Debug, thiserror::Error)]
pub enum AssignmentError {
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("task attempt error: {0}")]
    TaskAttempt(#[from] TaskAttemptError),
    #[error("project not found: {0}")]
    ProjectNotFound(Uuid),
    #[error("assignment not found: {0}")]
    AssignmentNotFound(Uuid),
    #[error("unknown executor: {0}")]
    UnknownExecutor(String),
    #[error("execution failed: {0}")]
    ExecutionFailed(String),
    #[error("channel closed")]
    ChannelClosed,
    #[error("container error: {0}")]
    Container(#[from] super::container::ContainerError),
    #[error("hive client error: {0}")]
    HiveClient(#[from] HiveClientError),
}
