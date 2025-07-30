use std::{collections::HashMap, sync::Arc};

use anyhow::{Error as AnyhowError, anyhow};
use async_trait::async_trait;
use axum::response::sse::Event;
use command_group::AsyncGroupChild;
use db::{
    DBService,
    models::{
        execution_process::ExecutionProcess,
        execution_process_logs::{self, ExecutionProcessLogs},
        task_attempt::TaskAttempt,
    },
};
use executors::{
    actions::ExecutorActions,
    executors::ExecutorError,
    logs::{LogNormalizer, amp::AmpLogNormalizer},
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

    async fn create(&self, task_attempt: &TaskAttempt) -> Result<ContainerRef, ContainerError>;

    async fn start_execution(
        &self,
        task_attempt: &TaskAttempt,
        executor_action: &ExecutorActions,
    ) -> Result<ExecutionProcess, ContainerError>;

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
            Some(
                store
                    .history_plus_stream() // BoxStream<Result<LogMsg, io::Error>>
                    .await
                    .filter(|msg| {
                        future::ready(matches!(msg, Ok(LogMsg::Stdout(..) | LogMsg::Stderr(..))))
                    })
                    .map_ok(|m| m.to_sse_event()) // LogMsg -> Event
                    .boxed(),
            )
        } else {
            None
        }
    }

    async fn stream_normalized_logs(
        &self,
        id: &Uuid,
    ) -> Option<futures::stream::BoxStream<'static, Result<Event, std::io::Error>>> {
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
            None
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
                                        eprintln!(
                                            "Failed to append log line for execution {}: {}",
                                            execution_id, e
                                        );
                                    }
                                }
                                Err(e) => {
                                    eprintln!(
                                        "Failed to serialize log message for execution {}: {}",
                                        execution_id, e
                                    );
                                }
                            }
                        }
                        LogMsg::Finished => {
                            break;
                        }
                        _ => continue,
                    }
                }
            }
        });

        handle
    }
}
