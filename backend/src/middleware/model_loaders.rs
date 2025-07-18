use axum::{
    extract::{Path, State},
    http::StatusCode,
    middleware::Next,
    response::Response,
};
use uuid::Uuid;

use crate::{
    app_state::AppState,
    models::{
        execution_process::ExecutionProcess, project::Project, task::Task,
        task_attempt::TaskAttempt, task_template::TaskTemplate,
    },
};

/// Middleware that loads and injects a Project based on the project_id path parameter
pub async fn load_project_middleware(
    State(app_state): State<AppState>,
    Path(project_id): Path<Uuid>,
    request: axum::extract::Request,
    next: Next,
) -> Result<Response, StatusCode> {
    // Load the project from the database
    let project = match Project::find_by_id(&app_state.db_pool, project_id).await {
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

/// Middleware that loads and injects both Project and Task based on project_id and task_id path parameters
pub async fn load_task_middleware(
    State(app_state): State<AppState>,
    Path((project_id, task_id)): Path<(Uuid, Uuid)>,
    request: axum::extract::Request,
    next: Next,
) -> Result<Response, StatusCode> {
    // Load the project first
    let project = match Project::find_by_id(&app_state.db_pool, project_id).await {
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

    // Load the task and validate it belongs to the project
    let task = match Task::find_by_id_and_project_id(&app_state.db_pool, task_id, project_id).await
    {
        Ok(Some(task)) => task,
        Ok(None) => {
            tracing::warn!("Task {} not found in project {}", task_id, project_id);
            return Err(StatusCode::NOT_FOUND);
        }
        Err(e) => {
            tracing::error!(
                "Failed to fetch task {} in project {}: {}",
                task_id,
                project_id,
                e
            );
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    // Insert both models as extensions
    let mut request = request;
    request.extensions_mut().insert(project);
    request.extensions_mut().insert(task);

    // Continue with the next middleware/handler
    Ok(next.run(request).await)
}

/// Middleware that loads and injects Project, Task, and TaskAttempt based on project_id, task_id, and attempt_id path parameters
pub async fn load_task_attempt_middleware(
    State(app_state): State<AppState>,
    Path((project_id, task_id, attempt_id)): Path<(Uuid, Uuid, Uuid)>,
    request: axum::extract::Request,
    next: Next,
) -> Result<Response, StatusCode> {
    // Load the full context in one call using the existing method
    let context = match TaskAttempt::load_context(
        &app_state.db_pool,
        attempt_id,
        task_id,
        project_id,
    )
    .await
    {
        Ok(context) => context,
        Err(e) => {
            tracing::error!(
                "Failed to load context for attempt {} in task {} in project {}: {}",
                attempt_id,
                task_id,
                project_id,
                e
            );
            return Err(StatusCode::NOT_FOUND);
        }
    };

    // Insert all models as extensions
    let mut request = request;
    request.extensions_mut().insert(context.project);
    request.extensions_mut().insert(context.task);
    request.extensions_mut().insert(context.task_attempt);

    // Continue with the next middleware/handler
    Ok(next.run(request).await)
}

/// Simple middleware that loads and injects ExecutionProcess based on the process_id path parameter
/// without any additional validation
pub async fn load_execution_process_simple_middleware(
    State(app_state): State<AppState>,
    Path(process_id): Path<Uuid>,
    mut request: axum::extract::Request,
    next: Next,
) -> Result<Response, StatusCode> {
    // Load the execution process from the database
    let execution_process = match ExecutionProcess::find_by_id(&app_state.db_pool, process_id).await
    {
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

/// Middleware that loads and injects TaskTemplate based on the template_id path parameter
pub async fn load_task_template_middleware(
    State(app_state): State<AppState>,
    Path(template_id): Path<Uuid>,
    request: axum::extract::Request,
    next: Next,
) -> Result<Response, StatusCode> {
    // Load the task template from the database
    let task_template = match TaskTemplate::find_by_id(&app_state.db_pool, template_id).await {
        Ok(Some(template)) => template,
        Ok(None) => {
            tracing::warn!("TaskTemplate {} not found", template_id);
            return Err(StatusCode::NOT_FOUND);
        }
        Err(e) => {
            tracing::error!("Failed to fetch task template {}: {}", template_id, e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    // Insert the task template as an extension
    let mut request = request;
    request.extensions_mut().insert(task_template);

    // Continue with the next middleware/handler
    Ok(next.run(request).await)
}
