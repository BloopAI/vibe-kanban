use deployment::Deployment;
use services::services::container::ContainerService;

use crate::error::ApiError;

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
