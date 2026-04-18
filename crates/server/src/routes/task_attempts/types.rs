//! Request and response types for task_attempts routes.

use db::models::merge::{Merge, MergeStatus};
use executors::{
    actions::coding_agent_review::CodingAgentReviewTarget, profile::ExecutorProfileId,
};
use serde::{Deserialize, Serialize};
use services::services::git::ConflictOp;
use ts_rs::TS;
use uuid::Uuid;

// ============================================================================
// Query Parameters
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct TaskAttemptQuery {
    pub task_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct DiffStreamQuery {
    #[serde(default)]
    pub stats_only: bool,
}

#[derive(Debug, Deserialize)]
pub struct ListFilesQuery {
    /// Relative path within the worktree (optional, defaults to root)
    pub path: Option<String>,
}

// ============================================================================
// Create/Update Request Types
// ============================================================================

#[derive(Debug, Serialize, Deserialize, TS)]
pub struct CreateTaskAttemptBody {
    pub task_id: Uuid,
    /// Executor profile specification
    pub executor_profile_id: ExecutorProfileId,
    pub base_branch: String,
    /// Target node ID for remote execution (if project exists on multiple nodes).
    /// When set, the request will be proxied to the specified node.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_node_id: Option<Uuid>,
    /// When true, reuse the parent task's latest attempt worktree.
    /// Only valid when the task has a parent_task_id.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub use_parent_worktree: Option<bool>,
}

impl CreateTaskAttemptBody {
    /// Get the executor profile ID
    pub fn get_executor_profile_id(&self) -> ExecutorProfileId {
        self.executor_profile_id.clone()
    }
}

/// Request body for creating a task attempt via by-task-id route (cross-node proxying).
/// Unlike CreateTaskAttemptBody, this doesn't need task_id since it's in the URL path.
#[derive(Debug, Serialize, Deserialize)]
pub struct CreateTaskAttemptByTaskIdBody {
    /// Executor profile specification
    pub executor_profile_id: ExecutorProfileId,
    pub base_branch: String,
    /// When true, reuse the parent task's latest attempt worktree.
    /// Only valid when the task has a parent_task_id.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub use_parent_worktree: Option<bool>,
}

#[derive(Debug, Deserialize, Serialize, TS)]
pub struct RunAgentSetupRequest {
    pub executor_profile_id: ExecutorProfileId,
}

#[derive(Debug, Deserialize, Serialize, TS)]
pub struct CreateFollowUpAttempt {
    pub prompt: String,
    pub variant: Option<String>,
    pub image_ids: Option<Vec<Uuid>>,
    pub retry_process_id: Option<Uuid>,
    pub force_when_dirty: Option<bool>,
    pub perform_git_reset: Option<bool>,
}

#[derive(Debug, Deserialize, Serialize, TS)]
pub struct CreateReviewAttempt {
    pub variant: Option<String>,
    #[ts(optional)]
    pub target: Option<CodingAgentReviewTarget>,
}

#[derive(Debug, Deserialize, Serialize, TS)]
pub struct RebaseTaskAttemptRequest {
    pub old_base_branch: Option<String>,
    pub new_base_branch: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, TS)]
pub struct CreateGitHubPrRequest {
    pub title: String,
    pub body: Option<String>,
    pub target_branch: Option<String>,
}

#[derive(serde::Deserialize, TS)]
pub struct OpenEditorRequest {
    pub editor_type: Option<String>,
    pub file_path: Option<String>,
}

#[derive(serde::Deserialize, serde::Serialize, Debug, TS)]
pub struct ChangeTargetBranchRequest {
    pub new_target_branch: String,
}

#[derive(serde::Deserialize, serde::Serialize, Debug, TS)]
pub struct RenameBranchRequest {
    pub new_branch_name: String,
}

/// Request for stash_changes endpoint
#[derive(Debug, Deserialize, Serialize, TS)]
pub struct StashChangesRequest {
    pub message: Option<String>,
}

// ============================================================================
// Response Types
// ============================================================================

#[derive(Debug, Serialize, TS)]
pub struct RunAgentSetupResponse {}

/// Response for fix-sessions endpoint
#[derive(Debug, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct FixSessionsResponse {
    pub invalidated_count: usize,
    pub invalidated_session_ids: Vec<String>,
}

#[derive(Debug, Serialize, TS)]
pub struct CommitInfo {
    pub sha: String,
    pub subject: String,
}

#[derive(Debug, Serialize, TS)]
pub struct CommitCompareResult {
    pub head_oid: String,
    pub target_oid: String,
    pub ahead_from_head: usize,
    pub behind_from_head: usize,
    pub is_linear: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct BranchStatus {
    pub commits_behind: Option<usize>,
    pub commits_ahead: Option<usize>,
    pub has_uncommitted_changes: Option<bool>,
    pub head_oid: Option<String>,
    pub uncommitted_count: Option<usize>,
    pub untracked_count: Option<usize>,
    pub target_branch_name: String,
    pub remote_commits_behind: Option<usize>,
    pub remote_commits_ahead: Option<usize>,
    pub merges: Vec<Merge>,
    /// True if a `git rebase` is currently in progress in this worktree
    pub is_rebase_in_progress: bool,
    /// Current conflict operation if any
    pub conflict_op: Option<ConflictOp>,
    /// List of files currently in conflicted (unmerged) state
    pub conflicted_files: Vec<String>,
}

#[derive(Debug, Serialize, TS)]
pub struct OpenEditorResponse {
    pub url: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, TS)]
pub struct ChangeTargetBranchResponse {
    pub new_target_branch: String,
    pub status: (usize, usize),
}

#[derive(serde::Serialize, serde::Deserialize, Debug, TS)]
pub struct RenameBranchResponse {
    pub branch: String,
}

/// Response for get_dirty_files endpoint
#[derive(Debug, Serialize, Deserialize, TS)]
pub struct DirtyFilesResponse {
    pub files: Vec<String>,
}

/// Response for stash_changes endpoint
#[derive(Debug, Serialize, Deserialize, TS)]
pub struct StashChangesResponse {
    pub stash_ref: String,
}

#[derive(Debug, Serialize, Deserialize, TS)]
pub struct AttachPrResponse {
    pub pr_attached: bool,
    pub pr_url: Option<String>,
    pub pr_number: Option<i64>,
    pub pr_status: Option<MergeStatus>,
}

/// Response for getting the worktree path
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct WorktreePathResponse {
    /// Absolute path to the worktree directory
    pub path: String,
}

// ============================================================================
// Error Types
// ============================================================================

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(tag = "type", rename_all = "snake_case")]
pub enum GitOperationError {
    MergeConflicts { message: String, op: ConflictOp },
    RebaseInProgress,
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(tag = "type", rename_all = "snake_case")]
pub enum PushError {
    ForcePushRequired,
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(tag = "type", rename_all = "snake_case")]
pub enum CreatePrError {
    GithubCliNotInstalled,
    GithubCliNotLoggedIn,
    GitCliNotLoggedIn,
    GitCliNotInstalled,
    TargetBranchNotFound { branch: String },
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_task_attempt_body_with_use_parent_worktree() {
        let body: CreateTaskAttemptBody = serde_json::from_str(
            r#"{
            "task_id": "550e8400-e29b-41d4-a716-446655440000",
            "executor_profile_id": { "executor": "CLAUDE_CODE", "variant": null },
            "base_branch": "main",
            "use_parent_worktree": true
        }"#,
        )
        .unwrap();
        assert!(body.use_parent_worktree.unwrap_or(false));
    }

    #[test]
    fn test_create_task_attempt_body_backwards_compatible() {
        // Old requests without use_parent_worktree should still work
        let body: CreateTaskAttemptBody = serde_json::from_str(
            r#"{
            "task_id": "550e8400-e29b-41d4-a716-446655440000",
            "executor_profile_id": { "executor": "CLAUDE_CODE", "variant": null },
            "base_branch": "main"
        }"#,
        )
        .unwrap();
        assert!(body.use_parent_worktree.is_none());
    }

    #[test]
    fn test_create_task_attempt_body_with_use_parent_worktree_false() {
        let body: CreateTaskAttemptBody = serde_json::from_str(
            r#"{
            "task_id": "550e8400-e29b-41d4-a716-446655440000",
            "executor_profile_id": { "executor": "CLAUDE_CODE", "variant": null },
            "base_branch": "main",
            "use_parent_worktree": false
        }"#,
        )
        .unwrap();
        assert_eq!(body.use_parent_worktree, Some(false));
    }

    #[test]
    fn test_create_task_attempt_by_task_id_body_with_use_parent_worktree() {
        let body: CreateTaskAttemptByTaskIdBody = serde_json::from_str(
            r#"{
            "executor_profile_id": { "executor": "CLAUDE_CODE", "variant": null },
            "base_branch": "main",
            "use_parent_worktree": true
        }"#,
        )
        .unwrap();
        assert!(body.use_parent_worktree.unwrap_or(false));
    }

    #[test]
    fn test_create_task_attempt_by_task_id_body_backwards_compatible() {
        // Old requests without use_parent_worktree should still work
        let body: CreateTaskAttemptByTaskIdBody = serde_json::from_str(
            r#"{
            "executor_profile_id": { "executor": "CLAUDE_CODE", "variant": null },
            "base_branch": "main"
        }"#,
        )
        .unwrap();
        assert!(body.use_parent_worktree.is_none());
    }

    #[test]
    fn test_create_review_attempt_defaults_target() {
        let body: CreateReviewAttempt = serde_json::from_str(
            r#"{
            "variant": "DEFAULT"
        }"#,
        )
        .unwrap();
        assert_eq!(body.variant.as_deref(), Some("DEFAULT"));
        assert!(body.target.is_none());
    }

    #[test]
    fn test_create_review_attempt_parses_target() {
        let body: CreateReviewAttempt = serde_json::from_str(
            r#"{
            "variant": null,
            "target": {
              "type": "base_branch",
              "branch": "main"
            }
        }"#,
        )
        .unwrap();
        assert_eq!(
            body.target,
            Some(CodingAgentReviewTarget::BaseBranch {
                branch: "main".to_string()
            })
        );
    }
}
