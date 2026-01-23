use std::{collections::HashMap, path::PathBuf};

use anyhow;
use axum::{
    Extension, Json, Router,
    extract::{
        Query, State,
        ws::{WebSocket, WebSocketUpgrade},
    },
    http::StatusCode,
    middleware::from_fn_with_state,
    response::{IntoResponse, Json as ResponseJson},
    routing::{delete, get, post, put},
};
use db::models::{
    execution_process::{ExecutionProcess, ExecutionProcessRunReason},
    image::TaskImage,
    repo::{Repo, RepoError},
    session::{CreateSession, Session},
    task::{CreateTask, Task, TaskType, TaskWithAttemptStatus, UpdateTask},
    workspace::{CreateWorkspace, Workspace},
    workspace_repo::{CreateWorkspaceRepo, WorkspaceRepo},
};
use deployment::Deployment;
use executors::{
    actions::{
        ExecutorAction, ExecutorActionType,
        coding_agent_follow_up::CodingAgentFollowUpRequest,
        coding_agent_initial::CodingAgentInitialRequest,
    },
    executors::BaseCodingAgent,
    profile::ExecutorProfileId,
};
use futures_util::{SinkExt, StreamExt, TryStreamExt};
use serde::{Deserialize, Serialize};
use services::services::{
    container::ContainerService,
    ralph::{RalphError, RalphService, RalphStory, StoryCommit},
    workspace_manager::WorkspaceManager,
};
use sqlx::Error as SqlxError;
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{
    DeploymentImpl, error::ApiError, middleware::load_task_middleware,
    routes::task_attempts::WorkspaceRepoInput,
};

#[derive(Debug, Serialize, Deserialize)]
pub struct TaskQuery {
    pub project_id: Uuid,
}

pub async fn get_tasks(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<TaskQuery>,
) -> Result<ResponseJson<ApiResponse<Vec<TaskWithAttemptStatus>>>, ApiError> {
    let tasks =
        Task::find_by_project_id_with_attempt_status(&deployment.db().pool, query.project_id)
            .await?;

    Ok(ResponseJson(ApiResponse::success(tasks)))
}

pub async fn stream_tasks_ws(
    ws: WebSocketUpgrade,
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<TaskQuery>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| async move {
        if let Err(e) = handle_tasks_ws(socket, deployment, query.project_id).await {
            tracing::warn!("tasks WS closed: {}", e);
        }
    })
}

async fn handle_tasks_ws(
    socket: WebSocket,
    deployment: DeploymentImpl,
    project_id: Uuid,
) -> anyhow::Result<()> {
    // Get the raw stream and convert LogMsg to WebSocket messages
    let mut stream = deployment
        .events()
        .stream_tasks_raw(project_id)
        .await?
        .map_ok(|msg| msg.to_ws_message_unchecked());

    // Split socket into sender and receiver
    let (mut sender, mut receiver) = socket.split();

    // Drain (and ignore) any client->server messages so pings/pongs work
    tokio::spawn(async move { while let Some(Ok(_)) = receiver.next().await {} });

    // Forward server messages
    while let Some(item) = stream.next().await {
        match item {
            Ok(msg) => {
                if sender.send(msg).await.is_err() {
                    break; // client disconnected
                }
            }
            Err(e) => {
                tracing::error!("stream error: {}", e);
                break;
            }
        }
    }
    Ok(())
}

pub async fn get_task(
    Extension(task): Extension<Task>,
    State(_deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Task>>, ApiError> {
    Ok(ResponseJson(ApiResponse::success(task)))
}

pub async fn create_task(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateTask>,
) -> Result<ResponseJson<ApiResponse<Task>>, ApiError> {
    let id = Uuid::new_v4();

    tracing::debug!(
        "Creating task '{}' in project {}",
        payload.title,
        payload.project_id
    );

    let task = Task::create(&deployment.db().pool, &payload, id).await?;

    if let Some(image_ids) = &payload.image_ids {
        TaskImage::associate_many_dedup(&deployment.db().pool, task.id, image_ids).await?;
    }

    deployment
        .track_if_analytics_allowed(
            "task_created",
            serde_json::json!({
            "task_id": task.id.to_string(),
            "project_id": payload.project_id,
            "has_description": task.description.is_some(),
            "has_images": payload.image_ids.is_some(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(task)))
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateAndStartTaskRequest {
    pub task: CreateTask,
    pub executor_profile_id: ExecutorProfileId,
    pub repos: Vec<WorkspaceRepoInput>,
}

pub async fn create_task_and_start(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateAndStartTaskRequest>,
) -> Result<ResponseJson<ApiResponse<TaskWithAttemptStatus>>, ApiError> {
    if payload.repos.is_empty() {
        return Err(ApiError::BadRequest(
            "At least one repository is required".to_string(),
        ));
    }

    let pool = &deployment.db().pool;

    let task_id = Uuid::new_v4();
    let task = Task::create(pool, &payload.task, task_id).await?;

    if let Some(image_ids) = &payload.task.image_ids {
        TaskImage::associate_many_dedup(pool, task.id, image_ids).await?;
    }

    deployment
        .track_if_analytics_allowed(
            "task_created",
            serde_json::json!({
                "task_id": task.id.to_string(),
                "project_id": task.project_id,
                "has_description": task.description.is_some(),
                "has_images": payload.task.image_ids.is_some(),
            }),
        )
        .await;

    let attempt_id = Uuid::new_v4();
    let git_branch_name = deployment
        .container()
        .git_branch_from_workspace(&attempt_id, &task.title)
        .await;

    // Compute agent_working_dir based on repo count:
    // - Single repo: use repo name as working dir (agent runs in repo directory)
    // - Multiple repos: use None (agent runs in workspace root)
    let agent_working_dir = if payload.repos.len() == 1 {
        let repo = Repo::find_by_id(pool, payload.repos[0].repo_id)
            .await?
            .ok_or(RepoError::NotFound)?;
        Some(repo.name)
    } else {
        None
    };

    let workspace = Workspace::create(
        pool,
        &CreateWorkspace {
            branch: git_branch_name,
            agent_working_dir,
        },
        attempt_id,
        task.id,
    )
    .await?;

    let workspace_repos: Vec<CreateWorkspaceRepo> = payload
        .repos
        .iter()
        .map(|r| CreateWorkspaceRepo {
            repo_id: r.repo_id,
            target_branch: r.target_branch.clone(),
            start_from_ref: None,
        })
        .collect();
    WorkspaceRepo::create_many(&deployment.db().pool, workspace.id, &workspace_repos).await?;

    let is_attempt_running = deployment
        .container()
        .start_workspace(&workspace, payload.executor_profile_id.clone())
        .await
        .inspect_err(|err| tracing::error!("Failed to start task attempt: {}", err))
        .is_ok();
    deployment
        .track_if_analytics_allowed(
            "task_attempt_started",
            serde_json::json!({
                "task_id": task.id.to_string(),
                "executor": &payload.executor_profile_id.executor,
                "variant": &payload.executor_profile_id.variant,
                "workspace_id": workspace.id.to_string(),
            }),
        )
        .await;

    let task = Task::find_by_id(pool, task.id)
        .await?
        .ok_or(ApiError::Database(SqlxError::RowNotFound))?;

    tracing::info!("Started attempt for task {}", task.id);
    Ok(ResponseJson(ApiResponse::success(TaskWithAttemptStatus {
        task,
        has_in_progress_attempt: is_attempt_running,
        last_attempt_failed: false,
        executor: payload.executor_profile_id.executor.to_string(),
    })))
}

pub async fn update_task(
    Extension(existing_task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,

    Json(payload): Json<UpdateTask>,
) -> Result<ResponseJson<ApiResponse<Task>>, ApiError> {
    // Use existing values if not provided in update
    let title = payload.title.unwrap_or(existing_task.title);
    let description = match payload.description {
        Some(s) if s.trim().is_empty() => None, // Empty string = clear description
        Some(s) => Some(s),                     // Non-empty string = update description
        None => existing_task.description,      // Field omitted = keep existing
    };
    let status = payload.status.unwrap_or(existing_task.status);
    let parent_workspace_id = payload
        .parent_workspace_id
        .or(existing_task.parent_workspace_id);

    let task = Task::update(
        &deployment.db().pool,
        existing_task.id,
        existing_task.project_id,
        title,
        description,
        status,
        parent_workspace_id,
    )
    .await?;

    if let Some(image_ids) = &payload.image_ids {
        TaskImage::delete_by_task_id(&deployment.db().pool, task.id).await?;
        TaskImage::associate_many_dedup(&deployment.db().pool, task.id, image_ids).await?;
    }

    Ok(ResponseJson(ApiResponse::success(task)))
}

pub async fn delete_task(
    Extension(task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,
) -> Result<(StatusCode, ResponseJson<ApiResponse<()>>), ApiError> {
    let pool = &deployment.db().pool;

    // Gather task attempts data needed for background cleanup
    let attempts = Workspace::fetch_all(pool, Some(task.id))
        .await
        .map_err(|e| {
            tracing::error!("Failed to fetch task attempts for task {}: {}", task.id, e);
            ApiError::Workspace(e)
        })?;

    // Stop any running execution processes before deletion
    for workspace in &attempts {
        deployment.container().try_stop(workspace, true).await;
    }

    let repositories = WorkspaceRepo::find_unique_repos_for_task(pool, task.id).await?;

    // Collect workspace directories that need cleanup
    let workspace_dirs: Vec<PathBuf> = attempts
        .iter()
        .filter_map(|attempt| attempt.container_ref.as_ref().map(PathBuf::from))
        .collect();

    // Use a transaction to ensure atomicity: either all operations succeed or all are rolled back
    let mut tx = pool.begin().await?;

    // Nullify parent_workspace_id for all child tasks before deletion
    // This breaks parent-child relationships to avoid foreign key constraint violations
    let mut total_children_affected = 0u64;
    for attempt in &attempts {
        let children_affected =
            Task::nullify_children_by_workspace_id(&mut *tx, attempt.id).await?;
        total_children_affected += children_affected;
    }

    // Delete task from database (FK CASCADE will handle task_attempts)
    let rows_affected = Task::delete(&mut *tx, task.id).await?;

    if rows_affected == 0 {
        return Err(ApiError::Database(SqlxError::RowNotFound));
    }

    // Commit the transaction - if this fails, all changes are rolled back
    tx.commit().await?;

    if total_children_affected > 0 {
        tracing::info!(
            "Nullified {} child task references before deleting task {}",
            total_children_affected,
            task.id
        );
    }

    deployment
        .track_if_analytics_allowed(
            "task_deleted",
            serde_json::json!({
                "task_id": task.id.to_string(),
                "project_id": task.project_id.to_string(),
                "attempt_count": attempts.len(),
            }),
        )
        .await;

    let task_id = task.id;
    let pool = pool.clone();
    tokio::spawn(async move {
        tracing::info!(
            "Starting background cleanup for task {} ({} workspaces, {} repos)",
            task_id,
            workspace_dirs.len(),
            repositories.len()
        );

        for workspace_dir in &workspace_dirs {
            if let Err(e) = WorkspaceManager::cleanup_workspace(workspace_dir, &repositories).await
            {
                tracing::error!(
                    "Background workspace cleanup failed for task {} at {}: {}",
                    task_id,
                    workspace_dir.display(),
                    e
                );
            }
        }

        match Repo::delete_orphaned(&pool).await {
            Ok(count) if count > 0 => {
                tracing::info!("Deleted {} orphaned repo records", count);
            }
            Err(e) => {
                tracing::error!("Failed to delete orphaned repos: {}", e);
            }
            _ => {}
        }

        tracing::info!("Background cleanup completed for task {}", task_id);
    });

    // Return 202 Accepted to indicate deletion was scheduled
    Ok((StatusCode::ACCEPTED, ResponseJson(ApiResponse::success(()))))
}

/// Response for Ralph status endpoint
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct RalphStatusResponse {
    pub total_stories: usize,
    pub completed_count: usize,
    pub stories: Vec<RalphStory>,
    pub current_story: Option<RalphStory>,
    /// Index of the current story (first with passes: false), if any
    pub current_story_index: Option<usize>,
    pub has_in_progress: bool,
    /// Whether the PRD has been started (autonomous mode active)
    pub started: bool,
    /// Custom prompt for autonomous iterations (if set in prd.json)
    pub iteration_prompt: Option<String>,
}

/// Get Ralph status for a task
/// Returns 404 if task is not Ralph type or has no workspace
pub async fn get_ralph_status(
    Extension(task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<RalphStatusResponse>>, ApiError> {
    let pool = &deployment.db().pool;

    // Check if task is Ralph type
    if task.task_type != TaskType::Ralph {
        return Err(ApiError::BadRequest(format!(
            "Task {} is not a Ralph task",
            task.id
        )));
    }

    // Get the first workspace for this task
    let workspaces = Workspace::fetch_all(pool, Some(task.id)).await?;
    let workspace = workspaces.first().ok_or_else(|| {
        ApiError::BadRequest(format!("No workspace found for task {}", task.id))
    })?;

    // Get the container ref (workspace directory)
    let workspace_dir = workspace.container_ref.as_ref().ok_or_else(|| {
        ApiError::BadRequest("Workspace has no container reference".to_string())
    })?;

    // Get the first repo in the workspace
    let repos = WorkspaceRepo::find_repos_for_workspace(pool, workspace.id).await?;
    let repo = repos.first().ok_or_else(|| {
        ApiError::BadRequest("No repos found for workspace".to_string())
    })?;

    // Build repo path
    let repo_path = PathBuf::from(workspace_dir).join(&repo.name);

    // Get Ralph status from prd.json in .ralph/
    let response = match RalphService::get_status_from_repo(&repo_path) {
        Ok(status) => {
            // Find the index of the current story (first with passes: false)
            let current_story_index = status.stories.iter().position(|s| !s.passes);
            RalphStatusResponse {
                total_stories: status.total_stories,
                completed_count: status.completed_count,
                stories: status.stories,
                current_story: status.current_story,
                current_story_index,
                has_in_progress: status.has_in_progress,
                started: status.started,
                iteration_prompt: status.iteration_prompt,
            }
        }
        Err(RalphError::PrdNotFound) => {
            // Return empty status if prd.json doesn't exist yet
            RalphStatusResponse {
                total_stories: 0,
                completed_count: 0,
                stories: vec![],
                current_story: None,
                current_story_index: None,
                has_in_progress: false,
                started: false,
                iteration_prompt: None,
            }
        }
        Err(e) => {
            return Err(ApiError::BadRequest(format!("Failed to read Ralph status: {}", e)));
        }
    };

    Ok(ResponseJson(ApiResponse::success(response)))
}

/// Response for Ralph continue endpoint
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct RalphContinueResponse {
    pub started: bool,
    pub story_id: Option<String>,
}

/// Continue Ralph execution - starts the next story
/// Returns error if task is not Ralph type, has no workspace, execution is running, or all stories complete
pub async fn continue_ralph_execution(
    Extension(task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<RalphContinueResponse>>, ApiError> {
    let pool = &deployment.db().pool;

    // Check if task is Ralph type
    if task.task_type != TaskType::Ralph {
        return Err(ApiError::BadRequest(format!(
            "Task {} is not a Ralph task",
            task.id
        )));
    }

    // Get the first workspace for this task
    let workspaces = Workspace::fetch_all(pool, Some(task.id)).await?;
    let workspace = workspaces.first().ok_or_else(|| {
        ApiError::BadRequest(format!("No workspace found for task {}", task.id))
    })?;

    // Check if there's already a running execution
    if deployment.container().has_running_processes(task.id).await? {
        return Err(ApiError::BadRequest(
            "Task already has a running execution. Wait for it to complete.".to_string(),
        ));
    }

    // Get the container ref (workspace directory)
    let workspace_dir = workspace.container_ref.as_ref().ok_or_else(|| {
        ApiError::BadRequest("Workspace has no container reference".to_string())
    })?;

    // Get the first repo in the workspace
    let repos = WorkspaceRepo::find_repos_for_workspace(pool, workspace.id).await?;
    let repo = repos.first().ok_or_else(|| {
        ApiError::BadRequest("No repos found for workspace".to_string())
    })?;

    // Build repo path
    let repo_path = PathBuf::from(workspace_dir).join(&repo.name);

    // Get Ralph status - check if prd.json exists
    let status = match RalphService::get_status_from_repo(&repo_path) {
        Ok(s) => s,
        Err(RalphError::PrdNotFound) => {
            return Err(ApiError::BadRequest(
                "PRD not ready yet. Create prd.json first.".to_string(),
            ));
        }
        Err(e) => {
            return Err(ApiError::BadRequest(format!("Failed to read Ralph status: {}", e)));
        }
    };

    // Check if there are remaining stories
    let next_story = status.current_story.ok_or_else(|| {
        ApiError::BadRequest("All stories are complete".to_string())
    })?;

    // Determine prompt based on Ralph started state
    let prompt = if status.started {
        status.iteration_prompt.clone().unwrap_or_else(|| {
            "Read .ralph/prompt.md and continue implementing the PRD.".to_string()
        })
    } else {
        task.description.clone().unwrap_or_default()
    };

    let working_dir = workspace
        .agent_working_dir
        .as_ref()
        .filter(|dir: &&String| !dir.is_empty())
        .cloned();

    // Use claude-code executor
    let executor_profile_id = ExecutorProfileId {
        executor: BaseCodingAgent::ClaudeCode,
        variant: None,
    };

    // Get repos for cleanup action
    let all_repos = WorkspaceRepo::find_repos_for_workspace(pool, workspace.id).await?;
    let cleanup_action = deployment.container().cleanup_actions_for_repos(&all_repos);

    // Check if a story is in progress (agent is mid-work)
    let (session, action_type) = if status.has_in_progress {
        tracing::info!(
            "Ralph continue: story in progress, attempting to reuse session for task {}",
            task.id
        );

        // Get the latest session for this workspace
        let sessions = Session::find_by_workspace_id(pool, workspace.id).await?;
        let session = sessions.first().ok_or_else(|| {
            ApiError::BadRequest("No session found for workspace".to_string())
        })?;

        // Get latest agent session ID for follow-up
        let latest_agent_session_id = ExecutionProcess::find_latest_coding_agent_turn_session_id(
            pool,
            session.id,
        )
        .await
        .unwrap_or(None);

        if let Some(agent_session_id) = latest_agent_session_id {
            (
                session.clone(),
                ExecutorActionType::CodingAgentFollowUpRequest(CodingAgentFollowUpRequest {
                    prompt,
                    session_id: agent_session_id,
                    executor_profile_id: executor_profile_id.clone(),
                    working_dir,
                }),
            )
        } else {
            tracing::warn!(
                "Ralph continue: no previous agent session found despite inProgress, starting fresh"
            );
            (
                session.clone(),
                ExecutorActionType::CodingAgentInitialRequest(CodingAgentInitialRequest {
                    prompt,
                    executor_profile_id: executor_profile_id.clone(),
                    working_dir,
                }),
            )
        }
    } else {
        tracing::info!(
            "Ralph continue: no story in progress, creating new session for task {}",
            task.id
        );

        let new_session = Session::create(
            pool,
            &CreateSession {
                executor: Some(executor_profile_id.executor.to_string()),
            },
            Uuid::new_v4(),
            workspace.id,
        )
        .await?;

        (
            new_session,
            ExecutorActionType::CodingAgentInitialRequest(CodingAgentInitialRequest {
                prompt,
                executor_profile_id: executor_profile_id.clone(),
                working_dir,
            }),
        )
    };

    let action = ExecutorAction::new(action_type, cleanup_action.map(Box::new));

    // Start the execution
    deployment
        .container()
        .start_execution(
            workspace,
            &session,
            &action,
            &ExecutionProcessRunReason::CodingAgent,
        )
        .await?;

    tracing::info!(
        "Started Ralph execution for task {} story {}",
        task.id,
        next_story.id
    );

    Ok(ResponseJson(ApiResponse::success(RalphContinueResponse {
        started: true,
        story_id: Some(next_story.id),
    })))
}

/// Request body for updating Ralph auto-continue setting
#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct UpdateRalphAutoContinueRequest {
    pub auto_continue: bool,
}

/// Response for Ralph auto-continue update endpoint
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct UpdateRalphAutoContinueResponse {
    pub auto_continue: bool,
}

/// Update Ralph auto-continue setting for a task
pub async fn update_ralph_auto_continue(
    Extension(task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<UpdateRalphAutoContinueRequest>,
) -> Result<ResponseJson<ApiResponse<UpdateRalphAutoContinueResponse>>, ApiError> {
    let pool = &deployment.db().pool;

    // Check if task is Ralph type
    if task.task_type != TaskType::Ralph {
        return Err(ApiError::BadRequest(format!(
            "Task {} is not a Ralph task",
            task.id
        )));
    }

    Task::update_ralph_auto_continue(pool, task.id, payload.auto_continue).await?;

    tracing::info!(
        "Updated Ralph auto-continue for task {} to {}",
        task.id,
        payload.auto_continue
    );

    Ok(ResponseJson(ApiResponse::success(
        UpdateRalphAutoContinueResponse {
            auto_continue: payload.auto_continue,
        },
    )))
}

/// Response for Ralph story commits endpoint
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct RalphStoryCommitsResponse {
    pub commits: HashMap<String, StoryCommit>,
}

/// Get commit information for completed Ralph stories
pub async fn get_ralph_story_commits(
    Extension(task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<RalphStoryCommitsResponse>>, ApiError> {
    let pool = &deployment.db().pool;

    // Check if task is Ralph type
    if task.task_type != TaskType::Ralph {
        return Err(ApiError::BadRequest(format!(
            "Task {} is not a Ralph task",
            task.id
        )));
    }

    // Get the first workspace for this task
    let workspaces = Workspace::fetch_all(pool, Some(task.id)).await?;
    let workspace = workspaces.first().ok_or_else(|| {
        ApiError::BadRequest(format!("No workspace found for task {}", task.id))
    })?;

    // Get the container ref (workspace directory)
    let workspace_dir = workspace.container_ref.as_ref().ok_or_else(|| {
        ApiError::BadRequest("Workspace has no container reference".to_string())
    })?;

    // Get the first repo in the workspace
    let repos = WorkspaceRepo::find_repos_for_workspace(pool, workspace.id).await?;
    let repo = repos.first().ok_or_else(|| {
        ApiError::BadRequest("No repos found for workspace".to_string())
    })?;

    // Build repo path
    let repo_path = PathBuf::from(workspace_dir).join(&repo.name);

    let commits = RalphService::get_story_commits(&repo_path)
        .map_err(|e| ApiError::BadRequest(format!("Failed to get story commits: {}", e)))?;

    Ok(ResponseJson(ApiResponse::success(RalphStoryCommitsResponse {
        commits,
    })))
}

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    // Ralph-specific routes under /{task_id}/ralph
    let ralph_router = Router::new()
        .route("/status", get(get_ralph_status))
        .route("/continue", post(continue_ralph_execution))
        .route("/auto-continue", put(update_ralph_auto_continue))
        .route("/commits", get(get_ralph_story_commits));

    let task_actions_router = Router::new()
        .route("/", put(update_task))
        .route("/", delete(delete_task))
        .nest("/ralph", ralph_router);

    let task_id_router = Router::new()
        .route("/", get(get_task))
        .merge(task_actions_router)
        .layer(from_fn_with_state(deployment.clone(), load_task_middleware));

    let inner = Router::new()
        .route("/", get(get_tasks).post(create_task))
        .route("/stream/ws", get(stream_tasks_ws))
        .route("/create-and-start", post(create_task_and_start))
        .nest("/{task_id}", task_id_router);

    // mount under /projects/:project_id/tasks
    Router::new().nest("/tasks", inner)
}
