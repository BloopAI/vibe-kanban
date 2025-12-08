use axum::{
    extract::{Path, Request, State},
    http::{HeaderMap, StatusCode},
    middleware::Next,
    response::Response,
};
use db::models::{
    execution_process::ExecutionProcess, project::Project, tag::Tag, task::Task,
    task_attempt::TaskAttempt,
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

pub async fn load_project_middleware(
    State(deployment): State<DeploymentImpl>,
    Path(project_id): Path<Uuid>,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    // Load the project from the database
    let project = match Project::find_by_id(&deployment.db().pool, project_id).await {
        Ok(Some(project)) => project,
        Ok(None) => {
            tracing::warn!("Project {} not found", project_id);
            return Err(StatusCode::NOT_FOUND);
        }
        Err(e) => {
            tracing::error!("Failed to fetch project {}: {}", project_id, e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    let mut request = request;

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
    // Load the task and validate it belongs to the project
    let task = match Task::find_by_id(&deployment.db().pool, task_id).await {
        Ok(Some(task)) => task,
        Ok(None) => {
            tracing::warn!("Task {} not found", task_id);
            return Err(StatusCode::NOT_FOUND);
        }
        Err(e) => {
            tracing::error!("Failed to fetch task {}: {}", task_id, e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    // Insert both models as extensions
    let mut request = request;
    request.extensions_mut().insert(task);

    // Continue with the next middleware/handler
    Ok(next.run(request).await)
}

pub async fn load_task_attempt_middleware(
    State(deployment): State<DeploymentImpl>,
    Path(task_attempt_id): Path<Uuid>,
    mut request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    // Load the TaskAttempt from the database
    let attempt = match TaskAttempt::find_by_id(&deployment.db().pool, task_attempt_id).await {
        Ok(Some(a)) => a,
        Ok(None) => {
            tracing::warn!("TaskAttempt {} not found", task_attempt_id);
            return Err(StatusCode::NOT_FOUND);
        }
        Err(e) => {
            tracing::error!("Failed to fetch TaskAttempt {}: {}", task_attempt_id, e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    // Insert the attempt into extensions
    request.extensions_mut().insert(attempt);

    // Continue on
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

// Middleware that loads and injects Tag based on the tag_id path parameter
pub async fn load_tag_middleware(
    State(deployment): State<DeploymentImpl>,
    Path(tag_id): Path<Uuid>,
    request: axum::extract::Request,
    next: Next,
) -> Result<Response, StatusCode> {
    // Load the tag from the database
    let tag = match Tag::find_by_id(&deployment.db().pool, tag_id).await {
        Ok(Some(tag)) => tag,
        Ok(None) => {
            tracing::warn!("Tag {} not found", tag_id);
            return Err(StatusCode::NOT_FOUND);
        }
        Err(e) => {
            tracing::error!("Failed to fetch tag {}: {}", tag_id, e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    // Insert the tag as an extension
    let mut request = request;
    request.extensions_mut().insert(tag);

    // Continue with the next middleware/handler
    Ok(next.run(request).await)
}
