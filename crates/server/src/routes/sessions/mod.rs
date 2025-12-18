pub mod queue;

use axum::{
    Extension, Json, Router,
    extract::{Query, State},
    middleware::from_fn_with_state,
    response::Json as ResponseJson,
    routing::{get, post},
};
use db::models::{
    execution_process::{ExecutionProcess, ExecutionProcessRunReason},
    project_repo::ProjectRepo,
    scratch::{Scratch, ScratchType},
    session::{CreateSession, Session},
    workspace::{Workspace, WorkspaceError},
};
use deployment::Deployment;
use executors::{
    actions::{
        ExecutorAction, ExecutorActionType, coding_agent_follow_up::CodingAgentFollowUpRequest,
    },
    profile::ExecutorProfileId,
};
use serde::Deserialize;
use services::services::container::ContainerService;
use sqlx::Error as SqlxError;
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{
    DeploymentImpl, error::ApiError, middleware::load_session_middleware,
    routes::task_attempts::util::restore_worktrees_to_process,
};

#[derive(Debug, Deserialize)]
pub struct SessionQuery {
    pub workspace_id: Uuid,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateSessionRequest {
    pub workspace_id: Uuid,
    pub executor: Option<String>,
}

pub async fn get_sessions(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<SessionQuery>,
) -> Result<ResponseJson<ApiResponse<Vec<Session>>>, ApiError> {
    let pool = &deployment.db().pool;
    let sessions = Session::find_by_workspace_id(pool, query.workspace_id).await?;
    Ok(ResponseJson(ApiResponse::success(sessions)))
}

pub async fn get_session(
    Extension(session): Extension<Session>,
) -> Result<ResponseJson<ApiResponse<Session>>, ApiError> {
    Ok(ResponseJson(ApiResponse::success(session)))
}

pub async fn create_session(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateSessionRequest>,
) -> Result<ResponseJson<ApiResponse<Session>>, ApiError> {
    let pool = &deployment.db().pool;

    // Verify workspace exists
    let _workspace = Workspace::find_by_id(pool, payload.workspace_id)
        .await?
        .ok_or(ApiError::Workspace(WorkspaceError::ValidationError(
            "Workspace not found".to_string(),
        )))?;

    let session = Session::create(
        pool,
        &CreateSession {
            executor: payload.executor,
        },
        Uuid::new_v4(),
        payload.workspace_id,
    )
    .await?;

    Ok(ResponseJson(ApiResponse::success(session)))
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateFollowUpAttempt {
    pub prompt: String,
    pub variant: Option<String>,
    pub retry_process_id: Option<Uuid>,
    pub force_when_dirty: Option<bool>,
    pub perform_git_reset: Option<bool>,
}

pub async fn follow_up(
    Extension(session): Extension<Session>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateFollowUpAttempt>,
) -> Result<ResponseJson<ApiResponse<ExecutionProcess>>, ApiError> {
    let pool = &deployment.db().pool;

    // Load workspace from session
    let workspace = Workspace::find_by_id(pool, session.workspace_id)
        .await?
        .ok_or(ApiError::Workspace(WorkspaceError::ValidationError(
            "Workspace not found".to_string(),
        )))?;

    tracing::info!("{:?}", workspace);

    deployment
        .container()
        .ensure_container_exists(&workspace)
        .await?;

    // Get executor profile data from the latest CodingAgent process in this session
    let initial_executor_profile_id =
        ExecutionProcess::latest_executor_profile_for_session(pool, session.id).await?;

    let executor_profile_id = ExecutorProfileId {
        executor: initial_executor_profile_id.executor,
        variant: payload.variant,
    };

    // Get parent task
    let task = workspace
        .parent_task(pool)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    // Get parent project
    let project = task
        .parent_project(pool)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    // If retry settings provided, perform replace-logic before proceeding
    if let Some(proc_id) = payload.retry_process_id {
        // Validate process belongs to this session
        let process =
            ExecutionProcess::find_by_id(pool, proc_id)
                .await?
                .ok_or(ApiError::Workspace(WorkspaceError::ValidationError(
                    "Process not found".to_string(),
                )))?;
        if process.session_id != session.id {
            return Err(ApiError::Workspace(WorkspaceError::ValidationError(
                "Process does not belong to this session".to_string(),
            )));
        }

        // Reset all repository worktrees to the state before the target process
        let force_when_dirty = payload.force_when_dirty.unwrap_or(false);
        let perform_git_reset = payload.perform_git_reset.unwrap_or(true);
        restore_worktrees_to_process(
            &deployment,
            pool,
            &workspace,
            proc_id,
            perform_git_reset,
            force_when_dirty,
        )
        .await?;

        // Stop any running processes for this workspace (except dev server)
        deployment.container().try_stop(&workspace, false).await;

        // Soft-drop the target process and all later processes in that session
        let _ = ExecutionProcess::drop_at_and_after(pool, process.session_id, proc_id).await?;
    }

    let latest_agent_session_id =
        ExecutionProcess::find_latest_coding_agent_turn_session_id(pool, session.id).await?;

    let prompt = payload.prompt;

    let project_repos = ProjectRepo::find_by_project_id_with_names(pool, project.id).await?;
    let cleanup_action = deployment
        .container()
        .cleanup_actions_for_repos(&project_repos);

    let action_type = if let Some(agent_session_id) = latest_agent_session_id {
        ExecutorActionType::CodingAgentFollowUpRequest(CodingAgentFollowUpRequest {
            prompt: prompt.clone(),
            session_id: agent_session_id,
            executor_profile_id: executor_profile_id.clone(),
        })
    } else {
        ExecutorActionType::CodingAgentInitialRequest(
            executors::actions::coding_agent_initial::CodingAgentInitialRequest {
                prompt,
                executor_profile_id: executor_profile_id.clone(),
            },
        )
    };

    let action = ExecutorAction::new(action_type, cleanup_action.map(Box::new));

    let execution_process = deployment
        .container()
        .start_execution(
            &workspace,
            &session,
            &action,
            &ExecutionProcessRunReason::CodingAgent,
        )
        .await?;

    // Clear the draft follow-up scratch on successful spawn
    // This ensures the scratch is wiped even if the user navigates away quickly
    if let Err(e) = Scratch::delete(pool, workspace.id, &ScratchType::DraftFollowUp).await {
        // Log but don't fail the request - scratch deletion is best-effort
        tracing::debug!(
            "Failed to delete draft follow-up scratch for attempt {}: {}",
            workspace.id,
            e
        );
    }

    Ok(ResponseJson(ApiResponse::success(execution_process)))
}

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let session_id_router = Router::new()
        .route("/", get(get_session))
        .route("/follow-up", post(follow_up))
        .layer(from_fn_with_state(
            deployment.clone(),
            load_session_middleware,
        ));

    let sessions_router = Router::new()
        .route("/", get(get_sessions).post(create_session))
        .nest("/{session_id}", session_id_router)
        .nest("/{session_id}/queue", queue::router(deployment));

    Router::new().nest("/sessions", sessions_router)
}
