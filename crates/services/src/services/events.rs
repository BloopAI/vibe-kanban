use std::{str::FromStr, sync::Arc};

use anyhow::Error as AnyhowError;
use db::{
    DBService,
    models::{execution_process::ExecutionProcess, task::Task, task_attempt::TaskAttempt},
};
use serde::Serialize;
use serde_json::json;
use sqlx::{Error as SqlxError, sqlite::SqliteOperation};
use strum_macros::{Display, EnumString};
use thiserror::Error;
use tokio::sync::RwLock;
use ts_rs::TS;
use utils::msg_store::MsgStore;

#[derive(Debug, Error)]
pub enum EventError {
    #[error(transparent)]
    Sqlx(#[from] SqlxError),
    #[error(transparent)]
    Parse(#[from] serde_json::Error),
    #[error(transparent)]
    Other(#[from] AnyhowError), // Catches any unclassified errors
}

#[derive(Clone)]
pub struct EventService {
    msg_store: Arc<MsgStore>,
    db: DBService,
    entry_count: Arc<RwLock<usize>>,
}

#[derive(EnumString, Display)]
enum HookTables {
    #[strum(to_string = "tasks")]
    Tasks,
    #[strum(to_string = "task_attempts")]
    TaskAttempts,
    #[strum(to_string = "execution_processes")]
    ExecutionProcesses,
}

#[derive(Serialize, TS)]
#[serde(tag = "type", content = "data", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RecordTypes {
    Task(Task),
    TaskAttempt(TaskAttempt),
    ExecutionProcess(ExecutionProcess),
    DeletedTask { rowid: i64 },
    DeletedTaskAttempt { rowid: i64 },
    DeletedExecutionProcess { rowid: i64 },
}

#[derive(Serialize, TS)]
pub struct EventPatchInner {
    db_op: String,
    record: RecordTypes,
}

#[derive(Serialize, TS)]
pub struct EventPatch {
    op: String,
    path: String,
    value: EventPatchInner,
}

impl EventService {
    /// Creates a new EventService that will work with a DBService configured with hooks
    pub fn new(db: DBService, msg_store: Arc<MsgStore>, entry_count: Arc<RwLock<usize>>) -> Self {
        Self {
            msg_store,
            db,
            entry_count,
        }
    }

    /// Creates the hook function that should be used with DBService::new_with_after_connect
    pub fn create_hook(
        msg_store: Arc<MsgStore>,
        entry_count: Arc<RwLock<usize>>,
        db_service: DBService,
    ) -> impl for<'a> Fn(
        &'a mut sqlx::sqlite::SqliteConnection,
    ) -> std::pin::Pin<
        Box<dyn std::future::Future<Output = Result<(), sqlx::Error>> + Send + 'a>,
    > + Send
    + Sync
    + 'static {
        move |conn: &mut sqlx::sqlite::SqliteConnection| {
            let msg_store_for_hook = msg_store.clone();
            let entry_count_for_hook = entry_count.clone();
            let db_for_hook = db_service.clone();

            Box::pin(async move {
                let mut handle = conn.lock_handle().await?;
                let runtime_handle = tokio::runtime::Handle::current();
                handle.set_update_hook(move |hook: sqlx::sqlite::UpdateHookResult<'_>| {
                    let runtime_handle = runtime_handle.clone();
                    let entry_count_for_hook = entry_count_for_hook.clone();
                    let msg_store_for_hook = msg_store_for_hook.clone();
                    let db = db_for_hook.clone();

                    if let Ok(table) = HookTables::from_str(hook.table) {
                        let rowid = hook.rowid;
                        runtime_handle.spawn(async move {
                            let record_type: RecordTypes = match (table, hook.operation.clone()) {
                                (HookTables::Tasks, SqliteOperation::Delete) => {
                                    RecordTypes::DeletedTask { rowid }
                                }
                                (HookTables::TaskAttempts, SqliteOperation::Delete) => {
                                    RecordTypes::DeletedTaskAttempt { rowid }
                                }
                                (HookTables::ExecutionProcesses, SqliteOperation::Delete) => {
                                    RecordTypes::DeletedExecutionProcess { rowid }
                                }
                                (HookTables::Tasks, _) => {
                                    match Task::find_by_rowid(&db.pool, rowid).await {
                                        Ok(Some(task)) => RecordTypes::Task(task),
                                        Ok(None) => RecordTypes::DeletedTask { rowid },
                                        Err(e) => {
                                            tracing::error!("Failed to fetch task: {:?}", e);
                                            return;
                                        }
                                    }
                                }
                                (HookTables::TaskAttempts, _) => {
                                    match TaskAttempt::find_by_rowid(&db.pool, rowid).await {
                                        Ok(Some(attempt)) => RecordTypes::TaskAttempt(attempt),
                                        Ok(None) => RecordTypes::DeletedTaskAttempt { rowid },
                                        Err(e) => {
                                            tracing::error!(
                                                "Failed to fetch task_attempt: {:?}",
                                                e
                                            );
                                            return;
                                        }
                                    }
                                }
                                (HookTables::ExecutionProcesses, _) => {
                                    match ExecutionProcess::find_by_rowid(&db.pool, rowid).await {
                                        Ok(Some(process)) => RecordTypes::ExecutionProcess(process),
                                        Ok(None) => RecordTypes::DeletedExecutionProcess { rowid },
                                        Err(e) => {
                                            tracing::error!(
                                                "Failed to fetch execution_process: {:?}",
                                                e
                                            );
                                            return;
                                        }
                                    }
                                }
                            };

                            let next_entry_count = {
                                let mut entry_count = entry_count_for_hook.write().await;
                                *entry_count += 1;
                                *entry_count
                            };

                            let db_op: &str = match hook.operation {
                                SqliteOperation::Insert => "insert",
                                SqliteOperation::Delete => "delete",
                                SqliteOperation::Update => "update",
                                SqliteOperation::Unknown(_) => "unknown",
                            };

                            let event_patch: EventPatch = EventPatch {
                                op: "add".to_string(),
                                path: format!("/entries/{next_entry_count}"),
                                value: EventPatchInner {
                                    db_op: db_op.to_string(),
                                    record: record_type,
                                },
                            };

                            let patch =
                                serde_json::from_value(json!([
                                    serde_json::to_value(event_patch).unwrap()
                                ]))
                                .unwrap();

                            msg_store_for_hook.push_patch(patch);
                        });
                    }
                });

                Ok(())
            })
        }
    }

    pub fn msg_store(&self) -> &Arc<MsgStore> {
        &self.msg_store
    }
}
