//! Follow-up execution handlers with retry logic.

use std::time::Duration;

use axum::{Extension, Json, extract::State, response::Json as ResponseJson};
use db::models::{
    draft::{Draft, DraftType},
    execution_process::{ExecutionProcess, ExecutionProcessRunReason},
    task::Task,
    task_attempt::{TaskAttempt, TaskAttemptError},
    task_variable::TaskVariable,
};
use deployment::Deployment;
use executors::{
    actions::{
        ExecutorAction, ExecutorActionType, coding_agent_follow_up::CodingAgentFollowUpRequest,
    },
    profile::{ExecutorConfigs, ExecutorProfileId},
};
use services::services::{
    container::ContainerService, git::WorktreeResetOptions, variable_expander,
};
use sqlx::Error as SqlxError;
use utils::response::ApiResponse;

use crate::routes::task_attempts::types::CreateFollowUpAttempt;
use crate::routes::task_attempts::util::{ensure_worktree_path, handle_images_for_prompt};
use crate::{
    DeploymentImpl, error::ApiError, middleware::RemoteTaskAttemptContext,
    proxy::check_remote_task_attempt_proxy,
};

/// Starts a follow-up CodingAgent execution for a task attempt, handling remote proxying, worktree preparation, retry/reset logic, prompt image handling, task-variable expansion, session selection, and execution start.
///
/// This function will:
/// - Proxy the request to a remote node when the task attempt is remote.
/// - Ensure the task attempt worktree exists (recreate for cold starts).
/// - Resolve the executor profile and project, and auto-unarchive the task if needed.
/// - For retry requests, validate the target process, optionally reset the worktree to a prior commit (best-effort with timeout), stop running processes, and drop later processes.
/// - Determine the session to use (respecting executor profile `no_context`), process images referenced by the prompt, expand task and system variables in the prompt, and choose the appropriate follow-up vs initial CodingAgent action.
/// - Start execution via the container and clear relevant drafts.
///
/// # Returns
///
/// An `ApiResponse` containing the started `ExecutionProcess` on success.
///
/// # Examples
///
/// ```
/// // Example (illustrative; types and setup omitted):
/// // let resp = follow_up(task_attempt_ext, remote_ctx_opt, State(deployment), Json(payload)).await?;
/// // assert!(resp.is_success());
/// ```
pub async fn follow_up(
    Extension(task_attempt): Extension<TaskAttempt>,
    remote_ctx: Option<Extension<RemoteTaskAttemptContext>>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateFollowUpAttempt>,
) -> Result<ResponseJson<ApiResponse<ExecutionProcess>>, ApiError> {
    // Check if this is a remote task attempt that should be proxied
    if let Some(proxy_info) = check_remote_task_attempt_proxy(remote_ctx.as_ref().map(|e| &e.0))? {
        tracing::debug!(
            node_id = %proxy_info.node_id,
            shared_task_id = %proxy_info.target_id,
            "Proxying follow_up to remote node"
        );

        let path = format!(
            "/task-attempts/by-task-id/{}/follow-up",
            proxy_info.target_id
        );
        let response: ApiResponse<ExecutionProcess> = deployment
            .node_proxy_client()
            .proxy_post(&proxy_info.node_url, &path, &payload, proxy_info.node_id)
            .await?;

        return Ok(ResponseJson(response));
    }

    tracing::info!("{:?}", task_attempt);

    // Ensure worktree exists (recreate if needed for cold task support)
    let _ = ensure_worktree_path(&deployment, &task_attempt).await?;

    // Get executor profile data from the latest CodingAgent process
    let initial_executor_profile_id = ExecutionProcess::latest_executor_profile_for_attempt(
        &deployment.db().pool,
        task_attempt.id,
    )
    .await?;

    let executor_profile_id = ExecutorProfileId {
        executor: initial_executor_profile_id.executor,
        variant: payload.variant,
    };

    // Get parent task
    let task = task_attempt
        .parent_task(&deployment.db().pool)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    // Auto-unarchive the task when user continues execution with input
    let pool = &deployment.db().pool;
    if Task::unarchive_if_archived(pool, task.id).await? {
        tracing::info!(
            task_id = %task.id,
            "Auto-unarchived task due to follow-up execution"
        );

        // Sync unarchive to Hive if task is shared
        if task.shared_task_id.is_some()
            && let Ok(publisher) = deployment.share_publisher()
            && let Some(updated_task) = Task::find_by_id(pool, task.id).await?
        {
            let publisher = publisher.clone();
            tokio::spawn(async move {
                if let Err(e) = publisher.update_shared_task(&updated_task).await {
                    tracing::warn!(?e, "failed to sync task unarchive to Hive");
                }
            });
        }
    }

    // Get parent project
    let project = task
        .parent_project(pool)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    // Check if the selected executor profile has no_context enabled (needed before retry logic)
    let executor_configs = ExecutorConfigs::get_cached();
    let coding_agent = executor_configs.get_coding_agent_or_default(&executor_profile_id);
    let skip_context = coding_agent.no_context();

    // Check if model changed (would cause context loss)
    let model_changed = {
        let previous_agent =
            executor_configs.get_coding_agent_or_default(&initial_executor_profile_id);
        let current_agent = coding_agent;
        let previous_model = previous_agent.model();
        let current_model = current_agent.model();
        previous_model != current_model
    };

    if model_changed {
        tracing::info!(
            task_attempt_id = %task_attempt.id,
            previous_variant = ?initial_executor_profile_id.variant,
            current_variant = ?executor_profile_id.variant,
            "Model changed between sessions, starting fresh to avoid context incompatibility"
        );
    }

    // For retries, get session ID BEFORE dropping processes to preserve context
    let pre_retry_session_id = if let Some(proc_id) = payload.retry_process_id {
        if !skip_context {
            ExecutionProcess::find_session_id_before_process(
                &deployment.db().pool,
                task_attempt.id,
                proc_id,
            )
            .await?
        } else {
            None
        }
    } else {
        None
    };

    // If retry settings provided, perform replace-logic before proceeding
    if let Some(proc_id) = payload.retry_process_id {
        let pool = &deployment.db().pool;
        // Validate process belongs to attempt
        let process =
            ExecutionProcess::find_by_id(pool, proc_id)
                .await?
                .ok_or(ApiError::TaskAttempt(TaskAttemptError::ValidationError(
                    "Process not found".to_string(),
                )))?;
        if process.task_attempt_id != task_attempt.id {
            return Err(ApiError::TaskAttempt(TaskAttemptError::ValidationError(
                "Process does not belong to this attempt".to_string(),
            )));
        }

        // Determine target reset OID: before the target process
        let mut target_before_oid = process.before_head_commit.clone();
        if target_before_oid.is_none() {
            target_before_oid =
                ExecutionProcess::find_prev_after_head_commit(pool, task_attempt.id, proc_id)
                    .await?;
        }

        // Decide if Git reset is needed and apply it (best-effort)
        let force_when_dirty = payload.force_when_dirty.unwrap_or(false);
        let perform_git_reset = payload.perform_git_reset.unwrap_or(true);
        if let Some(target_oid) = &target_before_oid {
            let wt_buf = ensure_worktree_path(&deployment, &task_attempt).await?;
            let wt = wt_buf.as_path();
            let is_dirty = deployment
                .container()
                .is_container_clean(&task_attempt)
                .await
                .map(|is_clean| !is_clean)
                .unwrap_or(false);

            // Wrap git operation in timeout + spawn_blocking to prevent hangs
            const GIT_OP_TIMEOUT: Duration = Duration::from_secs(30);
            let git_service = deployment.git().clone();
            let wt_owned = wt.to_path_buf();
            let target_oid_owned = target_oid.clone();
            let opts = WorktreeResetOptions::new(
                perform_git_reset,
                force_when_dirty,
                is_dirty,
                perform_git_reset,
            );

            let git_result = tokio::time::timeout(
                GIT_OP_TIMEOUT,
                tokio::task::spawn_blocking(move || {
                    git_service.reconcile_worktree_to_commit(&wt_owned, &target_oid_owned, opts);
                }),
            )
            .await;

            match git_result {
                Ok(Ok(())) => {
                    // Git operation completed successfully
                }
                Ok(Err(join_err)) => {
                    tracing::warn!(
                        task_attempt_id = %task_attempt.id,
                        error = %join_err,
                        "git reconcile_worktree_to_commit task panicked"
                    );
                }
                Err(_) => {
                    tracing::warn!(
                        task_attempt_id = %task_attempt.id,
                        timeout_secs = GIT_OP_TIMEOUT.as_secs(),
                        "git reconcile_worktree_to_commit timed out - proceeding anyway"
                    );
                }
            }
        }

        // Stop any running processes for this attempt
        deployment.container().try_stop(&task_attempt).await;

        // Soft-drop the target process and all later processes
        let _ = ExecutionProcess::drop_at_and_after(pool, task_attempt.id, proc_id).await?;

        // Best-effort: clear any retry draft for this attempt
        let _ = Draft::clear_after_send(pool, task_attempt.id, DraftType::Retry).await;
    }

    // Determine session ID to use:
    // 1. If skip_context is enabled, start fresh (None)
    // 2. If model changed, start fresh (None) to avoid context incompatibility
    // 3. If we have a pre_retry_session_id from before dropping, use it
    // 4. Otherwise, find the latest session ID from remaining processes
    let latest_session_id = if skip_context || model_changed {
        None
    } else if let Some(session_id) = pre_retry_session_id {
        Some(session_id)
    } else {
        ExecutionProcess::find_latest_session_id_by_task_attempt(
            &deployment.db().pool,
            task_attempt.id,
        )
        .await?
    };

    let mut prompt = payload.prompt;
    if let Some(image_ids) = &payload.image_ids {
        prompt = handle_images_for_prompt(&deployment, &task_attempt, task.id, image_ids, &prompt)
            .await?;
    }

    // Expand task variables ($VAR and ${VAR} syntax) in follow-up prompt
    let prompt = {
        let variables = TaskVariable::get_variable_map_with_system(&deployment.db().pool, task.id)
            .await
            .unwrap_or_else(|e| {
                tracing::warn!(task_id = %task.id, error = ?e, "Failed to fetch task variables for follow-up");
                std::collections::HashMap::new()
            });

        if variables.is_empty() {
            prompt
        } else {
            let variables: std::collections::HashMap<String, (String, Option<uuid::Uuid>)> =
                variables
                    .into_iter()
                    .map(|(k, (v, id))| (k, (v, Some(id))))
                    .collect();

            let result = variable_expander::expand_variables(&prompt, &variables);

            if !result.undefined_vars.is_empty() {
                tracing::warn!(
                    task_id = %task.id,
                    undefined_vars = ?result.undefined_vars,
                    "Follow-up prompt contains undefined variables"
                );
            }

            if !result.expanded_vars.is_empty() {
                tracing::info!(
                    task_id = %task.id,
                    expanded_count = result.expanded_vars.len(),
                    "Expanded task variables in follow-up prompt"
                );
            }

            result.text
        }
    };

    let cleanup_action = deployment
        .container()
        .cleanup_action(project.cleanup_script);

    let action_type = if let Some(session_id) = latest_session_id {
        ExecutorActionType::CodingAgentFollowUpRequest(CodingAgentFollowUpRequest {
            prompt: prompt.clone(),
            session_id,
            executor_profile_id: executor_profile_id.clone(),
        })
    } else {
        ExecutorActionType::CodingAgentInitialRequest(
            executors::actions::coding_agent_initial::CodingAgentInitialRequest {
                prompt,
                executor_profile_id: executor_profile_id.clone(),
            },
        )
    };

    let action = ExecutorAction::new(action_type, cleanup_action);

    let execution_process = deployment
        .container()
        .start_execution(
            &task_attempt,
            &action,
            &ExecutionProcessRunReason::CodingAgent,
        )
        .await?;

    // Clear drafts post-send:
    // - If this was a retry send, the retry draft has already been cleared above.
    // - Otherwise, clear the follow-up draft to avoid.
    if payload.retry_process_id.is_none() {
        let _ =
            Draft::clear_after_send(&deployment.db().pool, task_attempt.id, DraftType::FollowUp)
                .await;
    }

    Ok(ResponseJson(ApiResponse::success(execution_process)))
}
