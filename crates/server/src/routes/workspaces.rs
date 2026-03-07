pub mod codex_setup;
pub mod core;
pub mod create;
pub mod cursor_setup;
pub mod execution;
pub mod gh_cli_setup;
pub mod git;
pub mod images;
pub mod integration;
pub mod links;
pub mod pr;
pub mod repos;
pub mod streams;
pub mod workspace_summary;

use ::git::ConflictOp;
use axum::{
    Router,
    middleware::from_fn_with_state,
    routing::{get, post},
};
use db::models::{merge::Merge, workspace::Workspace, workspace_repo::RepoWithTargetBranch};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

use crate::{DeploymentImpl, middleware::load_workspace_middleware};

#[derive(Debug, Deserialize, Serialize, TS)]
pub struct RebaseWorkspaceRequest {
    pub repo_id: Uuid,
    pub old_base_branch: Option<String>,
    pub new_base_branch: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, TS)]
pub struct AbortConflictsRequest {
    pub repo_id: Uuid,
}

#[derive(Debug, Deserialize, Serialize, TS)]
pub struct ContinueRebaseRequest {
    pub repo_id: Uuid,
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(tag = "type", rename_all = "snake_case")]
pub enum GitOperationError {
    MergeConflicts {
        message: String,
        op: ConflictOp,
        conflicted_files: Vec<String>,
        target_branch: String,
    },
    RebaseInProgress,
}

#[derive(Debug, Deserialize)]
pub struct DiffStreamQuery {
    #[serde(default)]
    pub stats_only: bool,
}

#[derive(Debug, Deserialize)]
pub struct WorkspaceStreamQuery {
    pub archived: Option<bool>,
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct DeleteWorkspaceQuery {
    #[serde(default)]
    pub delete_remote: bool,
    #[serde(default)]
    pub delete_branches: bool,
}

#[derive(Debug, Deserialize)]
pub struct LinkWorkspaceRequest {
    pub project_id: Uuid,
    pub issue_id: Uuid,
}

#[derive(Debug, Deserialize, Serialize, TS)]
pub struct AddWorkspaceRepoRequest {
    pub repo_id: Uuid,
    pub target_branch: String,
}

#[derive(Debug, Serialize, TS)]
pub struct AddWorkspaceRepoResponse {
    pub workspace: Workspace,
    pub repo: RepoWithTargetBranch,
}

#[derive(Debug, Deserialize, Serialize, TS)]
pub struct RunAgentSetupRequest {
    pub executor_profile_id: executors::profile::ExecutorProfileId,
}

#[derive(Debug, Serialize, TS)]
pub struct RunAgentSetupResponse {}

#[derive(Debug, Deserialize, Serialize, TS)]
pub struct MergeWorkspaceRequest {
    pub repo_id: Uuid,
}

#[derive(Debug, Deserialize, Serialize, TS)]
pub struct PushWorkspaceRequest {
    pub repo_id: Uuid,
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(tag = "type", rename_all = "snake_case")]
pub enum PushError {
    ForcePushRequired,
}

#[derive(serde::Deserialize, TS)]
pub struct OpenEditorRequest {
    editor_type: Option<String>,
    file_path: Option<String>,
}

#[derive(Debug, Serialize, TS)]
pub struct OpenEditorResponse {
    pub url: Option<String>,
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
    pub is_rebase_in_progress: bool,
    pub conflict_op: Option<ConflictOp>,
    pub conflicted_files: Vec<String>,
    pub is_target_remote: bool,
}

#[derive(Debug, Clone, Serialize, TS)]
pub struct RepoBranchStatus {
    pub repo_id: Uuid,
    pub repo_name: String,
    #[serde(flatten)]
    pub status: BranchStatus,
}

#[derive(serde::Deserialize, Debug, TS)]
pub struct ChangeTargetBranchRequest {
    pub repo_id: Uuid,
    pub new_target_branch: String,
}

#[derive(serde::Serialize, Debug, TS)]
pub struct ChangeTargetBranchResponse {
    pub repo_id: Uuid,
    pub new_target_branch: String,
    pub status: (usize, usize),
}

#[derive(serde::Deserialize, Debug, TS)]
pub struct RenameBranchRequest {
    pub new_branch_name: String,
}

#[derive(serde::Serialize, Debug, TS)]
pub struct RenameBranchResponse {
    pub branch: String,
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(tag = "type", rename_all = "snake_case")]
pub enum RenameBranchError {
    EmptyBranchName,
    InvalidBranchNameFormat,
    OpenPullRequest,
    BranchAlreadyExists { repo_name: String },
    RebaseInProgress { repo_name: String },
    RenameFailed { repo_name: String, message: String },
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(tag = "type", rename_all = "snake_case")]
pub enum RunScriptError {
    NoScriptConfigured,
    ProcessAlreadyRunning,
}

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let workspace_id_router = Router::new()
        .route(
            "/",
            get(core::get_workspace)
                .put(core::update_workspace)
                .delete(core::delete_workspace),
        )
        .route("/messages/first", get(core::get_first_user_message))
        .route("/seen", axum::routing::put(core::mark_seen))
        .nest("/git", git_router())
        .nest("/execution", execution_router())
        .nest("/integration", integration_router())
        .nest("/repos", repos_router())
        .nest("/pull-requests", pr::router())
        .layer(from_fn_with_state(
            deployment.clone(),
            load_workspace_middleware,
        ));

    let workspaces_router = Router::new()
        .route(
            "/",
            get(core::get_workspaces).post(create::create_workspace),
        )
        .route("/start", post(create::create_and_start_workspace))
        .route("/from-pr", post(pr::create_workspace_from_pr))
        .route("/streams/ws", get(streams::stream_workspaces_ws))
        .route(
            "/summaries",
            post(workspace_summary::get_workspace_summaries),
        )
        .nest("/{id}", workspace_id_router)
        .nest("/{id}/images", images::router(deployment))
        .nest("/{id}/links", links::router(deployment));

    Router::new().nest("/workspaces", workspaces_router)
}

fn git_router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/status", get(git::get_workspace_branch_status))
        .route("/diff/ws", get(git::stream_diff_ws))
        .route("/merge", post(git::merge_workspace))
        .route("/push", post(git::push_workspace_branch))
        .route("/push/force", post(git::force_push_workspace_branch))
        .route("/rebase", post(git::rebase_workspace))
        .route("/rebase/continue", post(git::continue_workspace_rebase))
        .route("/conflicts/abort", post(git::abort_workspace_conflicts))
        .route(
            "/target-branch",
            axum::routing::put(git::change_target_branch),
        )
        .route("/branch", axum::routing::put(git::rename_branch))
}

fn execution_router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/dev-server/start", post(execution::start_dev_server))
        .route("/cleanup", post(execution::run_cleanup_script))
        .route("/archive", post(execution::run_archive_script))
        .route("/stop", post(execution::stop_workspace_execution))
}

fn integration_router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/editor/open", post(integration::open_workspace_in_editor))
        .route("/agent/setup", post(integration::run_agent_setup))
        .route("/github/cli/setup", post(integration::gh_cli_setup_handler))
}

fn repos_router() -> Router<DeploymentImpl> {
    Router::new().route(
        "/",
        get(repos::get_workspace_repos).post(repos::add_workspace_repo),
    )
}
