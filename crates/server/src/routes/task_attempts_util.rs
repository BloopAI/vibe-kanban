use db::models::{
    execution_process::{ExecutionProcess, ExecutionProcessRunReason},
    image::TaskImage,
    task_attempt::TaskAttemptError,
};
use deployment::Deployment;
use executors::{actions::ExecutorActionType, profile::ExecutorProfileId};
use services::services::{container::ContainerService, image::ImageService};
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::error::ApiError;

/// Fetch the latest CodingAgent executor profile for a task attempt.
pub async fn latest_executor_profile_for_attempt(
    pool: &SqlitePool,
    attempt_id: Uuid,
) -> Result<ExecutorProfileId, ApiError> {
    let latest_execution_process = ExecutionProcess::find_latest_by_task_attempt_and_run_reason(
        pool,
        attempt_id,
        &ExecutionProcessRunReason::CodingAgent,
    )
    .await?
    .ok_or(ApiError::TaskAttempt(TaskAttemptError::ValidationError(
        "Couldn't find initial coding agent process, has it run yet?".to_string(),
    )))?;

    let profile = match &latest_execution_process
        .executor_action()
        .map_err(|e| ApiError::TaskAttempt(TaskAttemptError::ValidationError(e.to_string())))?
        .typ
    {
        ExecutorActionType::CodingAgentInitialRequest(request) => {
            Ok(request.executor_profile_id.clone())
        }
        ExecutorActionType::CodingAgentFollowUpRequest(request) => {
            Ok(request.executor_profile_id.clone())
        }
        _ => Err(ApiError::TaskAttempt(TaskAttemptError::ValidationError(
            "Couldn't find profile from initial request".to_string(),
        ))),
    }?;

    Ok(profile)
}

/// Resolve and ensure the worktree path for a task attempt.
pub async fn ensure_worktree_path(
    deployment: &crate::DeploymentImpl,
    attempt: &db::models::task_attempt::TaskAttempt,
) -> Result<std::path::PathBuf, ApiError> {
    let container_ref = deployment
        .container()
        .ensure_container_exists(attempt)
        .await?;
    Ok(std::path::PathBuf::from(container_ref))
}

/// Require the latest session_id for a task attempt (CodingAgent runs); error if none exists.
pub async fn require_latest_session_id(
    pool: &SqlitePool,
    attempt_id: Uuid,
) -> Result<String, ApiError> {
    ExecutionProcess::find_latest_session_id_by_task_attempt(pool, attempt_id)
        .await?
        .ok_or(ApiError::TaskAttempt(TaskAttemptError::ValidationError(
            "Couldn't find a prior session_id, please create a new task attempt".to_string(),
        )))
}

/// Associate images to the task, copy into worktree, and canonicalize paths in the prompt.
/// Returns the transformed prompt.
pub async fn handle_images_for_prompt(
    deployment: &crate::DeploymentImpl,
    attempt: &db::models::task_attempt::TaskAttempt,
    task_id: Uuid,
    image_ids: &[Uuid],
    prompt: &str,
) -> Result<String, ApiError> {
    if image_ids.is_empty() {
        return Ok(prompt.to_string());
    }

    TaskImage::associate_many_dedup(&deployment.db().pool, task_id, image_ids).await?;

    // Copy to worktree and canonicalize
    let worktree_path = ensure_worktree_path(deployment, attempt).await?;
    deployment
        .image()
        .copy_images_by_ids_to_worktree(&worktree_path, image_ids)
        .await?;
    Ok(ImageService::canonicalise_image_paths(
        prompt,
        &worktree_path,
    ))
}
