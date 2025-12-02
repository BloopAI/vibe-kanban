use std::path::Path;

use db::models::{
    execution_process::ExecutionProcess, executor_session::ExecutorSession, image::TaskImage,
};
use sqlx::SqlitePool;
use uuid::Uuid;

use super::image::ImageService;

/// Result of preparing a follow-up prompt, including orphan prompt concatenation.
pub struct PreparedFollowUp {
    pub prompt: String,
    pub session_id: Option<String>,
}

/// Prepend orphan prompts to the base prompt and retrieve the latest session ID.
/// Orphan prompts are those from sessions after the latest one with a session_id,
/// which allows continuity in conversations that have not yet established a session ID.
pub async fn prepend_orphan_prompts(
    pool: &SqlitePool,
    task_attempt_id: Uuid,
    base_prompt: String,
) -> Result<PreparedFollowUp, sqlx::Error> {
    // Get latest session with a session_id
    let latest_session =
        ExecutionProcess::find_latest_session_by_task_attempt(pool, task_attempt_id).await?;

    let session_id = latest_session.as_ref().and_then(|s| s.session_id.clone());

    // Get orphan sessions (sessions after the latest with an ID, that have no session_id)
    let orphan_sessions = ExecutorSession::find_orphans_after_session(
        pool,
        task_attempt_id,
        latest_session.as_ref().map(|s| s.id),
    )
    .await?;

    // Build final prompt: orphan prompts (chronological) + current prompt
    let prompt = {
        let orphan_prompts: Vec<_> = orphan_sessions
            .iter()
            .filter_map(|s| s.prompt.as_ref())
            .collect();

        if orphan_prompts.is_empty() {
            base_prompt
        } else {
            format!(
                "{}\n\n{}",
                orphan_prompts
                    .into_iter()
                    .cloned()
                    .collect::<Vec<_>>()
                    .join("\n\n"),
                base_prompt
            )
        }
    };

    Ok(PreparedFollowUp { prompt, session_id })
}

/// Associate images to the task, copy into worktree, and canonicalize paths in the prompt.
/// Returns the transformed prompt.
pub async fn handle_images_for_prompt(
    pool: &SqlitePool,
    image_service: &ImageService,
    task_id: Uuid,
    image_ids: &[Uuid],
    prompt: &str,
    worktree_path: &Path,
) -> Result<String, super::image::ImageError> {
    if image_ids.is_empty() {
        return Ok(prompt.to_string());
    }

    TaskImage::associate_many_dedup(pool, task_id, image_ids).await?;
    image_service
        .copy_images_by_ids_to_worktree(worktree_path, image_ids)
        .await?;
    Ok(ImageService::canonicalise_image_paths(
        prompt,
        worktree_path,
    ))
}
