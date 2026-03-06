use std::{str::FromStr, sync::Arc};

use db::{
    DBService,
    models::{
        execution_process::ExecutionProcess, scratch::Scratch, session::Session,
        workspace::Workspace,
    },
};
use serde_json::json;
use sqlx::{Error as SqlxError, Sqlite, SqlitePool, decode::Decode, sqlite::SqliteOperation};
use tokio::sync::RwLock;
use utils::msg_store::MsgStore;
use uuid::Uuid;

#[path = "events/patches.rs"]
pub mod patches;
#[path = "events/streams.rs"]
mod streams;
#[path = "events/types.rs"]
pub mod types;

pub use patches::{execution_process_patch, scratch_patch, workspace_patch};
pub use types::{EventError, EventPatch, EventPatchInner, HookTables, RecordTypes};

#[derive(Clone)]
pub struct EventService {
    msg_store: Arc<MsgStore>,
    db: DBService,
    #[allow(dead_code)]
    entry_count: Arc<RwLock<usize>>,
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

    async fn push_workspace_update_for_session(
        pool: &SqlitePool,
        msg_store: Arc<MsgStore>,
        session_id: Uuid,
    ) -> Result<(), SqlxError> {
        if let Some(session) = Session::find_by_id(pool, session_id).await?
            && let Some(workspace_with_status) =
                Workspace::find_by_id_with_status(pool, session.workspace_id).await?
        {
            msg_store.push_patch(workspace_patch::replace(&workspace_with_status));
        }
        Ok(())
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
                handle.set_preupdate_hook({
                    let msg_store_for_preupdate = msg_store_for_hook.clone();
                    move |preupdate: sqlx::sqlite::PreupdateHookResult<'_>| {
                        if preupdate.operation != SqliteOperation::Delete {
                            return;
                        }

                        match preupdate.table {
                            "workspaces" => {
                                if let Ok(value) = preupdate.get_old_column_value(0)
                                    && let Ok(workspace_id) =
                                        <Uuid as Decode<Sqlite>>::decode(value)
                                {
                                    let patch = workspace_patch::remove(workspace_id);
                                    msg_store_for_preupdate.push_patch(patch);
                                }
                            }
                            "execution_processes" => {
                                if let Ok(value) = preupdate.get_old_column_value(0)
                                    && let Ok(process_id) = <Uuid as Decode<Sqlite>>::decode(value)
                                {
                                    let patch = execution_process_patch::remove(process_id);
                                    msg_store_for_preupdate.push_patch(patch);
                                }
                            }
                            "scratch" => {
                                // Composite key: need both id (column 0) and scratch_type (column 1)
                                if let Ok(id_val) = preupdate.get_old_column_value(0)
                                    && let Ok(scratch_id) = <Uuid as Decode<Sqlite>>::decode(id_val)
                                    && let Ok(type_val) = preupdate.get_old_column_value(1)
                                    && let Ok(type_str) =
                                        <String as Decode<Sqlite>>::decode(type_val)
                                {
                                    let patch = scratch_patch::remove(scratch_id, &type_str);
                                    msg_store_for_preupdate.push_patch(patch);
                                }
                            }
                            _ => {}
                        }
                    }
                });

                handle.set_update_hook(move |hook: sqlx::sqlite::UpdateHookResult<'_>| {
                    let runtime_handle = runtime_handle.clone();
                    let entry_count_for_hook = entry_count_for_hook.clone();
                    let msg_store_for_hook = msg_store_for_hook.clone();
                    let db = db_for_hook.clone();

                    if let Ok(table) = HookTables::from_str(hook.table) {
                        let rowid = hook.rowid;
                        runtime_handle.spawn(async move {
                            let record_type: RecordTypes = match (table, hook.operation.clone()) {
                                (HookTables::Workspaces, SqliteOperation::Delete)
                                | (HookTables::ExecutionProcesses, SqliteOperation::Delete)
                                | (HookTables::Scratch, SqliteOperation::Delete) => {
                                    return;
                                }
                                (HookTables::Workspaces, _) => {
                                    match Workspace::find_by_rowid(&db.pool, rowid).await {
                                        Ok(Some(workspace)) => RecordTypes::Workspace(workspace),
                                        Ok(None) => RecordTypes::DeletedWorkspace {
                                            rowid,
                                        },
                                        Err(e) => {
                                            tracing::error!(
                                                "Failed to fetch workspace: {:?}",
                                                e
                                            );
                                            return;
                                        }
                                    }
                                }
                                (HookTables::ExecutionProcesses, _) => {
                                    match ExecutionProcess::find_by_rowid(&db.pool, rowid).await {
                                        Ok(Some(process)) => RecordTypes::ExecutionProcess(process),
                                        Ok(None) => RecordTypes::DeletedExecutionProcess {
                                            rowid,
                                            session_id: None,
                                            process_id: None,
                                        },
                                        Err(e) => {
                                            tracing::error!(
                                                "Failed to fetch execution_process: {:?}",
                                                e
                                            );
                                            return;
                                        }
                                    }
                                }
                                (HookTables::Scratch, _) => {
                                    match Scratch::find_by_rowid(&db.pool, rowid).await {
                                        Ok(Some(scratch)) => RecordTypes::Scratch(scratch),
                                        Ok(None) => RecordTypes::DeletedScratch {
                                            rowid,
                                            scratch_id: None,
                                            scratch_type: None,
                                        },
                                        Err(e) => {
                                            tracing::error!("Failed to fetch scratch: {:?}", e);
                                            return;
                                        }
                                    }
                                }
                            };

                            let db_op: &str = match hook.operation {
                                SqliteOperation::Insert => "insert",
                                SqliteOperation::Delete => "delete",
                                SqliteOperation::Update => "update",
                                SqliteOperation::Unknown(_) => "unknown",
                            };

                            // Handle operations with direct patches
                            match &record_type {
                                RecordTypes::Scratch(scratch) => {
                                    let patch = match hook.operation {
                                        SqliteOperation::Insert => scratch_patch::add(scratch),
                                        SqliteOperation::Update => scratch_patch::replace(scratch),
                                        _ => scratch_patch::replace(scratch),
                                    };
                                    msg_store_for_hook.push_patch(patch);
                                    return;
                                }
                                RecordTypes::DeletedScratch {
                                    scratch_id: Some(scratch_id),
                                    scratch_type: Some(scratch_type_str),
                                    ..
                                } => {
                                    let patch = scratch_patch::remove(*scratch_id, scratch_type_str);
                                    msg_store_for_hook.push_patch(patch);
                                    return;
                                }
                                RecordTypes::Workspace(workspace) => {
                                    // Emit workspace patch with status
                                    if let Ok(Some(workspace_with_status)) =
                                        Workspace::find_by_id_with_status(&db.pool, workspace.id)
                                            .await
                                    {
                                        let patch = match hook.operation {
                                            SqliteOperation::Insert => {
                                                workspace_patch::add(&workspace_with_status)
                                            }
                                            _ => workspace_patch::replace(&workspace_with_status),
                                        };
                                        msg_store_for_hook.push_patch(patch);
                                    }
                                    return;
                                }
                                RecordTypes::DeletedWorkspace { .. } => {
                                    return;
                                }
                                RecordTypes::ExecutionProcess(process) => {
                                    let patch = match hook.operation {
                                        SqliteOperation::Insert => {
                                            execution_process_patch::add(process)
                                        }
                                        SqliteOperation::Update => {
                                            execution_process_patch::replace(process)
                                        }
                                        _ => execution_process_patch::replace(process), // fallback
                                    };
                                    msg_store_for_hook.push_patch(patch);

                                    if let Err(err) = EventService::push_workspace_update_for_session(
                                        &db.pool,
                                        msg_store_for_hook.clone(),
                                        process.session_id,
                                    )
                                    .await
                                    {
                                        tracing::error!(
                                            "Failed to push workspace update after execution process change: {:?}",
                                            err
                                        );
                                    }

                                    return;
                                }
                                RecordTypes::DeletedExecutionProcess {
                                    process_id: Some(process_id),
                                    session_id,
                                    ..
                                } => {
                                    let patch = execution_process_patch::remove(*process_id);
                                    msg_store_for_hook.push_patch(patch);

                                    if let Some(session_id) = session_id
                                        && let Err(err) =
                                            EventService::push_workspace_update_for_session(
                                                &db.pool,
                                                msg_store_for_hook.clone(),
                                                *session_id,
                                            )
                                            .await
                                        {
                                            tracing::error!(
                                                "Failed to push workspace update after execution process removal: {:?}",
                                                err
                                            );
                                    }

                                    return;
                                }
                                _ => {}
                            }

                            // Fallback: use the old entries format for other record types
                            let next_entry_count = {
                                let mut entry_count = entry_count_for_hook.write().await;
                                *entry_count += 1;
                                *entry_count
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
