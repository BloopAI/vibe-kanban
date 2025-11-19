use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::Arc,
};

use anyhow::{Error as AnyhowError, anyhow};
use async_trait::async_trait;
use db::{
    DBService,
    models::{
        execution_process::{
            CreateExecutionProcess, ExecutionContext, ExecutionProcess, ExecutionProcessRunReason,
            ExecutionProcessStatus,
        },
        execution_process_logs::ExecutionProcessLogs,
        executor_session::{CreateExecutorSession, ExecutorSession},
        task::{Task, TaskStatus},
        task_attempt::{TaskAttempt, TaskAttemptError},
    },
};
use executors::{
    actions::{
        ExecutorAction, ExecutorActionType,
        coding_agent_follow_up::CodingAgentFollowUpRequest,
        coding_agent_initial::CodingAgentInitialRequest,
        script::{ScriptContext, ScriptRequest, ScriptRequestLanguage},
    },
    executors::{ExecutorError, StandardCodingAgentExecutor},
    logs::{NormalizedEntry, NormalizedEntryError, NormalizedEntryType, utils::ConversationPatch},
    profile::{ExecutorConfigs, ExecutorProfileId, to_default_variant},
};
use futures::{StreamExt, future};
use sqlx::Error as SqlxError;
use thiserror::Error;
use tokio::{sync::RwLock, task::JoinHandle};
use utils::{
    log_msg::LogMsg,
    msg_store::MsgStore,
    text::{git_branch_id, short_uuid},
};
use uuid::Uuid;

use crate::services::{
    git::{GitService, GitServiceError},
    image::ImageService,
    share::SharePublisher,
    worktree_manager::{WorktreeError, WorktreeManager},
};
pub type ContainerRef = String;

/// Data needed for background worktree cleanup (doesn't require DB access)
#[derive(Debug, Clone)]
pub struct WorktreeCleanupData {
    pub attempt_id: Uuid,
    pub worktree_path: PathBuf,
    pub git_repo_path: Option<PathBuf>,
}

/// Cleanup worktrees without requiring database access
pub async fn cleanup_worktrees_direct(data: &[WorktreeCleanupData]) -> Result<(), ContainerError> {
    for cleanup_data in data {
        tracing::debug!(
            "Cleaning up worktree for attempt {}: {:?}",
            cleanup_data.attempt_id,
            cleanup_data.worktree_path
        );

        if let Err(e) = WorktreeManager::cleanup_worktree(
            &cleanup_data.worktree_path,
            cleanup_data.git_repo_path.as_deref(),
        )
        .await
        {
            tracing::error!(
                "Failed to cleanup worktree for task attempt {}: {}",
                cleanup_data.attempt_id,
                e
            );
            // Continue with other cleanups even if one fails
        }
    }
    Ok(())
}

#[derive(Debug, Error)]
pub enum ContainerError {
    #[error(transparent)]
    GitServiceError(#[from] GitServiceError),
    #[error(transparent)]
    Sqlx(#[from] SqlxError),
    #[error(transparent)]
    ExecutorError(#[from] ExecutorError),
    #[error(transparent)]
    Worktree(#[from] WorktreeError),
    #[error("Io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Failed to kill process: {0}")]
    KillFailed(std::io::Error),
    #[error(transparent)]
    TaskAttemptError(#[from] TaskAttemptError),
    #[error(transparent)]
    Other(#[from] AnyhowError), // Catches any unclassified errors
}

#[async_trait]
pub trait ContainerService {
    fn msg_stores(&self) -> &Arc<RwLock<HashMap<Uuid, Arc<MsgStore>>>>;

    fn db(&self) -> &DBService;

    fn git(&self) -> &GitService;

    fn share_publisher(&self) -> Option<&SharePublisher>;

    fn task_attempt_to_current_dir(&self, task_attempt: &TaskAttempt) -> PathBuf;

    async fn create(&self, task_attempt: &TaskAttempt) -> Result<ContainerRef, ContainerError>;

    async fn kill_all_running_processes(&self) -> Result<(), ContainerError>;

    async fn delete(&self, task_attempt: &TaskAttempt) -> Result<(), ContainerError> {
        self.try_stop(task_attempt).await;
        self.delete_inner(task_attempt).await
    }

    /// Check if a task has any running execution processes
    async fn has_running_processes(&self, task_id: Uuid) -> Result<bool, ContainerError> {
        let attempts = TaskAttempt::fetch_all(&self.db().pool, Some(task_id)).await?;

        for attempt in attempts {
            if let Ok(processes) =
                ExecutionProcess::find_by_task_attempt_id(&self.db().pool, attempt.id, false).await
            {
                for process in processes {
                    if process.status == ExecutionProcessStatus::Running {
                        return Ok(true);
                    }
                }
            }
        }

        Ok(false)
    }

    /// Stop execution processes for task attempts without cleanup
    async fn stop_task_processes(
        &self,
        task_attempts: &[TaskAttempt],
    ) -> Result<(), ContainerError> {
        for attempt in task_attempts {
            self.try_stop(attempt).await;
        }
        Ok(())
    }

    fn cleanup_action(&self, cleanup_script: Option<String>) -> Option<Box<ExecutorAction>> {
        cleanup_script.map(|script| {
            Box::new(ExecutorAction::new(
                ExecutorActionType::ScriptRequest(ScriptRequest {
                    script,
                    language: ScriptRequestLanguage::Bash,
                    context: ScriptContext::CleanupScript,
                }),
                None,
            ))
        })
    }

    async fn try_stop(&self, task_attempt: &TaskAttempt) {
        // stop all execution processes for this attempt
        if let Ok(processes) =
            ExecutionProcess::find_by_task_attempt_id(&self.db().pool, task_attempt.id, false).await
        {
            for process in processes {
                if process.status == ExecutionProcessStatus::Running {
                    self.stop_execution(&process, ExecutionProcessStatus::Killed)
                        .await
                        .unwrap_or_else(|e| {
                            tracing::debug!(
                                "Failed to stop execution process {} for task attempt {}: {}",
                                process.id,
                                task_attempt.id,
                                e
                            );
                        });
                }
            }
        }
    }

    async fn delete_inner(&self, task_attempt: &TaskAttempt) -> Result<(), ContainerError>;

    async fn ensure_container_exists(
        &self,
        task_attempt: &TaskAttempt,
    ) -> Result<ContainerRef, ContainerError>;

    async fn is_container_clean(&self, task_attempt: &TaskAttempt) -> Result<bool, ContainerError>;

    async fn start_execution_inner(
        &self,
        task_attempt: &TaskAttempt,
        execution_process: &ExecutionProcess,
        executor_action: &ExecutorAction,
    ) -> Result<(), ContainerError>;

    async fn stop_execution(
        &self,
        execution_process: &ExecutionProcess,
        status: ExecutionProcessStatus,
    ) -> Result<(), ContainerError>;

    async fn try_commit_changes(&self, ctx: &ExecutionContext) -> Result<bool, ContainerError>;

    async fn copy_project_files(
        &self,
        source_dir: &Path,
        target_dir: &Path,
        copy_files: &str,
    ) -> Result<(), ContainerError>;

    /// Stream diff updates as LogMsg for WebSocket endpoints.
    async fn stream_diff(
        &self,
        task_attempt: &TaskAttempt,
        stats_only: bool,
    ) -> Result<futures::stream::BoxStream<'static, Result<LogMsg, std::io::Error>>, ContainerError>;

    /// Fetch the MsgStore for a given execution ID, panicking if missing.
    async fn get_msg_store_by_id(&self, uuid: &Uuid) -> Option<Arc<MsgStore>> {
        let map = self.msg_stores().read().await;
        map.get(uuid).cloned()
    }

    async fn git_branch_prefix(&self) -> String;

    async fn git_branch_from_task_attempt(&self, attempt_id: &Uuid, task_title: &str) -> String {
        let task_title_id = git_branch_id(task_title);
        let prefix = self.git_branch_prefix().await;

        if prefix.is_empty() {
            format!("{}-{}", short_uuid(attempt_id), task_title_id)
        } else {
            format!("{}/{}-{}", prefix, short_uuid(attempt_id), task_title_id)
        }
    }

    async fn stream_raw_logs(
        &self,
        id: &Uuid,
    ) -> Option<futures::stream::BoxStream<'static, Result<LogMsg, std::io::Error>>> {
        if let Some(store) = self.get_msg_store_by_id(id).await {
            // First try in-memory store
            return Some(
                store
                    .history_plus_stream()
                    .filter(|msg| {
                        future::ready(matches!(
                            msg,
                            Ok(LogMsg::Stdout(..) | LogMsg::Stderr(..) | LogMsg::Finished)
                        ))
                    })
                    .boxed(),
            );
        } else {
            // Fallback: load from DB and create direct stream
            let log_records =
                match ExecutionProcessLogs::find_by_execution_id(&self.db().pool, *id).await {
                    Ok(records) if !records.is_empty() => records,
                    Ok(_) => return None, // No logs exist
                    Err(e) => {
                        tracing::error!("Failed to fetch logs for execution {}: {}", id, e);
                        return None;
                    }
                };

            let messages = match ExecutionProcessLogs::parse_logs(&log_records) {
                Ok(msgs) => msgs,
                Err(e) => {
                    tracing::error!("Failed to parse logs for execution {}: {}", id, e);
                    return None;
                }
            };

            // Direct stream from parsed messages
            let stream = futures::stream::iter(
                messages
                    .into_iter()
                    .filter(|m| matches!(m, LogMsg::Stdout(_) | LogMsg::Stderr(_)))
                    .chain(std::iter::once(LogMsg::Finished))
                    .map(Ok::<_, std::io::Error>),
            )
            .boxed();

            Some(stream)
        }
    }

    async fn stream_normalized_logs(
        &self,
        id: &Uuid,
    ) -> Option<futures::stream::BoxStream<'static, Result<LogMsg, std::io::Error>>> {
        // First try in-memory store (existing behavior)
        if let Some(store) = self.get_msg_store_by_id(id).await {
            Some(
                store
                    .history_plus_stream() // BoxStream<Result<LogMsg, io::Error>>
                    .filter(|msg| future::ready(matches!(msg, Ok(LogMsg::JsonPatch(..)))))
                    .chain(futures::stream::once(async {
                        Ok::<_, std::io::Error>(LogMsg::Finished)
                    }))
                    .boxed(),
            )
        } else {
            // Fallback: load from DB and normalize
            let log_records =
                match ExecutionProcessLogs::find_by_execution_id(&self.db().pool, *id).await {
                    Ok(records) if !records.is_empty() => records,
                    Ok(_) => return None, // No logs exist
                    Err(e) => {
                        tracing::error!("Failed to fetch logs for execution {}: {}", id, e);
                        return None;
                    }
                };

            let raw_messages = match ExecutionProcessLogs::parse_logs(&log_records) {
                Ok(msgs) => msgs,
                Err(e) => {
                    tracing::error!("Failed to parse logs for execution {}: {}", id, e);
                    return None;
                }
            };

            // Create temporary store and populate
            // Include JsonPatch messages (already normalized) and Stdout/Stderr (need normalization)
            let temp_store = Arc::new(MsgStore::new());
            for msg in raw_messages {
                if matches!(
                    msg,
                    LogMsg::Stdout(_) | LogMsg::Stderr(_) | LogMsg::JsonPatch(_)
                ) {
                    temp_store.push(msg);
                }
            }
            temp_store.push_finished();

            let process = match ExecutionProcess::find_by_id(&self.db().pool, *id).await {
                Ok(Some(process)) => process,
                Ok(None) => {
                    tracing::error!("No execution process found for ID: {}", id);
                    return None;
                }
                Err(e) => {
                    tracing::error!("Failed to fetch execution process {}: {}", id, e);
                    return None;
                }
            };

            // Get the task attempt to determine correct directory
            let task_attempt = match process.parent_task_attempt(&self.db().pool).await {
                Ok(Some(task_attempt)) => task_attempt,
                Ok(None) => {
                    tracing::error!("No task attempt found for ID: {}", process.task_attempt_id);
                    return None;
                }
                Err(e) => {
                    tracing::error!(
                        "Failed to fetch task attempt {}: {}",
                        process.task_attempt_id,
                        e
                    );
                    return None;
                }
            };

            if let Err(err) = self.ensure_container_exists(&task_attempt).await {
                tracing::warn!(
                    "Failed to recreate worktree before log normalization for task attempt {}: {}",
                    task_attempt.id,
                    err
                );
            }

            let current_dir = self.task_attempt_to_current_dir(&task_attempt);

            let executor_action = if let Ok(executor_action) = process.executor_action() {
                executor_action
            } else {
                tracing::error!(
                    "Failed to parse executor action: {:?}",
                    process.executor_action()
                );
                return None;
            };

            // Spawn normalizer on populated store
            match executor_action.typ() {
                ExecutorActionType::CodingAgentInitialRequest(request) => {
                    let executor = ExecutorConfigs::get_cached()
                        .get_coding_agent_or_default(&request.executor_profile_id);
                    executor.normalize_logs(temp_store.clone(), &current_dir);
                }
                ExecutorActionType::CodingAgentFollowUpRequest(request) => {
                    let executor = ExecutorConfigs::get_cached()
                        .get_coding_agent_or_default(&request.executor_profile_id);
                    executor.normalize_logs(temp_store.clone(), &current_dir);
                }
                _ => {
                    tracing::debug!(
                        "Executor action doesn't support log normalization: {:?}",
                        process.executor_action()
                    );
                    return None;
                }
            }
            Some(
                temp_store
                    .history_plus_stream()
                    .filter(|msg| future::ready(matches!(msg, Ok(LogMsg::JsonPatch(..)))))
                    .chain(futures::stream::once(async {
                        Ok::<_, std::io::Error>(LogMsg::Finished)
                    }))
                    .boxed(),
            )
        }
    }

    fn spawn_stream_raw_logs_to_db(&self, execution_id: &Uuid) -> JoinHandle<()> {
        let execution_id = *execution_id;
        let msg_stores = self.msg_stores().clone();
        let db = self.db().clone();

        tokio::spawn(async move {
            // Get the message store for this execution
            let store = {
                let map = msg_stores.read().await;
                map.get(&execution_id).cloned()
            };

            if let Some(store) = store {
                let mut stream = store.history_plus_stream();

                while let Some(Ok(msg)) = stream.next().await {
                    match &msg {
                        LogMsg::Stdout(_) | LogMsg::Stderr(_) => {
                            // Serialize this individual message as a JSONL line
                            match serde_json::to_string(&msg) {
                                Ok(jsonl_line) => {
                                    let jsonl_line_with_newline = format!("{jsonl_line}\n");

                                    // Append this line to the database
                                    if let Err(e) = ExecutionProcessLogs::append_log_line(
                                        &db.pool,
                                        execution_id,
                                        &jsonl_line_with_newline,
                                    )
                                    .await
                                    {
                                        tracing::error!(
                                            "Failed to append log line for execution {}: {}",
                                            execution_id,
                                            e
                                        );
                                    }
                                }
                                Err(e) => {
                                    tracing::error!(
                                        "Failed to serialize log message for execution {}: {}",
                                        execution_id,
                                        e
                                    );
                                }
                            }
                        }
                        LogMsg::SessionId(session_id) => {
                            // Append this line to the database
                            if let Err(e) = ExecutorSession::update_session_id(
                                &db.pool,
                                execution_id,
                                session_id,
                            )
                            .await
                            {
                                tracing::error!(
                                    "Failed to update session_id {} for execution process {}: {}",
                                    session_id,
                                    execution_id,
                                    e
                                );
                            }
                        }
                        LogMsg::Finished => {
                            break;
                        }
                        LogMsg::JsonPatch(_) => continue,
                    }
                }
            }
        })
    }

    async fn start_attempt(
        &self,
        task_attempt: &TaskAttempt,
        executor_profile_id: ExecutorProfileId,
    ) -> Result<ExecutionProcess, ContainerError> {
        // Create container
        self.create(task_attempt).await?;

        // Get parent task
        let task = task_attempt
            .parent_task(&self.db().pool)
            .await?
            .ok_or(SqlxError::RowNotFound)?;

        // Get parent project
        let project = task
            .parent_project(&self.db().pool)
            .await?
            .ok_or(SqlxError::RowNotFound)?;

        // // Get latest version of task attempt
        let task_attempt = TaskAttempt::find_by_id(&self.db().pool, task_attempt.id)
            .await?
            .ok_or(SqlxError::RowNotFound)?;

        // TODO: this implementation will not work in cloud
        let worktree_path = PathBuf::from(
            task_attempt
                .container_ref
                .as_ref()
                .ok_or_else(|| ContainerError::Other(anyhow!("Container ref not found")))?,
        );
        let prompt = ImageService::canonicalise_image_paths(&task.to_prompt(), &worktree_path);

        let cleanup_action = self.cleanup_action(project.cleanup_script);

        // Choose whether to execute the setup_script or coding agent first
        let execution_process = if let Some(setup_script) = project.setup_script {
            let executor_action = ExecutorAction::new(
                ExecutorActionType::ScriptRequest(ScriptRequest {
                    script: setup_script,
                    language: ScriptRequestLanguage::Bash,
                    context: ScriptContext::SetupScript,
                }),
                // once the setup script is done, run the initial coding agent request
                Some(Box::new(ExecutorAction::new(
                    ExecutorActionType::CodingAgentInitialRequest(CodingAgentInitialRequest {
                        prompt,
                        executor_profile_id: executor_profile_id.clone(),
                    }),
                    cleanup_action,
                ))),
            );

            self.start_execution(
                &task_attempt,
                &executor_action,
                &ExecutionProcessRunReason::SetupScript,
            )
            .await?
        } else {
            let executor_action = ExecutorAction::new(
                ExecutorActionType::CodingAgentInitialRequest(CodingAgentInitialRequest {
                    prompt,
                    executor_profile_id: executor_profile_id.clone(),
                }),
                cleanup_action,
            );

            self.start_execution(
                &task_attempt,
                &executor_action,
                &ExecutionProcessRunReason::CodingAgent,
            )
            .await?
        };
        Ok(execution_process)
    }

    async fn start_execution(
        &self,
        task_attempt: &TaskAttempt,
        executor_action: &ExecutorAction,
        run_reason: &ExecutionProcessRunReason,
    ) -> Result<ExecutionProcess, ContainerError> {
        // Update task status to InProgress when starting an attempt
        let task = task_attempt
            .parent_task(&self.db().pool)
            .await?
            .ok_or(SqlxError::RowNotFound)?;
        if task.status != TaskStatus::InProgress
            && run_reason != &ExecutionProcessRunReason::DevServer
        {
            Task::update_status(&self.db().pool, task.id, TaskStatus::InProgress).await?;

            if let Some(publisher) = self.share_publisher()
                && let Err(err) = publisher.update_shared_task_by_id(task.id).await
            {
                tracing::warn!(
                    ?err,
                    "Failed to propagate shared task update for {}",
                    task.id
                );
            }
        }
        // Create new execution process record
        // Capture current HEAD as the "before" commit for this execution
        let before_head_commit = {
            if let Some(container_ref) = &task_attempt.container_ref {
                let wt = std::path::Path::new(container_ref);
                self.git().get_head_info(wt).ok().map(|h| h.oid)
            } else {
                None
            }
        };
        let create_execution_process = CreateExecutionProcess {
            task_attempt_id: task_attempt.id,
            executor_action: executor_action.clone(),
            run_reason: run_reason.clone(),
        };

        let execution_process = ExecutionProcess::create(
            &self.db().pool,
            &create_execution_process,
            Uuid::new_v4(),
            before_head_commit.as_deref(),
        )
        .await?;

        if let Some(prompt) = match executor_action.typ() {
            ExecutorActionType::CodingAgentInitialRequest(coding_agent_request) => {
                Some(coding_agent_request.prompt.clone())
            }
            ExecutorActionType::CodingAgentFollowUpRequest(follow_up_request) => {
                Some(follow_up_request.prompt.clone())
            }
            _ => None,
        } {
            let create_executor_data = CreateExecutorSession {
                task_attempt_id: task_attempt.id,
                execution_process_id: execution_process.id,
                prompt: Some(prompt),
            };

            let executor_session_record_id = Uuid::new_v4();

            ExecutorSession::create(
                &self.db().pool,
                &create_executor_data,
                executor_session_record_id,
            )
            .await?;
        }

        if let Err(start_error) = self
            .start_execution_inner(task_attempt, &execution_process, executor_action)
            .await
        {
            // Mark process as failed
            if let Err(update_error) = ExecutionProcess::update_completion(
                &self.db().pool,
                execution_process.id,
                ExecutionProcessStatus::Failed,
                None,
            )
            .await
            {
                tracing::error!(
                    "Failed to mark execution process {} as failed after start error: {}",
                    execution_process.id,
                    update_error
                );
            }
            Task::update_status(&self.db().pool, task.id, TaskStatus::InReview).await?;

            // Emit stderr error message
            let log_message = LogMsg::Stderr(format!("Failed to start execution: {start_error}"));
            if let Ok(json_line) = serde_json::to_string(&log_message) {
                let _ = ExecutionProcessLogs::append_log_line(
                    &self.db().pool,
                    execution_process.id,
                    &format!("{json_line}\n"),
                )
                .await;
            }

            // Emit NextAction with failure context for coding agent requests
            if let ContainerError::ExecutorError(ExecutorError::ExecutableNotFound { program }) =
                &start_error
            {
                let help_text = format!("The required executable `{program}` is not installed.");
                let error_message = NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::ErrorMessage {
                        error_type: NormalizedEntryError::SetupRequired,
                    },
                    content: help_text,
                    metadata: None,
                };
                let patch = ConversationPatch::add_normalized_entry(2, error_message);
                if let Ok(json_line) = serde_json::to_string::<LogMsg>(&LogMsg::JsonPatch(patch)) {
                    let _ = ExecutionProcessLogs::append_log_line(
                        &self.db().pool,
                        execution_process.id,
                        &format!("{json_line}\n"),
                    )
                    .await;
                }
            };
            return Err(start_error);
        }

        // Start processing normalised logs for executor requests and follow ups
        if let Some(msg_store) = self.get_msg_store_by_id(&execution_process.id).await
            && let Some(executor_profile_id) = match executor_action.typ() {
                ExecutorActionType::CodingAgentInitialRequest(request) => {
                    Some(&request.executor_profile_id)
                }
                ExecutorActionType::CodingAgentFollowUpRequest(request) => {
                    Some(&request.executor_profile_id)
                }
                _ => None,
            }
        {
            if let Some(executor) =
                ExecutorConfigs::get_cached().get_coding_agent(executor_profile_id)
            {
                executor.normalize_logs(msg_store, &self.task_attempt_to_current_dir(task_attempt));
            } else {
                tracing::error!(
                    "Failed to resolve profile '{:?}' for normalization",
                    executor_profile_id
                );
            }
        }

        self.spawn_stream_raw_logs_to_db(&execution_process.id);
        Ok(execution_process)
    }

    async fn try_start_next_action(&self, ctx: &ExecutionContext) -> Result<(), ContainerError> {
        let action = ctx.execution_process.executor_action()?;
        let next_action = if let Some(next_action) = action.next_action() {
            next_action
        } else {
            tracing::debug!("No next action configured");
            return Ok(());
        };

        // Determine the run reason of the next action
        let next_run_reason = match (action.typ(), next_action.typ()) {
            (ExecutorActionType::ScriptRequest(_), ExecutorActionType::ScriptRequest(_)) => {
                ExecutionProcessRunReason::SetupScript
            }
            (
                ExecutorActionType::CodingAgentInitialRequest(_)
                | ExecutorActionType::CodingAgentFollowUpRequest(_),
                ExecutorActionType::ScriptRequest(_),
            ) => ExecutionProcessRunReason::CleanupScript,
            (
                _,
                ExecutorActionType::CodingAgentFollowUpRequest(_)
                | ExecutorActionType::CodingAgentInitialRequest(_),
            ) => ExecutionProcessRunReason::CodingAgent,
        };

        self.start_execution(&ctx.task_attempt, next_action, &next_run_reason)
            .await?;

        tracing::debug!("Started next action: {:?}", next_action);
        Ok(())
    }

    async fn exit_plan_mode_tool(&self, ctx: ExecutionContext) -> Result<(), ContainerError> {
        let execution_id = ctx.execution_process.id;

        if let Err(err) = self
            .stop_execution(&ctx.execution_process, ExecutionProcessStatus::Completed)
            .await
        {
            tracing::error!("Failed to stop execution process {}: {}", execution_id, err);
            return Err(err);
        }

        let action = ctx.execution_process.executor_action()?;
        let executor_profile_id = match action.typ() {
            ExecutorActionType::CodingAgentInitialRequest(req) => req.executor_profile_id.clone(),
            ExecutorActionType::CodingAgentFollowUpRequest(req) => req.executor_profile_id.clone(),
            _ => {
                return Err(ContainerError::Other(anyhow::anyhow!(
                    "exit plan mode tool called on non-coding agent action"
                )));
            }
        };
        let cleanup_chain = action.next_action().cloned();

        let session_id =
            ExecutorSession::find_by_execution_process_id(&self.db().pool, execution_id)
                .await?
                .and_then(|s| s.session_id);

        if session_id.is_none() {
            tracing::warn!(
                "No executor session found for execution process {}",
                execution_id
            );
            return Err(ContainerError::Other(anyhow::anyhow!(
                "No executor session found"
            )));
        }

        let default_profile = to_default_variant(&executor_profile_id);
        let follow_up = CodingAgentFollowUpRequest {
            prompt: String::from("The plan has been approved, please execute it."),
            session_id: session_id.unwrap(),
            executor_profile_id: default_profile,
        };
        let action = ExecutorAction::new(
            ExecutorActionType::CodingAgentFollowUpRequest(follow_up),
            cleanup_chain.map(Box::new),
        );

        let _ = self
            .start_execution(
                &ctx.task_attempt,
                &action,
                &ExecutionProcessRunReason::CodingAgent,
            )
            .await?;
        Ok(())
    }
}
