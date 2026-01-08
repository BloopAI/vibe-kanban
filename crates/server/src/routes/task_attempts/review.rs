use axum::{Extension, Json, extract::State, response::Json as ResponseJson};
use db::models::{
    execution_process::{ExecutionProcess, ExecutionProcessRunReason},
    execution_process_repo_state::ExecutionProcessRepoState,
    repo::Repo,
    session::{CreateSession, Session},
    workspace::Workspace,
};
use deployment::Deployment;
use executors::{
    actions::{
        ExecutorAction, ExecutorActionType,
        review::{
            CommitRange, RepoReviewContext as ExecutorRepoReviewContext,
            ReviewRequest as ReviewAction,
        },
    },
    executors::build_review_prompt,
    profile::ExecutorProfileId,
};
use serde::{Deserialize, Serialize};
use services::services::container::ContainerService;
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

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

    // Use existing session if available (so review logs appear in same conversation view)
    let session = match Session::find_latest_by_workspace_id(pool, workspace.id).await? {
        Some(s) => s,
        None => {
            Session::create(
                pool,
                &CreateSession {
                    executor: Some(payload.executor_profile_id.executor.to_string()),
                },
                Uuid::new_v4(),
                workspace.id,
            )
            .await?
        }
    };

    // Build context - auto-populated from workspace commits when requested
    let context: Option<Vec<ExecutorRepoReviewContext>> = if payload.use_all_workspace_commits {
        // Auto-populate with initial commits for each repo in the workspace
        let initial_commits =
            ExecutionProcessRepoState::find_initial_commits_for_workspace(pool, workspace.id)
                .await?;

        if initial_commits.is_empty() {
            None
        } else {
            // Look up repo names
            let repo_ids: Vec<Uuid> = initial_commits.iter().map(|(id, _)| *id).collect();
            let repos = Repo::find_by_ids(pool, &repo_ids).await?;
            let repo_map: std::collections::HashMap<Uuid, &Repo> =
                repos.iter().map(|r| (r.id, r)).collect();

            Some(
                initial_commits
                    .into_iter()
                    .filter_map(|(repo_id, initial_commit)| {
                        let repo = repo_map.get(&repo_id)?;
                        Some(ExecutorRepoReviewContext {
                            repo_id,
                            repo_name: repo.display_name.clone(),
                            commits: CommitRange::FromBase {
                                commit: initial_commit,
                            },
                        })
                    })
                    .collect(),
            )
        }
    } else {
        None
    };

    // Build the full prompt for display and execution
    let prompt = build_review_prompt(context.as_deref(), payload.additional_prompt.as_deref());

    // Build the review action
    let action = ExecutorAction::new(
        ExecutorActionType::ReviewRequest(ReviewAction {
            executor_profile_id: payload.executor_profile_id.clone(),
            context,
            prompt,
            session_id: None, // TODO: wire up from StartReviewRequest if needed
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
