use std::{str::FromStr, sync::Arc};

use anyhow::Error as AnyhowError;
use axum::response::sse::Event;
use db::{
    DBService,
    models::{
        execution_process::ExecutionProcess,
        task::{Task, TaskWithAttemptStatus},
        task_attempt::TaskAttempt,
    },
};
use futures::{StreamExt, TryStreamExt};
use json_patch::{AddOperation, Patch, PatchOperation, RemoveOperation, ReplaceOperation};
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

/// Helper functions for creating task-specific patches
pub mod task_patch {
    use super::*;

    /// Escape JSON Pointer special characters
    fn escape_pointer_segment(s: &str) -> String {
        s.replace('~', "~0").replace('/', "~1")
    }

    /// Create path for task operation
    fn task_path(task_id: Uuid) -> String {
        format!("/tasks/{}", escape_pointer_segment(&task_id.to_string()))
    }

    /// Create patch for adding a new task
    pub fn add(task: &TaskWithAttemptStatus) -> Patch {
        Patch(vec![PatchOperation::Add(AddOperation {
            path: task_path(task.id)
                .try_into()
                .expect("Task path should be valid"),
            value: serde_json::to_value(task).expect("Task serialization should not fail"),
        })])
    }

    /// Create patch for updating an existing task
    pub fn replace(task: &TaskWithAttemptStatus) -> Patch {
        Patch(vec![PatchOperation::Replace(ReplaceOperation {
            path: task_path(task.id)
                .try_into()
                .expect("Task path should be valid"),
            value: serde_json::to_value(task).expect("Task serialization should not fail"),
        })])
    }

    /// Create patch for removing a task
    pub fn remove(task_id: Uuid) -> Patch {
        Patch(vec![PatchOperation::Remove(RemoveOperation {
            path: task_path(task_id)
                .try_into()
                .expect("Task path should be valid"),
        })])
    }
}

/// Helper functions for creating execution process-specific patches
pub mod execution_process_patch {
    use db::models::execution_process::ExecutionProcess;

    use super::*;

    /// Escape JSON Pointer special characters
    fn escape_pointer_segment(s: &str) -> String {
        s.replace('~', "~0").replace('/', "~1")
    }

    /// Create path for execution process operation
    fn execution_process_path(process_id: Uuid) -> String {
        format!(
            "/execution_processes/{}",
            escape_pointer_segment(&process_id.to_string())
        )
    }

    /// Create patch for adding a new execution process
    pub fn add(process: &ExecutionProcess) -> Patch {
        Patch(vec![PatchOperation::Add(AddOperation {
            path: execution_process_path(process.id)
                .try_into()
                .expect("Execution process path should be valid"),
            value: serde_json::to_value(process)
                .expect("Execution process serialization should not fail"),
        })])
    }

    /// Create patch for updating an existing execution process
    pub fn replace(process: &ExecutionProcess) -> Patch {
        Patch(vec![PatchOperation::Replace(ReplaceOperation {
            path: execution_process_path(process.id)
                .try_into()
                .expect("Execution process path should be valid"),
            value: serde_json::to_value(process)
                .expect("Execution process serialization should not fail"),
        })])
    }

    /// Create patch for removing an execution process
    pub fn remove(process_id: Uuid) -> Patch {
        Patch(vec![PatchOperation::Remove(RemoveOperation {
            path: execution_process_path(process_id)
                .try_into()
                .expect("Execution process path should be valid"),
        })])
    }
}

#[derive(Clone)]
pub struct EventService {
    msg_store: Arc<MsgStore>,
    db: DBService,
    #[allow(dead_code)]
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
    #[strum(to_string = "follow_up_drafts")]
    FollowUpDrafts,
}

#[derive(Serialize, Deserialize, TS)]
#[serde(tag = "type", content = "data", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RecordTypes {
    Task(Task),
    TaskAttempt(TaskAttempt),
    ExecutionProcess(ExecutionProcess),
    FollowUpDraft(db::models::follow_up_draft::FollowUpDraft),
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
        process_id: Option<Uuid>,
    },
    DeletedFollowUpDraft {
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
                                (HookTables::FollowUpDrafts, SqliteOperation::Delete) => {
                                    // Try to get draft before deletion to capture attempt id
                                    let attempt_id =
                                        db::models::follow_up_draft::FollowUpDraft::find_by_rowid(
                                            &db.pool, rowid,
                                        )
                                        .await
                                        .ok()
                                        .flatten()
                                        .map(|d| d.task_attempt_id);
                                    RecordTypes::DeletedFollowUpDraft {
                                        rowid,
                                        task_attempt_id: attempt_id,
                                    }
                                }
                                (HookTables::FollowUpDrafts, _) => {
                                    match db::models::follow_up_draft::FollowUpDraft::find_by_rowid(
                                        &db.pool, rowid,
                                    )
                                    .await
                                    {
                                        Ok(Some(draft)) => RecordTypes::FollowUpDraft(draft),
                                        Ok(None) => RecordTypes::DeletedFollowUpDraft {
                                            rowid,
                                            task_attempt_id: None,
                                        },
                                        Err(e) => {
                                            tracing::error!(
                                                "Failed to fetch follow_up_draft: {:?}",
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
                                    return;
                                }
                                RecordTypes::DeletedExecutionProcess {
                                    process_id: Some(process_id),
                                    ..
                                } => {
                                    let patch = execution_process_patch::remove(*process_id);
                                    msg_store_for_hook.push_patch(patch);
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

    /// Stream raw task messages for a specific project with initial snapshot
    pub async fn stream_tasks_raw(
        &self,
        project_id: Uuid,
    ) -> Result<futures::stream::BoxStream<'static, Result<LogMsg, std::io::Error>>, EventError>
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
                            if let Some(patch_op) = patch.0.first() {
                                // Check if this is a direct task patch (new format)
                                if patch_op.path().starts_with("/tasks/") {
                                    match patch_op {
                                        json_patch::PatchOperation::Add(op) => {
                                            // Parse task data directly from value
                                            if let Ok(task) =
                                                serde_json::from_value::<TaskWithAttemptStatus>(
                                                    op.value.clone(),
                                                )
                                                && task.project_id == project_id
                                            {
                                                return Some(Ok(LogMsg::JsonPatch(patch)));
                                            }
                                        }
                                        json_patch::PatchOperation::Replace(op) => {
                                            // Parse task data directly from value
                                            if let Ok(task) =
                                                serde_json::from_value::<TaskWithAttemptStatus>(
                                                    op.value.clone(),
                                                )
                                                && task.project_id == project_id
                                            {
                                                return Some(Ok(LogMsg::JsonPatch(patch)));
                                            }
                                        }
                                        json_patch::PatchOperation::Remove(_) => {
                                            // For remove operations, we need to check project membership differently
                                            // We could cache this information or let it pass through for now
                                            // Since we don't have the task data, we'll allow all removals
                                            // and let the client handle filtering
                                            return Some(Ok(LogMsg::JsonPatch(patch)));
                                        }
                                        _ => {}
                                    }
                                } else if let Ok(event_patch_value) = serde_json::to_value(patch_op)
                                    && let Ok(event_patch) =
                                        serde_json::from_value::<EventPatch>(event_patch_value)
                                {
                                    // Handle old EventPatch format for non-task records
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
        let combined_stream = initial_stream.chain(filtered_stream).boxed();

        Ok(combined_stream)
    }

    /// Stream execution processes for a specific task attempt with initial snapshot (raw LogMsg format for WebSocket)
    pub async fn stream_execution_processes_for_attempt_raw(
        &self,
        task_attempt_id: Uuid,
    ) -> Result<futures::stream::BoxStream<'static, Result<LogMsg, std::io::Error>>, EventError>
    {
        // Get initial snapshot of execution processes
        let processes =
            ExecutionProcess::find_by_task_attempt_id(&self.db.pool, task_attempt_id).await?;

        // Convert processes array to object keyed by process ID
        let processes_map: serde_json::Map<String, serde_json::Value> = processes
            .into_iter()
            .map(|process| {
                (
                    process.id.to_string(),
                    serde_json::to_value(process).unwrap(),
                )
            })
            .collect();

        let initial_patch = json!([{
            "op": "replace",
            "path": "/execution_processes",
            "value": processes_map
        }]);
        let initial_msg = LogMsg::JsonPatch(serde_json::from_value(initial_patch).unwrap());

        // Get filtered event stream
        let filtered_stream = BroadcastStream::new(self.msg_store.get_receiver()).filter_map(
            move |msg_result| async move {
                match msg_result {
                    Ok(LogMsg::JsonPatch(patch)) => {
                        // Filter events based on task_attempt_id
                        if let Some(patch_op) = patch.0.first() {
                            // Check if this is a modern execution process patch
                            if patch_op.path().starts_with("/execution_processes/") {
                                match patch_op {
                                    json_patch::PatchOperation::Add(op) => {
                                        // Parse execution process data directly from value
                                        if let Ok(process) =
                                            serde_json::from_value::<ExecutionProcess>(
                                                op.value.clone(),
                                            )
                                            && process.task_attempt_id == task_attempt_id
                                        {
                                            return Some(Ok(LogMsg::JsonPatch(patch)));
                                        }
                                    }
                                    json_patch::PatchOperation::Replace(op) => {
                                        // Parse execution process data directly from value
                                        if let Ok(process) =
                                            serde_json::from_value::<ExecutionProcess>(
                                                op.value.clone(),
                                            )
                                            && process.task_attempt_id == task_attempt_id
                                        {
                                            return Some(Ok(LogMsg::JsonPatch(patch)));
                                        }
                                    }
                                    json_patch::PatchOperation::Remove(_) => {
                                        // For remove operations, we can't verify task_attempt_id
                                        // so we allow all removals and let the client handle filtering
                                        return Some(Ok(LogMsg::JsonPatch(patch)));
                                    }
                                    _ => {}
                                }
                            }
                            // Fallback to legacy EventPatch format for backward compatibility
                            else if let Ok(event_patch_value) = serde_json::to_value(patch_op)
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
        let combined_stream = initial_stream.chain(filtered_stream).boxed();

        Ok(combined_stream)
    }

    /// Stream follow-up draft for a specific task attempt with initial snapshot
    pub async fn stream_follow_up_draft_for_attempt(
        &self,
        task_attempt_id: Uuid,
    ) -> Result<futures::stream::BoxStream<'static, Result<Event, std::io::Error>>, EventError>
    {
        // Get initial snapshot of follow-up draft
        let draft = db::models::follow_up_draft::FollowUpDraft::find_by_task_attempt_id(
            &self.db.pool,
            task_attempt_id,
        )
        .await?
        .unwrap_or(db::models::follow_up_draft::FollowUpDraft {
            id: uuid::Uuid::new_v4(),
            task_attempt_id,
            prompt: String::new(),
            queued: false,
            sending: false,
            variant: None,
            image_ids: None,
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
            version: 0,
        });

        let initial_patch = json!([{
            "op": "replace",
            "path": "/",
            "value": { "follow_up_draft": draft }
        }]);
        let initial_msg = LogMsg::JsonPatch(serde_json::from_value(initial_patch).unwrap());

        // Filtered live stream, mapped into direct JSON patches that update /follow_up_draft
        let filtered_stream = BroadcastStream::new(self.msg_store.get_receiver()).filter_map(
            move |msg_result| async move {
                match msg_result {
                    Ok(LogMsg::JsonPatch(patch)) => {
                        if let Some(event_patch_op) = patch.0.first()
                            && let Ok(event_patch_value) = serde_json::to_value(event_patch_op)
                            && let Ok(event_patch) =
                                serde_json::from_value::<EventPatch>(event_patch_value)
                        {
                            match &event_patch.value.record {
                                RecordTypes::FollowUpDraft(draft) => {
                                    if draft.task_attempt_id == task_attempt_id {
                                        // Build a direct patch to replace /follow_up_draft
                                        let direct = json!([{
                                            "op": "replace",
                                            "path": "/follow_up_draft",
                                            "value": draft
                                        }]);
                                        let direct_patch = serde_json::from_value(direct).unwrap();
                                        return Some(Ok(LogMsg::JsonPatch(direct_patch)));
                                    }
                                }
                                RecordTypes::DeletedFollowUpDraft {
                                    task_attempt_id: Some(id),
                                    ..
                                } => {
                                    if *id == task_attempt_id {
                                        // Replace with empty draft state
                                        let empty = json!({
                                            "id": uuid::Uuid::new_v4(),
                                            "task_attempt_id": id,
                                            "prompt": "",
                                            "queued": false,
                                            "sending": false,
                                            "variant": null,
                                            "image_ids": null,
                                            "created_at": chrono::Utc::now(),
                                            "updated_at": chrono::Utc::now(),
                                            "version": 0
                                        });
                                        let direct = json!([{
                                            "op": "replace",
                                            "path": "/follow_up_draft",
                                            "value": empty
                                        }]);
                                        let direct_patch = serde_json::from_value(direct).unwrap();
                                        return Some(Ok(LogMsg::JsonPatch(direct_patch)));
                                    }
                                }
                                _ => {}
                            }
                        }
                        None
                    }
                    Ok(other) => Some(Ok(other)),
                    Err(_) => None,
                }
            },
        );

        let initial_stream = futures::stream::once(async move { Ok(initial_msg) });
        let combined_stream = initial_stream
            .chain(filtered_stream)
            .map_ok(|msg| msg.to_sse_event())
            .boxed();

        Ok(combined_stream)
    }
}
