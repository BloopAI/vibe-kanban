use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
};

use anyhow::Error as AnyhowError;
use async_trait::async_trait;
use axum::response::sse::Event;
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
        coding_agent_initial::CodingAgentInitialRequest,
        script::{ScriptContext, ScriptRequest, ScriptRequestLanguage},
    },
    executors::{CodingAgent, ExecutorError, StandardCodingAgentExecutor},
    logs::{NormalizedEntry, NormalizedEntryType, utils::patch::ConversationPatch},
    profile::ProfileVariantLabel,
};
use futures::{StreamExt, TryStreamExt, future};
use sqlx::Error as SqlxError;
use thiserror::Error;
use tokio::{sync::RwLock, task::JoinHandle};
use utils::{log_msg::LogMsg, msg_store::MsgStore};
use uuid::Uuid;

use crate::services::{
    git::{GitService, GitServiceError},
    worktree_manager::WorktreeError,
};
pub type ContainerRef = String;

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

    fn task_attempt_to_current_dir(&self, task_attempt: &TaskAttempt) -> PathBuf;

    async fn create(&self, task_attempt: &TaskAttempt) -> Result<ContainerRef, ContainerError>;

    async fn delete(&self, task_attempt: &TaskAttempt) -> Result<(), ContainerError> {
        self.try_stop(task_attempt).await;
        self.delete_inner(task_attempt).await
    }

    async fn try_stop(&self, task_attempt: &TaskAttempt) {
        // stop all execution processes for this attempt
        if let Ok(processes) =
            ExecutionProcess::find_by_task_attempt_id(&self.db().pool, task_attempt.id).await
        {
            for process in processes {
                if process.status == ExecutionProcessStatus::Running {
                    self.stop_execution(&process).await.unwrap_or_else(|e| {
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

    async fn start_execution_inner(
        &self,
        task_attempt: &TaskAttempt,
        execution_process: &ExecutionProcess,
        executor_action: &ExecutorAction,
    ) -> Result<(), ContainerError>;

    async fn stop_execution(
        &self,
        execution_process: &ExecutionProcess,
    ) -> Result<(), ContainerError>;

    async fn try_commit_changes(&self, ctx: &ExecutionContext) -> Result<bool, ContainerError>;

    async fn copy_project_files(
        &self,
        source_dir: &PathBuf,
        target_dir: &PathBuf,
        copy_files: &str,
    ) -> Result<(), ContainerError>;

    async fn get_diff(
        &self,
        task_attempt: &TaskAttempt,
    ) -> Result<futures::stream::BoxStream<'static, Result<Event, std::io::Error>>, ContainerError>;

    /// Fetch the MsgStore for a given execution ID, panicking if missing.
    async fn get_msg_store_by_id(&self, uuid: &Uuid) -> Option<Arc<MsgStore>> {
        let map = self.msg_stores().read().await;
        map.get(uuid).cloned()
    }

    async fn stream_raw_logs(
        &self,
        id: &Uuid,
    ) -> Option<futures::stream::BoxStream<'static, Result<Event, std::io::Error>>> {
        if let Some(store) = self.get_msg_store_by_id(id).await {
            // First try in-memory store
            let counter = Arc::new(AtomicUsize::new(0));
            return Some(
                store
                    .history_plus_stream()
                    .filter(|msg| {
                        future::ready(matches!(msg, Ok(LogMsg::Stdout(..) | LogMsg::Stderr(..))))
                    })
                    .map_ok({
                        let counter = counter.clone();
                        move |m| {
                            let index = counter.fetch_add(1, Ordering::SeqCst);
                            match m {
                                LogMsg::Stdout(content) => {
                                    let patch = ConversationPatch::add_stdout(index, content);
                                    LogMsg::JsonPatch(patch).to_sse_event()
                                }
                                LogMsg::Stderr(content) => {
                                    let patch = ConversationPatch::add_stderr(index, content);
                                    LogMsg::JsonPatch(patch).to_sse_event()
                                }
                                _ => unreachable!("Filter should only pass Stdout/Stderr"),
                            }
                        }
                    })
                    .boxed(),
            );
        } else {
            // Fallback: load from DB and create direct stream
            let logs_record =
                match ExecutionProcessLogs::find_by_execution_id(&self.db().pool, *id).await {
                    Ok(Some(record)) => record,
                    Ok(None) => return None, // No logs exist
                    Err(e) => {
                        tracing::error!("Failed to fetch logs for execution {}: {}", id, e);
                        return None;
                    }
                };

            let messages = match logs_record.parse_logs() {
                Ok(msgs) => msgs,
                Err(e) => {
                    tracing::error!("Failed to parse logs for execution {}: {}", id, e);
                    return None;
                }
            };

            // Direct stream from parsed messages converted to JSON patches
            let stream = futures::stream::iter(
                messages
                    .into_iter()
                    .filter(|m| matches!(m, LogMsg::Stdout(_) | LogMsg::Stderr(_)))
                    .enumerate()
                    .map(|(index, m)| {
                        let event = match m {
                            LogMsg::Stdout(content) => {
                                let patch = ConversationPatch::add_stdout(index, content);
                                LogMsg::JsonPatch(patch).to_sse_event()
                            }
                            LogMsg::Stderr(content) => {
                                let patch = ConversationPatch::add_stderr(index, content);
                                LogMsg::JsonPatch(patch).to_sse_event()
                            }
                            _ => unreachable!("Filter should only pass Stdout/Stderr"),
                        };
                        Ok::<_, std::io::Error>(event)
                    }),
            )
            .chain(futures::stream::once(async {
                Ok::<_, std::io::Error>(LogMsg::Finished.to_sse_event())
            }))
            .boxed();

            Some(stream)
        }
    }

    async fn stream_normalized_logs(
        &self,
        id: &Uuid,
    ) -> Option<futures::stream::BoxStream<'static, Result<Event, std::io::Error>>> {
        // First try in-memory store (existing behavior)
        if let Some(store) = self.get_msg_store_by_id(id).await {
            Some(
                store
                    .history_plus_stream() // BoxStream<Result<LogMsg, io::Error>>
                    .filter(|msg| future::ready(matches!(msg, Ok(LogMsg::JsonPatch(..)))))
                    .map_ok(|m| m.to_sse_event()) // LogMsg -> Event
                    .boxed(),
            )
        } else {
            // Fallback: load from DB and normalize
            let logs_record =
                match ExecutionProcessLogs::find_by_execution_id(&self.db().pool, *id).await {
                    Ok(Some(record)) => record,
                    Ok(None) => return None, // No logs exist
                    Err(e) => {
                        tracing::error!("Failed to fetch logs for execution {}: {}", id, e);
                        return None;
                    }
                };

            let raw_messages = match logs_record.parse_logs() {
                Ok(msgs) => msgs,
                Err(e) => {
                    tracing::error!("Failed to parse logs for execution {}: {}", id, e);
                    return None;
                }
            };

            // Create temporary store and populate
            let temp_store = Arc::new(MsgStore::new());
            for msg in raw_messages {
                if matches!(msg, LogMsg::Stdout(_) | LogMsg::Stderr(_)) {
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
                    if let Ok(executor) =
                        CodingAgent::from_profile_variant_label(&request.profile_variant_label)
                    {
                        // Inject the initial user prompt before normalization (DB fallback path)
                        let user_entry = NormalizedEntry {
                            timestamp: None,
                            entry_type: NormalizedEntryType::UserMessage,
                            content: request.prompt.clone(),
                            metadata: None,
                        };
                        temp_store
                            .push_patch(ConversationPatch::add_normalized_entry(0, user_entry));

                        executor.normalize_logs(temp_store.clone(), &current_dir);
                    } else {
                        tracing::error!(
                            "Failed to resolve profile '{:?}' for normalization",
                            request.profile_variant_label
                        );
                    }
                }
                ExecutorActionType::CodingAgentFollowUpRequest(request) => {
                    if let Ok(executor) =
                        CodingAgent::from_profile_variant_label(&request.profile_variant_label)
                    {
                        // Inject the follow-up user prompt before normalization (DB fallback path)
                        let user_entry = NormalizedEntry {
                            timestamp: None,
                            entry_type: NormalizedEntryType::UserMessage,
                            content: request.prompt.clone(),
                            metadata: None,
                        };
                        temp_store
                            .push_patch(ConversationPatch::add_normalized_entry(0, user_entry));

                        executor.normalize_logs(temp_store.clone(), &current_dir);
                    } else {
                        tracing::error!(
                            "Failed to resolve profile '{:?}' for normalization",
                            request.profile_variant_label
                        );
                    }
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
                    .map_ok(|m| m.to_sse_event())
                    .chain(futures::stream::once(async {
                        Ok::<_, std::io::Error>(LogMsg::Finished.to_sse_event())
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
        profile_variant_label: ProfileVariantLabel,
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

        let cleanup_action = project.cleanup_script.map(|script| {
            Box::new(ExecutorAction::new(
                ExecutorActionType::ScriptRequest(ScriptRequest {
                    script,
                    language: ScriptRequestLanguage::Bash,
                    context: ScriptContext::CleanupScript,
                }),
                None,
            ))
        });

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
                        prompt: task.to_prompt(),
                        profile_variant_label,
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
                    prompt: task.to_prompt(),
                    profile_variant_label,
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
        }
        // Create new execution process record
        let create_execution_process = CreateExecutionProcess {
            task_attempt_id: task_attempt.id,
            executor_action: executor_action.clone(),
            run_reason: run_reason.clone(),
        };

        let execution_process =
            ExecutionProcess::create(&self.db().pool, &create_execution_process, Uuid::new_v4())
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

        let _ = self
            .start_execution_inner(task_attempt, &execution_process, executor_action)
            .await?;

        // Start processing normalised logs for executor requests and follow ups
        match executor_action.typ() {
            ExecutorActionType::CodingAgentInitialRequest(request) => {
                if let Some(msg_store) = self.get_msg_store_by_id(&execution_process.id).await {
                    if let Ok(executor) =
                        CodingAgent::from_profile_variant_label(&request.profile_variant_label)
                    {
                        // Prepend the initial user prompt as a normalized entry
                        let user_entry = NormalizedEntry {
                            timestamp: None,
                            entry_type: NormalizedEntryType::UserMessage,
                            content: request.prompt.clone(),
                            metadata: None,
                        };
                        msg_store
                            .push_patch(ConversationPatch::add_normalized_entry(0, user_entry));

                        executor.normalize_logs(
                            msg_store,
                            &self.task_attempt_to_current_dir(task_attempt),
                        );
                    } else {
                        tracing::error!(
                            "Failed to resolve profile '{:?}' for normalization",
                            request.profile_variant_label
                        );
                    }
                }
            }
            ExecutorActionType::CodingAgentFollowUpRequest(request) => {
                if let Some(msg_store) = self.get_msg_store_by_id(&execution_process.id).await {
                    if let Ok(executor) =
                        CodingAgent::from_profile_variant_label(&request.profile_variant_label)
                    {
                        // Prepend the follow-up user prompt as a normalized entry
                        let user_entry = NormalizedEntry {
                            timestamp: None,
                            entry_type: NormalizedEntryType::UserMessage,
                            content: request.prompt.clone(),
                            metadata: None,
                        };
                        msg_store
                            .push_patch(ConversationPatch::add_normalized_entry(0, user_entry));

                        executor.normalize_logs(
                            msg_store,
                            &self.task_attempt_to_current_dir(task_attempt),
                        );
                    } else {
                        tracing::error!(
                            "Failed to resolve profile '{:?}' for normalization",
                            request.profile_variant_label
                        );
                    }
                }
            }
            _ => {}
        };

        self.spawn_stream_raw_logs_to_db(&execution_process.id);
        Ok(execution_process)
    }

    async fn try_start_next_action(&self, ctx: &ExecutionContext) -> Result<(), ContainerError> {
        let action = ctx.execution_process.executor_action()?;
        let next_action = if let Some(next_action) = action.next_action() {
            next_action
        } else if matches!(
            ctx.execution_process.run_reason,
            ExecutionProcessRunReason::SetupScript
        ) {
            return Err(ContainerError::Other(anyhow::anyhow!(
                "No next action configured for SetupScript"
            )));
        } else {
            tracing::debug!("No next action configured");
            return Ok(());
        };

        // Determine the run reason of the next action
        let next_run_reason = match ctx.execution_process.run_reason {
            ExecutionProcessRunReason::SetupScript => ExecutionProcessRunReason::CodingAgent,
            ExecutionProcessRunReason::CodingAgent => ExecutionProcessRunReason::CleanupScript,
            _ => {
                tracing::warn!(
                    "Unexpected run reason: {:?}, defaulting to current reason",
                    ctx.execution_process.run_reason
                );
                ctx.execution_process.run_reason.clone()
            }
        };

        self.start_execution(&ctx.task_attempt, next_action, &next_run_reason)
            .await?;

        tracing::debug!("Started next action: {:?}", next_action);
        Ok(())
    }
}
