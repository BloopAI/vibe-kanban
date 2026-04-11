use db::models::{
    execution_process::ExecutionProcess, scratch::Scratch, workspace::WorkspaceWithStatus,
};
use json_patch::{AddOperation, Patch, PatchOperation, RemoveOperation, ReplaceOperation};
use uuid::Uuid;

// Shared helper to escape JSON Pointer segments
fn escape_pointer_segment(s: &str) -> String {
    s.replace('~', "~0").replace('/', "~1")
}

/// Helper functions for creating execution process-specific patches
pub mod execution_process_patch {
    use super::*;

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

/// Helper functions for creating workspace-specific patches
pub mod workspace_patch {
    use super::*;

    fn workspace_path(workspace_id: Uuid) -> String {
        format!(
            "/workspaces/{}",
            escape_pointer_segment(&workspace_id.to_string())
        )
    }

    pub fn add(workspace: &WorkspaceWithStatus) -> Patch {
        Patch(vec![PatchOperation::Add(AddOperation {
            path: workspace_path(workspace.id)
                .try_into()
                .expect("Workspace path should be valid"),
            value: serde_json::to_value(workspace)
                .expect("Workspace serialization should not fail"),
        })])
    }

    pub fn replace(workspace: &WorkspaceWithStatus) -> Patch {
        Patch(vec![PatchOperation::Replace(ReplaceOperation {
            path: workspace_path(workspace.id)
                .try_into()
                .expect("Workspace path should be valid"),
            value: serde_json::to_value(workspace)
                .expect("Workspace serialization should not fail"),
        })])
    }

    pub fn remove(workspace_id: Uuid) -> Patch {
        Patch(vec![PatchOperation::Remove(RemoveOperation {
            path: workspace_path(workspace_id)
                .try_into()
                .expect("Workspace path should be valid"),
        })])
    }
}

/// Helper functions for creating scratch-specific patches.
/// All patches use path "/scratch" - filtering is done by matching id and payload type in the value.
pub mod scratch_patch {
    use super::*;

    const SCRATCH_PATH: &str = "/scratch";

    /// Create patch for adding a new scratch
    pub fn add(scratch: &Scratch) -> Patch {
        Patch(vec![PatchOperation::Add(AddOperation {
            path: SCRATCH_PATH
                .try_into()
                .expect("Scratch path should be valid"),
            value: serde_json::to_value(scratch).expect("Scratch serialization should not fail"),
        })])
    }

    /// Create patch for updating an existing scratch
    pub fn replace(scratch: &Scratch) -> Patch {
        Patch(vec![PatchOperation::Replace(ReplaceOperation {
            path: SCRATCH_PATH
                .try_into()
                .expect("Scratch path should be valid"),
            value: serde_json::to_value(scratch).expect("Scratch serialization should not fail"),
        })])
    }

    /// Create patch for removing a scratch.
    /// Uses Replace with deleted marker so clients can filter by id and payload type.
    pub fn remove(scratch_id: Uuid, scratch_type_str: &str) -> Patch {
        Patch(vec![PatchOperation::Replace(ReplaceOperation {
            path: SCRATCH_PATH
                .try_into()
                .expect("Scratch path should be valid"),
            value: serde_json::json!({
                "id": scratch_id,
                "payload": { "type": scratch_type_str },
                "deleted": true
            }),
        })])
    }
}

/// Helper functions for creating approval-specific patches.
pub mod approvals_patch {
    use super::*;

    const PENDING_PATH: &str = "/pending";

    fn pending_path(approval_id: &str) -> String {
        format!("{}/{}", PENDING_PATH, escape_pointer_segment(approval_id))
    }

    pub fn snapshot(pending: &[crate::services::approvals::ApprovalInfo]) -> Patch {
        let pending: serde_json::Map<String, serde_json::Value> = pending
            .iter()
            .map(|info| {
                (
                    info.approval_id.clone(),
                    serde_json::to_value(info).unwrap_or(serde_json::Value::Null),
                )
            })
            .collect();

        Patch(vec![PatchOperation::Replace(ReplaceOperation {
            path: PENDING_PATH
                .try_into()
                .expect("Pending approvals path should be valid"),
            value: serde_json::Value::Object(pending),
        })])
    }

    pub fn created(info: &crate::services::approvals::ApprovalInfo) -> Patch {
        let value = serde_json::to_value(info).unwrap_or(serde_json::Value::Null);
        Patch(vec![PatchOperation::Replace(ReplaceOperation {
            path: pending_path(&info.approval_id)
                .try_into()
                .expect("Approval path should be valid"),
            value,
        })])
    }

    pub fn resolved(approval_id: &str) -> Patch {
        Patch(vec![PatchOperation::Remove(RemoveOperation {
            path: pending_path(approval_id)
                .try_into()
                .expect("Approval path should be valid"),
        })])
    }
}
