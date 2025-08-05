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
        execution_process::{CreateExecutionProcess, ExecutionProcess, ExecutionProcessRunReason},
        execution_process_logs::ExecutionProcessLogs,
        executor_session::{CreateExecutorSession, ExecutorSession},
        task_attempt::TaskAttempt,
    },
};
use executors::{
    actions::ExecutorActions,
    executors::{ExecutorError, StandardCodingAgentExecutor},
    logs::{NormalizedEntry, NormalizedEntryType, utils::patch::ConversationPatch},
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
    Other(#[from] AnyhowError), // Catches any unclassified errors
}

#[async_trait]
pub trait ContainerService {
    fn msg_stores(&self) -> &Arc<RwLock<HashMap<Uuid, Arc<MsgStore>>>>;

    fn db(&self) -> &DBService;

    fn git(&self) -> &GitService;

    fn task_attempt_to_current_dir(&self, task_attempt: &TaskAttempt) -> PathBuf;

    async fn create(&self, task_attempt: &TaskAttempt) -> Result<ContainerRef, ContainerError>;

    async fn ensure_container_exists(
        &self,
        task_attempt: &TaskAttempt,
    ) -> Result<ContainerRef, ContainerError>;

    async fn start_execution_inner(
        &self,
        task_attempt: &TaskAttempt,
        execution_process: &ExecutionProcess,
        executor_action: &ExecutorActions,
    ) -> Result<(), ContainerError>;

    async fn stop_execution(
        &self,
        execution_process: &ExecutionProcess,
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
                    .await
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
                    .await
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

            let current_dir = self.task_attempt_to_current_dir(&task_attempt);

            // Spawn normalizer on populated store
            match process.executor_actions() {
                ExecutorActions::CodingAgentInitialRequest(request) => {
                    request
                        .executor
                        .normalize_logs(temp_store.clone(), &current_dir);
                }
                ExecutorActions::CodingAgentFollowUpRequest(request) => {
                    request
                        .executor
                        .normalize_logs(temp_store.clone(), &current_dir);
                }
                _ => {
                    tracing::debug!(
                        "Executor action doesn't support log normalization: {:?}",
                        process.executor_actions()
                    );
                    return None;
                }
            }

            Some(
                temp_store
                    .history_plus_stream()
                    .await
                    .filter(|msg| future::ready(matches!(msg, Ok(LogMsg::JsonPatch(..)))))
                    .map_ok(|m| m.to_sse_event())
                    .boxed(),
            )
        }
    }

    fn spawn_stream_raw_logs_to_db(&self, execution_id: &Uuid) -> JoinHandle<()> {
        let execution_id = *execution_id;
        let msg_stores = self.msg_stores().clone();
        let db = self.db().clone();

        let handle = tokio::spawn(async move {
            // Get the message store for this execution
            let store = {
                let map = msg_stores.read().await;
                map.get(&execution_id).cloned()
            };

            if let Some(store) = store {
                let mut stream = store.history_plus_stream().await;

                while let Some(Ok(msg)) = stream.next().await {
                    match &msg {
                        LogMsg::Stdout(_) | LogMsg::Stderr(_) => {
                            // Serialize this individual message as a JSONL line
                            match serde_json::to_string(&msg) {
                                Ok(jsonl_line) => {
                                    let jsonl_line_with_newline = format!("{}\n", jsonl_line);

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
        });

        handle
    }

    async fn start_execution(
        &self,
        task_attempt: &TaskAttempt,
        executor_action: &ExecutorActions,
        run_reason: &ExecutionProcessRunReason,
    ) -> Result<ExecutionProcess, ContainerError> {
        // Create new execution process record
        let create_execution_process = CreateExecutionProcess {
            task_attempt_id: task_attempt.id,
            executor_action: executor_action.clone(),
            run_reason: run_reason.clone(),
        };

        let execution_process =
            ExecutionProcess::create(&self.db().pool, &create_execution_process, Uuid::new_v4())
                .await?;

        if let ExecutorActions::CodingAgentInitialRequest(coding_agent_request) = executor_action {
            let create_executor_data = CreateExecutorSession {
                task_attempt_id: task_attempt.id,
                execution_process_id: execution_process.id,
                prompt: Some(coding_agent_request.prompt.clone()),
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
        match executor_action {
            ExecutorActions::CodingAgentInitialRequest(request) => {
                if let Some(msg_store) = self.get_msg_store_by_id(&execution_process.id).await {
                    request
                        .executor
                        .normalize_logs(msg_store, &self.task_attempt_to_current_dir(task_attempt));
                }
            }
            ExecutorActions::CodingAgentFollowUpRequest(request) => {
                if let Some(msg_store) = self.get_msg_store_by_id(&execution_process.id).await {
                    request
                        .executor
                        .normalize_logs(msg_store, &self.task_attempt_to_current_dir(task_attempt));
                }
            }
            _ => {}
        };

        self.spawn_stream_raw_logs_to_db(&execution_process.id);
        Ok(execution_process)
    }
}
