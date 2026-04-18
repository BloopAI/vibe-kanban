//! Core CRUD handlers: create, get, list, status, children, sessions, dev server.

use axum::{
    Extension, Json,
    extract::{Query, State},
    response::Json as ResponseJson,
};
use db::models::{
    execution_process::{ExecutionProcess, ExecutionProcessRunReason, ExecutionProcessStatus},
    execution_process_logs::ExecutionProcessLogs,
    executor_session::ExecutorSession,
    project::Project,
    task::{Task, TaskRelationships},
    task_attempt::{CreateTaskAttempt, TaskAttempt, TaskAttemptError},
};
use deployment::Deployment;
use executors::{
    actions::{
        ExecutorAction, ExecutorActionType,
        script::{ScriptContext, ScriptRequest, ScriptRequestLanguage},
    },
    executors::{CodingAgent, ExecutorError},
    profile::ExecutorConfigs,
};
use services::services::container::ContainerService;
use sqlx::Error as SqlxError;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::routes::task_attempts::codex_setup;
use crate::routes::task_attempts::cursor_setup;
use crate::routes::task_attempts::types::{
    CommitCompareResult, CommitInfo, CreateTaskAttemptBody, CreateTaskAttemptByTaskIdBody,
    FixSessionsResponse, OpenEditorRequest, OpenEditorResponse, RunAgentSetupRequest,
    RunAgentSetupResponse, TaskAttemptQuery,
};
use crate::routes::task_attempts::util::ensure_worktree_path;
use crate::{
    DeploymentImpl,
    error::ApiError,
    middleware::{RemoteAttemptNeeded, RemoteTaskAttemptContext},
    proxy::check_remote_task_attempt_proxy,
};

// ============================================================================
// List and Get
// ============================================================================

pub async fn get_task_attempts(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<TaskAttemptQuery>,
) -> Result<ResponseJson<ApiResponse<Vec<TaskAttempt>>>, ApiError> {
    use std::collections::HashMap;

    let pool = &deployment.db().pool;

    // If no task_id provided, just return all local attempts
    let Some(task_id) = query.task_id else {
        let attempts = TaskAttempt::fetch_all(pool, None).await?;
        return Ok(ResponseJson(ApiResponse::success(attempts)));
    };

    // Step 1: Try to find task locally
    let local_task = Task::find_by_id(pool, task_id).await?;

    // Step 2: If task not found locally, it might be a shared_task_id from a swarm project
    // In this case, we can only query Hive (no local data)
    if local_task.is_none() {
        let client = match deployment.node_auth_client().cloned() {
            Some(c) => c,
            None => deployment.remote_client().map_err(|e| {
                tracing::warn!(
                    task_id = %task_id,
                    error = %e,
                    "No remote client available for swarm task lookup"
                );
                ApiError::BadGateway("No remote client available".into())
            })?,
        };
        // Try to query Hive using task_id as shared_task_id
        match client.list_swarm_task_attempts(task_id).await {
            Ok(response) => {
                let attempts: Vec<TaskAttempt> = response
                    .attempts
                    .into_iter()
                    .map(|nta| TaskAttempt {
                        id: nta.id,
                        task_id, // Keep as-is (it's the shared_task_id)
                        container_ref: nta.container_ref,
                        branch: nta.branch,
                        target_branch: nta.target_branch,
                        executor: nta.executor,
                        worktree_deleted: nta.worktree_deleted,
                        setup_completed_at: nta.setup_completed_at,
                        created_at: nta.created_at,
                        updated_at: nta.updated_at,
                        hive_synced_at: Some(nta.updated_at),
                        hive_assignment_id: nta.assignment_id,
                        origin_node_id: Some(nta.node_id), // Remote attempt's origin
                    })
                    .collect();
                return Ok(ResponseJson(ApiResponse::success(attempts)));
            }
            Err(e) => {
                if e.is_not_found() {
                    return Err(ApiError::NotFound(format!(
                        "Task {} not found locally or on Hive",
                        task_id
                    )));
                }
                tracing::warn!(
                    task_id = %task_id,
                    error = %e,
                    "Failed to fetch swarm task attempts from Hive"
                );
                return Err(ApiError::RemoteClient(e));
            }
        }
    }

    let task = local_task.unwrap();

    // Step 3: ALWAYS query local attempts first - this is the core fix
    // Local attempts are authoritative for THIS node's executions
    let local_attempts = TaskAttempt::fetch_all(pool, Some(task_id)).await?;

    // Step 4: If task is not linked to swarm (no shared_task_id), just return local
    let Some(shared_task_id) = task.shared_task_id else {
        return Ok(ResponseJson(ApiResponse::success(local_attempts)));
    };

    // Step 5: For swarm tasks, get current node_id to filter Hive results
    let current_node_id = if let Some(ctx) = deployment.node_runner_context() {
        ctx.node_id().await
    } else {
        None
    };

    // Step 6: Try to fetch remote attempts from Hive
    let client = match deployment.node_auth_client().cloned() {
        Some(c) => c,
        None => match deployment.remote_client() {
            Ok(c) => c,
            Err(e) => {
                tracing::warn!(
                    shared_task_id = %shared_task_id,
                    error = %e,
                    "Remote client unavailable, returning local attempts only"
                );
                // Graceful degradation: return local attempts when Hive is unavailable
                return Ok(ResponseJson(ApiResponse::success(local_attempts)));
            }
        },
    };

    let remote_attempts = match client.list_swarm_task_attempts(shared_task_id).await {
        Ok(response) => response.attempts,
        Err(e) => {
            tracing::warn!(
                shared_task_id = %shared_task_id,
                error = %e,
                "Failed to fetch task attempts from Hive, returning local attempts only"
            );
            // Graceful degradation: return local attempts when Hive query fails
            return Ok(ResponseJson(ApiResponse::success(local_attempts)));
        }
    };

    // Step 7: Merge local + remote attempts, filtering out current node's attempts from Hive
    // (to avoid duplicates - we already have them locally)
    // Use HashMap to deduplicate by attempt ID, preferring local data
    let mut attempt_map: HashMap<Uuid, TaskAttempt> =
        local_attempts.into_iter().map(|a| (a.id, a)).collect();

    for nta in remote_attempts {
        // Skip if this attempt is from the current node (we have local data)
        if Some(nta.node_id) == current_node_id {
            continue;
        }

        // Only add if not already in the map (prefer local data)
        attempt_map.entry(nta.id).or_insert_with(|| TaskAttempt {
            id: nta.id,
            task_id, // Map back to local task_id
            container_ref: nta.container_ref,
            branch: nta.branch,
            target_branch: nta.target_branch,
            executor: nta.executor,
            worktree_deleted: nta.worktree_deleted,
            setup_completed_at: nta.setup_completed_at,
            created_at: nta.created_at,
            updated_at: nta.updated_at,
            hive_synced_at: Some(nta.updated_at),
            hive_assignment_id: nta.assignment_id,
            origin_node_id: Some(nta.node_id), // Track which node this came from
        });
    }

    // Step 8: Convert back to Vec and sort by created_at DESC
    let mut merged: Vec<TaskAttempt> = attempt_map.into_values().collect();
    merged.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    tracing::debug!(
        task_id = %task_id,
        shared_task_id = %shared_task_id,
        attempt_count = merged.len(),
        "Returning hybrid local+remote task attempts"
    );

    Ok(ResponseJson(ApiResponse::success(merged)))
}

pub async fn get_task_attempt(
    local_attempt: Option<Extension<TaskAttempt>>,
    remote_needed: Option<Extension<RemoteAttemptNeeded>>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<TaskAttempt>>, ApiError> {
    // If we have a local attempt, return it
    if let Some(Extension(attempt)) = local_attempt {
        return Ok(ResponseJson(ApiResponse::success(attempt)));
    }

    // If attempt not found locally, try Hive fallback using API key auth
    if let Some(Extension(remote)) = remote_needed {
        // Prefer node_auth_client (API key auth) - works even without user login
        // Fall back to remote_client (OAuth) for non-node deployments
        let client = match deployment.node_auth_client().cloned() {
            Some(c) => c,
            None => deployment.remote_client().map_err(|e| {
                tracing::warn!(
                    attempt_id = %remote.attempt_id,
                    error = %e,
                    "No remote client available for attempt lookup"
                );
                ApiError::BadGateway("No remote client available".into())
            })?,
        };
        match client.get_swarm_attempt(remote.attempt_id).await {
            Ok(hive_response) => {
                // Try to find local task by shared_task_id to map back to local task_id
                let pool = &deployment.db().pool;
                let local_task =
                    Task::find_by_shared_task_id(pool, hive_response.attempt.shared_task_id)
                        .await?;

                // Use local task_id if available, otherwise use shared_task_id
                let task_id = local_task
                    .map(|t| t.id)
                    .unwrap_or(hive_response.attempt.shared_task_id);

                // Convert NodeTaskAttempt to local TaskAttempt format
                let attempt = TaskAttempt {
                    id: hive_response.attempt.id,
                    task_id,
                    container_ref: hive_response.attempt.container_ref,
                    branch: hive_response.attempt.branch,
                    target_branch: hive_response.attempt.target_branch,
                    executor: hive_response.attempt.executor,
                    worktree_deleted: hive_response.attempt.worktree_deleted,
                    setup_completed_at: hive_response.attempt.setup_completed_at,
                    created_at: hive_response.attempt.created_at,
                    updated_at: hive_response.attempt.updated_at,
                    hive_synced_at: Some(hive_response.attempt.updated_at),
                    hive_assignment_id: hive_response.attempt.assignment_id,
                    origin_node_id: Some(hive_response.attempt.node_id),
                };
                return Ok(ResponseJson(ApiResponse::success(attempt)));
            }
            Err(e) => {
                if e.is_not_found() {
                    tracing::debug!(
                        attempt_id = %remote.attempt_id,
                        "Attempt not found on Hive"
                    );
                    // Fall through to NotFound below
                } else {
                    tracing::warn!(
                        attempt_id = %remote.attempt_id,
                        error = %e,
                        "Failed to fetch attempt from Hive"
                    );
                    // Propagate non-NotFound errors to distinguish from missing data
                    return Err(ApiError::RemoteClient(e));
                }
            }
        }
    }

    Err(ApiError::NotFound("Task attempt not found".to_string()))
}

// ============================================================================
// Create
// ============================================================================

/// Create a new task attempt either locally or by proxying the request to a remote node.
///
/// If `payload.target_node_id` is present the request is proxied to the specified node using
/// the task's `shared_task_id`; the handler then attempts to set the executing node in Hive
/// (errors from that step are logged and ignored). If no target node is provided the handler:
/// - auto-unarchives the task if it was archived (and asynchronously syncs the unarchive to Hive if shared),
/// - optionally uses the parent task's worktree (when `use_parent_worktree` is true) after validating the parent and its worktree,
/// - creates a local TaskAttempt record,
/// - starts the attempt via the container backend (creating a worktree when needed).
///
/// If starting the attempt fails the partial TaskAttempt is deleted and the original container error is returned.
///
/// # Returns
///
/// On success returns an `ApiResponse` containing the created `TaskAttempt` (for proxied requests the remote node's response is returned). On failure returns an `ApiError`.
///
/// # Examples
///
/// ```no_run
/// use axum::Json;
/// use uuid::Uuid;
///
/// // Illustrative example — wiring the handler into an application and calling it requires
/// // constructing `DeploymentImpl` and `CreateTaskAttemptBody` which are omitted here.
/// #[tokio::main]
/// async fn main() {
///     // let deployment = ...;
///     // let payload = CreateTaskAttemptBody { task_id: Uuid::new_v4(), ..Default::default() };
///     // let resp = create_task_attempt(State(deployment), Json(payload)).await;
///     // assert!(resp.is_ok());
/// }
/// ```
#[axum::debug_handler]
pub async fn create_task_attempt(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateTaskAttemptBody>,
) -> Result<ResponseJson<ApiResponse<TaskAttempt>>, ApiError> {
    // If target_node_id is specified, proxy to the target node
    if let Some(target_node_id) = payload.target_node_id {
        let task = Task::find_by_id(&deployment.db().pool, payload.task_id)
            .await?
            .ok_or(SqlxError::RowNotFound)?;

        // Need shared_task_id to route to remote node
        let shared_task_id = task.shared_task_id.ok_or_else(|| {
            ApiError::BadRequest("Task is not shared (no shared_task_id)".to_string())
        })?;

        // Query the hive to get node info (URL and status)
        let client = deployment.remote_client()?;
        let project = Project::find_by_id(&deployment.db().pool, task.project_id)
            .await?
            .ok_or(SqlxError::RowNotFound)?;

        let remote_project_id = project
            .remote_project_id
            .ok_or_else(|| ApiError::BadRequest("Project is not linked to hive".to_string()))?;

        let nodes_response = client.list_project_nodes(remote_project_id).await?;

        // Find the target node in the response
        let target_node = nodes_response
            .nodes
            .iter()
            .find(|n| n.node_id == target_node_id)
            .ok_or_else(|| {
                ApiError::BadRequest(format!(
                    "Target node {} does not have this project linked",
                    target_node_id
                ))
            })?;

        // Check if node is online
        if target_node.node_status != remote::nodes::NodeStatus::Online {
            return Err(ApiError::BadGateway(format!(
                "Target node '{}' is not online (status: {:?})",
                target_node.node_name, target_node.node_status
            )));
        }

        let node_url = target_node.node_public_url.clone().ok_or_else(|| {
            ApiError::BadGateway(format!(
                "Target node '{}' does not have a public URL configured",
                target_node.node_name
            ))
        })?;

        // Build the proxy request
        let proxy_body = CreateTaskAttemptByTaskIdBody {
            executor_profile_id: payload.executor_profile_id,
            base_branch: payload.base_branch,
            use_parent_worktree: payload.use_parent_worktree,
        };

        let path = format!("/task-attempts/by-task-id/{}/create", shared_task_id);
        tracing::info!(
            target_node_id = %target_node_id,
            target_node_name = %target_node.node_name,
            shared_task_id = %shared_task_id,
            "Proxying create_task_attempt to remote node"
        );

        let response: ApiResponse<TaskAttempt> = deployment
            .node_proxy_client()
            .proxy_post(&node_url, &path, &proxy_body, target_node_id)
            .await?;

        // Set the executing node in the Hive so it can be displayed in the UI
        if response.is_success()
            && let Ok(client) = deployment.remote_client()
            && let Err(e) = client
                .set_executing_node(shared_task_id, Some(target_node_id))
                .await
        {
            tracing::warn!(
                error = ?e,
                shared_task_id = %shared_task_id,
                target_node_id = %target_node_id,
                "Failed to set executing node in Hive (non-blocking)"
            );
        }

        return Ok(ResponseJson(response));
    }

    // Local execution path
    let executor_profile_id = payload.get_executor_profile_id();
    let pool = &deployment.db().pool;
    let task = Task::find_by_id(pool, payload.task_id)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    // Get current node_id for tracking attempt origin (for swarm hybrid queries)
    let origin_node_id = if let Some(ctx) = deployment.node_runner_context() {
        ctx.node_id().await
    } else {
        None
    };

    // Auto-unarchive the task when a new attempt is created
    if Task::unarchive_if_archived(pool, task.id).await? {
        tracing::info!(
            task_id = %task.id,
            "Auto-unarchived task due to new attempt creation"
        );

        // Sync unarchive to Hive if task is shared
        if task.shared_task_id.is_some()
            && let Ok(publisher) = deployment.share_publisher()
            && let Some(updated_task) = Task::find_by_id(pool, task.id).await?
        {
            let publisher = publisher.clone();
            tokio::spawn(async move {
                if let Err(e) = publisher.update_shared_task(&updated_task).await {
                    tracing::warn!(?e, "failed to sync task unarchive to Hive");
                }
            });
        }
    }

    let attempt_id = Uuid::new_v4();

    // Determine branch name and parent worktree info based on use_parent_worktree flag
    let (git_branch_name, parent_container_ref) = if payload.use_parent_worktree.unwrap_or(false) {
        // Validate task has parent
        let parent_task_id = task.parent_task_id.ok_or_else(|| {
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
            executor: executor_profile_id.executor,
            base_branch: payload.base_branch.clone(),
            branch: git_branch_name.clone(),
            origin_node_id,
        },
        attempt_id,
        payload.task_id,
    )
    .await?;

    // If using parent worktree, update container_ref before calling start_attempt
    let skip_worktree_creation = if let Some(ref container_ref) = parent_container_ref {
        TaskAttempt::update_container_ref(pool, task_attempt.id, container_ref).await?;
        tracing::info!(
            task_id = %task.id,
            attempt_id = %task_attempt.id,
            container_ref = %container_ref,
            "Using parent worktree for attempt"
        );
        true
    } else {
        false
    };

    // Refetch to get the updated container_ref before starting attempt
    let task_attempt = TaskAttempt::find_by_id(pool, task_attempt.id)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    // Start the attempt (creates worktree if needed, then starts execution)
    if let Err(err) = deployment
        .container()
        .start_attempt(
            &task_attempt,
            executor_profile_id.clone(),
            skip_worktree_creation,
        )
        .await
    {
        tracing::error!(
            task_id = %task.id,
            attempt_id = %task_attempt.id,
            error = %err,
            "Failed to start task attempt"
        );

        // Clean up the broken task attempt
        if let Err(delete_err) = TaskAttempt::delete(pool, task_attempt.id).await {
            tracing::error!(
                task_id = %task.id,
                attempt_id = %task_attempt.id,
                error = %delete_err,
                "Failed to clean up broken task attempt"
            );
        }

        // Return error to client
        return Err(ApiError::Container(err));
    }
    tracing::info!(task_id = %task.id, attempt_id = %task_attempt.id, "Created task attempt");

    // Refetch to get the final state
    let task_attempt = TaskAttempt::find_by_id(pool, task_attempt.id)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    Ok(ResponseJson(ApiResponse::success(task_attempt)))
}

/// Create a new TaskAttempt for a task identified by shared_task_id (used for cross-node proxying).
///
/// This handler creates a TaskAttempt for the provided task (loaded from the path by shared_task_id),
/// optionally reusing the parent task's worktree when `use_parent_worktree` is set. If a parent
/// worktree is requested, the parent attempt must exist, have a non-deleted worktree, and its
/// container reference will be reused. The handler starts the attempt; if starting the attempt
/// fails, the partially created TaskAttempt is removed and the original container error is returned.
///
/// # Returns
///
/// An `ApiResponse` containing the created `TaskAttempt` on success.
///
/// # Examples
///
/// ```rust,no_run
/// // Typical invocation is via an HTTP route. This sketch demonstrates the handler signature:
/// // let response = create_task_attempt_by_task_id(
/// //     Extension(task),
/// //     State(deployment),
/// //     Json(payload)
/// // ).await;
/// // assert!(response.is_ok());
/// ```
pub async fn create_task_attempt_by_task_id(
    Extension(task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateTaskAttemptByTaskIdBody>,
) -> Result<ResponseJson<ApiResponse<TaskAttempt>>, ApiError> {
    let executor_profile_id = payload.executor_profile_id.clone();
    let pool = &deployment.db().pool;

    // Get current node_id for tracking attempt origin (for swarm hybrid queries)
    let origin_node_id = if let Some(ctx) = deployment.node_runner_context() {
        ctx.node_id().await
    } else {
        None
    };

    let attempt_id = Uuid::new_v4();

    // Determine branch name and parent worktree info based on use_parent_worktree flag
    let (git_branch_name, parent_container_ref) = if payload.use_parent_worktree.unwrap_or(false) {
        // Validate task has parent
        let parent_task_id = task.parent_task_id.ok_or_else(|| {
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
            executor: executor_profile_id.executor,
            base_branch: payload.base_branch.clone(),
            branch: git_branch_name.clone(),
            origin_node_id,
        },
        attempt_id,
        task.id,
    )
    .await?;

    // If using parent worktree, update container_ref before calling start_attempt
    let skip_worktree_creation = if let Some(ref container_ref) = parent_container_ref {
        TaskAttempt::update_container_ref(pool, task_attempt.id, container_ref).await?;
        tracing::info!(
            task_id = %task.id,
            shared_task_id = ?task.shared_task_id,
            attempt_id = %task_attempt.id,
            container_ref = %container_ref,
            "Using parent worktree for attempt via by-task-id route"
        );
        true
    } else {
        false
    };

    // Refetch to get the updated container_ref before starting attempt
    let task_attempt = TaskAttempt::find_by_id(pool, task_attempt.id)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    // Start the attempt (creates worktree if needed, then starts execution)
    if let Err(err) = deployment
        .container()
        .start_attempt(
            &task_attempt,
            executor_profile_id.clone(),
            skip_worktree_creation,
        )
        .await
    {
        tracing::error!(
            task_id = %task.id,
            attempt_id = %task_attempt.id,
            error = %err,
            "Failed to start task attempt"
        );

        // Clean up the broken task attempt
        if let Err(delete_err) = TaskAttempt::delete(pool, task_attempt.id).await {
            tracing::error!(
                task_id = %task.id,
                attempt_id = %task_attempt.id,
                error = %delete_err,
                "Failed to clean up broken task attempt"
            );
        }

        // Return error to client
        return Err(ApiError::Container(err));
    }
    tracing::info!(
        task_id = %task.id,
        shared_task_id = ?task.shared_task_id,
        attempt_id = %task_attempt.id,
        "Created attempt via by-task-id route"
    );

    // Refetch to get the final state
    let task_attempt = TaskAttempt::find_by_id(pool, task_attempt.id)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    Ok(ResponseJson(ApiResponse::success(task_attempt)))
}

// ============================================================================
// Agent Setup
// ============================================================================

#[axum::debug_handler]
pub async fn run_agent_setup(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<RunAgentSetupRequest>,
) -> Result<ResponseJson<ApiResponse<RunAgentSetupResponse>>, ApiError> {
    let executor_profile_id = payload.executor_profile_id;
    let config = ExecutorConfigs::get_cached();
    let coding_agent = config.get_coding_agent_or_default(&executor_profile_id);
    match coding_agent {
        CodingAgent::CursorAgent(_) => {
            cursor_setup::run_cursor_setup(&deployment, &task_attempt).await?;
        }
        CodingAgent::Codex(codex) => {
            codex_setup::run_codex_setup(&deployment, &task_attempt, &codex).await?;
        }
        _ => return Err(ApiError::Executor(ExecutorError::SetupHelperNotSupported)),
    }

    Ok(ResponseJson(ApiResponse::success(RunAgentSetupResponse {})))
}

// ============================================================================
// Commit Info
// ============================================================================

pub async fn get_commit_info(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<ResponseJson<ApiResponse<CommitInfo>>, ApiError> {
    let Some(sha) = params.get("sha").cloned() else {
        return Err(ApiError::TaskAttempt(TaskAttemptError::ValidationError(
            "Missing sha param".to_string(),
        )));
    };
    let wt_buf = ensure_worktree_path(&deployment, &task_attempt).await?;
    let wt = wt_buf.as_path();
    let subject = deployment.git().get_commit_subject(wt, &sha)?;
    Ok(ResponseJson(ApiResponse::success(CommitInfo {
        sha,
        subject,
    })))
}

pub async fn compare_commit_to_head(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<ResponseJson<ApiResponse<CommitCompareResult>>, ApiError> {
    let Some(target_oid) = params.get("sha").cloned() else {
        return Err(ApiError::TaskAttempt(TaskAttemptError::ValidationError(
            "Missing sha param".to_string(),
        )));
    };
    let wt_buf = ensure_worktree_path(&deployment, &task_attempt).await?;
    let wt = wt_buf.as_path();
    let head_info = deployment.git().get_head_info(wt)?;
    let (ahead_from_head, behind_from_head) =
        deployment
            .git()
            .ahead_behind_commits_by_oid(wt, &head_info.oid, &target_oid)?;
    let is_linear = behind_from_head == 0;
    Ok(ResponseJson(ApiResponse::success(CommitCompareResult {
        head_oid: head_info.oid,
        target_oid,
        ahead_from_head,
        behind_from_head,
        is_linear,
    })))
}

// ============================================================================
// Editor
// ============================================================================

pub async fn open_task_attempt_in_editor(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<OpenEditorRequest>,
) -> Result<ResponseJson<ApiResponse<OpenEditorResponse>>, ApiError> {
    // Get the task attempt to access the worktree path
    let base_path_buf = ensure_worktree_path(&deployment, &task_attempt).await?;
    let base_path = base_path_buf.as_path();

    // If a specific file path is provided, use it; otherwise use the base path
    let path = if let Some(file_path) = payload.file_path.as_ref() {
        base_path.join(file_path)
    } else {
        base_path.to_path_buf()
    };

    let editor_config = {
        let config = deployment.config().read().await;
        let editor_type_str = payload.editor_type.as_deref();
        config.editor.with_override(editor_type_str)
    };

    match editor_config.open_file(path.as_path()).await {
        Ok(url) => {
            tracing::info!(
                "Opened editor for task attempt {} at path: {}{}",
                task_attempt.id,
                path.display(),
                if url.is_some() { " (remote mode)" } else { "" }
            );

            Ok(ResponseJson(ApiResponse::success(OpenEditorResponse {
                url,
            })))
        }
        Err(e) => {
            tracing::error!(
                "Failed to open editor for attempt {}: {:?}",
                task_attempt.id,
                e
            );
            Err(ApiError::EditorOpen(e))
        }
    }
}

// ============================================================================
// Dev Server
// ============================================================================

#[axum::debug_handler]
pub async fn start_dev_server(
    Extension(task_attempt): Extension<TaskAttempt>,
    remote_ctx: Option<Extension<RemoteTaskAttemptContext>>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    // Dev server is a local-only operation - reject remote attempts
    if remote_ctx.is_some() {
        return Err(ApiError::BadRequest(
            "Cannot start dev server for remote task attempts".to_string(),
        ));
    }

    let pool = &deployment.db().pool;

    // Get parent task
    let task = task_attempt
        .parent_task(&deployment.db().pool)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    // Get parent project
    let project = task
        .parent_project(&deployment.db().pool)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    // Stop any existing dev servers for this project
    let existing_dev_servers =
        match ExecutionProcess::find_running_dev_servers_by_project(pool, project.id).await {
            Ok(servers) => servers,
            Err(e) => {
                tracing::error!(
                    "Failed to find running dev servers for project {}: {}",
                    project.id,
                    e
                );
                return Err(ApiError::TaskAttempt(TaskAttemptError::ValidationError(
                    e.to_string(),
                )));
            }
        };

    for dev_server in existing_dev_servers {
        tracing::info!(
            "Stopping existing dev server {} for project {}",
            dev_server.id,
            project.id
        );

        if let Err(e) = deployment
            .container()
            .stop_execution(&dev_server, ExecutionProcessStatus::Killed)
            .await
        {
            tracing::error!("Failed to stop dev server {}: {}", dev_server.id, e);
        }
    }

    if let Some(dev_server) = project.dev_script {
        // TODO: Derive script language from system config
        let executor_action = ExecutorAction::new(
            ExecutorActionType::ScriptRequest(ScriptRequest {
                script: dev_server,
                language: ScriptRequestLanguage::Bash,
                context: ScriptContext::DevServer,
            }),
            None,
        );

        deployment
            .container()
            .start_execution(
                &task_attempt,
                &executor_action,
                &ExecutionProcessRunReason::DevServer,
            )
            .await?
    } else {
        return Ok(ResponseJson(ApiResponse::error(
            "No dev server script configured for this project",
        )));
    };

    Ok(ResponseJson(ApiResponse::success(())))
}

// ============================================================================
// Children and Stop
// ============================================================================

pub async fn get_task_attempt_children(
    Extension(task_attempt): Extension<TaskAttempt>,
    remote_ctx: Option<Extension<RemoteTaskAttemptContext>>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<TaskRelationships>>, ApiError> {
    // For remote tasks, relationships are stored on the Hive - return empty
    if remote_ctx.is_some() {
        return Ok(ResponseJson(ApiResponse::success(TaskRelationships {
            parent_task: None,
            current_attempt: task_attempt,
            children: vec![],
        })));
    }

    let relationships =
        Task::find_relationships_for_attempt(&deployment.db().pool, &task_attempt).await?;
    Ok(ResponseJson(ApiResponse::success(relationships)))
}

pub async fn stop_task_attempt_execution(
    Extension(task_attempt): Extension<TaskAttempt>,
    remote_ctx: Option<Extension<RemoteTaskAttemptContext>>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    // Check if this is a remote task attempt that should be proxied
    if let Some(proxy_info) = check_remote_task_attempt_proxy(remote_ctx.as_ref().map(|e| &e.0))? {
        tracing::debug!(
            node_id = %proxy_info.node_id,
            shared_task_id = %proxy_info.target_id,
            "Proxying stop_task_attempt_execution to remote node"
        );

        let path = format!("/task-attempts/by-task-id/{}/stop", proxy_info.target_id);
        let response: ApiResponse<()> = deployment
            .node_proxy_client()
            .proxy_post(&proxy_info.node_url, &path, &(), proxy_info.node_id)
            .await?;

        return Ok(ResponseJson(response));
    }

    deployment.container().try_stop(&task_attempt).await;

    Ok(ResponseJson(ApiResponse::success(())))
}

// ============================================================================
// Session Error Handling
// ============================================================================

/// Fix corrupted sessions by invalidating sessions from failed/killed execution processes
pub async fn fix_sessions(
    Extension(task_attempt): Extension<TaskAttempt>,
    remote_ctx: Option<Extension<RemoteTaskAttemptContext>>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<FixSessionsResponse>>, ApiError> {
    // Proxy to owning node - this is a write operation
    if let Some(proxy_info) = check_remote_task_attempt_proxy(remote_ctx.as_ref().map(|e| &e.0))? {
        tracing::debug!(
            node_id = %proxy_info.node_id,
            shared_task_id = %proxy_info.target_id,
            "Proxying fix_sessions to remote node"
        );

        let path = format!(
            "/task-attempts/by-task-id/{}/fix-sessions",
            proxy_info.target_id
        );
        let response: ApiResponse<FixSessionsResponse> = deployment
            .node_proxy_client()
            .proxy_post(&proxy_info.node_url, &path, &(), proxy_info.node_id)
            .await?;

        return Ok(ResponseJson(response));
    }

    let pool = &deployment.db().pool;

    let invalidated = ExecutorSession::invalidate_failed_sessions(pool, task_attempt.id).await?;

    tracing::info!(
        task_attempt_id = %task_attempt.id,
        invalidated_count = invalidated.len(),
        "Fixed corrupted sessions for task attempt"
    );

    Ok(ResponseJson(ApiResponse::success(FixSessionsResponse {
        invalidated_count: invalidated.len(),
        invalidated_session_ids: invalidated,
    })))
}

/// Check if the latest failed execution has a session invalid error that can be fixed.
/// Returns true only if:
/// 1. The latest CodingAgent execution failed with a session error, AND
/// 2. There are sessions from failed processes that can still be invalidated
pub async fn has_session_error(
    Extension(task_attempt): Extension<TaskAttempt>,
    remote_ctx: Option<Extension<RemoteTaskAttemptContext>>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<bool>>, ApiError> {
    // Sessions are local-only - remote tasks have no local session
    if remote_ctx.is_some() {
        return Ok(ResponseJson(ApiResponse::success(false)));
    }

    let pool = &deployment.db().pool;

    // Get latest coding agent execution
    let latest = ExecutionProcess::find_latest_by_task_attempt_and_run_reason(
        pool,
        task_attempt.id,
        &ExecutionProcessRunReason::CodingAgent,
    )
    .await?;

    let has_error = if let Some(exec) = latest {
        if exec.status == ExecutionProcessStatus::Failed {
            // Check if logs contain session error
            let has_session_error_in_logs =
                ExecutionProcessLogs::contains_session_invalid_error(pool, exec.id)
                    .await
                    .unwrap_or(false);

            if has_session_error_in_logs {
                // Also check if there are sessions that can be fixed
                // (i.e., sessions from failed processes that still have session_id set)
                let fixable_sessions =
                    ExecutorSession::count_fixable_sessions(pool, task_attempt.id).await?;
                fixable_sessions > 0
            } else {
                false
            }
        } else {
            false
        }
    } else {
        false
    };

    Ok(ResponseJson(ApiResponse::success(has_error)))
}
