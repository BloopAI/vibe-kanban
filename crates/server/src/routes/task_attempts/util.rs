use db::models::image::TaskImage;
use deployment::Deployment;
use services::services::{container::ContainerService, image::ImageService};
use uuid::Uuid;

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
