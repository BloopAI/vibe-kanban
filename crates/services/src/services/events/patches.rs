use db::models::{
    draft::{Draft, DraftType},
    execution_process::ExecutionProcess,
    task::TaskWithAttemptStatus,
    task_attempt::TaskAttempt,
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

/// Helper functions for creating draft-specific patches
pub mod draft_patch {
    use super::*;

    fn follow_up_path(attempt_id: Uuid) -> String {
        format!("/drafts/{attempt_id}/follow_up")
    }

    fn retry_path(attempt_id: Uuid) -> String {
        format!("/drafts/{attempt_id}/retry")
    }

    /// Replace the follow-up draft for a specific attempt
    pub fn follow_up_replace(draft: &Draft) -> Patch {
        Patch(vec![PatchOperation::Replace(ReplaceOperation {
            path: follow_up_path(draft.task_attempt_id)
                .try_into()
                .expect("Path should be valid"),
            value: serde_json::to_value(draft).expect("Draft serialization should not fail"),
        })])
    }

    /// Replace the retry draft for a specific attempt
    pub fn retry_replace(draft: &Draft) -> Patch {
        Patch(vec![PatchOperation::Replace(ReplaceOperation {
            path: retry_path(draft.task_attempt_id)
                .try_into()
                .expect("Path should be valid"),
            value: serde_json::to_value(draft).expect("Draft serialization should not fail"),
        })])
    }

    /// Clear the follow-up draft for an attempt (replace with an empty draft)
    pub fn follow_up_clear(attempt_id: Uuid) -> Patch {
        let empty = Draft {
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
        };
        Patch(vec![PatchOperation::Replace(ReplaceOperation {
            path: follow_up_path(attempt_id)
                .try_into()
                .expect("Path should be valid"),
            value: serde_json::to_value(empty).expect("Draft serialization should not fail"),
        })])
    }

    /// Clear the retry draft for an attempt (set to null)
    pub fn retry_clear(attempt_id: Uuid) -> Patch {
        Patch(vec![PatchOperation::Replace(ReplaceOperation {
            path: retry_path(attempt_id)
                .try_into()
                .expect("Path should be valid"),
            value: serde_json::Value::Null,
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
