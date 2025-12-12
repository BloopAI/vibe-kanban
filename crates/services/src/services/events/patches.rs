use db::models::{
    execution_process::ExecutionProcess, project::Project, scratch::Scratch,
    task::TaskWithAttemptStatus, task_attempt::TaskAttempt,
};
use json_patch::{AddOperation, Patch, PatchOperation, RemoveOperation, ReplaceOperation};
use uuid::Uuid;

// Shared helper to escape JSON Pointer segments
fn escape_pointer_segment(s: &str) -> String {
    s.replace('~', "~0").replace('/', "~1")
}

/// Helper functions for creating task-specific patches
pub mod task_patch {
    use super::*;

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

/// Helper functions for creating project-specific patches
pub mod project_patch {
    use super::*;

    fn project_path(project_id: Uuid) -> String {
        format!(
            "/projects/{}",
            escape_pointer_segment(&project_id.to_string())
        )
    }

    /// Create patch for adding a new project
    pub fn add(project: &Project) -> Patch {
        Patch(vec![PatchOperation::Add(AddOperation {
            path: project_path(project.id)
                .try_into()
                .expect("Project path should be valid"),
            value: serde_json::to_value(project).expect("Project serialization should not fail"),
        })])
    }

    /// Create patch for updating an existing project
    pub fn replace(project: &Project) -> Patch {
        Patch(vec![PatchOperation::Replace(ReplaceOperation {
            path: project_path(project.id)
                .try_into()
                .expect("Project path should be valid"),
            value: serde_json::to_value(project).expect("Project serialization should not fail"),
        })])
    }

    /// Create patch for removing a project
    pub fn remove(project_id: Uuid) -> Patch {
        Patch(vec![PatchOperation::Remove(RemoveOperation {
            path: project_path(project_id)
                .try_into()
                .expect("Project path should be valid"),
        })])
    }
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

/// Helper functions for creating task attempt-specific patches
pub mod task_attempt_patch {
    use super::*;

    fn attempt_path(attempt_id: Uuid) -> String {
        format!(
            "/task_attempts/{}",
            escape_pointer_segment(&attempt_id.to_string())
        )
    }

    /// Create patch for adding a new task attempt
    pub fn add(attempt: &TaskAttempt) -> Patch {
        Patch(vec![PatchOperation::Add(AddOperation {
            path: attempt_path(attempt.id)
                .try_into()
                .expect("Task attempt path should be valid"),
            value: serde_json::to_value(attempt)
                .expect("Task attempt serialization should not fail"),
        })])
    }

    /// Create patch for updating an existing task attempt
    pub fn replace(attempt: &TaskAttempt) -> Patch {
        Patch(vec![PatchOperation::Replace(ReplaceOperation {
            path: attempt_path(attempt.id)
                .try_into()
                .expect("Task attempt path should be valid"),
            value: serde_json::to_value(attempt)
                .expect("Task attempt serialization should not fail"),
        })])
    }

    /// Create patch for removing a task attempt
    pub fn remove(attempt_id: Uuid) -> Patch {
        Patch(vec![PatchOperation::Remove(RemoveOperation {
            path: attempt_path(attempt_id)
                .try_into()
                .expect("Task attempt path should be valid"),
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
