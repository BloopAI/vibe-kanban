use axum::{Extension, Json, extract::State, response::Json as ResponseJson};
use db::models::{
    execution_process::{ExecutionProcess, ExecutionProcessRunReason},
    execution_process_repo_state::ExecutionProcessRepoState,
    session::Session,
    workspace::{Workspace, WorkspaceError},
    workspace_repo::WorkspaceRepo,
};
use deployment::Deployment;
use executors::{
    actions::{
        ExecutorAction, ExecutorActionType,
        review::{RepoReviewContext as ExecutorRepoReviewContext, ReviewRequest as ReviewAction},
    },
    executors::build_review_prompt,
    profile::ExecutorProfileId,
};
use serde::{Deserialize, Serialize};
use services::services::container::ContainerService;
use ts_rs::TS;
use utils::response::ApiResponse;

use crate::{DeploymentImpl, error::ApiError};

/// Request to start a review session
#[derive(Debug, Deserialize, Serialize, TS)]
pub struct StartReviewRequest {
    pub executor_profile_id: ExecutorProfileId,
    pub additional_prompt: Option<String>,
    /// If true, automatically include all workspace commits from initial state
    #[serde(default)]
    pub use_all_workspace_commits: bool,
}

/// Error types for review operations
#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(tag = "type", rename_all = "snake_case")]
pub enum ReviewError {
    ProcessAlreadyRunning,
}

#[axum::debug_handler]
pub async fn start_review(
    Extension(session): Extension<Session>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<StartReviewRequest>,
) -> Result<ResponseJson<ApiResponse<ExecutionProcess, ReviewError>>, ApiError> {
    let pool = &deployment.db().pool;

    // Load workspace from session
    let workspace = Workspace::find_by_id(pool, session.workspace_id)
        .await?
        .ok_or(ApiError::Workspace(WorkspaceError::ValidationError(
            "Workspace not found".to_string(),
        )))?;

    // Check if any non-dev-server processes are already running for this workspace
    if ExecutionProcess::has_running_non_dev_server_processes_for_workspace(pool, workspace.id)
        .await?
    {
        return Ok(ResponseJson(ApiResponse::error_with_data(
            ReviewError::ProcessAlreadyRunning,
        )));
    }

    // Ensure container exists
    deployment
        .container()
        .ensure_container_exists(&workspace)
        .await?;

    // Lookup agent session_id from previous execution in this session (for session resumption)
    let agent_session_id =
        ExecutionProcess::find_latest_coding_agent_turn_session_id(pool, session.id).await?;

    // Build context - auto-populated from workspace commits when requested
    let context: Option<Vec<ExecutorRepoReviewContext>> = if payload.use_all_workspace_commits {
        let repos = WorkspaceRepo::find_repos_for_workspace(pool, workspace.id).await?;
        let mut contexts = Vec::new();
        for repo in repos {
            if let Some(base_commit) =
                ExecutionProcessRepoState::find_initial_commit_for_repo(pool, workspace.id, repo.id)
                    .await?
            {
                contexts.push(ExecutorRepoReviewContext {
                    repo_id: repo.id,
                    repo_name: repo.display_name,
                    base_commit,
                });
            }
        }
        if contexts.is_empty() {
            None
        } else {
            Some(contexts)
        }
    } else {
        None
    };

    // Build the full prompt for display and execution
    let prompt = build_review_prompt(context.as_deref(), payload.additional_prompt.as_deref());

    // Track whether we're resuming a session (before moving agent_session_id)
    let resumed_session = agent_session_id.is_some();

    // Build the review action
    let action = ExecutorAction::new(
        ExecutorActionType::ReviewRequest(ReviewAction {
            executor_profile_id: payload.executor_profile_id.clone(),
            context,
            prompt,
            session_id: agent_session_id,
            working_dir: workspace.agent_working_dir.clone(),
        }),
        None,
    );

    // Start execution
    let execution_process = deployment
        .container()
        .start_execution(
            &workspace,
            &session,
            &action,
            &ExecutionProcessRunReason::CodingAgent,
        )
        .await?;

    // Track analytics
    deployment
        .track_if_analytics_allowed(
            "review_started",
            serde_json::json!({
                "workspace_id": workspace.id.to_string(),
                "session_id": session.id.to_string(),
                "executor": payload.executor_profile_id.executor.to_string(),
                "variant": payload.executor_profile_id.variant,
                "resumed_session": resumed_session,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(execution_process)))
}
