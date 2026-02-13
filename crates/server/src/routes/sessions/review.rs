use std::path::PathBuf;

use axum::{Extension, Json, extract::State, response::Json as ResponseJson};
use db::models::{
    coding_agent_turn::CodingAgentTurn,
    execution_process::{ExecutionProcess, ExecutionProcessRunReason},
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
    profile::ExecutorConfig,
};
use serde::{Deserialize, Serialize};
use services::services::container::ContainerService;
use ts_rs::TS;
use utils::response::ApiResponse;

use crate::{DeploymentImpl, error::ApiError};

#[derive(Debug, Deserialize, Serialize, TS)]
pub struct StartReviewRequest {
    pub executor_config: ExecutorConfig,
    pub additional_prompt: Option<String>,
    #[serde(default)]
    pub use_all_workspace_commits: bool,
}

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

    let workspace = Workspace::find_by_id(pool, session.workspace_id)
        .await?
        .ok_or(ApiError::Workspace(WorkspaceError::ValidationError(
            "Workspace not found".to_string(),
        )))?;

    if ExecutionProcess::has_running_non_dev_server_processes_for_workspace(pool, workspace.id)
        .await?
    {
        return Ok(ResponseJson(ApiResponse::error_with_data(
            ReviewError::ProcessAlreadyRunning,
        )));
    }

    let container_ref = deployment
        .container()
        .ensure_container_exists(&workspace)
        .await?;

    let agent_session_id = CodingAgentTurn::find_latest_session_info(pool, session.id)
        .await?
        .map(|info| info.session_id);

    let context: Option<Vec<ExecutorRepoReviewContext>> = if payload.use_all_workspace_commits {
        let repos =
            WorkspaceRepo::find_repos_with_target_branch_for_workspace(pool, workspace.id).await?;
        let workspace_path = PathBuf::from(container_ref.as_str());

        let mut contexts = Vec::new();
        for repo in repos {
            let worktree_path = workspace_path.join(&repo.repo.name);
            if let Ok(base_commit) = deployment.git().get_fork_point(
                &worktree_path,
                &repo.target_branch,
                &workspace.branch,
            ) {
                contexts.push(ExecutorRepoReviewContext {
                    repo_id: repo.repo.id,
                    repo_name: repo.repo.display_name,
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

    let prompt = build_review_prompt(context.as_deref(), payload.additional_prompt.as_deref());
    let resumed_session = agent_session_id.is_some();

    let action = ExecutorAction::new(
        ExecutorActionType::ReviewRequest(ReviewAction {
            executor_config: payload.executor_config.clone(),
            context,
            prompt,
            session_id: agent_session_id,
            working_dir: workspace.agent_working_dir.clone(),
        }),
        None,
    );

    let execution_process = deployment
        .container()
        .start_execution(
            &workspace,
            &session,
            &action,
            &ExecutionProcessRunReason::CodingAgent,
        )
        .await?;

    deployment
        .track_if_analytics_allowed(
            "review_started",
            serde_json::json!({
                "workspace_id": workspace.id.to_string(),
                "session_id": session.id.to_string(),
                "executor": payload.executor_config.executor.to_string(),
                "variant": payload.executor_config.variant,
                "resumed_session": resumed_session,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(execution_process)))
}
