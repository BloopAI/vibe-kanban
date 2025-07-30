use std::{collections::HashMap, path::PathBuf, sync::Arc};

use anyhow::{Error as AnyhowError, anyhow};
use async_trait::async_trait;
use axum::response::sse::Event;
use command_group::AsyncGroupChild;
use db::{
    DBService,
    models::{
        execution_process::{CreateExecutionProcess, ExecutionProcess, ExecutionProcessType},
        execution_process_logs::{self, ExecutionProcessLogs},
        executor_session::{CreateExecutorSession, ExecutorSession},
        task,
        task_attempt::TaskAttempt,
    },
};
use executors::{
    actions::{ExecutorActions, script::ScriptContext},
    executors::{ExecutorError, standard::StandardCodingAgentExecutor},
};
use futures::{StreamExt, TryStreamExt, future, stream::select};
use sqlx::Error as SqlxError;
use thiserror::Error;
use tokio::{sync::RwLock, task::JoinHandle};
use tokio_util::io::ReaderStream;
use utils::{log_msg::LogMsg, msg_store::MsgStore};
use uuid::Uuid;

use crate::services::git::GitServiceError;
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
    Other(#[from] AnyhowError), // Catches any unclassified errors
}

#[async_trait]
pub trait ContainerService {
    fn msg_stores(&self) -> &Arc<RwLock<HashMap<Uuid, Arc<MsgStore>>>>;

    fn db(&self) -> &DBService;

    fn task_attempt_to_current_dir(&self, task_attempt: &TaskAttempt) -> PathBuf;

    async fn create(&self, task_attempt: &TaskAttempt) -> Result<ContainerRef, ContainerError>;

    async fn start_execution_inner(
        &self,
        task_attempt: &TaskAttempt,
        execution_process: &ExecutionProcess,
        executor_action: &ExecutorActions,
    ) -> Result<(), ContainerError>;

    fn create_execution_process_from_action(
        task_attempt: &TaskAttempt,
        executor_action: &ExecutorActions,
    ) -> CreateExecutionProcess {
        match executor_action {
            ExecutorActions::StandardCodingAgentRequest(standard_coding_agent_request) => {
                CreateExecutionProcess {
                    task_attempt_id: task_attempt.id,
                    process_type: ExecutionProcessType::CodingAgent,
                    // executor_type: Some(standard_coding_agent_request.executor.to_string()),
                    executor_type: None,
                }
            }
            ExecutorActions::StandardFollowUpCodingAgentRequest(
                standard_follow_up_coding_agent_request,
            ) => CreateExecutionProcess {
                task_attempt_id: task_attempt.id,
                process_type: ExecutionProcessType::CodingAgent,
                // executor_type: Some(standard_follow_up_coding_agent_request.executor.to_string()),
                executor_type: None,
            },
            ExecutorActions::ScriptRequest(script_request) => CreateExecutionProcess {
                task_attempt_id: task_attempt.id,
                process_type: match script_request.context {
                    ScriptContext::SetupScript => ExecutionProcessType::SetupScript,
                    ScriptContext::CleanupScript => ExecutionProcessType::CleanupScript,
                    ScriptContext::DevServer => ExecutionProcessType::DevServer,
                },
                executor_type: None,
            },
        }
    }

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
            return Some(
                store
                    .history_plus_stream()
                    .await
                    .filter(|msg| {
                        future::ready(matches!(msg, Ok(LogMsg::Stdout(..) | LogMsg::Stderr(..))))
                    })
                    .map_ok(|m| m.to_sse_event())
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

            // Direct stream from parsed messages (no MsgStore overhead)
            let stream = futures::stream::iter(
                messages
                    .into_iter()
                    .filter(|m| matches!(m, LogMsg::Stdout(_) | LogMsg::Stderr(_)))
                    .map(|m| Ok::<_, std::io::Error>(m.to_sse_event())),
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

            // TODO: Reimplement in-memory normaliser for finished executions
            // // Spawn normalizer on populated store
            // let normalizer = AmpLogNormalizer {};
            // normalizer.normalize_logs(temp_store.clone(), &PathBuf::from("/"));

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
    ) -> Result<ExecutionProcess, ContainerError> {
        // Create new execution process record
        let create_execution_process =
            Self::create_execution_process_from_action(&task_attempt, &executor_action);

        let execution_process =
            ExecutionProcess::create(&self.db().pool, &create_execution_process, Uuid::new_v4())
                .await?;

        if let ExecutorActions::StandardCodingAgentRequest(coding_agent_request) = executor_action {
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
            ExecutorActions::StandardCodingAgentRequest(request) => {
                if let Some(msg_store) = self.get_msg_store_by_id(&execution_process.id).await {
                    request
                        .executor
                        .normalize_logs(msg_store, &self.task_attempt_to_current_dir(task_attempt));
                }
            }
            ExecutorActions::StandardFollowUpCodingAgentRequest(request) => {
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
