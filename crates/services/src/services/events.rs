use std::{str::FromStr, sync::Arc};

use anyhow::Error as AnyhowError;
use axum::response::sse::Event;
use db::{
    DBService,
    models::{execution_process::ExecutionProcess, task::Task, task_attempt::TaskAttempt},
};
use futures::{StreamExt, TryStreamExt};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::{Error as SqlxError, sqlite::SqliteOperation};
use strum_macros::{Display, EnumString};
use thiserror::Error;
use tokio::sync::RwLock;
use tokio_stream::wrappers::BroadcastStream;
use ts_rs::TS;
use utils::{log_msg::LogMsg, msg_store::MsgStore};
use uuid::Uuid;

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

#[derive(Serialize, Deserialize, TS)]
#[serde(tag = "type", content = "data", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RecordTypes {
    Task(Task),
    TaskAttempt(TaskAttempt),
    ExecutionProcess(ExecutionProcess),
    DeletedTask {
        rowid: i64,
        project_id: Option<Uuid>,
        task_id: Option<Uuid>,
    },
    DeletedTaskAttempt {
        rowid: i64,
        task_id: Option<Uuid>,
    },
    DeletedExecutionProcess {
        rowid: i64,
        task_attempt_id: Option<Uuid>,
    },
}

#[derive(Serialize, Deserialize, TS)]
pub struct EventPatchInner {
    db_op: String,
    record: RecordTypes,
}

#[derive(Serialize, Deserialize, TS)]
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
                                    // Try to get execution_process before deletion to capture task_attempt_id
                                    let task_attempt_id =
                                        ExecutionProcess::find_by_rowid(&db.pool, rowid)
                                            .await
                                            .ok()
                                            .flatten()
                                            .map(|process| process.task_attempt_id);
                                    RecordTypes::DeletedExecutionProcess {
                                        rowid,
                                        task_attempt_id,
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
                            };

                            let db_op: &str = match hook.operation {
                                SqliteOperation::Insert => "insert",
                                SqliteOperation::Delete => "delete",
                                SqliteOperation::Update => "update",
                                SqliteOperation::Unknown(_) => "unknown",
                            };

                            let (op, path) = match &record_type {
                                RecordTypes::Task(task) => {
                                    let op = match hook.operation {
                                        SqliteOperation::Insert => "add",
                                        SqliteOperation::Update => "replace",
                                        _ => "replace", // fallback
                                    };
                                    (op, format!("/tasks/{}", task.id))
                                }
                                RecordTypes::DeletedTask {
                                    task_id: Some(task_id),
                                    ..
                                } => ("remove", format!("/tasks/{task_id}")),
                                RecordTypes::TaskAttempt(attempt) => {
                                    // Task attempts don't directly go in the tasks stream, they should update the parent task
                                    // We need to fetch the updated task and use that instead
                                    if let Ok(Some(updated_task)) =
                                        Task::find_by_id(&db.pool, attempt.task_id).await
                                    {
                                        // Create a new patch for the updated task
                                        let task_record = RecordTypes::Task(updated_task);
                                        let event_patch = EventPatch {
                                            op: "replace".to_string(),
                                            path: format!("/tasks/{}", attempt.task_id),
                                            value: EventPatchInner {
                                                db_op: db_op.to_string(),
                                                record: task_record,
                                            },
                                        };

                                        let patch =
                                            serde_json::from_value(json!([serde_json::to_value(
                                                event_patch
                                            )
                                            .unwrap()]))
                                            .unwrap();

                                        msg_store_for_hook.push_patch(patch);
                                        return;
                                    }
                                    // Fallback: use the old entries format
                                    let next_entry_count = {
                                        let mut entry_count = entry_count_for_hook.write().await;
                                        *entry_count += 1;
                                        *entry_count
                                    };
                                    ("add", format!("/entries/{next_entry_count}"))
                                }
                                RecordTypes::DeletedTaskAttempt {
                                    task_id: Some(task_id),
                                    ..
                                } => {
                                    // Task attempt deletion should update the parent task with fresh data
                                    if let Ok(Some(updated_task)) =
                                        Task::find_by_id(&db.pool, *task_id).await
                                    {
                                        let task_record = RecordTypes::Task(updated_task);
                                        let event_patch = EventPatch {
                                            op: "replace".to_string(),
                                            path: format!("/tasks/{task_id}"),
                                            value: EventPatchInner {
                                                db_op: db_op.to_string(),
                                                record: task_record,
                                            },
                                        };

                                        let patch =
                                            serde_json::from_value(json!([serde_json::to_value(
                                                event_patch
                                            )
                                            .unwrap()]))
                                            .unwrap();

                                        msg_store_for_hook.push_patch(patch);
                                        return;
                                    }
                                    // Fallback: use the old entries format
                                    let next_entry_count = {
                                        let mut entry_count = entry_count_for_hook.write().await;
                                        *entry_count += 1;
                                        *entry_count
                                    };
                                    ("add", format!("/entries/{next_entry_count}"))
                                }
                                _ => {
                                    // For other record types, use the old entries format temporarily
                                    let next_entry_count = {
                                        let mut entry_count = entry_count_for_hook.write().await;
                                        *entry_count += 1;
                                        *entry_count
                                    };
                                    ("add", format!("/entries/{next_entry_count}"))
                                }
                            };

                            let event_patch: EventPatch = EventPatch {
                                op: op.to_string(),
                                path,
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

    /// Stream tasks for a specific project with initial snapshot
    pub async fn stream_tasks_for_project(
        &self,
        project_id: Uuid,
    ) -> Result<futures::stream::BoxStream<'static, Result<Event, std::io::Error>>, EventError>
    {
        // Get initial snapshot of tasks
        let tasks = Task::find_by_project_id_with_attempt_status(&self.db.pool, project_id).await?;

        // Convert task array to object keyed by task ID
        let tasks_map: serde_json::Map<String, serde_json::Value> = tasks
            .into_iter()
            .map(|task| (task.id.to_string(), serde_json::to_value(task).unwrap()))
            .collect();

        let initial_patch = json!([{
            "op": "replace",
            "path": "/tasks",
            "value": tasks_map
        }]);
        let initial_msg = LogMsg::JsonPatch(serde_json::from_value(initial_patch).unwrap());

        // Clone necessary data for the async filter
        let db_pool = self.db.pool.clone();

        // Get filtered event stream
        let filtered_stream =
            BroadcastStream::new(self.msg_store.get_receiver()).filter_map(move |msg_result| {
                let db_pool = db_pool.clone();
                async move {
                    match msg_result {
                        Ok(LogMsg::JsonPatch(patch)) => {
                            // Filter events based on project_id
                            if let Some(event_patch_op) = patch.0.first()
                                && let Ok(event_patch_value) = serde_json::to_value(event_patch_op)
                                && let Ok(event_patch) =
                                    serde_json::from_value::<EventPatch>(event_patch_value)
                            {
                                match &event_patch.value.record {
                                    RecordTypes::Task(task) => {
                                        if task.project_id == project_id {
                                            return Some(Ok(LogMsg::JsonPatch(patch)));
                                        }
                                    }
                                    RecordTypes::DeletedTask {
                                        project_id: Some(deleted_project_id),
                                        ..
                                    } => {
                                        if *deleted_project_id == project_id {
                                            return Some(Ok(LogMsg::JsonPatch(patch)));
                                        }
                                    }
                                    RecordTypes::TaskAttempt(attempt) => {
                                        // Check if this task_attempt belongs to a task in our project
                                        if let Ok(Some(task)) =
                                            Task::find_by_id(&db_pool, attempt.task_id).await
                                            && task.project_id == project_id
                                        {
                                            return Some(Ok(LogMsg::JsonPatch(patch)));
                                        }
                                    }
                                    RecordTypes::DeletedTaskAttempt {
                                        task_id: Some(deleted_task_id),
                                        ..
                                    } => {
                                        // Check if deleted attempt belonged to a task in our project
                                        if let Ok(Some(task)) =
                                            Task::find_by_id(&db_pool, *deleted_task_id).await
                                            && task.project_id == project_id
                                        {
                                            return Some(Ok(LogMsg::JsonPatch(patch)));
                                        }
                                    }
                                    _ => {}
                                }
                            }
                            None
                        }
                        Ok(other) => Some(Ok(other)), // Pass through non-patch messages
                        Err(_) => None,               // Filter out broadcast errors
                    }
                }
            });

        // Start with initial snapshot, then live updates
        let initial_stream = futures::stream::once(async move { Ok(initial_msg) });
        let combined_stream = initial_stream
            .chain(filtered_stream)
            .map_ok(|msg| msg.to_sse_event())
            .boxed();

        Ok(combined_stream)
    }

    /// Stream execution processes for a specific task attempt with initial snapshot  
    pub async fn stream_execution_processes_for_attempt(
        &self,
        task_attempt_id: Uuid,
    ) -> Result<futures::stream::BoxStream<'static, Result<Event, std::io::Error>>, EventError>
    {
        // Get initial snapshot of execution processes
        let processes =
            ExecutionProcess::find_by_task_attempt_id(&self.db.pool, task_attempt_id).await?;
        let initial_patch = json!([{
            "op": "replace",
            "path": "/",
            "value": { "execution_processes": processes }
        }]);
        let initial_msg = LogMsg::JsonPatch(serde_json::from_value(initial_patch).unwrap());

        // Get filtered event stream
        let filtered_stream = BroadcastStream::new(self.msg_store.get_receiver()).filter_map(
            move |msg_result| async move {
                match msg_result {
                    Ok(LogMsg::JsonPatch(patch)) => {
                        // Filter events based on task_attempt_id
                        if let Some(event_patch_op) = patch.0.first()
                            && let Ok(event_patch_value) = serde_json::to_value(event_patch_op)
                            && let Ok(event_patch) =
                                serde_json::from_value::<EventPatch>(event_patch_value)
                        {
                            match &event_patch.value.record {
                                RecordTypes::ExecutionProcess(process) => {
                                    if process.task_attempt_id == task_attempt_id {
                                        return Some(Ok(LogMsg::JsonPatch(patch)));
                                    }
                                }
                                RecordTypes::DeletedExecutionProcess {
                                    task_attempt_id: Some(deleted_attempt_id),
                                    ..
                                } => {
                                    if *deleted_attempt_id == task_attempt_id {
                                        return Some(Ok(LogMsg::JsonPatch(patch)));
                                    }
                                }
                                _ => {}
                            }
                        }
                        None
                    }
                    Ok(other) => Some(Ok(other)), // Pass through non-patch messages
                    Err(_) => None,               // Filter out broadcast errors
                }
            },
        );

        // Start with initial snapshot, then live updates
        let initial_stream = futures::stream::once(async move { Ok(initial_msg) });
        let combined_stream = initial_stream
            .chain(filtered_stream)
            .map_ok(|msg| msg.to_sse_event())
            .boxed();

        Ok(combined_stream)
    }
}
