use std::{collections::HashMap, sync::Arc};

use anyhow::{Context, Result};
use db::{
    DBService,
    models::{
        coding_agent_turn::CodingAgentTurn, execution_process::ExecutionProcess,
        execution_process_logs::ExecutionProcessLogs,
    },
};
use futures::StreamExt;
use sqlx::SqlitePool;
use tokio::{sync::RwLock, task::JoinHandle};
use utils::{
    assets::prod_asset_dir_path,
    execution_logs::{
        ExecutionLogWriter, process_log_file_path, process_log_file_path_in_root,
        read_execution_log_file,
    },
    log_msg::LogMsg,
    msg_store::MsgStore,
};
use uuid::Uuid;

pub async fn remove_session_process_logs(session_id: Uuid) -> Result<()> {
    let dir = utils::execution_logs::process_logs_session_dir(session_id);
    match tokio::fs::remove_dir_all(&dir).await {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => {
            Err(e).with_context(|| format!("remove session process logs at {}", dir.display()))
        }
    }
}

pub async fn load_raw_log_messages(pool: &SqlitePool, execution_id: Uuid) -> Option<Vec<LogMsg>> {
    if let Some(jsonl) = read_execution_logs_for_execution(pool, execution_id)
        .await
        .inspect_err(|e| {
            tracing::warn!(
                "Failed to read execution log file for execution {}: {:#}",
                execution_id,
                e
            );
        })
        .ok()
        .flatten()
    {
        let messages = utils::execution_logs::parse_log_jsonl_lossy(execution_id, &jsonl);
        if !messages.is_empty() {
            return Some(messages);
        }
    }

    let db_log_records = match ExecutionProcessLogs::find_by_execution_id(pool, execution_id).await
    {
        Ok(records) if !records.is_empty() => records,
        Ok(_) => return None,
        Err(e) => {
            tracing::error!(
                "Failed to fetch DB logs for execution {}: {}",
                execution_id,
                e
            );
            return None;
        }
    };

    match ExecutionProcessLogs::parse_logs(&db_log_records) {
        Ok(msgs) => Some(msgs),
        Err(e) => {
            tracing::error!(
                "Failed to parse DB logs for execution {}: {}",
                execution_id,
                e
            );
            None
        }
    }
}

pub async fn append_log_message(session_id: Uuid, execution_id: Uuid, msg: &LogMsg) -> Result<()> {
    let mut log_writer = ExecutionLogWriter::new_for_execution(session_id, execution_id)
        .await
        .with_context(|| format!("create log writer for execution {}", execution_id))?;
    let json_line = serde_json::to_string(msg)
        .with_context(|| format!("serialize log message for execution {}", execution_id))?;
    let mut json_line_with_newline = json_line;
    json_line_with_newline.push('\n');
    log_writer
        .append_jsonl_line(&json_line_with_newline)
        .await
        .with_context(|| format!("append log message for execution {}", execution_id))?;
    Ok(())
}

pub fn spawn_stream_raw_logs_to_storage(
    msg_stores: Arc<RwLock<HashMap<Uuid, Arc<MsgStore>>>>,
    db: DBService,
    execution_id: Uuid,
    session_id: Uuid,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        let mut log_writer =
            match ExecutionLogWriter::new_for_execution(session_id, execution_id).await {
                Ok(w) => w,
                Err(e) => {
                    tracing::error!(
                        "Failed to create log file writer for execution {}: {}",
                        execution_id,
                        e
                    );
                    return;
                }
            };

        let store = {
            let map = msg_stores.read().await;
            map.get(&execution_id).cloned()
        };

        if let Some(store) = store {
            let mut stream = store.history_plus_stream();

            while let Some(Ok(msg)) = stream.next().await {
                match &msg {
                    LogMsg::Stdout(_) | LogMsg::Stderr(_) => match serde_json::to_string(&msg) {
                        Ok(jsonl_line) => {
                            let mut jsonl_line_with_newline = jsonl_line;
                            jsonl_line_with_newline.push('\n');

                            if let Err(e) =
                                log_writer.append_jsonl_line(&jsonl_line_with_newline).await
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
                    },
                    LogMsg::SessionId(agent_session_id) => {
                        if let Err(e) = CodingAgentTurn::update_agent_session_id(
                            &db.pool,
                            execution_id,
                            agent_session_id,
                        )
                        .await
                        {
                            tracing::error!(
                                "Failed to update agent_session_id {} for execution process {}: {}",
                                agent_session_id,
                                execution_id,
                                e
                            );
                        }
                    }
                    LogMsg::MessageId(agent_message_id) => {
                        if let Err(e) = CodingAgentTurn::update_agent_message_id(
                            &db.pool,
                            execution_id,
                            agent_message_id,
                        )
                        .await
                        {
                            tracing::error!(
                                "Failed to update agent_message_id {} for execution process {}: {}",
                                agent_message_id,
                                execution_id,
                                e
                            );
                        }
                    }
                    LogMsg::Finished => {
                        break;
                    }
                    LogMsg::JsonPatch(_) | LogMsg::Ready => continue,
                }
            }
        }
    })
}

async fn read_execution_logs_for_execution(
    pool: &SqlitePool,
    execution_id: Uuid,
) -> Result<Option<String>> {
    let session_id = if let Some(process) = ExecutionProcess::find_by_id(pool, execution_id).await?
    {
        process.session_id
    } else {
        return Ok(None);
    };
    let path = process_log_file_path(session_id, execution_id);

    match tokio::fs::metadata(&path).await {
        Ok(_) => Ok(Some(read_execution_log_file(&path).await.with_context(
            || format!("read execution log file for execution {execution_id}"),
        )?)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            if cfg!(debug_assertions) {
                // Convenience for local development with a clone of a prod db. Read only access to prod logs.
                let prod_path =
                    process_log_file_path_in_root(&prod_asset_dir_path(), session_id, execution_id);
                match read_execution_log_file(&prod_path).await {
                    Ok(contents) => return Ok(Some(contents)),
                    Err(err) if err.kind() == std::io::ErrorKind::NotFound => {}
                    Err(err) => {
                        return Err(err).with_context(|| {
                            format!(
                                "read execution log file for execution {execution_id} from {}",
                                prod_path.display()
                            )
                        });
                    }
                }
            }
            Ok(None)
        }
        Err(e) => Err(e).with_context(|| {
            format!(
                "check execution log file exists for execution {execution_id} at {}",
                path.display()
            )
        }),
    }
}
