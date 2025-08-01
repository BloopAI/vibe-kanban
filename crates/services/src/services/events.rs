use std::{str::FromStr, sync::Arc};

use anyhow::{Error as AnyhowError, anyhow};
use db::{
    DBService,
    models::{task::Task, task_attempt::TaskAttempt},
};
use json_patch::{Patch, PatchOperation};
use serde::Serialize;
use serde_json::{Value, json};
use sqlx::{Error as SqlxError, sqlite::SqliteOperation};
use strum_macros::{Display, EnumString};
use thiserror::Error;
use tokio::sync::RwLock;
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

const HOOK_TABLES: [&str; 2] = ["tasks", "task_attempts"];

#[derive(EnumString, Display)]
enum HookTables {
    #[strum(to_string = "tasks")]
    Tasks,
    #[strum(to_string = "task_attempts")]
    TaskAttempts,
}

#[derive(Serialize)]
enum RecordTypes {
    Task(Task),
    TaskAttempt(TaskAttempt),
}

#[derive(Serialize)]
struct EventPatchInner {
    db_op: String,
    record: RecordTypes,
}

#[derive(Serialize)]
struct EventPatch {
    op: String,
    path: String,
    value: EventPatchInner,
}

impl EventService {
    /// Sets a hook on the DB to log create/update/delete to the event msg_store
    pub async fn new(db: DBService) -> Result<Self, EventError> {
        let mut conn = db.pool.acquire().await?;
        let mut handle = conn.lock_handle().await?;
        let db_for_hook = db.clone();
        let entry_count = Arc::new(RwLock::new(0));
        let entry_count_for_hook = entry_count.clone();
        let msg_store = Arc::new(MsgStore::new());
        let msg_store_for_hook = msg_store.clone();
        let runtime_handle = tokio::runtime::Handle::current();

        tracing::info!("DEBUG0");

        handle.set_update_hook(move |hook: sqlx::sqlite::UpdateHookResult<'_>| {
            tracing::info!("DEBUG1");

            let runtime_handle = runtime_handle.clone();
            let entry_count_for_hook = entry_count_for_hook.clone();
            let msg_store_for_hook = msg_store_for_hook.clone();
            let db = db_for_hook.clone();
            if let Ok(table) = HookTables::from_str(hook.table) {
                let rowid = hook.rowid;
                runtime_handle.spawn(async move {
                    tracing::info!("DEBUG2");
                    let record_type: RecordTypes = match table {
                        HookTables::Tasks => {
                            let task = Task::find_by_rowid(&db.pool, rowid)
                                .await
                                .ok()
                                .flatten()
                                .unwrap();
                            RecordTypes::Task(task)
                        }
                        HookTables::TaskAttempts => {
                            let task_attempts = TaskAttempt::find_by_rowid(&db.pool, rowid)
                                .await
                                .ok()
                                .flatten()
                                .unwrap();
                            RecordTypes::TaskAttempt(task_attempts)
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
                        path: format!("/entries/{}", next_entry_count),
                        value: EventPatchInner {
                            db_op: db_op.to_string(),
                            record: record_type,
                        },
                    };

                    let patch =
                        serde_json::from_value(serde_json::to_value(event_patch).unwrap()).unwrap();

                    msg_store_for_hook.push_patch(patch);

                    // let patch_res: Result<Patch, _> = serde_json::from_value(json!([{
                    //     "op": "add",
                    //     "path": format!("/entries/{}", next_entry_count),
                    //     "value": event_json
                    // }]));

                    // match patch_res {
                    //     Ok(patch) => {
                    //         msg_store_for_hook.push_patch(patch);
                    //     }
                    //     Err(e) => {
                    //         tracing::error!(
                    //             "failed to build patch for entry {}: {e:?}",
                    //             next_entry_count
                    //         );
                    //     }
                    // }
                });
            }
        });

        Ok(Self {
            msg_store,
            db,
            entry_count,
        })
    }

    pub fn msg_store(&self) -> &Arc<MsgStore> {
        &self.msg_store
    }
}
