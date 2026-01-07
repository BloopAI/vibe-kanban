use axum::{Extension, Json, extract::State, response::Json as ResponseJson};
use db::models::{
    execution_process::{ExecutionProcess, ExecutionProcessRunReason},
    execution_process_repo_state::ExecutionProcessRepoState,
    session::{CreateSession, Session},
    workspace::Workspace,
};
use deployment::Deployment;
use executors::{
    actions::{ExecutorAction, ExecutorActionType, review::ReviewRequest as ReviewAction},
    profile::ExecutorProfileId,
};
use serde::{Deserialize, Serialize};
use services::services::container::ContainerService;
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

/// Context for a repository in a review request
#[derive(Debug, Clone, Deserialize, Serialize, TS)]
pub struct RepoReviewContext {
    pub repo_id: Uuid,
    pub commit_hashes: Vec<String>,
}

impl From<RepoReviewContext> for executors::actions::review::RepoReviewContext {
    fn from(ctx: RepoReviewContext) -> Self {
        Self {
            repo_id: ctx.repo_id,
            commit_hashes: ctx.commit_hashes,
        }
    }
}

/// Request to start a review session
#[derive(Debug, Deserialize, Serialize, TS)]
pub struct StartReviewRequest {
    pub executor_profile_id: ExecutorProfileId,
    pub context: Option<Vec<RepoReviewContext>>,
    pub additional_prompt: Option<String>,
    /// If true and context is None, automatically include all workspace commits
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
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<StartReviewRequest>,
) -> Result<ResponseJson<ApiResponse<ExecutionProcess, ReviewError>>, ApiError> {
    let pool = &deployment.db().pool;

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

    // Create a fresh session for the review
    let session = Session::create(
        pool,
        &CreateSession {
            executor: Some(payload.executor_profile_id.executor.to_string()),
        },
        Uuid::new_v4(),
        workspace.id,
    )
    .await?;

    // Build context - either from payload or auto-populated from workspace commits
    let context: Option<Vec<executors::actions::review::RepoReviewContext>> =
        if let Some(ctx) = payload.context {
            // Use explicit context if provided
            Some(ctx.into_iter().map(|c| c.into()).collect())
        } else if payload.use_all_workspace_commits {
            // Auto-populate with initial commits for each repo in the workspace
            let initial_commits =
                ExecutionProcessRepoState::find_initial_commits_for_workspace(pool, workspace.id)
                    .await?;

            if initial_commits.is_empty() {
                None
            } else {
                Some(
                    initial_commits
                        .into_iter()
                        .map(|(repo_id, initial_commit)| {
                            executors::actions::review::RepoReviewContext {
                                repo_id,
                                // Store just the initial commit - prompt will say "from this commit onwards"
                                commit_hashes: vec![initial_commit],
                            }
                        })
                        .collect(),
                )
            }
        } else {
            None
        };

    // Build the review action
    let action = ExecutorAction::new(
        ExecutorActionType::ReviewRequest(ReviewAction {
            executor_profile_id: payload.executor_profile_id.clone(),
            context,
            additional_prompt: payload.additional_prompt,
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
                "executor": payload.executor_profile_id.executor.to_string(),
                "variant": payload.executor_profile_id.variant,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(execution_process)))
}
