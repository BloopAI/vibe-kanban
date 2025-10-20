use axum::{
    extract::{Path, Request, State},
    http::StatusCode,
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

// TODO: fix
// Middleware that loads and injects Project, Task, TaskAttempt, and ExecutionProcess
// based on the path parameters: project_id, task_id, attempt_id, process_id
// pub async fn load_execution_process_with_context_middleware(
//     State(deployment): State<DeploymentImpl>,
//     Path((project_id, task_id, attempt_id, process_id)): Path<(Uuid, Uuid, Uuid, Uuid)>,
//     request: axum::extract::Request,
//     next: Next,
// ) -> Result<Response, StatusCode> {
//     // Load the task attempt context first
//     let context = match TaskAttempt::load_context(
//         &deployment.db().pool,
//         attempt_id,
//         task_id,
//         project_id,
//     )
//     .await
//     {
//         Ok(context) => context,
//         Err(e) => {
//             tracing::error!(
//                 "Failed to load context for attempt {} in task {} in project {}: {}",
//                 attempt_id,
//                 task_id,
//                 project_id,
//                 e
//             );
//             return Err(StatusCode::NOT_FOUND);
//         }
//     };

//     // Load the execution process
//     let execution_process = match ExecutionProcess::find_by_id(&deployment.db().pool, process_id).await
//     {
//         Ok(Some(process)) => process,
//         Ok(None) => {
//             tracing::warn!("ExecutionProcess {} not found", process_id);
//             return Err(StatusCode::NOT_FOUND);
//         }
//         Err(e) => {
//             tracing::error!("Failed to fetch execution process {}: {}", process_id, e);
//             return Err(StatusCode::INTERNAL_SERVER_ERROR);
//         }
//     };

//     // Insert all models as extensions
//     let mut request = request;
//     request.extensions_mut().insert(context.project);
//     request.extensions_mut().insert(context.task);
//     request.extensions_mut().insert(context.task_attempt);
//     request.extensions_mut().insert(execution_process);

//     // Continue with the next middleware/handler
//     Ok(next.run(request).await)
// }

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
