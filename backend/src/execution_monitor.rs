use std::sync::OnceLock;

use git2::Repository;
use uuid::Uuid;

use crate::{
    app_state::AppState,
    models::{
        execution_process::{ExecutionProcess, ExecutionProcessStatus, ExecutionProcessType},
        task::{Task, TaskStatus},
        task_attempt::{TaskAttempt, TaskAttemptStatus},
        task_attempt_activity::{CreateTaskAttemptActivity, TaskAttemptActivity},
    },
    utils::worktree_manager::WorktreeManager,
};

/// Commit any unstaged changes in the worktree after execution completion
async fn commit_execution_changes(
    worktree_path: &str,
    attempt_id: Uuid,
    summary: Option<&str>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Run git operations in a blocking task since git2 is synchronous
    let worktree_path = worktree_path.to_string();
    let summary = summary.map(|s| s.to_string());
    tokio::task::spawn_blocking(move || {
        let worktree_repo = Repository::open(&worktree_path)?;

        // Check if there are any changes to commit
        let status = worktree_repo.statuses(None)?;
        let has_changes = status.iter().any(|entry| {
            let flags = entry.status();
            flags.contains(git2::Status::INDEX_NEW)
                || flags.contains(git2::Status::INDEX_MODIFIED)
                || flags.contains(git2::Status::INDEX_DELETED)
                || flags.contains(git2::Status::WT_NEW)
                || flags.contains(git2::Status::WT_MODIFIED)
                || flags.contains(git2::Status::WT_DELETED)
        });

        if !has_changes {
            return Ok::<(), Box<dyn std::error::Error + Send + Sync>>(());
        }

        // Get the current signature for commits
        let signature = worktree_repo.signature()?;

        // Get the current HEAD commit
        let head = worktree_repo.head()?;
        let parent_commit = head.peel_to_commit()?;

        // Stage all changes
        let mut worktree_index = worktree_repo.index()?;
        worktree_index.add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)?;
        worktree_index.write()?;

        let tree_id = worktree_index.write_tree()?;
        let tree = worktree_repo.find_tree(tree_id)?;

        // Create commit for the changes
        let commit_message = if let Some(ref summary_msg) = summary {
            summary_msg.clone()
        } else {
            format!("Task attempt {} - Final changes", attempt_id)
        };
        worktree_repo.commit(
            Some("HEAD"),
            &signature,
            &signature,
            &commit_message,
            &tree,
            &[&parent_commit],
        )?;

        Ok(())
    })
    .await??;

    Ok(())
}

/// Check if worktree has uncommitted changes and warn if so
fn check_uncommitted_changes(worktree_path: &str) {
    if let Ok(repo) = Repository::open(worktree_path) {
        if let Ok(statuses) = repo.statuses(None) {
            // Simplified check: any status entry indicates changes
            if !statuses.is_empty() {
                tracing::warn!(
                    "Deleting worktree {} with uncommitted changes",
                    worktree_path
                );
            }
        }
    }
}

/// Delete a single git worktree and its filesystem directory using WorktreeManager
async fn delete_worktree(
    worktree_path: &str,
    main_repo_path: &str,
    attempt_id: Uuid,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let worktree_path_buf = std::path::PathBuf::from(worktree_path);

    // Check if worktree directory exists first - no-op if already gone
    if !worktree_path_buf.exists() {
        tracing::debug!(
            "Worktree {} already doesn't exist, skipping cleanup",
            worktree_path
        );
        return Ok(());
    }

    // Check for uncommitted changes and warn
    check_uncommitted_changes(worktree_path);

    match WorktreeManager::cleanup_worktree(&worktree_path_buf, Some(main_repo_path)).await {
        Ok(_) => {
            tracing::info!(
                "Successfully cleaned up worktree for attempt {}",
                attempt_id
            );
            Ok(())
        }
        Err(e) => {
            tracing::error!(
                "Failed to cleanup worktree for attempt {}: {}",
                attempt_id,
                e
            );
            Err(Box::new(e) as Box<dyn std::error::Error + Send + Sync>)
        }
    }
}

/// Clean up all worktrees for a specific task (immediate cleanup)
pub async fn cleanup_task_worktrees(
    pool: &sqlx::SqlitePool,
    task_id: Uuid,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let task_attempts_with_project =
        TaskAttempt::find_by_task_id_with_project(pool, task_id).await?;

    if task_attempts_with_project.is_empty() {
        tracing::debug!("No worktrees found for task {} to clean up", task_id);
        return Ok(());
    }

    tracing::info!(
        "Starting immediate cleanup of {} worktrees for task {}",
        task_attempts_with_project.len(),
        task_id
    );

    let mut cleaned_count = 0;
    let mut failed_count = 0;

    for (attempt_id, worktree_path, git_repo_path) in task_attempts_with_project {
        if let Err(e) = delete_worktree(&worktree_path, &git_repo_path, attempt_id).await {
            tracing::error!(
                "Failed to cleanup worktree for attempt {}: {}",
                attempt_id,
                e
            );
            failed_count += 1;
            // Continue with other attempts even if one fails
        } else {
            // Mark worktree as deleted in database after successful cleanup
            if let Err(e) =
                crate::models::task_attempt::TaskAttempt::mark_worktree_deleted(pool, attempt_id)
                    .await
            {
                tracing::error!(
                    "Failed to mark worktree as deleted in database for attempt {}: {}",
                    attempt_id,
                    e
                );
            } else {
                cleaned_count += 1;
            }
        }
    }

    tracing::info!(
        "Completed immediate cleanup for task {}: {} worktrees cleaned, {} failed",
        task_id,
        cleaned_count,
        failed_count
    );

    Ok(())
}

/// Defensively check for externally deleted worktrees and mark them as deleted in the database
async fn check_externally_deleted_worktrees(pool: &sqlx::SqlitePool) {
    let active_attempts = match sqlx::query!(
        r#"SELECT id as "id!: Uuid", worktree_path FROM task_attempts WHERE worktree_deleted = FALSE"#
    )
    .fetch_all(pool)
    .await
    {
        Ok(attempts) => attempts,
        Err(e) => {
            tracing::error!("Failed to query active task attempts for external deletion check: {}", e);
            return;
        }
    };

    tracing::debug!(
        "Checking {} active worktrees for external deletion...",
        active_attempts.len()
    );

    let mut externally_deleted_count = 0;
    for record in active_attempts {
        let attempt_id = record.id;
        let worktree_path = &record.worktree_path;

        // Check if worktree directory exists
        if !std::path::Path::new(worktree_path).exists() {
            // Worktree was deleted externally, mark as deleted in database
            if let Err(e) =
                crate::models::task_attempt::TaskAttempt::mark_worktree_deleted(pool, attempt_id)
                    .await
            {
                tracing::error!(
                    "Failed to mark externally deleted worktree as deleted for attempt {}: {}",
                    attempt_id,
                    e
                );
            } else {
                externally_deleted_count += 1;
                tracing::debug!(
                    "Marked externally deleted worktree as deleted for attempt {} (path: {})",
                    attempt_id,
                    worktree_path
                );
            }
        }
    }

    if externally_deleted_count > 0 {
        tracing::info!(
            "Found and marked {} externally deleted worktrees",
            externally_deleted_count
        );
    } else {
        tracing::debug!("No externally deleted worktrees found");
    }
}

/// Find and delete orphaned worktrees that don't correspond to any task attempts
async fn cleanup_orphaned_worktrees(pool: &sqlx::SqlitePool) {
    let worktree_base_dir = crate::models::task_attempt::TaskAttempt::get_worktree_base_dir();

    // Check if base directory exists
    if !worktree_base_dir.exists() {
        tracing::debug!(
            "Worktree base directory {} does not exist, skipping orphan cleanup",
            worktree_base_dir.display()
        );
        return;
    }

    // Read all directories in the base directory
    let entries = match std::fs::read_dir(&worktree_base_dir) {
        Ok(entries) => entries,
        Err(e) => {
            tracing::error!(
                "Failed to read worktree base directory {}: {}",
                worktree_base_dir.display(),
                e
            );
            return;
        }
    };

    let mut orphaned_count = 0;
    let mut checked_count = 0;

    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(e) => {
                tracing::warn!("Failed to read directory entry: {}", e);
                continue;
            }
        };

        let path = entry.path();

        // Only process directories
        if !path.is_dir() {
            continue;
        }

        let worktree_path_str = path.to_string_lossy().to_string();
        checked_count += 1;

        // Check if this worktree path exists in the database
        let exists_in_db = match sqlx::query!(
            "SELECT COUNT(*) as count FROM task_attempts WHERE worktree_path = ?",
            worktree_path_str
        )
        .fetch_one(pool)
        .await
        {
            Ok(row) => row.count > 0,
            Err(e) => {
                tracing::error!(
                    "Failed to check database for worktree path {}: {}",
                    worktree_path_str,
                    e
                );
                continue;
            }
        };

        if !exists_in_db {
            // This is an orphaned worktree - delete it
            tracing::info!("Found orphaned worktree: {}", worktree_path_str);

            // For orphaned worktrees, we try to clean up git metadata if possible
            // then remove the directory
            if let Err(e) = cleanup_orphaned_worktree_directory(&path).await {
                tracing::error!(
                    "Failed to remove orphaned worktree {}: {}",
                    worktree_path_str,
                    e
                );
            } else {
                orphaned_count += 1;
                tracing::info!(
                    "Successfully removed orphaned worktree: {}",
                    worktree_path_str
                );
            }
        }
    }

    if orphaned_count > 0 {
        tracing::info!(
            "Cleaned up {} orphaned worktrees (checked {} total directories)",
            orphaned_count,
            checked_count
        );
    } else {
        tracing::debug!(
            "No orphaned worktrees found (checked {} directories)",
            checked_count
        );
    }
}

/// Clean up an orphaned worktree directory, attempting to clean git metadata if possible
async fn cleanup_orphaned_worktree_directory(
    worktree_path: &std::path::Path,
) -> Result<(), std::io::Error> {
    // Use WorktreeManager for proper cleanup - it will try to infer the repo path
    // and clean up what it can, even if the main repo is gone
    match WorktreeManager::cleanup_worktree(worktree_path, None).await {
        Ok(()) => {
            tracing::debug!(
                "WorktreeManager successfully cleaned up orphaned worktree: {}",
                worktree_path.display()
            );
        }
        Err(e) => {
            tracing::warn!(
                "WorktreeManager cleanup failed for orphaned worktree {}: {}",
                worktree_path.display(),
                e
            );

            // If WorktreeManager cleanup failed, fall back to simple directory removal
            // This ensures we delete as much as we can
            if worktree_path.exists() {
                tracing::debug!(
                    "Falling back to simple directory removal for orphaned worktree: {}",
                    worktree_path.display()
                );
                std::fs::remove_dir_all(worktree_path).map_err(|e| {
                    std::io::Error::new(
                        e.kind(),
                        format!("Failed to remove orphaned worktree directory: {}", e),
                    )
                })?;
            }
        }
    }

    Ok(())
}

/// Cache for WSL root path from PowerShell
static WSL_ROOT_PATH_CACHE: OnceLock<Option<String>> = OnceLock::new();

/// Get WSL root path via PowerShell (cached)
async fn get_wsl_root_path() -> Option<String> {
    if let Some(cached) = WSL_ROOT_PATH_CACHE.get() {
        return cached.clone();
    }

    match tokio::process::Command::new("powershell.exe")
        .arg("-c")
        .arg("(Get-Location).Path -replace '^.*::', ''")
        .current_dir("/")
        .output()
        .await
    {
        Ok(output) => {
            match String::from_utf8(output.stdout) {
                Ok(pwd_str) => {
                    let pwd = pwd_str.trim();
                    tracing::info!("WSL root path detected: {}", pwd);

                    // Cache the result
                    let _ = WSL_ROOT_PATH_CACHE.set(Some(pwd.to_string()));
                    return Some(pwd.to_string());
                }
                Err(e) => {
                    tracing::error!("Failed to parse PowerShell pwd output as UTF-8: {}", e);
                }
            }
        }
        Err(e) => {
            tracing::error!("Failed to execute PowerShell pwd command: {}", e);
        }
    }

    // Cache the failure result
    let _ = WSL_ROOT_PATH_CACHE.set(None);
    None
}

/// Convert WSL path to Windows UNC path for PowerShell
async fn wsl_to_windows_path(wsl_path: &std::path::Path) -> Option<String> {
    let path_str = wsl_path.to_string_lossy();

    // Relative paths work fine as-is in PowerShell
    if !path_str.starts_with('/') {
        tracing::debug!("Using relative path as-is: {}", path_str);
        return Some(path_str.to_string());
    }

    // Get cached WSL root path from PowerShell
    if let Some(wsl_root) = get_wsl_root_path().await {
        // Simply concatenate WSL root with the absolute path - PowerShell doesn't mind /
        let windows_path = format!("{}{}", wsl_root, path_str);
        tracing::debug!("WSL path converted: {} -> {}", path_str, windows_path);
        Some(windows_path)
    } else {
        tracing::error!(
            "Failed to determine WSL root path for conversion: {}",
            path_str
        );
        None
    }
}

/// Play a system sound notification
async fn play_sound_notification(sound_file: &crate::models::config::SoundFile) {
    let file_path = match sound_file.get_path().await {
        Ok(path) => path,
        Err(e) => {
            tracing::error!("Failed to create cached sound file: {}", e);
            return;
        }
    };

    // Use platform-specific sound notification
    // Note: spawn() calls are intentionally not awaited - sound notifications should be fire-and-forget
    if cfg!(target_os = "macos") {
        let _ = tokio::process::Command::new("afplay")
            .arg(&file_path)
            .spawn();
    } else if cfg!(target_os = "linux") && !crate::utils::is_wsl2() {
        // Try different Linux audio players
        if tokio::process::Command::new("paplay")
            .arg(&file_path)
            .spawn()
            .is_ok()
        {
            // Success with paplay
        } else if tokio::process::Command::new("aplay")
            .arg(&file_path)
            .spawn()
            .is_ok()
        {
            // Success with aplay
        } else {
            // Try system bell as fallback
            let _ = tokio::process::Command::new("echo")
                .arg("-e")
                .arg("\\a")
                .spawn();
        }
    } else if cfg!(target_os = "windows") || (cfg!(target_os = "linux") && crate::utils::is_wsl2())
    {
        // Convert WSL path to Windows path if in WSL2
        let file_path = if crate::utils::is_wsl2() {
            if let Some(windows_path) = wsl_to_windows_path(&file_path).await {
                windows_path
            } else {
                file_path.to_string_lossy().to_string()
            }
        } else {
            file_path.to_string_lossy().to_string()
        };

        let _ = tokio::process::Command::new("powershell.exe")
            .arg("-c")
            .arg(format!(
                r#"(New-Object Media.SoundPlayer "{}").PlaySync()"#,
                file_path
            ))
            .spawn();
    }
}

/// Send a cross-platform push notification
async fn send_push_notification(title: &str, message: &str) {
    if cfg!(target_os = "macos") {
        let script = format!(
            r#"display notification "{message}" with title "{title}" sound name "Glass""#,
            message = message.replace('"', r#"\""#),
            title = title.replace('"', r#"\""#)
        );

        let _ = tokio::process::Command::new("osascript")
            .arg("-e")
            .arg(script)
            .spawn();
    } else if cfg!(target_os = "linux") && !crate::utils::is_wsl2() {
        // Linux: Use notify-rust crate - fire and forget
        use notify_rust::Notification;

        let title = title.to_string();
        let message = message.to_string();

        let _handle = tokio::task::spawn_blocking(move || {
            if let Err(e) = Notification::new()
                .summary(&title)
                .body(&message)
                .timeout(10000)
                .show()
            {
                tracing::error!("Failed to send Linux notification: {}", e);
            }
        });
        drop(_handle); // Don't await, fire-and-forget
    } else if cfg!(target_os = "windows") || (cfg!(target_os = "linux") && crate::utils::is_wsl2())
    {
        // Windows and WSL2: Use PowerShell toast notification script
        let script_path = match crate::utils::get_powershell_script().await {
            Ok(path) => path,
            Err(e) => {
                tracing::error!("Failed to get PowerShell script: {}", e);
                return;
            }
        };

        // Convert WSL path to Windows path if in WSL2
        let script_path_str = if crate::utils::is_wsl2() {
            if let Some(windows_path) = wsl_to_windows_path(&script_path).await {
                windows_path
            } else {
                script_path.to_string_lossy().to_string()
            }
        } else {
            script_path.to_string_lossy().to_string()
        };

        let _ = tokio::process::Command::new("powershell.exe")
            .arg("-NoProfile")
            .arg("-ExecutionPolicy")
            .arg("Bypass")
            .arg("-File")
            .arg(script_path_str)
            .arg("-Title")
            .arg(title)
            .arg("-Message")
            .arg(message)
            .spawn();
    }
}

pub async fn execution_monitor(app_state: AppState) {
    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(5));
    let mut cleanup_interval = tokio::time::interval(tokio::time::Duration::from_secs(1800)); // 30 minutes

    loop {
        tokio::select! {
            _ = interval.tick() => {
                // Check for completed processes FIRST to avoid race conditions
                let completed_executions = app_state.get_running_executions_for_monitor().await;

                // Handle completed executions
                for (execution_process_id, task_attempt_id, success, exit_code) in completed_executions {
                    let status_text = if success {
                        "completed successfully"
                    } else {
                        "failed"
                    };
                    let exit_text = if let Some(code) = exit_code {
                        format!(" with exit code {}", code)
                    } else {
                        String::new()
                    };

                    tracing::info!(
                        "Execution {} {}{}",
                        execution_process_id,
                        status_text,
                        exit_text
                    );

                    // Update the execution process record
                    let execution_status = if success {
                        ExecutionProcessStatus::Completed
                    } else {
                        ExecutionProcessStatus::Failed
                    };

                    if let Err(e) = ExecutionProcess::update_completion(
                        &app_state.db_pool,
                        execution_process_id,
                        execution_status,
                        exit_code,
                    )
                    .await
                    {
                        tracing::error!(
                            "Failed to update execution process {} completion: {}",
                            execution_process_id,
                            e
                        );
                    }

                    // Get the execution process to determine next steps
                    if let Ok(Some(execution_process)) =
                        ExecutionProcess::find_by_id(&app_state.db_pool, execution_process_id).await
                    {
                        match execution_process.process_type {
                            ExecutionProcessType::SetupScript => {
                                handle_setup_completion(
                                    &app_state,
                                    task_attempt_id,
                                    execution_process_id,
                                    execution_process,
                                    success,
                                    exit_code,
                                )
                                .await;
                            }
                            ExecutionProcessType::CodingAgent => {
                                handle_coding_agent_completion(
                                    &app_state,
                                    task_attempt_id,
                                    execution_process_id,
                                    execution_process,
                                    success,
                                    exit_code,
                                )
                                .await;
                            }
                            ExecutionProcessType::DevServer => {
                                handle_dev_server_completion(
                                    &app_state,
                                    task_attempt_id,
                                    execution_process_id,
                                    execution_process,
                                    success,
                                    exit_code,
                                )
                                .await;
                            }
                        }
                    } else {
                        tracing::error!(
                            "Failed to find execution process {} for completion handling",
                            execution_process_id
                        );
                    }
                }

                // Check for orphaned execution processes AFTER handling completions
                // Add a small delay to ensure completed processes are properly handled first
                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

                let running_processes = match ExecutionProcess::find_running(&app_state.db_pool).await {
                    Ok(processes) => processes,
                    Err(e) => {
                        tracing::error!("Failed to query running execution processes: {}", e);
                        continue;
                    }
                };

                for process in running_processes {
                    // Check if this process is not actually running in the app state
                    if !app_state.has_running_execution(process.task_attempt_id).await {
                        // Additional check: if the process was recently updated, skip it to prevent race conditions
                        let now = chrono::Utc::now();
                        let time_since_update = now - process.updated_at;
                        if time_since_update.num_seconds() < 10 {
                            // Process was updated within last 10 seconds, likely just completed
                            tracing::debug!(
                                "Skipping recently updated orphaned process {} (updated {} seconds ago)",
                                process.id,
                                time_since_update.num_seconds()
                            );
                            continue;
                        }

                        // This is truly an orphaned execution process - mark it as failed
                        tracing::info!(
                            "Found orphaned execution process {} for task attempt {}",
                            process.id,
                            process.task_attempt_id
                        );
                        // This is truly an orphaned execution process - mark it as failed
                        tracing::info!(
                            "Found orphaned execution process {} for task attempt {}",
                            process.id,
                            process.task_attempt_id
                        );

                        // Update the execution process status first
                        if let Err(e) = ExecutionProcess::update_completion(
                            &app_state.db_pool,
                            process.id,
                            ExecutionProcessStatus::Failed,
                            None, // No exit code for orphaned processes
                        )
                        .await
                        {
                            tracing::error!(
                                "Failed to update orphaned execution process {} status: {}",
                                process.id,
                                e
                            );
                            continue;
                        }

                        // Create task attempt activity for non-dev server processes
                        if process.process_type != ExecutionProcessType::DevServer {
                            let activity_id = Uuid::new_v4();
                            let create_activity = CreateTaskAttemptActivity {
                                execution_process_id: process.id,
                                status: Some(TaskAttemptStatus::ExecutorFailed),
                                note: Some("Execution lost (server restart or crash)".to_string()),
                            };

                            if let Err(e) = TaskAttemptActivity::create(
                                &app_state.db_pool,
                                &create_activity,
                                activity_id,
                                TaskAttemptStatus::ExecutorFailed,
                            )
                            .await
                            {
                                tracing::error!(
                                    "Failed to create failed activity for orphaned process: {}",
                                    e
                                );
                                continue;
                            }
                        }

                        tracing::info!("Marked orphaned execution process {} as failed", process.id);

                        // Update task status to InReview for coding agent and setup script failures
                        if matches!(
                            process.process_type,
                            ExecutionProcessType::CodingAgent | ExecutionProcessType::SetupScript
                        ) {
                            if let Ok(Some(task_attempt)) =
                                TaskAttempt::find_by_id(&app_state.db_pool, process.task_attempt_id).await
                            {
                                if let Ok(Some(task)) =
                                    Task::find_by_id(&app_state.db_pool, task_attempt.task_id).await
                                {
                                    if let Err(e) = Task::update_status(
                                        &app_state.db_pool,
                                        task.id,
                                        task.project_id,
                                        TaskStatus::InReview,
                                    )
                                    .await
                                    {
                                        tracing::error!("Failed to update task status to InReview for orphaned attempt: {}", e);
                                    }
                                }
                            }
                        }
                    }
                }
            }
            _ = cleanup_interval.tick() => {
                tracing::info!("Starting periodic worktree cleanup...");

                // First, defensively check for externally deleted worktrees
                check_externally_deleted_worktrees(&app_state.db_pool).await;

                // Then, find and delete orphaned worktrees that don't belong to any task
                cleanup_orphaned_worktrees(&app_state.db_pool).await;

                // Then, proceed with normal expired worktree cleanup
                match TaskAttempt::find_expired_for_cleanup(&app_state.db_pool).await {
                    Ok(expired_attempts) => {
                        if expired_attempts.is_empty() {
                            tracing::debug!("No expired worktrees found");
                        } else {
                            tracing::info!("Found {} expired worktrees to clean up", expired_attempts.len());
                            for (attempt_id, worktree_path, git_repo_path) in expired_attempts {
                                if let Err(e) = delete_worktree(&worktree_path, &git_repo_path, attempt_id).await {
                                    tracing::error!("Failed to cleanup expired worktree {}: {}", attempt_id, e);
                                } else {
                                    // Mark worktree as deleted in database after successful cleanup
                                    if let Err(e) = crate::models::task_attempt::TaskAttempt::mark_worktree_deleted(&app_state.db_pool, attempt_id).await {
                                        tracing::error!("Failed to mark worktree as deleted in database for attempt {}: {}", attempt_id, e);
                                    } else {
                                        tracing::info!("Successfully marked worktree as deleted for attempt {}", attempt_id);
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        tracing::error!("Failed to query expired task attempts: {}", e);
                    }
                }
            }
        }
    }
}

/// Handle setup script completion
async fn handle_setup_completion(
    app_state: &AppState,
    task_attempt_id: Uuid,
    execution_process_id: Uuid,
    _execution_process: ExecutionProcess,
    success: bool,
    exit_code: Option<i64>,
) {
    let exit_text = if let Some(code) = exit_code {
        format!(" with exit code {}", code)
    } else {
        String::new()
    };

    if success {
        // Setup completed successfully, create activity
        let activity_id = Uuid::new_v4();
        let create_activity = CreateTaskAttemptActivity {
            execution_process_id,
            status: Some(TaskAttemptStatus::SetupComplete),
            note: Some(format!("Setup script completed successfully{}", exit_text)),
        };

        if let Err(e) = TaskAttemptActivity::create(
            &app_state.db_pool,
            &create_activity,
            activity_id,
            TaskAttemptStatus::SetupComplete,
        )
        .await
        {
            tracing::error!("Failed to create setup complete activity: {}", e);
            return;
        }

        // Get task and project info to start coding agent
        if let Ok(Some(task_attempt)) =
            TaskAttempt::find_by_id(&app_state.db_pool, task_attempt_id).await
        {
            if let Ok(Some(task)) = Task::find_by_id(&app_state.db_pool, task_attempt.task_id).await
            {
                // Start the coding agent
                if let Err(e) = TaskAttempt::start_coding_agent(
                    &app_state.db_pool,
                    app_state,
                    task_attempt_id,
                    task.id,
                    task.project_id,
                )
                .await
                {
                    tracing::error!("Failed to start coding agent after setup completion: {}", e);
                }
            }
        }
    } else {
        // Setup failed, create activity and update task status
        let activity_id = Uuid::new_v4();
        let create_activity = CreateTaskAttemptActivity {
            execution_process_id,
            status: Some(TaskAttemptStatus::SetupFailed),
            note: Some(format!("Setup script failed{}", exit_text)),
        };

        if let Err(e) = TaskAttemptActivity::create(
            &app_state.db_pool,
            &create_activity,
            activity_id,
            TaskAttemptStatus::SetupFailed,
        )
        .await
        {
            tracing::error!("Failed to create setup failed activity: {}", e);
        }

        // Update task status to InReview since setup failed
        if let Ok(Some(task_attempt)) =
            TaskAttempt::find_by_id(&app_state.db_pool, task_attempt_id).await
        {
            if let Ok(Some(task)) = Task::find_by_id(&app_state.db_pool, task_attempt.task_id).await
            {
                if let Err(e) = Task::update_status(
                    &app_state.db_pool,
                    task.id,
                    task.project_id,
                    TaskStatus::InReview,
                )
                .await
                {
                    tracing::error!(
                        "Failed to update task status to InReview after setup failure: {}",
                        e
                    );
                }
            }
        }
    }
}

/// Handle coding agent completion
async fn handle_coding_agent_completion(
    app_state: &AppState,
    task_attempt_id: Uuid,
    execution_process_id: Uuid,
    execution_process: ExecutionProcess,
    success: bool,
    exit_code: Option<i64>,
) {
    let exit_text = if let Some(code) = exit_code {
        format!(" with exit code {}", code)
    } else {
        String::new()
    };

    // Extract and store assistant message from execution logs
    let summary = if let Some(stdout) = &execution_process.stdout {
        if let Some(assistant_message) = crate::executor::parse_assistant_message_from_logs(stdout)
        {
            if let Err(e) = crate::models::executor_session::ExecutorSession::update_summary(
                &app_state.db_pool,
                execution_process_id,
                &assistant_message,
            )
            .await
            {
                tracing::error!(
                    "Failed to update summary for execution process {}: {}",
                    execution_process_id,
                    e
                );
                None
            } else {
                tracing::info!(
                    "Successfully stored summary for execution process {}",
                    execution_process_id
                );
                Some(assistant_message)
            }
        } else {
            None
        }
    } else {
        None
    };

    // Play sound notification if enabled
    if app_state.get_sound_alerts_enabled().await {
        let sound_file = app_state.get_sound_file().await;
        play_sound_notification(&sound_file).await;
    }

    // Send push notification if enabled
    if app_state.get_push_notifications_enabled().await {
        let notification_title = "Task Complete";
        let notification_message = if success {
            "Task execution completed successfully"
        } else {
            "Task execution failed"
        };
        send_push_notification(notification_title, notification_message).await;
    }

    // Get task attempt to access worktree path for committing changes
    if let Ok(Some(task_attempt)) =
        TaskAttempt::find_by_id(&app_state.db_pool, task_attempt_id).await
    {
        // Commit any unstaged changes after execution completion
        if let Err(e) = commit_execution_changes(
            &task_attempt.worktree_path,
            task_attempt_id,
            summary.as_deref(),
        )
        .await
        {
            tracing::error!(
                "Failed to commit execution changes for attempt {}: {}",
                task_attempt_id,
                e
            );
        } else {
            tracing::info!(
                "Successfully committed execution changes for attempt {}",
                task_attempt_id
            );
        }

        // Create task attempt activity with appropriate completion status
        let activity_id = Uuid::new_v4();
        let status = if success {
            TaskAttemptStatus::ExecutorComplete
        } else {
            TaskAttemptStatus::ExecutorFailed
        };
        let create_activity = CreateTaskAttemptActivity {
            execution_process_id,
            status: Some(status.clone()),
            note: Some(format!("Coding agent execution completed{}", exit_text)),
        };

        if let Err(e) =
            TaskAttemptActivity::create(&app_state.db_pool, &create_activity, activity_id, status)
                .await
        {
            tracing::error!("Failed to create executor completion activity: {}", e);
        } else {
            tracing::info!(
                "Task attempt {} set to paused after coding agent completion",
                task_attempt_id
            );

            // Get task to access task_id and project_id for status update
            if let Ok(Some(task)) = Task::find_by_id(&app_state.db_pool, task_attempt.task_id).await
            {
                app_state
                    .track_analytics_event(
                        "task_attempt_finished",
                        Some(serde_json::json!({
                            "task_id": task.id.to_string(),
                            "project_id": task.project_id.to_string(),
                            "attempt_id": task_attempt_id.to_string(),
                            "execution_success": success,
                            "exit_code": exit_code,
                        })),
                    )
                    .await;

                // Update task status to InReview
                if let Err(e) = Task::update_status(
                    &app_state.db_pool,
                    task.id,
                    task.project_id,
                    TaskStatus::InReview,
                )
                .await
                {
                    tracing::error!(
                        "Failed to update task status to InReview for completed attempt: {}",
                        e
                    );
                }
            }
        }
    } else {
        tracing::error!(
            "Failed to find task attempt {} for coding agent completion",
            task_attempt_id
        );
    }
}

/// Handle dev server completion (future functionality)
async fn handle_dev_server_completion(
    app_state: &AppState,
    task_attempt_id: Uuid,
    execution_process_id: Uuid,
    _execution_process: ExecutionProcess,
    success: bool,
    exit_code: Option<i64>,
) {
    let exit_text = if let Some(code) = exit_code {
        format!(" with exit code {}", code)
    } else {
        String::new()
    };

    tracing::info!(
        "Dev server for task attempt {} completed{}",
        task_attempt_id,
        exit_text
    );

    // Update execution process status instead of creating activity
    let process_status = if success {
        ExecutionProcessStatus::Completed
    } else {
        ExecutionProcessStatus::Failed
    };

    if let Err(e) = ExecutionProcess::update_completion(
        &app_state.db_pool,
        execution_process_id,
        process_status,
        exit_code,
    )
    .await
    {
        tracing::error!(
            "Failed to update dev server execution process status: {}",
            e
        );
    }
}
