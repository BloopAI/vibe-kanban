//! Core CRUD handlers: get_tasks, get_task, create_task, update_task, delete_task, create_task_and_start.

use std::path::PathBuf;

use axum::{
    Extension, Json,
    extract::{Query, State},
    http::StatusCode,
    response::Json as ResponseJson,
};
use db::models::{
    image::TaskImage,
    project::Project,
    task::{CreateTask, Task, TaskStatus, TaskWithAttemptStatus, UpdateTask},
    task_attempt::{CreateTaskAttempt, TaskAttempt, TaskAttemptError},
};
use deployment::Deployment;
use services::services::{
    container::ContainerService,
    worktree_manager::{WorktreeCleanup, WorktreeManager},
};
use sqlx::Error as SqlxError;
use utils::response::ApiResponse;
use uuid::Uuid;

use super::remote::{create_remote_task, delete_remote_task, update_remote_task};
use crate::middleware::RemoteTaskNeeded;
use crate::routes::tasks::types::{CreateAndStartTaskRequest, TaskQuery};
use crate::{DeploymentImpl, error::ApiError};

// ============================================================================
// List and Get
// ============================================================================

pub async fn get_tasks(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<TaskQuery>,
) -> Result<ResponseJson<ApiResponse<Vec<TaskWithAttemptStatus>>>, ApiError> {
    use std::collections::HashMap;

    let pool = &deployment.db().pool;
    let project_id = query.project_id;

    // Step 1: Try to find the project locally (by ID or by remote_project_id)
    let project = match Project::find_by_id(pool, project_id).await? {
        Some(p) => Some(p),
        None => Project::find_by_remote_project_id(pool, project_id).await?,
    };

    // Step 2: If project exists locally and is NOT remote, fetch tasks from local DB
    // For swarm-linked projects, we also need to fetch from Hive and merge
    if let Some(ref project) = project
        && !project.is_remote
    {
        let local_tasks =
            Task::find_by_project_id_with_attempt_status(pool, project.id, query.include_archived)
                .await?;

        // Step 2a: If not swarm-linked, return local tasks only
        let Some(remote_project_id) = project.remote_project_id else {
            return Ok(ResponseJson(ApiResponse::success(local_tasks)));
        };

        // Step 2b: For swarm-linked projects, also fetch from Hive and merge
        // This enables cross-node task visibility
        let remote_client = match deployment.node_auth_client().cloned() {
            Some(c) => c,
            None => match deployment.remote_client() {
                Ok(c) => c,
                Err(e) => {
                    tracing::warn!(
                        project_id = %project_id,
                        remote_project_id = %remote_project_id,
                        error = %e,
                        "Remote client unavailable, returning local tasks only"
                    );
                    return Ok(ResponseJson(ApiResponse::success(local_tasks)));
                }
            },
        };

        let remote_tasks = match remote_client
            .list_swarm_project_tasks(remote_project_id)
            .await
        {
            Ok(response) => response.tasks,
            Err(e) => {
                tracing::warn!(
                    remote_project_id = %remote_project_id,
                    error = %e,
                    "Failed to fetch tasks from Hive, returning local tasks only"
                );
                return Ok(ResponseJson(ApiResponse::success(local_tasks)));
            }
        };

        // Step 2c: Merge local + remote tasks, deduplicating by shared_task_id
        // For swarm projects: Hive status takes precedence for core task fields (status, assignee)
        // while local task provides the detailed execution info (attempt status, executor, etc.)
        let mut task_map: HashMap<Uuid, TaskWithAttemptStatus> = HashMap::new();

        // Add local tasks first
        for task in local_tasks {
            // Key by shared_task_id if available, otherwise by id
            let key = task.task.shared_task_id.unwrap_or(task.task.id);
            task_map.insert(key, task);
        }

        // Process remote tasks - either add new or update existing with Hive's authoritative data
        for shared_task in remote_tasks {
            // Skip archived tasks if not requested
            if !query.include_archived && shared_task.archived_at.is_some() {
                continue;
            }

            let hive_status = match shared_task.status {
                remote::db::tasks::TaskStatus::Todo => TaskStatus::Todo,
                remote::db::tasks::TaskStatus::InProgress => TaskStatus::InProgress,
                remote::db::tasks::TaskStatus::InReview => TaskStatus::InReview,
                remote::db::tasks::TaskStatus::Done => TaskStatus::Done,
                remote::db::tasks::TaskStatus::Cancelled => TaskStatus::Cancelled,
            };

            if let Some(existing) = task_map.get_mut(&shared_task.id) {
                // Task exists locally - update with Hive's authoritative fields
                // The Hive is the source of truth for status, assignee, and version
                // because other nodes may have updated these fields

                // Only update if Hive has a newer or equal version to avoid stale data
                if shared_task.version >= existing.task.remote_version {
                    // Update status from Hive (this is the core fix - Hive status takes precedence)
                    existing.task.status = hive_status.clone();

                    // Update assignee info from Hive
                    existing.task.remote_assignee_user_id = shared_task.assignee_user_id;
                    existing.task.remote_assignee_name = shared_task.assignee_name.clone();
                    existing.task.remote_assignee_username = shared_task.assignee_username.clone();

                    // Update version and sync timestamp
                    existing.task.remote_version = shared_task.version;
                    existing.task.remote_last_synced_at = shared_task.shared_at;

                    // Update archived status
                    existing.task.archived_at = shared_task.archived_at;

                    // Update stream node info for remote log access
                    existing.task.remote_stream_node_id =
                        shared_task.executing_node_id.or(shared_task.owner_node_id);

                    // Update activity_at if Hive has it (for time-in-column tracking)
                    if shared_task.activity_at.is_some() {
                        existing.task.activity_at = shared_task.activity_at;
                    }

                    // Update has_in_progress_attempt based on Hive status
                    existing.has_in_progress_attempt =
                        existing.has_in_progress_attempt || hive_status == TaskStatus::InProgress;
                }
            } else {
                // Task is new from Hive - add it
                let is_in_progress = hive_status == TaskStatus::InProgress;

                task_map.insert(
                    shared_task.id,
                    TaskWithAttemptStatus {
                        task: Task {
                            id: shared_task.id,
                            project_id: project.id, // Map to local project ID
                            title: shared_task.title,
                            description: shared_task.description,
                            status: hive_status,
                            shared_task_id: Some(shared_task.id),
                            remote_version: shared_task.version,
                            parent_task_id: None,
                            archived_at: shared_task.archived_at,
                            created_at: shared_task.created_at,
                            updated_at: shared_task.updated_at,
                            remote_assignee_user_id: shared_task.assignee_user_id,
                            remote_assignee_name: shared_task.assignee_name,
                            remote_assignee_username: shared_task.assignee_username,
                            remote_last_synced_at: shared_task.shared_at,
                            remote_stream_node_id: shared_task
                                .executing_node_id
                                .or(shared_task.owner_node_id),
                            remote_stream_url: shared_task.owner_public_url.as_ref().map(|url| {
                                format!(
                                    "{}/api/tasks/{}/attempts/logs",
                                    url.trim_end_matches('/'),
                                    shared_task.id
                                )
                            }),
                            activity_at: shared_task.activity_at,
                        },
                        has_in_progress_attempt: is_in_progress,
                        has_merged_attempt: false,
                        last_attempt_failed: false,
                        executor: String::new(),
                        latest_execution_started_at: None,
                        latest_execution_completed_at: None,
                        source_node_name: shared_task.owner_name.clone(),
                    },
                );
            }
        }

        // Convert back to Vec and sort by activity_at (with created_at fallback) DESC
        // This preserves the same ordering as local-only queries which use COALESCE(activity_at, created_at)
        let mut merged: Vec<TaskWithAttemptStatus> = task_map.into_values().collect();
        merged.sort_by(|a, b| {
            let a_key = a.task.activity_at.unwrap_or(a.task.created_at);
            let b_key = b.task.activity_at.unwrap_or(b.task.created_at);
            b_key.cmp(&a_key)
        });

        tracing::debug!(
            project_id = %project_id,
            remote_project_id = %remote_project_id,
            task_count = merged.len(),
            "Returning hybrid local+remote tasks"
        );

        return Ok(ResponseJson(ApiResponse::success(merged)));
    }

    // Step 3: Project not found locally or is remote - fetch from Hive only
    // Use remote_project_id if we have a local stub, otherwise use the requested project_id
    let hive_project_id = project
        .and_then(|p| p.remote_project_id)
        .unwrap_or(project_id);

    // Prefer node_auth_client (API key auth) - works even without user login
    // Fall back to remote_client (OAuth) for non-node deployments
    let remote_client = match deployment.node_auth_client().cloned() {
        Some(c) => c,
        None => deployment.remote_client().map_err(|e| {
            tracing::warn!(
                project_id = %project_id,
                hive_project_id = %hive_project_id,
                error = %e,
                "No remote client available for project tasks lookup"
            );
            ApiError::BadGateway("No remote client available".into())
        })?,
    };

    let response = remote_client
        .list_swarm_project_tasks(hive_project_id)
        .await
        .map_err(|e| {
            if e.is_not_found() {
                ApiError::NotFound(format!("Project {} not found", project_id))
            } else {
                ApiError::RemoteClient(e)
            }
        })?;

    // Convert SharedTask to TaskWithAttemptStatus for frontend compatibility
    // Filter by archived status to match local behavior
    let tasks: Vec<TaskWithAttemptStatus> = response
        .tasks
        .into_iter()
        .filter(|t| query.include_archived || t.archived_at.is_none())
        .map(|shared_task| {
            // Convert remote TaskStatus to local TaskStatus
            let status = match shared_task.status {
                remote::db::tasks::TaskStatus::Todo => TaskStatus::Todo,
                remote::db::tasks::TaskStatus::InProgress => TaskStatus::InProgress,
                remote::db::tasks::TaskStatus::InReview => TaskStatus::InReview,
                remote::db::tasks::TaskStatus::Done => TaskStatus::Done,
                remote::db::tasks::TaskStatus::Cancelled => TaskStatus::Cancelled,
            };
            let is_in_progress = status == TaskStatus::InProgress;

            TaskWithAttemptStatus {
                task: Task {
                    // Use shared_task.id so downstream handlers can use it for Hive lookups
                    id: shared_task.id,
                    project_id: shared_task.swarm_project_id.unwrap_or(project_id),
                    title: shared_task.title,
                    description: shared_task.description,
                    status,
                    shared_task_id: Some(shared_task.id),
                    remote_version: shared_task.version,
                    parent_task_id: None,
                    archived_at: shared_task.archived_at,
                    created_at: shared_task.created_at,
                    updated_at: shared_task.updated_at,
                    // Set remote stream info based on owner/executing node
                    remote_assignee_user_id: shared_task.assignee_user_id,
                    remote_assignee_name: shared_task.assignee_name.clone(),
                    remote_assignee_username: shared_task.assignee_username.clone(),
                    remote_last_synced_at: shared_task.shared_at,
                    remote_stream_node_id: shared_task
                        .executing_node_id
                        .or(shared_task.owner_node_id),
                    remote_stream_url: shared_task.owner_public_url.as_ref().map(|url| {
                        format!(
                            "{}/api/tasks/{}/attempts/logs",
                            url.trim_end_matches('/'),
                            shared_task.id
                        )
                    }),
                    activity_at: shared_task.activity_at,
                },
                has_in_progress_attempt: is_in_progress,
                has_merged_attempt: false,
                last_attempt_failed: false,
                executor: String::new(),
                latest_execution_started_at: None,
                latest_execution_completed_at: None,
                source_node_name: shared_task.owner_name.clone(),
            }
        })
        .collect();

    Ok(ResponseJson(ApiResponse::success(tasks)))
}

pub async fn get_task(
    local_task: Option<Extension<Task>>,
    remote_needed: Option<Extension<RemoteTaskNeeded>>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Task>>, ApiError> {
    // If we have a local task, return it
    if let Some(Extension(task)) = local_task {
        return Ok(ResponseJson(ApiResponse::success(task)));
    }

    // If task not found locally, try Hive fallback
    if let Some(Extension(remote)) = remote_needed {
        // Prefer node_auth_client (API key auth) - works even without user login
        // Fall back to remote_client (OAuth) for non-node deployments
        let client = match deployment.node_auth_client().cloned() {
            Some(c) => c,
            None => deployment.remote_client().map_err(|e| {
                tracing::warn!(
                    task_id = %remote.task_id,
                    error = %e,
                    "No remote client available for task lookup"
                );
                ApiError::BadGateway("No remote client available".into())
            })?,
        };

        // Try to get the task from Hive
        match client.get_shared_task(remote.task_id).await {
            Ok(shared_task) => {
                // Require swarm_project_id - can't construct a valid Task without it
                let swarm_project_id = match shared_task.swarm_project_id {
                    Some(id) => id,
                    None => {
                        tracing::warn!(
                            task_id = %shared_task.id,
                            "Shared task missing swarm_project_id"
                        );
                        return Err(ApiError::BadGateway(
                            "Shared task missing swarm_project_id".into(),
                        ));
                    }
                };

                // Try to find a local project that maps to this Hive project
                // This ensures consistency with get_tasks which maps remote tasks to local project IDs
                let project_id = match Project::find_by_remote_project_id(
                    &deployment.db().pool,
                    swarm_project_id,
                )
                .await
                {
                    Ok(Some(local_project)) => local_project.id,
                    Ok(None) => swarm_project_id, // Fallback to Hive project ID
                    Err(e) => {
                        tracing::warn!(
                            swarm_project_id = %swarm_project_id,
                            error = %e,
                            "Failed to map swarm_project_id to local project"
                        );
                        swarm_project_id
                    }
                };

                // Convert SharedTask to local Task format
                let status = match shared_task.status {
                    remote::db::tasks::TaskStatus::Todo => TaskStatus::Todo,
                    remote::db::tasks::TaskStatus::InProgress => TaskStatus::InProgress,
                    remote::db::tasks::TaskStatus::InReview => TaskStatus::InReview,
                    remote::db::tasks::TaskStatus::Done => TaskStatus::Done,
                    remote::db::tasks::TaskStatus::Cancelled => TaskStatus::Cancelled,
                };

                let task = Task {
                    id: shared_task.id,
                    project_id,
                    title: shared_task.title,
                    description: shared_task.description,
                    status,
                    shared_task_id: Some(shared_task.id),
                    remote_version: shared_task.version,
                    parent_task_id: None,
                    archived_at: shared_task.archived_at,
                    created_at: shared_task.created_at,
                    updated_at: shared_task.updated_at,
                    remote_assignee_user_id: shared_task.assignee_user_id,
                    remote_assignee_name: shared_task.assignee_name,
                    remote_assignee_username: shared_task.assignee_username,
                    remote_last_synced_at: shared_task.shared_at,
                    remote_stream_node_id: shared_task
                        .executing_node_id
                        .or(shared_task.owner_node_id),
                    remote_stream_url: shared_task.owner_public_url.as_ref().map(|url| {
                        format!(
                            "{}/api/tasks/{}/attempts/logs",
                            url.trim_end_matches('/'),
                            shared_task.id
                        )
                    }),
                    activity_at: shared_task.activity_at,
                };
                return Ok(ResponseJson(ApiResponse::success(task)));
            }
            Err(e) => {
                if e.is_not_found() {
                    tracing::debug!(
                        task_id = %remote.task_id,
                        "Task not found on Hive"
                    );
                    // Fall through to NotFound below
                } else {
                    tracing::warn!(
                        task_id = %remote.task_id,
                        error = %e,
                        "Failed to fetch task from Hive"
                    );
                    return Err(ApiError::RemoteClient(e));
                }
            }
        }
    }

    Err(ApiError::NotFound("Task not found".to_string()))
}

// ============================================================================
// Create
// ============================================================================

pub async fn create_task(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateTask>,
) -> Result<ResponseJson<ApiResponse<Task>>, ApiError> {
    let pool = &deployment.db().pool;

    // Check if project is remote
    let project = Project::find_by_id(pool, payload.project_id)
        .await?
        .ok_or(ApiError::Database(SqlxError::RowNotFound))?;

    if project.is_remote {
        // Remote project: proxy to Hive and sync locally
        return create_remote_task(&deployment, &project, &payload).await;
    }

    // Local project: existing logic

    // Validate: If creating a subtask, check that the parent doesn't use a shared worktree
    if let Some(parent_task_id) = payload.parent_task_id {
        let parent_task = Task::find_by_id(pool, parent_task_id)
            .await?
            .ok_or(ApiError::Database(SqlxError::RowNotFound))?;

        // Check if parent task uses a shared worktree from its own parent (grandparent)
        if let Some(grandparent_id) = parent_task.parent_task_id {
            let uses_shared =
                TaskAttempt::task_uses_shared_worktree(pool, parent_task_id, grandparent_id)
                    .await
                    .map_err(|e| ApiError::TaskAttempt(TaskAttemptError::Database(e)))?;

            if uses_shared {
                return Err(ApiError::BadRequest(
                    "Cannot create subtask: parent task uses a shared worktree".to_string(),
                ));
            }
        }

        // Auto-unarchive the parent task when a subtask is created
        if Task::unarchive_if_archived(pool, parent_task_id).await? {
            tracing::info!(
                parent_task_id = %parent_task_id,
                "Auto-unarchived parent task due to subtask creation"
            );

            // Sync unarchive to Hive if parent is shared
            if parent_task.shared_task_id.is_some()
                && let Ok(publisher) = deployment.share_publisher()
                && let Some(updated_parent) = Task::find_by_id(pool, parent_task_id).await?
            {
                let publisher = publisher.clone();
                tokio::spawn(async move {
                    if let Err(e) = publisher.update_shared_task(&updated_parent).await {
                        tracing::warn!(?e, "failed to sync parent task unarchive to Hive");
                    }
                });
            }
        }
    }

    let id = Uuid::new_v4();

    tracing::debug!(
        "Creating task '{}' in project {}",
        payload.title,
        payload.project_id
    );

    let task = Task::create(pool, &payload, id).await?;

    if let Some(image_ids) = &payload.image_ids {
        TaskImage::associate_many_dedup(pool, task.id, image_ids).await?;
    }

    // Auto-share task to Hive (will auto-link project if not already linked)
    let mut task = task;
    if let Ok(publisher) = deployment.share_publisher() {
        // Get user_id for sharing - use cached profile if available (optional)
        let user_id = deployment
            .auth_context()
            .cached_profile()
            .await
            .map(|p| p.user_id);

        match publisher.share_task(task.id, user_id).await {
            Ok(shared_task_id) => {
                tracing::info!(
                    task_id = %task.id,
                    shared_task_id = %shared_task_id,
                    "Auto-shared task to Hive"
                );
                // Update local task with shared_task_id for consistency
                if let Some(updated) = Task::find_by_id(pool, task.id).await? {
                    task = updated;
                }
            }
            Err(e) => {
                tracing::warn!(
                    task_id = %task.id,
                    error = ?e,
                    "Failed to auto-share task to Hive"
                );
            }
        }
    }

    Ok(ResponseJson(ApiResponse::success(task)))
}

// ============================================================================
// Create and Start
// ============================================================================

pub async fn create_task_and_start(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateAndStartTaskRequest>,
) -> Result<ResponseJson<ApiResponse<TaskWithAttemptStatus>>, ApiError> {
    let pool = &deployment.db().pool;

    // Check if project is remote - cannot start task attempts on remote projects
    let project = Project::find_by_id(pool, payload.task.project_id)
        .await?
        .ok_or(ApiError::Database(SqlxError::RowNotFound))?;

    if project.is_remote {
        return Err(ApiError::BadRequest(
            "Cannot start task attempts on remote projects. Tasks execute on their origin node."
                .to_string(),
        ));
    }

    let task_id = Uuid::new_v4();
    let task = Task::create(pool, &payload.task, task_id).await?;

    if let Some(image_ids) = &payload.task.image_ids {
        TaskImage::associate_many(pool, task.id, image_ids).await?;
    }

    // Auto-share task if project is linked to the Hive
    if let Some(project) = Project::find_by_id(pool, task.project_id).await?
        && project.remote_project_id.is_some()
        && let Ok(publisher) = deployment.share_publisher()
    {
        // Get user_id for sharing - use cached profile if available (optional)
        let user_id = deployment
            .auth_context()
            .cached_profile()
            .await
            .map(|p| p.user_id);

        match publisher.share_task(task.id, user_id).await {
            Ok(shared_task_id) => {
                tracing::info!(
                    task_id = %task.id,
                    shared_task_id = %shared_task_id,
                    "Auto-shared task to Hive"
                );
            }
            Err(e) => {
                tracing::warn!(
                    task_id = %task.id,
                    error = ?e,
                    "Failed to auto-share task to Hive"
                );
            }
        }
    }

    let attempt_id = Uuid::new_v4();

    // Get current node_id for tracking attempt origin (for swarm hybrid queries)
    let origin_node_id = if let Some(ctx) = deployment.node_runner_context() {
        ctx.node_id().await
    } else {
        None
    };

    // Determine branch name and parent worktree info based on use_parent_worktree flag
    let (git_branch_name, parent_container_ref) = if payload.use_parent_worktree.unwrap_or(false) {
        // Validate task has parent
        let parent_task_id = payload.task.parent_task_id.ok_or_else(|| {
            ApiError::BadRequest("Cannot use parent worktree: task has no parent_task_id".into())
        })?;

        // Get parent task's latest attempt
        let parent_attempts = TaskAttempt::fetch_all(pool, Some(parent_task_id)).await?;
        let parent_attempt = parent_attempts.first().ok_or_else(|| {
            ApiError::BadRequest("Cannot use parent worktree: parent task has no attempts".into())
        })?;

        // Validate parent has a worktree
        let container_ref = parent_attempt.container_ref.clone().ok_or_else(|| {
            ApiError::BadRequest(
                "Cannot use parent worktree: parent attempt has no worktree".into(),
            )
        })?;

        // Validate parent worktree not deleted
        if parent_attempt.worktree_deleted {
            return Err(ApiError::BadRequest(
                "Cannot use parent worktree: parent worktree was deleted".into(),
            ));
        }

        (parent_attempt.branch.clone(), Some(container_ref))
    } else {
        let branch = deployment
            .container()
            .git_branch_from_task_attempt(&attempt_id, &task.title)
            .await;
        (branch, None)
    };

    let task_attempt = TaskAttempt::create(
        pool,
        &CreateTaskAttempt {
            executor: payload.executor_profile_id.executor,
            base_branch: payload.base_branch.clone(),
            branch: git_branch_name,
            origin_node_id,
        },
        attempt_id,
        task.id,
    )
    .await?;

    // If using parent worktree, update container_ref directly and skip worktree creation
    let skip_worktree_creation = if let Some(container_ref) = parent_container_ref {
        TaskAttempt::update_container_ref(pool, task_attempt.id, &container_ref).await?;
        true
    } else {
        false
    };

    let is_attempt_running = deployment
        .container()
        .start_attempt(
            &task_attempt,
            payload.executor_profile_id.clone(),
            skip_worktree_creation,
        )
        .await
        .inspect_err(|err| tracing::error!("Failed to start task attempt: {}", err))
        .is_ok();

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
        latest_execution_started_at: None, // Will be populated after first execution
        latest_execution_completed_at: None,
        source_node_name: None, // Not needed for start_attempt response
    })))
}

// ============================================================================
// Update
// ============================================================================

pub async fn update_task(
    Extension(existing_task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<UpdateTask>,
) -> Result<ResponseJson<ApiResponse<Task>>, ApiError> {
    // Check if this is a task synced from Hive (has shared_task_id)
    if existing_task.shared_task_id.is_some() {
        return update_remote_task(&deployment, &existing_task, &payload).await;
    }

    // Local task: existing logic
    // Use existing values if not provided in update
    let title = payload.title.unwrap_or(existing_task.title);
    let description = match payload.description {
        Some(s) if s.trim().is_empty() => None, // Empty string = clear description
        Some(s) => Some(s),                     // Non-empty string = update description
        None => existing_task.description,      // Field omitted = keep existing
    };
    let status = payload.status.unwrap_or(existing_task.status);
    let parent_task_id = payload.parent_task_id.or(existing_task.parent_task_id);

    let task = Task::update(
        &deployment.db().pool,
        existing_task.id,
        existing_task.project_id,
        title,
        description,
        status,
        parent_task_id,
    )
    .await?;

    // Auto-unarchive the task if it was archived (user is actively editing it)
    let task = if Task::unarchive_if_archived(&deployment.db().pool, task.id).await? {
        // Re-fetch to get updated archived_at = NULL
        Task::find_by_id(&deployment.db().pool, task.id)
            .await?
            .ok_or(ApiError::Database(SqlxError::RowNotFound))?
    } else {
        task
    };

    if let Some(image_ids) = &payload.image_ids {
        TaskImage::delete_by_task_id(&deployment.db().pool, task.id).await?;
        TaskImage::associate_many_dedup(&deployment.db().pool, task.id, image_ids).await?;
    }

    // If task has been shared, broadcast update (fire-and-forget to avoid blocking)
    if task.shared_task_id.is_some()
        && let Ok(publisher) = deployment.share_publisher()
    {
        let task_clone = task.clone();
        tokio::spawn(async move {
            match tokio::time::timeout(
                std::time::Duration::from_secs(5),
                publisher.update_shared_task(&task_clone),
            )
            .await
            {
                Ok(Ok(())) => {}
                Ok(Err(e)) => tracing::warn!(?e, "failed to sync shared task update"),
                Err(_) => tracing::warn!("shared task sync timed out"),
            }
        });
    }

    Ok(ResponseJson(ApiResponse::success(task)))
}

// ============================================================================
// Delete
// ============================================================================

pub async fn delete_task(
    Extension(task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,
) -> Result<(StatusCode, ResponseJson<ApiResponse<()>>), ApiError> {
    // Check if this is a task synced from Hive (has shared_task_id)
    if task.shared_task_id.is_some() {
        return delete_remote_task(&deployment, &task).await;
    }

    // Local task: existing logic
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

    // Fire-and-forget remote deletion to avoid blocking local operation
    if let Some(shared_task_id) = task.shared_task_id
        && let Ok(publisher) = deployment.share_publisher()
    {
        tokio::spawn(async move {
            match tokio::time::timeout(
                std::time::Duration::from_secs(5),
                publisher.delete_shared_task(shared_task_id),
            )
            .await
            {
                Ok(Ok(())) => {}
                Ok(Err(e)) => tracing::warn!(?e, "failed to sync shared task deletion"),
                Err(_) => tracing::warn!("shared task deletion sync timed out"),
            }
        });
    }

    // Use a transaction to ensure atomicity: either all operations succeed or all are rolled back
    let mut tx = deployment.db().pool.begin().await?;

    // Nullify parent_task_id for all child tasks before deletion
    // This breaks parent-child relationships to avoid foreign key constraint violations
    let total_children_affected = Task::nullify_children_by_parent_id(&mut *tx, task.id).await?;

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
