use std::{str::FromStr, sync::Arc};

use db::{
    DBService,
    models::{
        draft::{Draft, DraftType},
        execution_process::ExecutionProcess,
        task::Task,
        task_attempt::TaskAttempt,
    },
};
use serde_json::json;
use sqlx::{Error as SqlxError, SqlitePool, sqlite::SqliteOperation};
use tokio::sync::RwLock;
use utils::msg_store::MsgStore;
use uuid::Uuid;

#[path = "events/patches.rs"]
pub mod patches;
#[path = "events/streams.rs"]
mod streams;
#[path = "events/types.rs"]
pub mod types;

pub use patches::{draft_patch, execution_process_patch, task_patch};
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

    async fn push_task_update_for_task(
        pool: &SqlitePool,
        msg_store: Arc<MsgStore>,
        task_id: Uuid,
    ) -> Result<(), SqlxError> {
        if let Some(task) = Task::find_by_id(pool, task_id).await? {
            let tasks = Task::find_by_project_id_with_attempt_status(pool, task.project_id).await?;

            if let Some(task_with_status) = tasks
                .into_iter()
                .find(|task_with_status| task_with_status.id == task_id)
            {
                msg_store.push_patch(task_patch::replace(&task_with_status));
            }
        }

        Ok(())
    }

    async fn push_task_update_for_attempt(
        pool: &SqlitePool,
        msg_store: Arc<MsgStore>,
        attempt_id: Uuid,
    ) -> Result<(), SqlxError> {
        if let Some(attempt) = TaskAttempt::find_by_id(pool, attempt_id).await? {
            Self::push_task_update_for_task(pool, msg_store, attempt.task_id).await?;
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
                                    // Try to get task before deletion to capture project_id and task_id
                                    let task_info =
                                        Task::find_by_rowid(&db.pool, rowid).await.ok().flatten();
                                    RecordTypes::DeletedTask {
                                        rowid,
                                        project_id: task_info.as_ref().map(|t| t.project_id),
                                        task_id: task_info.as_ref().map(|t| t.id),
                                    }
                                }
                                (HookTables::TaskAttempts, SqliteOperation::Delete) => {
                                    // Try to get task_attempt before deletion to capture task_id
                                    let task_id = TaskAttempt::find_by_rowid(&db.pool, rowid)
                                        .await
                                        .ok()
                                        .flatten()
                                        .map(|attempt| attempt.task_id);
                                    RecordTypes::DeletedTaskAttempt { rowid, task_id }
                                }
                                (HookTables::ExecutionProcesses, SqliteOperation::Delete) => {
                                    // Try to get execution_process before deletion to capture full process data
                                    if let Ok(Some(process)) =
                                        ExecutionProcess::find_by_rowid(&db.pool, rowid).await
                                    {
                                        RecordTypes::DeletedExecutionProcess {
                                            rowid,
                                            task_attempt_id: Some(process.task_attempt_id),
                                            process_id: Some(process.id),
                                        }
                                    } else {
                                        RecordTypes::DeletedExecutionProcess {
                                            rowid,
                                            task_attempt_id: None,
                                            process_id: None,
                                        }
                                    }
                                }
                                (HookTables::Tasks, _) => {
                                    match Task::find_by_rowid(&db.pool, rowid).await {
                                        Ok(Some(task)) => RecordTypes::Task(task),
                                        Ok(None) => RecordTypes::DeletedTask {
                                            rowid,
                                            project_id: None,
                                            task_id: None,
                                        },
                                        Err(e) => {
                                            tracing::error!("Failed to fetch task: {:?}", e);
                                            return;
                                        }
                                    }
                                }
                                (HookTables::TaskAttempts, _) => {
                                    match TaskAttempt::find_by_rowid(&db.pool, rowid).await {
                                        Ok(Some(attempt)) => RecordTypes::TaskAttempt(attempt),
                                        Ok(None) => RecordTypes::DeletedTaskAttempt {
                                            rowid,
                                            task_id: None,
                                        },
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
                                        Ok(None) => RecordTypes::DeletedExecutionProcess {
                                            rowid,
                                            task_attempt_id: None,
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
                                (HookTables::Drafts, SqliteOperation::Delete) => {
                                    // Try to get draft before deletion to capture attempt id and type
                                    match Draft::find_by_rowid(&db.pool, rowid).await {
                                        Ok(Some(d)) => RecordTypes::DeletedDraft {
                                            rowid,
                                            draft_type: d.draft_type,
                                            task_attempt_id: Some(d.task_attempt_id),
                                        },
                                        _ => {
                                            // Default to retry deletion when type unknown; follow-ups are not deleted in normal flows
                                            RecordTypes::DeletedDraft {
                                                rowid,
                                                draft_type: DraftType::Retry,
                                                task_attempt_id: None,
                                            }
                                        }
                                    }
                                }
                                (HookTables::Drafts, _) => {
                                    match Draft::find_by_rowid(&db.pool, rowid).await {
                                        Ok(Some(draft)) => match draft.draft_type {
                                            DraftType::FollowUp => RecordTypes::Draft(draft),
                                            DraftType::Retry => RecordTypes::RetryDraft(draft),
                                        },
                                        Ok(None) => RecordTypes::DeletedDraft {
                                            rowid,
                                            draft_type: DraftType::Retry,
                                            task_attempt_id: None,
                                        },
                                        Err(e) => {
                                            tracing::error!("Failed to fetch draft: {:?}", e);
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

                            // Handle task-related operations with direct patches
                            match &record_type {
                                RecordTypes::Task(task) => {
                                    // Convert Task to TaskWithAttemptStatus
                                    if let Ok(task_list) =
                                        Task::find_by_project_id_with_attempt_status(
                                            &db.pool,
                                            task.project_id,
                                        )
                                        .await
                                        && let Some(task_with_status) =
                                            task_list.into_iter().find(|t| t.id == task.id)
                                    {
                                        let patch = match hook.operation {
                                            SqliteOperation::Insert => {
                                                task_patch::add(&task_with_status)
                                            }
                                            SqliteOperation::Update => {
                                                task_patch::replace(&task_with_status)
                                            }
                                            _ => task_patch::replace(&task_with_status), // fallback
                                        };
                                        msg_store_for_hook.push_patch(patch);
                                        return;
                                    }
                                }
                                // Draft updates: emit direct patches used by the follow-up draft stream
                                RecordTypes::Draft(draft) => {
                                    let patch = draft_patch::follow_up_replace(draft);
                                    msg_store_for_hook.push_patch(patch);
                                    return;
                                }
                                RecordTypes::RetryDraft(draft) => {
                                    let patch = draft_patch::retry_replace(draft);
                                    msg_store_for_hook.push_patch(patch);
                                    return;
                                }
                                RecordTypes::DeletedDraft { draft_type, task_attempt_id: Some(id), .. } => {
                                    let patch = match draft_type {
                                        DraftType::FollowUp => draft_patch::follow_up_clear(*id),
                                        DraftType::Retry => draft_patch::retry_clear(*id),
                                    };
                                    msg_store_for_hook.push_patch(patch);
                                    return;
                                }
                                RecordTypes::DeletedTask {
                                    task_id: Some(task_id),
                                    ..
                                } => {
                                    let patch = task_patch::remove(*task_id);
                                    msg_store_for_hook.push_patch(patch);
                                    return;
                                }
                                RecordTypes::TaskAttempt(attempt) => {
                                    // Task attempts should update the parent task with fresh data
                                    if let Ok(Some(task)) =
                                        Task::find_by_id(&db.pool, attempt.task_id).await
                                        && let Ok(task_list) =
                                            Task::find_by_project_id_with_attempt_status(
                                                &db.pool,
                                                task.project_id,
                                            )
                                            .await
                                        && let Some(task_with_status) =
                                            task_list.into_iter().find(|t| t.id == attempt.task_id)
                                    {
                                        let patch = task_patch::replace(&task_with_status);
                                        msg_store_for_hook.push_patch(patch);
                                        return;
                                    }
                                }
                                RecordTypes::DeletedTaskAttempt {
                                    task_id: Some(task_id),
                                    ..
                                } => {
                                    // Task attempt deletion should update the parent task with fresh data
                                    if let Ok(Some(task)) =
                                        Task::find_by_id(&db.pool, *task_id).await
                                        && let Ok(task_list) =
                                            Task::find_by_project_id_with_attempt_status(
                                                &db.pool,
                                                task.project_id,
                                            )
                                            .await
                                        && let Some(task_with_status) =
                                            task_list.into_iter().find(|t| t.id == *task_id)
                                    {
                                        let patch = task_patch::replace(&task_with_status);
                                        msg_store_for_hook.push_patch(patch);
                                        return;
                                    }
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

                                    if let Err(err) = EventService::push_task_update_for_attempt(
                                        &db.pool,
                                        msg_store_for_hook.clone(),
                                        process.task_attempt_id,
                                    )
                                    .await
                                    {
                                        tracing::error!(
                                            "Failed to push task update after execution process change: {:?}",
                                            err
                                        );
                                    }

                                    return;
                                }
                                RecordTypes::DeletedExecutionProcess {
                                    process_id: Some(process_id),
                                    task_attempt_id,
                                    ..
                                } => {
                                    let patch = execution_process_patch::remove(*process_id);
                                    msg_store_for_hook.push_patch(patch);

                                    if let Some(task_attempt_id) = task_attempt_id
                                        && let Err(err) =
                                            EventService::push_task_update_for_attempt(
                                                &db.pool,
                                                msg_store_for_hook.clone(),
                                                *task_attempt_id,
                                            )
                                            .await
                                        {
                                            tracing::error!(
                                                "Failed to push task update after execution process removal: {:?}",
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

    /// Emit a targeted event indicating the retry draft for a given attempt was cleared.
    ///
    /// This helps WS clients update immediately on DELETE flows where the SQLite
    /// update hook cannot recover the deleted row's attempt_id.
    pub fn emit_deleted_retry_draft_for_attempt(&self, attempt_id: Uuid) {
        // Build an EventPatch (same shape the hook produces), but include the
        // attempt_id so the follow-up draft stream can route it to the correct
        // attempt and produce a direct `/retry_draft: null` patch.
        let event_patch = EventPatch {
            op: "replace".to_string(),
            path: "/events".to_string(),
            value: EventPatchInner {
                db_op: "delete".to_string(),
                record: RecordTypes::DeletedDraft {
                    rowid: 0,
                    draft_type: DraftType::Retry,
                    task_attempt_id: Some(attempt_id),
                },
            },
        };

        // Wrap as a JSON Patch array and push to the MsgStore
        if let Ok(value) = serde_json::to_value(vec![event_patch])
            && let Ok(patch) = serde_json::from_value::<json_patch::Patch>(value)
        {
            self.msg_store.push_patch(patch);
        }
        // Also push a direct drafts patch for the new keyed stream (project-level)
        let direct = draft_patch::retry_clear(attempt_id);
        self.msg_store.push_patch(direct);
    }
}
