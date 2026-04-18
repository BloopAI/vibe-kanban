pub mod codex_setup;
pub mod cursor_setup;
pub mod drafts;
pub mod gh_cli_setup;
pub mod handlers;
pub mod types;
pub mod util;

// Re-export utility functions for sibling modules
pub use util::ensure_worktree_path;

// Re-export types for public API
pub use types::{
    AttachPrResponse, BranchStatus, ChangeTargetBranchRequest, ChangeTargetBranchResponse,
    CommitCompareResult, CommitInfo, CreateFollowUpAttempt, CreateGitHubPrRequest, CreatePrError,
    CreateReviewAttempt, CreateTaskAttemptBody, CreateTaskAttemptByTaskIdBody, DiffStreamQuery,
    DirtyFilesResponse, FixSessionsResponse, GitOperationError, ListFilesQuery, OpenEditorRequest,
    OpenEditorResponse, PushError, RebaseTaskAttemptRequest, RenameBranchRequest,
    RenameBranchResponse, RunAgentSetupRequest, RunAgentSetupResponse, StashChangesRequest,
    StashChangesResponse, TaskAttemptQuery, WorktreePathResponse,
};

use axum::{
    Router,
    middleware::from_fn_with_state,
    routing::{get, post},
};

use crate::{
    DeploymentImpl,
    middleware::{
        load_task_attempt_by_task_id_middleware,
        load_task_attempt_by_task_id_middleware_with_wildcard, load_task_attempt_middleware,
        load_task_attempt_middleware_with_wildcard, load_task_by_task_id_middleware,
    },
};

// Import handlers from the handlers module
use handlers::{
    abort_conflicts_task_attempt,
    attach_existing_pr,
    change_target_branch,
    cleanup_worktree,
    compare_commit_to_head,
    // GitHub handlers
    create_github_pr,
    // Core handlers
    create_task_attempt,
    create_task_attempt_by_task_id,
    fix_sessions,
    // Follow-up handler
    follow_up,
    force_push_task_attempt_branch,
    get_commit_info,
    get_dirty_files,
    get_task_attempt,
    get_task_attempt_branch_status,
    get_task_attempt_children,
    get_task_attempts,
    get_worktree_path,
    gh_cli_setup_handler,
    has_session_error,
    list_worktree_files,
    // Git ops handlers
    merge_task_attempt,
    open_task_attempt_in_editor,
    pop_stash,
    purge_build_artifacts,
    push_task_attempt_branch,
    read_worktree_file,
    rebase_task_attempt,
    rename_branch,
    review_attempt,
    run_agent_setup,
    start_dev_server,
    stash_changes,
    stop_task_attempt_execution,
    // Worktree handlers
    stream_task_attempt_diff_ws,
};

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let task_attempt_id_router = Router::new()
        .route("/", get(get_task_attempt))
        .route("/follow-up", post(follow_up))
        .route("/review", post(review_attempt))
        .route("/run-agent-setup", post(run_agent_setup))
        .route("/gh-cli-setup", post(gh_cli_setup_handler))
        .route(
            "/draft",
            get(drafts::get_draft)
                .put(drafts::save_draft)
                .delete(drafts::delete_draft),
        )
        .route("/draft/queue", post(drafts::set_draft_queue))
        .route("/commit-info", get(get_commit_info))
        .route("/commit-compare", get(compare_commit_to_head))
        .route("/start-dev-server", post(start_dev_server))
        .route("/branch-status", get(get_task_attempt_branch_status))
        .route("/diff/ws", get(stream_task_attempt_diff_ws))
        .route("/merge", post(merge_task_attempt))
        .route("/push", post(push_task_attempt_branch))
        .route("/push/force", post(force_push_task_attempt_branch))
        .route("/rebase", post(rebase_task_attempt))
        .route("/conflicts/abort", post(abort_conflicts_task_attempt))
        // Stash endpoints for handling uncommitted changes
        .route("/stash/dirty-files", get(get_dirty_files))
        .route("/stash", post(stash_changes))
        .route("/stash/pop", post(pop_stash))
        .route("/pr", post(create_github_pr))
        .route("/pr/attach", post(attach_existing_pr))
        .route("/open-editor", post(open_task_attempt_in_editor))
        .route("/children", get(get_task_attempt_children))
        .route("/stop", post(stop_task_attempt_execution))
        .route("/change-target-branch", post(change_target_branch))
        .route("/rename-branch", post(rename_branch))
        // Worktree path endpoint (for terminal sessions)
        .route("/worktree-path", get(get_worktree_path))
        // Worktree cleanup endpoint (deletes worktree filesystem and marks as deleted)
        .route("/cleanup", post(cleanup_worktree))
        // Purge build artifacts endpoint (removes target/, node_modules/, etc. without deleting worktree)
        .route("/purge", post(purge_build_artifacts))
        // Session error handling endpoints
        .route("/fix-sessions", post(fix_sessions))
        .route("/has-session-error", get(has_session_error))
        // File browser endpoints (directory listing only - wildcard route is separate)
        .route("/files", get(list_worktree_files))
        .layer(from_fn_with_state(
            deployment.clone(),
            load_task_attempt_middleware,
        ));

    // Wildcard file path route needs to be separate (not nested) to avoid
    // path parameter count mismatch in the middleware. Uses the wildcard variant
    // that extracts both path params but only uses the id.
    let task_attempt_files_router = Router::new()
        .route("/{id}/files/{*file_path}", get(read_worktree_file))
        .layer(from_fn_with_state(
            deployment.clone(),
            load_task_attempt_middleware_with_wildcard,
        ));

    // Routes for accessing task attempts by shared_task_id (used for node-to-node proxying).
    // These routes allow a proxying node to request data using the Hive shared task ID.
    // The middleware finds the task by shared_task_id and loads its most recent attempt.
    let by_task_id_router = Router::new()
        .route("/follow-up", post(follow_up))
        .route("/review", post(review_attempt))
        .route("/stop", post(stop_task_attempt_execution))
        .route("/branch-status", get(get_task_attempt_branch_status))
        .route("/push", post(push_task_attempt_branch))
        .route("/push/force", post(force_push_task_attempt_branch))
        .route("/merge", post(merge_task_attempt))
        .route("/rebase", post(rebase_task_attempt))
        .route("/conflicts/abort", post(abort_conflicts_task_attempt))
        // Stash endpoints for handling uncommitted changes
        .route("/stash/dirty-files", get(get_dirty_files))
        .route("/stash", post(stash_changes))
        .route("/stash/pop", post(pop_stash))
        .route("/change-target-branch", post(change_target_branch))
        .route("/rename-branch", post(rename_branch))
        .route("/pr", post(create_github_pr))
        .route("/pr/attach", post(attach_existing_pr))
        .route(
            "/draft",
            get(drafts::get_draft)
                .put(drafts::save_draft)
                .delete(drafts::delete_draft),
        )
        .route("/draft/queue", post(drafts::set_draft_queue))
        .route("/files", get(list_worktree_files))
        .route("/diff/ws", get(stream_task_attempt_diff_ws))
        // These routes were added for node-to-node proxy support
        .route("/children", get(get_task_attempt_children))
        .route("/has-session-error", get(has_session_error))
        .route("/fix-sessions", post(fix_sessions))
        .layer(from_fn_with_state(
            deployment.clone(),
            load_task_attempt_by_task_id_middleware,
        ));

    // Wildcard file path route for by-task-id (file content browsing)
    let by_task_id_files_router = Router::new()
        .route(
            "/by-task-id/{task_id}/files/{*file_path}",
            get(read_worktree_file),
        )
        .layer(from_fn_with_state(
            deployment.clone(),
            load_task_attempt_by_task_id_middleware_with_wildcard,
        ));

    // Route for creating task attempts via shared_task_id (cross-node proxying).
    // Uses different middleware that only loads Task (not TaskAttempt).
    let by_task_id_create_router = Router::new()
        .route(
            "/by-task-id/{task_id}/create",
            post(create_task_attempt_by_task_id),
        )
        .layer(from_fn_with_state(
            deployment.clone(),
            load_task_by_task_id_middleware,
        ));

    let task_attempts_router = Router::new()
        .route("/", get(get_task_attempts).post(create_task_attempt))
        .nest("/{id}", task_attempt_id_router)
        .merge(task_attempt_files_router)
        .nest("/by-task-id/{task_id}", by_task_id_router)
        .merge(by_task_id_files_router)
        .merge(by_task_id_create_router);

    Router::new().nest("/task-attempts", task_attempts_router)
}

// Note: Type tests are in types.rs
// Note: Tests for check_remote_task_attempt_proxy are in crates/server/src/proxy.rs
