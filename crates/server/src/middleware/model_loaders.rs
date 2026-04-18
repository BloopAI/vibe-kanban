use axum::{
    extract::{OriginalUri, Path, Request, State},
    http::{HeaderMap, Method, StatusCode},
    middleware::Next,
    response::Response,
};
use db::models::{
    execution_process::ExecutionProcess, label::Label, project::Project, task::Task,
    task_attempt::TaskAttempt, template::Template,
};
use deployment::Deployment;
use uuid::Uuid;

use crate::DeploymentImpl;

/// Context for an authenticated proxy request from another node.
#[derive(Debug, Clone)]
pub struct ProxyRequestContext {
    /// The ID of the node that sent the request
    pub source_node_id: String,
}

/// Extract bearer token from Authorization header.
fn extract_bearer_token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(axum::http::header::AUTHORIZATION)?
        .to_str()
        .ok()?
        .strip_prefix("Bearer ")
        .or_else(|| {
            headers
                .get(axum::http::header::AUTHORIZATION)?
                .to_str()
                .ok()?
                .strip_prefix("bearer ")
        })
}

/// Context for remote project operations.
///
/// This is injected into request extensions when the project is remote
/// (`project.is_remote == true`), enabling route handlers to proxy
/// requests to the appropriate remote node.
#[derive(Debug, Clone)]
pub struct RemoteProjectContext {
    /// The UUID of the remote node that owns this project
    pub node_id: Uuid,
    /// The public URL of the remote node (e.g., "https://node.example.com")
    pub node_url: Option<String>,
    /// Current status of the remote node ("online", "offline", etc.)
    pub node_status: Option<String>,
    /// The Hive project ID used for cross-node identification
    pub remote_project_id: Uuid,
}

impl RemoteProjectContext {
    /// Check if the remote node is available for proxying.
    pub fn is_available(&self) -> bool {
        self.node_url.is_some() && self.node_status.as_deref() == Some("online")
    }

    /// Get the node URL, returning None if not configured.
    pub fn node_url(&self) -> Option<&str> {
        self.node_url.as_deref()
    }
}

/// Context for remote task attempt operations.
///
/// This is injected into request extensions when the task attempt belongs to a
/// remote project (`project.is_remote == true`), enabling route handlers to proxy
/// requests to the appropriate remote node where the attempt lives.
#[derive(Debug, Clone)]
pub struct RemoteTaskAttemptContext {
    /// The UUID of the remote node that owns this task's project
    pub node_id: Uuid,
    /// The public URL of the remote node (e.g., "https://node.example.com")
    pub node_url: Option<String>,
    /// Current status of the remote node ("online", "offline", etc.)
    pub node_status: Option<String>,
    /// The shared_task_id used for cross-node routing
    pub task_id: Uuid,
}

impl RemoteTaskAttemptContext {
    /// Check if the remote node is available for proxying.
    pub fn is_available(&self) -> bool {
        self.node_url.is_some() && self.node_status.as_deref() == Some("online")
    }

    /// Get the node URL, returning None if not configured.
    pub fn node_url(&self) -> Option<&str> {
        self.node_url.as_deref()
    }
}

/// Marker extension indicating the attempt wasn't found locally
/// and needs to be fetched from the Hive for cross-node viewing.
#[derive(Debug, Clone)]
pub struct RemoteAttemptNeeded {
    pub attempt_id: Uuid,
}

/// Marker extension indicating the project wasn't found locally
/// and needs to be fetched from the Hive for cross-node viewing.
#[derive(Debug, Clone)]
pub struct SwarmProjectNeeded {
    pub project_id: Uuid,
}

/// Marker extension indicating a task wasn't found locally
/// and needs to be fetched from the Hive for cross-node viewing.
#[derive(Debug, Clone)]
pub struct RemoteTaskNeeded {
    pub task_id: Uuid,
}

/// Marker extension indicating a task was fetched from Hive (not local).
/// Handlers can check for this to determine if they should return fallback values.
#[derive(Debug, Clone)]
pub struct RemoteTaskContext {
    pub shared_task_id: Uuid,
    pub origin_node_id: Option<Uuid>,
}

pub async fn load_project_middleware(
    State(deployment): State<DeploymentImpl>,
    Path(project_id): Path<Uuid>,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    load_project_impl(deployment, project_id, request, next).await
}

/// Variant of load_project_middleware for routes with wildcard path params.
/// Use this for routes like `/{id}/files/{*file_path}` where there are 2 path params.
pub async fn load_project_middleware_with_wildcard(
    State(deployment): State<DeploymentImpl>,
    Path((project_id, _file_path)): Path<(Uuid, String)>,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    load_project_impl(deployment, project_id, request, next).await
}

/// Internal implementation shared by load_project_middleware variants.
async fn load_project_impl(
    deployment: DeploymentImpl,
    project_id: Uuid,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let pool = &deployment.db().pool;

    // Step 1: Try to find by local project ID
    let mut project = match Project::find_by_id(pool, project_id).await {
        Ok(Some(project)) => Some(project),
        Ok(None) => None,
        Err(e) => {
            tracing::error!("Failed to fetch project {}: {}", project_id, e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    // Step 2: If not found, try finding by remote_project_id (user may have passed a swarm project ID)
    if project.is_none() {
        project = match Project::find_by_remote_project_id(pool, project_id).await {
            Ok(p) => p,
            Err(e) => {
                tracing::error!(
                    "Failed to fetch project by remote_project_id {}: {}",
                    project_id,
                    e
                );
                return Err(StatusCode::INTERNAL_SERVER_ERROR);
            }
        };
    }

    // Step 3: If still not found, check if we should allow Hive fallback
    let mut request = request;
    let Some(mut project) = project else {
        // Inject SwarmProjectNeeded for GET requests to routes that support swarm-only projects.
        // These routes have handlers that can gracefully handle the absence of a local project.
        //
        // Supported routes:
        // - Base project route (GET /api/projects/{id}) - returns swarm project details
        // - Branches route (GET /api/projects/{id}/branches) - returns empty list for swarm-only
        //
        // Sub-routes like /files, /sync-health, /github/counts require a local project
        // to operate on - they can't work with a project that only exists on the Hive.
        //
        // Note: We use OriginalUri from extensions because nested routes strip the prefix
        // from request.uri().path(). For example, /api/projects/{id} becomes just "/" after
        // nesting through /api, /projects, and /{id}.
        let path = request
            .extensions()
            .get::<OriginalUri>()
            .map(|uri| uri.path())
            .unwrap_or_else(|| request.uri().path())
            .trim_end_matches('/');
        let is_get_request = request.method() == Method::GET;
        let project_id_str = project_id.to_string();
        // Match base project route (exactly /api/projects/{id}) or branches route
        let is_base_project_route = path.ends_with(&format!("/projects/{}", project_id_str))
            || path.ends_with(&project_id_str);
        let is_branches_route = path.ends_with("/branches");

        if is_get_request && (is_base_project_route || is_branches_route) {
            tracing::debug!(project_id = %project_id, path = %path, "Project not found locally, signaling for Hive fallback");
            request
                .extensions_mut()
                .insert(SwarmProjectNeeded { project_id });
            return Ok(next.run(request).await);
        }

        tracing::debug!(project_id = %project_id, path = %path, "Project not found locally");
        return Err(StatusCode::NOT_FOUND);
    };

    // For local projects linked to Hive, populate source_node_name for symmetric display.
    // This ensures task cards show the node indicator on all nodes, not just remote ones.
    if !project.is_remote
        && project.remote_project_id.is_some()
        && project.source_node_name.is_none()
    {
        project.source_node_name = Some(gethostname::gethostname().to_string_lossy().to_string());
    }

    // If project is remote, inject RemoteProjectContext for proxy routing
    if project.is_remote {
        if let (Some(node_id), Some(remote_project_id)) =
            (project.source_node_id, project.remote_project_id)
        {
            let remote_ctx = RemoteProjectContext {
                node_id,
                node_url: project.source_node_public_url.clone(),
                node_status: project.source_node_status.clone(),
                remote_project_id,
            };
            tracing::debug!(
                project_id = %project_id,
                node_id = %node_id,
                remote_project_id = %remote_project_id,
                node_status = ?remote_ctx.node_status,
                "Loaded remote project context"
            );
            request.extensions_mut().insert(remote_ctx);
        } else {
            tracing::warn!(
                project_id = %project_id,
                "Remote project missing source_node_id or remote_project_id"
            );
        }
    }

    // Insert the project as an extension
    request.extensions_mut().insert(project);

    // Continue with the next middleware/handler
    Ok(next.run(request).await)
}

/// Middleware to load a project by its remote (Hive) project ID.
///
/// Used for the `/projects/by-remote-id/{remote_project_id}` routes
/// that receive proxied requests from other nodes.
///
/// This middleware also validates the proxy token if one is provided via
/// the Authorization header. If no token is provided and the connection token
/// validator is enabled, the request is rejected.
pub async fn load_project_by_remote_id_middleware(
    State(deployment): State<DeploymentImpl>,
    Path(remote_project_id): Path<Uuid>,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let mut request = request;

    // Validate proxy token if connection token validation is enabled
    let validator = deployment.connection_token_validator();
    if validator.is_enabled() {
        let token = extract_bearer_token(request.headers()).ok_or_else(|| {
            tracing::warn!(
                remote_project_id = %remote_project_id,
                "Missing Authorization header for by-remote-id route"
            );
            StatusCode::UNAUTHORIZED
        })?;

        match validator.validate_proxy_token(token) {
            Ok(proxy_token) => {
                tracing::debug!(
                    source_node_id = %proxy_token.source_node_id,
                    target_node_id = %proxy_token.target_node_id,
                    remote_project_id = %remote_project_id,
                    "Validated proxy token"
                );
                request.extensions_mut().insert(ProxyRequestContext {
                    source_node_id: proxy_token.source_node_id,
                });
            }
            Err(e) => {
                tracing::warn!(
                    remote_project_id = %remote_project_id,
                    error = ?e,
                    "Invalid proxy token"
                );
                return Err(StatusCode::UNAUTHORIZED);
            }
        }
    }

    // Load the project by its remote_project_id
    let project =
        match Project::find_by_remote_project_id(&deployment.db().pool, remote_project_id).await {
            Ok(Some(project)) => project,
            Ok(None) => {
                tracing::warn!(
                    remote_project_id = %remote_project_id,
                    "Project not found by remote_project_id"
                );
                return Err(StatusCode::NOT_FOUND);
            }
            Err(e) => {
                tracing::error!(
                    remote_project_id = %remote_project_id,
                    error = %e,
                    "Failed to fetch project by remote_project_id"
                );
                return Err(StatusCode::INTERNAL_SERVER_ERROR);
            }
        };

    tracing::debug!(
        local_project_id = %project.id,
        remote_project_id = %remote_project_id,
        "Loaded project by remote_project_id"
    );

    // Insert the project as an extension
    request.extensions_mut().insert(project);

    // Continue with the next middleware/handler
    Ok(next.run(request).await)
}

pub async fn load_task_middleware(
    State(deployment): State<DeploymentImpl>,
    Path(task_id): Path<Uuid>,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    // Load the task from local database
    let task = match Task::find_by_id(&deployment.db().pool, task_id).await {
        Ok(Some(task)) => Some(task),
        Ok(None) => {
            // Task not found locally - might be a remote task from Hive.
            // Also try looking up by shared_task_id in case this is a Hive ID.
            match Task::find_by_shared_task_id(&deployment.db().pool, task_id).await {
                Ok(Some(task)) => Some(task),
                Ok(None) => None,
                Err(e) => {
                    tracing::error!("Failed to fetch task by shared_task_id {}: {}", task_id, e);
                    return Err(StatusCode::INTERNAL_SERVER_ERROR);
                }
            }
        }
        Err(e) => {
            tracing::error!("Failed to fetch task {}: {}", task_id, e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    let mut request = request;

    if let Some(task) = task {
        // Found locally - insert as extension
        request.extensions_mut().insert(task);
        return Ok(next.run(request).await);
    }

    // Task not found locally - try Hive fallback for GET requests
    if request.method() == Method::GET {
        tracing::debug!(
            task_id = %task_id,
            method = %request.method(),
            "Task not found locally, attempting Hive fallback"
        );

        // Try to get client for Hive access
        let client =
            deployment
                .node_auth_client()
                .cloned()
                .or_else(|| match deployment.remote_client() {
                    Ok(client) => Some(client),
                    Err(e) => {
                        tracing::warn!(error = %e, "Failed to build Hive client for task fallback");
                        None
                    }
                });

        if let Some(client) = client {
            match client.get_shared_task(task_id).await {
                Ok(shared_task) => {
                    tracing::debug!(
                        task_id = %task_id,
                        shared_task_id = %shared_task.id,
                        "Fetched task from Hive"
                    );

                    // Get swarm_project_id, falling back to project_id
                    let swarm_project_id = shared_task.swarm_project_id.or(shared_task.project_id);

                    // Try to find a local project that maps to this Hive project
                    let project_id = if let Some(hive_project_id) = swarm_project_id {
                        match Project::find_by_remote_project_id(
                            &deployment.db().pool,
                            hive_project_id,
                        )
                        .await
                        {
                            Ok(Some(local_project)) => local_project.id,
                            Ok(None) => hive_project_id,
                            Err(e) => {
                                tracing::warn!(
                                    hive_project_id = %hive_project_id,
                                    error = %e,
                                    "Failed to map Hive project ID; falling back to Hive ID"
                                );
                                hive_project_id
                            }
                        }
                    } else {
                        // No project reference - use task_id as placeholder (shouldn't happen)
                        task_id
                    };

                    // Convert SharedTask status to local TaskStatus
                    use db::models::task::TaskStatus;
                    let status = match shared_task.status {
                        remote::db::tasks::TaskStatus::Todo => TaskStatus::Todo,
                        remote::db::tasks::TaskStatus::InProgress => TaskStatus::InProgress,
                        remote::db::tasks::TaskStatus::InReview => TaskStatus::InReview,
                        remote::db::tasks::TaskStatus::Done => TaskStatus::Done,
                        remote::db::tasks::TaskStatus::Cancelled => TaskStatus::Cancelled,
                    };

                    // Convert SharedTask to local Task format
                    let hive_task = Task {
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
                        remote_stream_url: None,
                        activity_at: shared_task.activity_at,
                    };

                    // Inject RemoteTaskContext so handlers know this is a remote task
                    let remote_ctx = RemoteTaskContext {
                        shared_task_id: shared_task.id,
                        origin_node_id: shared_task.source_node_id,
                    };

                    request.extensions_mut().insert(hive_task);
                    request.extensions_mut().insert(remote_ctx);
                    return Ok(next.run(request).await);
                }
                Err(e) => {
                    if e.is_not_found() {
                        tracing::debug!(
                            task_id = %task_id,
                            "Task not found on Hive either"
                        );
                    } else {
                        tracing::warn!(
                            task_id = %task_id,
                            error = %e,
                            "Failed to fetch task from Hive"
                        );
                    }
                }
            }
        }

        // Fall back to signaling handler (for handlers that can handle RemoteTaskNeeded)
        request
            .extensions_mut()
            .insert(RemoteTaskNeeded { task_id });
        return Ok(next.run(request).await);
    }

    // Non-GET request with missing task - return 404
    let path = request
        .extensions()
        .get::<OriginalUri>()
        .map(|uri| uri.path())
        .unwrap_or_else(|| request.uri().path())
        .trim_end_matches('/');
    tracing::debug!(
        task_id = %task_id,
        method = %request.method(),
        path = %path,
        "Task not found locally, returning 404"
    );
    Err(StatusCode::NOT_FOUND)
}

pub async fn load_task_attempt_middleware(
    State(deployment): State<DeploymentImpl>,
    Path(task_attempt_id): Path<Uuid>,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    load_task_attempt_impl(deployment, task_attempt_id, request, next).await
}

/// Variant of load_task_attempt_middleware for routes with wildcard path params.
/// Use this for routes like `/{id}/files/{*file_path}` where there are 2 path params.
pub async fn load_task_attempt_middleware_with_wildcard(
    State(deployment): State<DeploymentImpl>,
    Path((task_attempt_id, _file_path)): Path<(Uuid, String)>,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    load_task_attempt_impl(deployment, task_attempt_id, request, next).await
}

/// Internal implementation shared by load_task_attempt_middleware variants.
async fn load_task_attempt_impl(
    deployment: DeploymentImpl,
    task_attempt_id: Uuid,
    mut request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    // Load the TaskAttempt from the database
    let attempt = match TaskAttempt::find_by_id(&deployment.db().pool, task_attempt_id).await {
        Ok(Some(a)) => Some(a),
        Ok(None) => {
            // Attempt not found locally - try Hive fallback for GET requests
            tracing::debug!(
                attempt_id = %task_attempt_id,
                method = %request.method(),
                "TaskAttempt not found locally, attempting Hive fallback"
            );

            // Only fetch from Hive for GET requests (read operations)
            if request.method() == Method::GET {
                // Try to get client for Hive access
                let client = deployment.node_auth_client().cloned().or_else(|| {
                    match deployment.remote_client() {
                        Ok(client) => Some(client),
                        Err(e) => {
                            tracing::warn!(error = %e, "Failed to build Hive client for attempt fallback");
                            None
                        }
                    }
                });

                if let Some(client) = client {
                    match client.get_swarm_attempt(task_attempt_id).await {
                        Ok(response) => {
                            tracing::debug!(
                                attempt_id = %task_attempt_id,
                                shared_task_id = %response.attempt.shared_task_id,
                                node_id = %response.attempt.node_id,
                                "Fetched attempt from Hive"
                            );

                            // Convert NodeTaskAttempt to local TaskAttempt
                            let hive_attempt = TaskAttempt {
                                id: response.attempt.id,
                                task_id: response.attempt.shared_task_id, // Use shared_task_id as task reference
                                container_ref: response.attempt.container_ref,
                                branch: response.attempt.branch,
                                target_branch: response.attempt.target_branch,
                                executor: response.attempt.executor,
                                worktree_deleted: response.attempt.worktree_deleted,
                                setup_completed_at: response.attempt.setup_completed_at,
                                created_at: response.attempt.created_at,
                                updated_at: response.attempt.updated_at,
                                hive_synced_at: Some(response.attempt.updated_at),
                                hive_assignment_id: response.attempt.assignment_id,
                                origin_node_id: Some(response.attempt.node_id),
                            };

                            // Inject RemoteTaskAttemptContext so handlers know this is a remote attempt
                            // Use node_info from Hive response for proxy routing
                            let remote_ctx = RemoteTaskAttemptContext {
                                node_id: response.attempt.node_id,
                                node_url: response
                                    .node_info
                                    .as_ref()
                                    .and_then(|n| n.public_url.clone()),
                                node_status: response.node_info.as_ref().map(|n| n.status.clone()),
                                task_id: response.attempt.shared_task_id,
                            };

                            request.extensions_mut().insert(hive_attempt);
                            request.extensions_mut().insert(remote_ctx);
                            return Ok(next.run(request).await);
                        }
                        Err(e) => {
                            if e.is_not_found() {
                                tracing::debug!(
                                    attempt_id = %task_attempt_id,
                                    "Attempt not found on Hive either"
                                );
                            } else {
                                tracing::warn!(
                                    attempt_id = %task_attempt_id,
                                    error = %e,
                                    "Failed to fetch attempt from Hive"
                                );
                            }
                        }
                    }
                }
            }

            // Fall back to signaling handler
            request.extensions_mut().insert(RemoteAttemptNeeded {
                attempt_id: task_attempt_id,
            });
            return Ok(next.run(request).await);
        }
        Err(e) => {
            tracing::error!("Failed to fetch TaskAttempt {}: {}", task_attempt_id, e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };
    let attempt = attempt.expect("attempt is Some at this point");

    // Load the parent Task to check if it belongs to a remote project
    let task = match Task::find_by_id(&deployment.db().pool, attempt.task_id).await {
        Ok(Some(t)) => t,
        Ok(None) => {
            tracing::warn!(
                "Task {} not found for TaskAttempt {}",
                attempt.task_id,
                task_attempt_id
            );
            return Err(StatusCode::NOT_FOUND);
        }
        Err(e) => {
            tracing::error!(
                "Failed to fetch Task {} for TaskAttempt {}: {}",
                attempt.task_id,
                task_attempt_id,
                e
            );
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    // Load the Project to check if it's remote
    let project = match Project::find_by_id(&deployment.db().pool, task.project_id).await {
        Ok(Some(p)) => p,
        Ok(None) => {
            tracing::warn!("Project {} not found for Task {}", task.project_id, task.id);
            return Err(StatusCode::NOT_FOUND);
        }
        Err(e) => {
            tracing::error!(
                "Failed to fetch Project {} for Task {}: {}",
                task.project_id,
                task.id,
                e
            );
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    // If project is remote, inject RemoteTaskAttemptContext for proxy routing
    if project.is_remote {
        if let (Some(node_id), Some(shared_task_id)) = (project.source_node_id, task.shared_task_id)
        {
            let remote_ctx = RemoteTaskAttemptContext {
                node_id,
                node_url: project.source_node_public_url.clone(),
                node_status: project.source_node_status.clone(),
                task_id: shared_task_id,
            };
            tracing::debug!(
                task_attempt_id = %task_attempt_id,
                task_id = %task.id,
                shared_task_id = %shared_task_id,
                node_id = %node_id,
                node_status = ?remote_ctx.node_status,
                "Loaded remote task attempt context"
            );
            request.extensions_mut().insert(remote_ctx);
        } else {
            tracing::warn!(
                task_attempt_id = %task_attempt_id,
                task_id = %task.id,
                project_id = %project.id,
                "Remote project missing source_node_id or task missing shared_task_id"
            );
        }
    }

    // Insert the attempt into extensions
    request.extensions_mut().insert(attempt);

    // Continue on
    Ok(next.run(request).await)
}

/// Middleware to load a task attempt by the task's shared_task_id.
///
/// Used for the `/task-attempts/by-task-id/{task_id}` routes that receive
/// proxied requests from other nodes. This finds the task by shared_task_id,
/// then loads its most recent attempt.
///
/// This middleware also validates the proxy token if one is provided via
/// the Authorization header. If no token is provided and the connection token
/// validator is enabled, the request is rejected.
pub async fn load_task_attempt_by_task_id_middleware(
    State(deployment): State<DeploymentImpl>,
    Path(shared_task_id): Path<Uuid>,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    load_task_attempt_by_task_id_impl(deployment, shared_task_id, request, next).await
}

/// Variant for routes with wildcard path params like `/{task_id}/files/{*file_path}`.
pub async fn load_task_attempt_by_task_id_middleware_with_wildcard(
    State(deployment): State<DeploymentImpl>,
    Path((shared_task_id, _file_path)): Path<(Uuid, String)>,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    load_task_attempt_by_task_id_impl(deployment, shared_task_id, request, next).await
}

/// Internal implementation for loading task attempt by shared_task_id.
async fn load_task_attempt_by_task_id_impl(
    deployment: DeploymentImpl,
    shared_task_id: Uuid,
    mut request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    // Validate proxy token if connection token validation is enabled
    let validator = deployment.connection_token_validator();
    if validator.is_enabled() {
        let token = extract_bearer_token(request.headers()).ok_or_else(|| {
            tracing::warn!(
                shared_task_id = %shared_task_id,
                "Missing Authorization header for by-task-id route"
            );
            StatusCode::UNAUTHORIZED
        })?;

        match validator.validate_proxy_token(token) {
            Ok(proxy_token) => {
                tracing::debug!(
                    source_node_id = %proxy_token.source_node_id,
                    target_node_id = %proxy_token.target_node_id,
                    shared_task_id = %shared_task_id,
                    "Validated proxy token for by-task-id route"
                );
                request.extensions_mut().insert(ProxyRequestContext {
                    source_node_id: proxy_token.source_node_id,
                });
            }
            Err(e) => {
                tracing::warn!(
                    shared_task_id = %shared_task_id,
                    error = ?e,
                    "Invalid proxy token for by-task-id route"
                );
                return Err(StatusCode::UNAUTHORIZED);
            }
        }
    }

    // Find the task by shared_task_id
    let task = match Task::find_by_shared_task_id(&deployment.db().pool, shared_task_id).await {
        Ok(Some(task)) => task,
        Ok(None) => {
            tracing::warn!(
                shared_task_id = %shared_task_id,
                "Task not found by shared_task_id"
            );
            return Err(StatusCode::NOT_FOUND);
        }
        Err(e) => {
            tracing::error!(
                shared_task_id = %shared_task_id,
                error = %e,
                "Failed to fetch task by shared_task_id"
            );
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    // Find the most recent attempt for this task
    let attempts = match TaskAttempt::fetch_all(&deployment.db().pool, Some(task.id)).await {
        Ok(attempts) => attempts,
        Err(e) => {
            tracing::error!(
                task_id = %task.id,
                shared_task_id = %shared_task_id,
                error = %e,
                "Failed to fetch task attempts"
            );
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    let attempt = match attempts.into_iter().next() {
        Some(attempt) => attempt,
        None => {
            tracing::warn!(
                task_id = %task.id,
                shared_task_id = %shared_task_id,
                "No task attempts found for task"
            );
            return Err(StatusCode::NOT_FOUND);
        }
    };

    tracing::debug!(
        attempt_id = %attempt.id,
        task_id = %task.id,
        shared_task_id = %shared_task_id,
        "Loaded task attempt by shared_task_id"
    );

    // Insert the attempt into extensions
    request.extensions_mut().insert(attempt);

    // Continue to the next middleware/handler
    Ok(next.run(request).await)
}

/// Middleware that loads a Task by shared_task_id for routes that don't need an existing attempt.
/// Used for creating new task attempts via cross-node proxying.
pub async fn load_task_by_task_id_middleware(
    State(deployment): State<DeploymentImpl>,
    Path(shared_task_id): Path<Uuid>,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    load_task_by_task_id_impl(deployment, shared_task_id, request, next).await
}

/// Internal implementation for loading task by shared_task_id (without attempt lookup).
async fn load_task_by_task_id_impl(
    deployment: DeploymentImpl,
    shared_task_id: Uuid,
    mut request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    // Validate proxy token if connection token validation is enabled
    let validator = deployment.connection_token_validator();
    if validator.is_enabled() {
        let token = extract_bearer_token(request.headers()).ok_or_else(|| {
            tracing::warn!(
                shared_task_id = %shared_task_id,
                "Missing Authorization header for by-task-id route"
            );
            StatusCode::UNAUTHORIZED
        })?;

        match validator.validate_proxy_token(token) {
            Ok(proxy_token) => {
                tracing::debug!(
                    source_node_id = %proxy_token.source_node_id,
                    target_node_id = %proxy_token.target_node_id,
                    "Validated proxy token for by-task-id route"
                );
            }
            Err(e) => {
                tracing::warn!(
                    shared_task_id = %shared_task_id,
                    error = ?e,
                    "Invalid proxy token for by-task-id route"
                );
                return Err(StatusCode::UNAUTHORIZED);
            }
        }
    }

    // Find the task by shared_task_id
    let task = match Task::find_by_shared_task_id(&deployment.db().pool, shared_task_id).await {
        Ok(Some(task)) => task,
        Ok(None) => {
            tracing::warn!(
                shared_task_id = %shared_task_id,
                "Task not found by shared_task_id"
            );
            return Err(StatusCode::NOT_FOUND);
        }
        Err(e) => {
            tracing::error!(
                shared_task_id = %shared_task_id,
                error = %e,
                "Failed to fetch task by shared_task_id"
            );
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    // Inject the task into the request
    request.extensions_mut().insert(task);

    // Continue to the next middleware/handler
    Ok(next.run(request).await)
}

pub async fn load_execution_process_middleware(
    State(deployment): State<DeploymentImpl>,
    Path(process_id): Path<Uuid>,
    mut request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    // Load the execution process from the database
    let execution_process =
        match ExecutionProcess::find_by_id(&deployment.db().pool, process_id).await {
            Ok(Some(process)) => process,
            Ok(None) => {
                tracing::warn!("ExecutionProcess {} not found", process_id);
                return Err(StatusCode::NOT_FOUND);
            }
            Err(e) => {
                tracing::error!("Failed to fetch execution process {}: {}", process_id, e);
                return Err(StatusCode::INTERNAL_SERVER_ERROR);
            }
        };

    // Inject the execution process into the request
    request.extensions_mut().insert(execution_process);

    // Continue to the next middleware/handler
    Ok(next.run(request).await)
}

// Middleware that loads and injects Template based on the template_id path parameter
pub async fn load_template_middleware(
    State(deployment): State<DeploymentImpl>,
    Path(template_id): Path<Uuid>,
    request: axum::extract::Request,
    next: Next,
) -> Result<Response, StatusCode> {
    // Load the template from the database
    let template = match Template::find_by_id(&deployment.db().pool, template_id).await {
        Ok(Some(template)) => template,
        Ok(None) => {
            tracing::warn!("Template {} not found", template_id);
            return Err(StatusCode::NOT_FOUND);
        }
        Err(e) => {
            tracing::error!("Failed to fetch template {}: {}", template_id, e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    // Insert the template as an extension
    let mut request = request;
    request.extensions_mut().insert(template);

    // Continue with the next middleware/handler
    Ok(next.run(request).await)
}

// Middleware that loads and injects Label based on the label_id path parameter
pub async fn load_label_middleware(
    State(deployment): State<DeploymentImpl>,
    Path(label_id): Path<Uuid>,
    request: axum::extract::Request,
    next: Next,
) -> Result<Response, StatusCode> {
    // Load the label from the database
    let label = match Label::find_by_id(&deployment.db().pool, label_id).await {
        Ok(Some(label)) => label,
        Ok(None) => {
            tracing::warn!("Label {} not found", label_id);
            return Err(StatusCode::NOT_FOUND);
        }
        Err(e) => {
            tracing::error!("Failed to fetch label {}: {}", label_id, e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    // Insert the label as an extension
    let mut request = request;
    request.extensions_mut().insert(label);

    // Continue with the next middleware/handler
    Ok(next.run(request).await)
}
