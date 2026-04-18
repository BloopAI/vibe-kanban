//! Handler functions for task_attempts routes.
//!
//! Handlers are organized by concern:
//! - `core`: CRUD operations, status, commits, children, sessions, dev server
//! - `follow_up`: Follow-up execution with retry logic
//! - `review`: Native review execution for supported agents
//! - `git_ops`: Git operations (merge, rebase, push, stash, branch)
//! - `github`: PR creation, attachment, gh CLI setup
//! - `worktree`: File browser, cleanup, worktree path access

pub mod core;
pub mod follow_up;
pub mod git_ops;
pub mod github;
pub mod review;
pub mod worktree;

// Re-export all handlers for convenient access from the router
pub use core::{
    compare_commit_to_head, create_task_attempt, create_task_attempt_by_task_id, fix_sessions,
    get_commit_info, get_task_attempt, get_task_attempt_children, get_task_attempts,
    has_session_error, open_task_attempt_in_editor, run_agent_setup, start_dev_server,
    stop_task_attempt_execution,
};
pub use follow_up::follow_up;
pub use git_ops::{
    abort_conflicts_task_attempt, change_target_branch, force_push_task_attempt_branch,
    get_dirty_files, get_task_attempt_branch_status, merge_task_attempt, pop_stash,
    push_task_attempt_branch, rebase_task_attempt, rename_branch, stash_changes,
};
pub use github::{attach_existing_pr, create_github_pr, gh_cli_setup_handler};
pub use review::review_attempt;
pub use worktree::{
    cleanup_worktree, get_worktree_path, list_worktree_files, purge_build_artifacts,
    read_worktree_file, stream_task_attempt_diff_ws,
};
