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
};

/// Commit any unstaged changes in the worktree after execution completion
async fn commit_execution_changes(
    worktree_path: &str,
    attempt_id: Uuid,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Run git operations in a blocking task since git2 is synchronous
    let worktree_path = worktree_path.to_string();
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
        let commit_message = format!("Task attempt {} - Final changes", attempt_id);
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

/// Play a system sound notification
async fn play_sound_notification(sound_file: &crate::models::config::SoundFile) {
    // Use platform-specific sound notification
    if cfg!(target_os = "macos") {
        let sound_path = sound_file.to_path();
        let _ = tokio::process::Command::new("afplay")
            .arg(sound_path)
            .spawn();
    } else if cfg!(target_os = "linux") {
        // Try different Linux notification sounds
        let sound_path = sound_file.to_path();
        if let Ok(_) = tokio::process::Command::new("paplay")
            .arg(&sound_path)
            .spawn()
        {
            // Success with paplay
        } else if let Ok(_) = tokio::process::Command::new("aplay")
            .arg(&sound_path)
            .spawn()
        {
            // Success with aplay
        } else {
            // Try system bell as fallback
            let _ = tokio::process::Command::new("echo")
                .arg("-e")
                .arg("\\a")
                .spawn();
        }
    } else if cfg!(target_os = "windows") {
        let _ = tokio::process::Command::new("powershell")
            .arg("-c")
            .arg("[console]::beep(800, 300)")
            .spawn();
    }
}

/// Send a macOS push notification
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
    }
}

pub async fn execution_monitor(app_state: AppState) {
    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(5));

    loop {
        interval.tick().await;

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
            // Additional check: if the process was recently updated, skip it
            // This prevents race conditions with recent completions
            let now = chrono::Utc::now();
            let time_since_update = now - process.updated_at;
            if time_since_update.num_seconds() < 10 {
                // Process was updated within last 10 seconds, likely just completed
                tracing::debug!(
                    "Skipping recently updated process {} (updated {} seconds ago)",
                    process.id,
                    time_since_update.num_seconds()
                );
                continue;
            }

            // Check if this process is not actually running in the app state
            if !app_state
                .has_running_execution(process.task_attempt_id)
                .await
            {
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
    _execution_process: ExecutionProcess,
    success: bool,
    exit_code: Option<i64>,
) {
    let exit_text = if let Some(code) = exit_code {
        format!(" with exit code {}", code)
    } else {
        String::new()
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
        if let Err(e) = commit_execution_changes(&task_attempt.worktree_path, task_attempt_id).await
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
