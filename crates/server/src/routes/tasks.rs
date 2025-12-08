use std::path::PathBuf;

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
    image::TaskImage,
    task::{CreateTask, Task, TaskWithAttemptStatus, UpdateTask},
    task_attempt::{CreateTaskAttempt, TaskAttempt},
};
use deployment::Deployment;
use executors::profile::ExecutorProfileId;
use futures_util::{SinkExt, StreamExt, TryStreamExt};
use serde::{Deserialize, Serialize};
use services::services::{
    container::ContainerService,
    share::ShareError,
    worktree_manager::{WorktreeCleanup, WorktreeManager},
};
use sqlx::Error as SqlxError;
use ts_rs::TS;
use utils::{api::oauth::LoginStatus, response::ApiResponse};
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError, middleware::load_task_middleware};

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
    pub base_branch: String,
}

pub async fn create_task_and_start(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateAndStartTaskRequest>,
) -> Result<ResponseJson<ApiResponse<TaskWithAttemptStatus>>, ApiError> {
    let pool = &deployment.db().pool;

    // Resolve parent from branch if applicable
    let task_payload = payload
        .task
        .clone()
        .with_parent_from_branch(pool, &payload.base_branch)
        .await?;

    let task_id = Uuid::new_v4();
    let task = Task::create(pool, &task_payload, task_id).await?;

    if let Some(image_ids) = &task_payload.image_ids {
        TaskImage::associate_many_dedup(pool, task.id, image_ids).await?;
    }

    deployment
        .track_if_analytics_allowed(
            "task_created",
            serde_json::json!({
                "task_id": task.id.to_string(),
                "project_id": task.project_id,
                "has_description": task.description.is_some(),
                "has_images": task_payload.image_ids.is_some(),
            }),
        )
        .await;
    let attempt_id = Uuid::new_v4();
    let git_branch_name = deployment
        .container()
        .git_branch_from_task_attempt(&attempt_id, &task.title)
        .await;

    let task_attempt = TaskAttempt::create(
        pool,
        &CreateTaskAttempt {
            executor: payload.executor_profile_id.executor,
            base_branch: payload.base_branch,
            branch: git_branch_name,
        },
        attempt_id,
        task.id,
    )
    .await?;
    let is_attempt_running = deployment
        .container()
        .start_attempt(&task_attempt, payload.executor_profile_id.clone())
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
                "attempt_id": task_attempt.id.to_string(),
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
        has_merged_attempt: false,
        last_attempt_failed: false,
        executor: task_attempt.executor,
    })))
}

pub async fn update_task(
    Extension(existing_task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,

    Json(payload): Json<UpdateTask>,
) -> Result<ResponseJson<ApiResponse<Task>>, ApiError> {
    ensure_shared_task_auth(&existing_task, &deployment).await?;

    // Use existing values if not provided in update
    let title = payload.title.unwrap_or(existing_task.title);
    let description = match payload.description {
        Some(s) if s.trim().is_empty() => None, // Empty string = clear description
        Some(s) => Some(s),                     // Non-empty string = update description
        None => existing_task.description,      // Field omitted = keep existing
    };
    let status = payload.status.unwrap_or(existing_task.status);
    let parent_task_attempt = payload
        .parent_task_attempt
        .or(existing_task.parent_task_attempt);

    let task = Task::update(
        &deployment.db().pool,
        existing_task.id,
        existing_task.project_id,
        title,
        description,
        status,
        parent_task_attempt,
    )
    .await?;

    if let Some(image_ids) = &payload.image_ids {
        TaskImage::delete_by_task_id(&deployment.db().pool, task.id).await?;
        TaskImage::associate_many_dedup(&deployment.db().pool, task.id, image_ids).await?;
    }

    // If task has been shared, broadcast update
    if task.shared_task_id.is_some() {
        let Ok(publisher) = deployment.share_publisher() else {
            return Err(ShareError::MissingConfig("share publisher unavailable").into());
        };
        publisher.update_shared_task(&task).await?;
    }

    Ok(ResponseJson(ApiResponse::success(task)))
}

async fn ensure_shared_task_auth(
    existing_task: &Task,
    deployment: &local_deployment::LocalDeployment,
) -> Result<(), ApiError> {
    if existing_task.shared_task_id.is_some() {
        match deployment.get_login_status().await {
            LoginStatus::LoggedIn { .. } => return Ok(()),
            LoginStatus::LoggedOut => {
                return Err(ShareError::MissingAuth.into());
            }
        }
    }
    Ok(())
}

pub async fn delete_task(
    Extension(task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,
) -> Result<(StatusCode, ResponseJson<ApiResponse<()>>), ApiError> {
    ensure_shared_task_auth(&task, &deployment).await?;

    // Validate no running execution processes
    if deployment
        .container()
        .has_running_processes(task.id)
        .await?
    {
        return Err(ApiError::Conflict("Task has running execution processes. Please wait for them to complete or stop them first.".to_string()));
    }

    // Gather task attempts data needed for background cleanup
    let attempts = TaskAttempt::fetch_all(&deployment.db().pool, Some(task.id))
        .await
        .map_err(|e| {
            tracing::error!("Failed to fetch task attempts for task {}: {}", task.id, e);
            ApiError::TaskAttempt(e)
        })?;

    // Gather cleanup data before deletion
    let project = task
        .parent_project(&deployment.db().pool)
        .await?
        .ok_or_else(|| ApiError::Database(SqlxError::RowNotFound))?;

    let cleanup_args: Vec<WorktreeCleanup> = attempts
        .iter()
        .filter_map(|attempt| {
            attempt
                .container_ref
                .as_ref()
                .map(|worktree_path| WorktreeCleanup {
                    worktree_path: PathBuf::from(worktree_path),
                    git_repo_path: Some(project.git_repo_path.clone()),
                })
        })
        .collect();

    if let Some(shared_task_id) = task.shared_task_id {
        let Ok(publisher) = deployment.share_publisher() else {
            return Err(ShareError::MissingConfig("share publisher unavailable").into());
        };
        publisher.delete_shared_task(shared_task_id).await?;
    }

    // Use a transaction to ensure atomicity: either all operations succeed or all are rolled back
    let mut tx = deployment.db().pool.begin().await?;

    // Nullify parent_task_attempt for all child tasks before deletion
    // This breaks parent-child relationships to avoid foreign key constraint violations
    let mut total_children_affected = 0u64;
    for attempt in &attempts {
        let children_affected = Task::nullify_children_by_attempt_id(&mut *tx, attempt.id).await?;
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

    // Spawn background worktree cleanup task
    let task_id = task.id;
    tokio::spawn(async move {
        let span = tracing::info_span!("background_worktree_cleanup", task_id = %task_id);
        let _enter = span.enter();

        tracing::info!(
            "Starting background cleanup for task {} ({} worktrees)",
            task_id,
            cleanup_args.len()
        );

        if let Err(e) = WorktreeManager::batch_cleanup_worktrees(&cleanup_args).await {
            tracing::error!(
                "Background worktree cleanup failed for task {}: {}",
                task_id,
                e
            );
        } else {
            tracing::info!("Background cleanup completed for task {}", task_id);
        }
    });

    // Return 202 Accepted to indicate deletion was scheduled
    Ok((StatusCode::ACCEPTED, ResponseJson(ApiResponse::success(()))))
}

#[derive(Debug, Serialize, Deserialize, TS)]
pub struct ShareTaskResponse {
    pub shared_task_id: Uuid,
}

pub async fn share_task(
    Extension(task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<ShareTaskResponse>>, ApiError> {
    let Ok(publisher) = deployment.share_publisher() else {
        return Err(ShareError::MissingConfig("share publisher unavailable").into());
    };
    let profile = deployment
        .auth_context()
        .cached_profile()
        .await
        .ok_or(ShareError::MissingAuth)?;
    let shared_task_id = publisher.share_task(task.id, profile.user_id).await?;

    let props = serde_json::json!({
        "task_id": task.id,
        "shared_task_id": shared_task_id,
    });
    deployment
        .track_if_analytics_allowed("start_sharing_task", props)
        .await;

    Ok(ResponseJson(ApiResponse::success(ShareTaskResponse {
        shared_task_id,
    })))
}

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let task_actions_router = Router::new()
        .route("/", put(update_task))
        .route("/", delete(delete_task))
        .route("/share", post(share_task));

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
