use db::models::{
    execution_process::ExecutionProcess,
    scratch::Scratch,
    task::{Task, TaskWithAttemptStatus},
};
use futures::StreamExt;
use serde_json::json;
use tokio_stream::wrappers::BroadcastStream;
use utils::log_msg::LogMsg;
use uuid::Uuid;

use super::{
    EventService,
    patches::execution_process_patch,
    types::{EventError, EventPatch, RecordTypes},
};

impl EventService {
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

        let initial_patch = json!([
            {
                "op": "replace",
                "path": "/tasks",
                "value": tasks_map
            }
        ]);
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
        show_soft_deleted: bool,
    ) -> Result<futures::stream::BoxStream<'static, Result<LogMsg, std::io::Error>>, EventError>
    {
        // Get initial snapshot of execution processes (filtering at SQL level)
        let processes = ExecutionProcess::find_by_task_attempt_id(
            &self.db.pool,
            task_attempt_id,
            show_soft_deleted,
        )
        .await?;

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
                                            if !show_soft_deleted && process.dropped {
                                                let remove_patch =
                                                    execution_process_patch::remove(process.id);
                                                return Some(Ok(LogMsg::JsonPatch(remove_patch)));
                                            }
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
                                            if !show_soft_deleted && process.dropped {
                                                let remove_patch =
                                                    execution_process_patch::remove(process.id);
                                                return Some(Ok(LogMsg::JsonPatch(remove_patch)));
                                            }
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
                                            if !show_soft_deleted && process.dropped {
                                                let remove_patch =
                                                    execution_process_patch::remove(process.id);
                                                return Some(Ok(LogMsg::JsonPatch(remove_patch)));
                                            }
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

    /// Stream a single scratch item with initial snapshot (raw LogMsg format for WebSocket)
    pub async fn stream_scratch_raw(
        &self,
        scratch_id: Uuid,
        scratch_type: &db::models::scratch::ScratchType,
    ) -> Result<futures::stream::BoxStream<'static, Result<LogMsg, std::io::Error>>, EventError>
    {
        // Treat errors (e.g., corrupted/malformed data) the same as "scratch not found"
        // This prevents the websocket from closing and retrying indefinitely
        let scratch = match Scratch::find_by_id(&self.db.pool, scratch_id, scratch_type).await {
            Ok(scratch) => scratch,
            Err(e) => {
                tracing::warn!(
                    scratch_id = %scratch_id,
                    scratch_type = %scratch_type,
                    error = %e,
                    "Failed to load scratch, treating as empty"
                );
                None
            }
        };

        let initial_patch = json!([{
            "op": "replace",
            "path": "/scratch",
            "value": scratch
        }]);
        let initial_msg = LogMsg::JsonPatch(serde_json::from_value(initial_patch).unwrap());

        let type_str = scratch_type.to_string();

        // Filter to only this scratch's events by matching id and payload.type in the patch value
        let filtered_stream =
            BroadcastStream::new(self.msg_store.get_receiver()).filter_map(move |msg_result| {
                let id_str = scratch_id.to_string();
                let type_str = type_str.clone();
                async move {
                    match msg_result {
                        Ok(LogMsg::JsonPatch(patch)) => {
                            if let Some(op) = patch.0.first()
                                && op.path() == "/scratch"
                            {
                                // Extract id and payload.type from the patch value
                                let value = match op {
                                    json_patch::PatchOperation::Add(a) => Some(&a.value),
                                    json_patch::PatchOperation::Replace(r) => Some(&r.value),
                                    json_patch::PatchOperation::Remove(_) => None,
                                    _ => None,
                                };

                                let matches = value.is_some_and(|v| {
                                    let id_matches =
                                        v.get("id").and_then(|v| v.as_str()) == Some(&id_str);
                                    let type_matches = v
                                        .get("payload")
                                        .and_then(|p| p.get("type"))
                                        .and_then(|t| t.as_str())
                                        == Some(&type_str);
                                    id_matches && type_matches
                                });

                                if matches {
                                    return Some(Ok(LogMsg::JsonPatch(patch)));
                                }
                            }
                            None
                        }
                        Ok(other) => Some(Ok(other)),
                        Err(_) => None,
                    }
                }
            });

        let initial_stream = futures::stream::once(async move { Ok(initial_msg) });
        let combined_stream = initial_stream.chain(filtered_stream).boxed();
        Ok(combined_stream)
    }
}
