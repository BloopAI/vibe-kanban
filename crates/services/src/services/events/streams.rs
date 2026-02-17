use db::models::{execution_process::ExecutionProcess, scratch::Scratch, workspace::Workspace};
use futures::StreamExt;
use serde_json::json;
use tokio_stream::wrappers::BroadcastStream;
use utils::log_msg::LogMsg;
use uuid::Uuid;

use super::{
    EventService,
    patches::execution_process_patch,
    types::{EventPatch, RecordTypes},
};

impl EventService {
    /// Stream execution processes for a specific session with initial snapshot (raw LogMsg format for WebSocket)
    pub async fn stream_execution_processes_for_session_raw(
        &self,
        session_id: Uuid,
        show_soft_deleted: bool,
    ) -> Result<
        futures::stream::BoxStream<'static, Result<LogMsg, std::io::Error>>,
        super::types::EventError,
    > {
        // Get execution processes for this session
        let processes =
            ExecutionProcess::find_by_session_id(&self.db.pool, session_id, show_soft_deleted)
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
        let filtered_stream =
            BroadcastStream::new(self.msg_store.get_receiver()).filter_map(move |msg_result| {
                async move {
                    match msg_result {
                        Ok(LogMsg::JsonPatch(patch)) => {
                            // Filter events based on session_id
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
                                                && process.session_id == session_id
                                            {
                                                if !show_soft_deleted && process.dropped {
                                                    let remove_patch =
                                                        execution_process_patch::remove(process.id);
                                                    return Some(Ok(LogMsg::JsonPatch(
                                                        remove_patch,
                                                    )));
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
                                                && process.session_id == session_id
                                            {
                                                if !show_soft_deleted && process.dropped {
                                                    let remove_patch =
                                                        execution_process_patch::remove(process.id);
                                                    return Some(Ok(LogMsg::JsonPatch(
                                                        remove_patch,
                                                    )));
                                                }
                                                return Some(Ok(LogMsg::JsonPatch(patch)));
                                            }
                                        }
                                        json_patch::PatchOperation::Remove(_) => {
                                            // For remove operations, we can't verify session_id
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
                                            if process.session_id == session_id {
                                                if !show_soft_deleted && process.dropped {
                                                    let remove_patch =
                                                        execution_process_patch::remove(process.id);
                                                    return Some(Ok(LogMsg::JsonPatch(
                                                        remove_patch,
                                                    )));
                                                }
                                                return Some(Ok(LogMsg::JsonPatch(patch)));
                                            }
                                        }
                                        RecordTypes::DeletedExecutionProcess {
                                            session_id: Some(deleted_session_id),
                                            ..
                                        } => {
                                            if *deleted_session_id == session_id {
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

        // Start with initial snapshot, Ready signal, then live updates
        let initial_stream = futures::stream::iter(vec![Ok(initial_msg), Ok(LogMsg::Ready)]);
        let combined_stream = initial_stream.chain(filtered_stream).boxed();

        Ok(combined_stream)
    }

    /// Stream a single scratch item with initial snapshot (raw LogMsg format for WebSocket)
    pub async fn stream_scratch_raw(
        &self,
        scratch_id: Uuid,
        scratch_type: &db::models::scratch::ScratchType,
    ) -> Result<
        futures::stream::BoxStream<'static, Result<LogMsg, std::io::Error>>,
        super::types::EventError,
    > {
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

        let initial_stream = futures::stream::iter(vec![Ok(initial_msg), Ok(LogMsg::Ready)]);
        let combined_stream = initial_stream.chain(filtered_stream).boxed();
        Ok(combined_stream)
    }

    pub async fn stream_workspaces_raw(
        &self,
        archived: Option<bool>,
        limit: Option<i64>,
    ) -> Result<
        futures::stream::BoxStream<'static, Result<LogMsg, std::io::Error>>,
        super::types::EventError,
    > {
        let workspaces = Workspace::find_all_with_status(&self.db.pool, archived, limit).await?;
        let workspaces_map: serde_json::Map<String, serde_json::Value> = workspaces
            .into_iter()
            .map(|ws| (ws.id.to_string(), serde_json::to_value(ws).unwrap()))
            .collect();

        let initial_patch = json!([{
            "op": "replace",
            "path": "/workspaces",
            "value": workspaces_map
        }]);
        let initial_msg = LogMsg::JsonPatch(serde_json::from_value(initial_patch).unwrap());

        let filtered_stream = BroadcastStream::new(self.msg_store.get_receiver()).filter_map(
            move |msg_result| async move {
                match msg_result {
                    Ok(LogMsg::JsonPatch(patch)) => {
                        if let Some(op) = patch.0.first()
                            && op.path().starts_with("/workspaces")
                        {
                            // If archived filter is set, handle state transitions
                            if let Some(archived_filter) = archived {
                                // Extract workspace data from Add/Replace operations
                                let value = match op {
                                    json_patch::PatchOperation::Add(a) => Some(&a.value),
                                    json_patch::PatchOperation::Replace(r) => Some(&r.value),
                                    json_patch::PatchOperation::Remove(_) => {
                                        // Allow remove operations through - client will handle
                                        return Some(Ok(LogMsg::JsonPatch(patch)));
                                    }
                                    _ => None,
                                };

                                if let Some(v) = value
                                    && let Some(ws_archived) =
                                        v.get("archived").and_then(|a| a.as_bool())
                                {
                                    if ws_archived == archived_filter {
                                        // Workspace matches this filter
                                        // Convert Replace to Add since workspace may be new to this filtered stream
                                        if let json_patch::PatchOperation::Replace(r) = op {
                                            let add_patch = json_patch::Patch(vec![
                                                json_patch::PatchOperation::Add(
                                                    json_patch::AddOperation {
                                                        path: r.path.clone(),
                                                        value: r.value.clone(),
                                                    },
                                                ),
                                            ]);
                                            return Some(Ok(LogMsg::JsonPatch(add_patch)));
                                        }
                                        return Some(Ok(LogMsg::JsonPatch(patch)));
                                    } else {
                                        // Workspace no longer matches this filter - send remove
                                        let remove_patch = json_patch::Patch(vec![
                                            json_patch::PatchOperation::Remove(
                                                json_patch::RemoveOperation {
                                                    path: op
                                                        .path()
                                                        .to_string()
                                                        .try_into()
                                                        .expect("Workspace path should be valid"),
                                                },
                                            ),
                                        ]);
                                        return Some(Ok(LogMsg::JsonPatch(remove_patch)));
                                    }
                                }
                            }
                            return Some(Ok(LogMsg::JsonPatch(patch)));
                        }
                        None
                    }
                    Ok(other) => Some(Ok(other)),
                    Err(_) => None,
                }
            },
        );

        let initial_stream = futures::stream::iter(vec![Ok(initial_msg), Ok(LogMsg::Ready)]);
        Ok(initial_stream.chain(filtered_stream).boxed())
    }
}
