use db::models::{
    draft::{Draft, DraftType},
    execution_process::ExecutionProcess,
    project::Project,
    shared_task::SharedTask,
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

        let remote_project_id = Project::find_by_id(&self.db.pool, project_id)
            .await?
            .and_then(|project| project.remote_project_id);

        let shared_tasks = if let Some(remote_project_id) = remote_project_id {
            SharedTask::list_by_remote_project_id(&self.db.pool, remote_project_id).await?
        } else {
            Vec::new()
        };
        let shared_tasks_map: serde_json::Map<String, serde_json::Value> = shared_tasks
            .into_iter()
            .map(|task| (task.id.to_string(), serde_json::to_value(task).unwrap()))
            .collect();

        let initial_patch = json!([
            {
                "op": "replace",
                "path": "/tasks",
                "value": tasks_map
            },
            {
                "op": "replace",
                "path": "/shared_tasks",
                "value": shared_tasks_map
            }
        ]);
        let initial_msg = LogMsg::JsonPatch(serde_json::from_value(initial_patch).unwrap());

        // Clone necessary data for the async filter
        let db_pool = self.db.pool.clone();
        let remote_project_id_filter = remote_project_id;

        // Get filtered event stream
        let filtered_stream =
            BroadcastStream::new(self.msg_store.get_receiver()).filter_map(move |msg_result| {
                let db_pool = db_pool.clone();
                async move {
                    match msg_result {
                        Ok(LogMsg::JsonPatch(patch)) => {
                            // Filter events based on project_id
                            if let Some(patch_op) = patch.0.first() {
                                if patch_op.path().starts_with("/shared_tasks/") {
                                    match patch_op {
                                        json_patch::PatchOperation::Add(op) => {
                                            if let Ok(shared_task) =
                                                serde_json::from_value::<SharedTask>(
                                                    op.value.clone(),
                                                )
                                                && remote_project_id_filter
                                                    .map(|expected| {
                                                        shared_task.remote_project_id == expected
                                                    })
                                                    .unwrap_or(false)
                                            {
                                                return Some(Ok(LogMsg::JsonPatch(patch)));
                                            }
                                        }
                                        json_patch::PatchOperation::Replace(op) => {
                                            if let Ok(shared_task) =
                                                serde_json::from_value::<SharedTask>(
                                                    op.value.clone(),
                                                )
                                                && remote_project_id_filter
                                                    .map(|expected| {
                                                        shared_task.remote_project_id == expected
                                                    })
                                                    .unwrap_or(false)
                                            {
                                                return Some(Ok(LogMsg::JsonPatch(patch)));
                                            }
                                        }
                                        json_patch::PatchOperation::Remove(_) => {
                                            // Forward removals; clients will ignore missing tasks
                                            return Some(Ok(LogMsg::JsonPatch(patch)));
                                        }
                                        _ => {}
                                    }
                                    return None;
                                }
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
                                        RecordTypes::SharedTask(shared_task) => {
                                            if remote_project_id_filter
                                                .map(|expected| {
                                                    shared_task.remote_project_id == expected
                                                })
                                                .unwrap_or(false)
                                            {
                                                return Some(Ok(LogMsg::JsonPatch(patch)));
                                            }
                                        }
                                        RecordTypes::DeletedSharedTask { .. } => {
                                            return Some(Ok(LogMsg::JsonPatch(patch)));
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

    /// Stream drafts for all task attempts in a project with initial snapshot (raw LogMsg)
    pub async fn stream_drafts_for_project_raw(
        &self,
        project_id: Uuid,
    ) -> Result<futures::stream::BoxStream<'static, Result<LogMsg, std::io::Error>>, EventError>
    {
        // Load all attempt ids for tasks in this project
        let attempt_ids: Vec<Uuid> = sqlx::query_scalar(
            r#"SELECT ta.id
               FROM task_attempts ta
               JOIN tasks t ON t.id = ta.task_id
              WHERE t.project_id = ?"#,
        )
        .bind(project_id)
        .fetch_all(&self.db.pool)
        .await?;

        // Build initial drafts map keyed by attempt_id
        let mut drafts_map: serde_json::Map<String, serde_json::Value> = serde_json::Map::new();
        for attempt_id in attempt_ids {
            let fu = Draft::find_by_task_attempt_and_type(
                &self.db.pool,
                attempt_id,
                DraftType::FollowUp,
            )
            .await?
            .unwrap_or(Draft {
                id: uuid::Uuid::new_v4(),
                task_attempt_id: attempt_id,
                draft_type: DraftType::FollowUp,
                retry_process_id: None,
                prompt: String::new(),
                queued: false,
                sending: false,
                variant: None,
                image_ids: None,
                created_at: chrono::Utc::now(),
                updated_at: chrono::Utc::now(),
                version: 0,
            });
            let re =
                Draft::find_by_task_attempt_and_type(&self.db.pool, attempt_id, DraftType::Retry)
                    .await?;
            let entry = json!({
                "follow_up": fu,
                "retry": serde_json::to_value(re).unwrap_or(serde_json::Value::Null),
            });
            drafts_map.insert(attempt_id.to_string(), entry);
        }

        let initial_patch = json!([
            {
                "op": "replace",
                "path": "/drafts",
                "value": drafts_map
            }
        ]);
        let initial_msg = LogMsg::JsonPatch(serde_json::from_value(initial_patch).unwrap());

        let db_pool = self.db.pool.clone();
        // Live updates: accept direct draft patches and filter by project membership
        let filtered_stream =
            BroadcastStream::new(self.msg_store.get_receiver()).filter_map(move |msg_result| {
                let db_pool = db_pool.clone();
                async move {
                    match msg_result {
                        Ok(LogMsg::JsonPatch(patch)) => {
                            if let Some(op) = patch.0.first() {
                                let path = op.path();
                                if let Some(rest) = path.strip_prefix("/drafts/")
                                    && let Some((attempt_str, _)) = rest.split_once('/')
                                    && let Ok(attempt_id) = Uuid::parse_str(attempt_str)
                                {
                                    // Check project membership
                                    if let Ok(Some(task_attempt)) =
                                        db::models::task_attempt::TaskAttempt::find_by_id(
                                            &db_pool, attempt_id,
                                        )
                                        .await
                                        && let Ok(Some(task)) = db::models::task::Task::find_by_id(
                                            &db_pool,
                                            task_attempt.task_id,
                                        )
                                        .await
                                        && task.project_id == project_id
                                    {
                                        return Some(Ok(LogMsg::JsonPatch(patch)));
                                    }
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
