use axum::{
    extract::{Path, Request, State},
    http::StatusCode,
    middleware::Next,
    response::Response,
};
use db::models::{
    execution_process::ExecutionProcess, inbox::InboxItem, project::Project, session::Session,
    tag::Tag, task::Task, team::Team, workspace::Workspace,
};
use deployment::Deployment;
use std::collections::HashMap;
use uuid::Uuid;

use crate::DeploymentImpl;

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

    // Insert the project as an extension
    let mut request = request;
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

pub async fn load_workspace_middleware(
    State(deployment): State<DeploymentImpl>,
    Path(workspace_id): Path<Uuid>,
    mut request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    // Load the Workspace from the database
    let workspace = match Workspace::find_by_id(&deployment.db().pool, workspace_id).await {
        Ok(Some(w)) => w,
        Ok(None) => {
            tracing::warn!("Workspace {} not found", workspace_id);
            return Err(StatusCode::NOT_FOUND);
        }
        Err(e) => {
            tracing::error!("Failed to fetch Workspace {}: {}", workspace_id, e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    // Insert the workspace into extensions
    request.extensions_mut().insert(workspace);

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

pub async fn load_session_middleware(
    State(deployment): State<DeploymentImpl>,
    Path(session_id): Path<Uuid>,
    mut request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let session = match Session::find_by_id(&deployment.db().pool, session_id).await {
        Ok(Some(session)) => session,
        Ok(None) => {
            tracing::warn!("Session {} not found", session_id);
            return Err(StatusCode::NOT_FOUND);
        }
        Err(e) => {
            tracing::error!("Failed to fetch session {}: {}", session_id, e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    request.extensions_mut().insert(session);
    Ok(next.run(request).await)
}

// Middleware that loads and injects Team based on the team_id path parameter
// Supports multiple lookup strategies: UUID, slug, or identifier
pub async fn load_team_middleware(
    State(deployment): State<DeploymentImpl>,
    Path(params): Path<HashMap<String, String>>,
    request: axum::extract::Request,
    next: Next,
) -> Result<Response, StatusCode> {
    // Extract team_id string from path params
    let team_id_str = params.get("team_id").ok_or_else(|| {
        tracing::error!("Missing team_id in path");
        StatusCode::BAD_REQUEST
    })?;

    // Try to resolve team using multiple strategies:
    // 1. UUID lookup (if parseable)
    // 2. Slug lookup (e.g., "test-team")
    // 3. Identifier lookup (e.g., "TES", "VIB")
    let team = if let Ok(uuid) = Uuid::parse_str(team_id_str) {
        // Try UUID lookup
        Team::find_by_id(&deployment.db().pool, uuid).await
    } else {
        // Try slug lookup first
        match Team::find_by_slug(&deployment.db().pool, team_id_str).await {
            Ok(Some(team)) => Ok(Some(team)),
            Ok(None) => {
                // Fall back to identifier lookup
                Team::find_by_identifier(&deployment.db().pool, team_id_str).await
            }
            Err(e) => Err(e),
        }
    };

    let team = match team {
        Ok(Some(team)) => team,
        Ok(None) => {
            tracing::warn!("Team not found: {}", team_id_str);
            return Err(StatusCode::NOT_FOUND);
        }
        Err(e) => {
            tracing::error!("Failed to fetch team {}: {}", team_id_str, e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    // Insert the team as an extension
    let mut request = request;
    request.extensions_mut().insert(team);

    // Continue with the next middleware/handler
    Ok(next.run(request).await)
}

// Middleware that loads and injects InboxItem based on the inbox_item_id path parameter
pub async fn load_inbox_item_middleware(
    State(deployment): State<DeploymentImpl>,
    Path(inbox_item_id): Path<Uuid>,
    request: axum::extract::Request,
    next: Next,
) -> Result<Response, StatusCode> {
    // Load the inbox item from the database
    let inbox_item = match InboxItem::find_by_id(&deployment.db().pool, inbox_item_id).await {
        Ok(Some(item)) => item,
        Ok(None) => {
            tracing::warn!("InboxItem {} not found", inbox_item_id);
            return Err(StatusCode::NOT_FOUND);
        }
        Err(e) => {
            tracing::error!("Failed to fetch inbox item {}: {}", inbox_item_id, e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    // Insert the inbox item as an extension
    let mut request = request;
    request.extensions_mut().insert(inbox_item);

    // Continue with the next middleware/handler
    Ok(next.run(request).await)
}
