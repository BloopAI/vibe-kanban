use std::path::PathBuf;

use axum::{
    BoxError, Extension, Json, Router,
    extract::{Query, State},
    http::StatusCode,
    middleware::from_fn_with_state,
    response::{
        Json as ResponseJson, Sse,
        sse::{Event, KeepAlive},
    },
    routing::{get, post},
};
use db::models::{
    execution_process::{ExecutionProcess, ExecutionProcessRunReason},
    follow_up_draft::FollowUpDraft,
    image::TaskImage,
    merge::{Merge, MergeStatus, PrMerge, PullRequestInfo},
    project::{Project, ProjectError},
    task::{Task, TaskRelationships, TaskStatus},
    task_attempt::{CreateTaskAttempt, TaskAttempt, TaskAttemptError},
};
use deployment::Deployment;
use executors::{
    actions::{
        ExecutorAction, ExecutorActionType,
        coding_agent_follow_up::CodingAgentFollowUpRequest,
        script::{ScriptContext, ScriptRequest, ScriptRequestLanguage},
    },
    profile::ExecutorProfileId,
};
use futures_util::TryStreamExt;
use git2::BranchType;
use serde::{Deserialize, Serialize};
use services::services::{
    container::ContainerService,
    git::ConflictOp,
    github_service::{CreatePrRequest, GitHubService, GitHubServiceError},
    image::ImageService,
};
use sqlx::Error as SqlxError;
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError, middleware::load_task_attempt_middleware};

#[derive(Debug, Deserialize, Serialize, TS)]
pub struct RebaseTaskAttemptRequest {
    pub new_base_branch: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(tag = "type", rename_all = "snake_case")]
pub enum GitOperationError {
    MergeConflicts { message: String, op: ConflictOp },
    RebaseInProgress,
}

#[derive(Debug, Deserialize, Serialize, TS)]
pub struct ReplaceProcessRequest {
    /// Process to replace (delete this and later ones)
    pub process_id: Uuid,
    /// New prompt to use for the replacement follow-up
    pub prompt: String,
    /// Optional variant override
    pub variant: Option<String>,
    /// If true, allow resetting Git even when uncommitted changes exist
    pub force_when_dirty: Option<bool>,
    /// If false, skip performing the Git reset step (history drop still applies)
    pub perform_git_reset: Option<bool>,
}

#[derive(Debug, Serialize, TS)]
pub struct ReplaceProcessResult {
    pub deleted_count: i64,
    pub git_reset_needed: bool,
    pub git_reset_applied: bool,
    pub target_before_oid: Option<String>,
    pub new_execution_id: Option<Uuid>,
}

#[derive(Debug, Deserialize, Serialize, TS)]
pub struct CreateGitHubPrRequest {
    pub title: String,
    pub body: Option<String>,
    pub base_branch: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct FollowUpResponse {
    pub message: String,
    pub actual_attempt_id: Uuid,
    pub created_new_attempt: bool,
}

#[derive(Debug, Deserialize)]
pub struct TaskAttemptQuery {
    pub task_id: Option<Uuid>,
}

pub async fn get_task_attempts(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<TaskAttemptQuery>,
) -> Result<ResponseJson<ApiResponse<Vec<TaskAttempt>>>, ApiError> {
    let pool = &deployment.db().pool;
    let attempts = TaskAttempt::fetch_all(pool, query.task_id).await?;
    Ok(ResponseJson(ApiResponse::success(attempts)))
}

pub async fn get_task_attempt(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(_deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<TaskAttempt>>, ApiError> {
    Ok(ResponseJson(ApiResponse::success(task_attempt)))
}

#[derive(Debug, Deserialize, ts_rs::TS)]
pub struct CreateTaskAttemptBody {
    pub task_id: Uuid,
    /// Executor profile specification
    pub executor_profile_id: ExecutorProfileId,
    pub base_branch: String,
}

impl CreateTaskAttemptBody {
    /// Get the executor profile ID
    pub fn get_executor_profile_id(&self) -> ExecutorProfileId {
        self.executor_profile_id.clone()
    }
}

#[axum::debug_handler]
pub async fn create_task_attempt(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateTaskAttemptBody>,
) -> Result<ResponseJson<ApiResponse<TaskAttempt>>, ApiError> {
    let executor_profile_id = payload.get_executor_profile_id();

    let task_attempt = TaskAttempt::create(
        &deployment.db().pool,
        &CreateTaskAttempt {
            executor: executor_profile_id.executor,
            base_branch: payload.base_branch.clone(),
        },
        payload.task_id,
    )
    .await?;

    let execution_process = deployment
        .container()
        .start_attempt(&task_attempt, executor_profile_id.clone())
        .await?;

    deployment
        .track_if_analytics_allowed(
            "task_attempt_started",
            serde_json::json!({
                "task_id": task_attempt.task_id.to_string(),
                "variant": &executor_profile_id.variant,
                "executor": &executor_profile_id.executor,
                "attempt_id": task_attempt.id.to_string(),
            }),
        )
        .await;

    tracing::info!("Started execution process {}", execution_process.id);

    Ok(ResponseJson(ApiResponse::success(task_attempt)))
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateFollowUpAttempt {
    pub prompt: String,
    pub variant: Option<String>,
    pub image_ids: Option<Vec<Uuid>>,
}

pub async fn follow_up(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateFollowUpAttempt>,
) -> Result<ResponseJson<ApiResponse<ExecutionProcess>>, ApiError> {
    tracing::info!("{:?}", task_attempt);

    // Ensure worktree exists (recreate if needed for cold task support)
    deployment
        .container()
        .ensure_container_exists(&task_attempt)
        .await?;

    // Get latest session id (ignoring dropped)
    let session_id = ExecutionProcess::find_latest_session_id_by_task_attempt(
        &deployment.db().pool,
        task_attempt.id,
    )
    .await?
    .ok_or(ApiError::TaskAttempt(TaskAttemptError::ValidationError(
        "Couldn't find a prior session_id, please create a new task attempt".to_string(),
    )))?;

    // Get ExecutionProcess for profile data
    let latest_execution_process = ExecutionProcess::find_latest_by_task_attempt_and_run_reason(
        &deployment.db().pool,
        task_attempt.id,
        &ExecutionProcessRunReason::CodingAgent,
    )
    .await?
    .ok_or(ApiError::TaskAttempt(TaskAttemptError::ValidationError(
        "Couldn't find initial coding agent process, has it run yet?".to_string(),
    )))?;
    let initial_executor_profile_id = match &latest_execution_process
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

    let executor_profile_id = ExecutorProfileId {
        executor: initial_executor_profile_id.executor,
        variant: payload.variant,
    };

    // Get parent task
    let task = task_attempt
        .parent_task(&deployment.db().pool)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    // Get parent project
    let project = task
        .parent_project(&deployment.db().pool)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    let mut prompt = payload.prompt;
    if let Some(image_ids) = &payload.image_ids {
        TaskImage::associate_many_dedup(&deployment.db().pool, task.id, image_ids).await?;

        // Copy new images from the image cache to the worktree
        if let Some(container_ref) = &task_attempt.container_ref {
            let worktree_path = std::path::PathBuf::from(container_ref);
            deployment
                .image()
                .copy_images_by_ids_to_worktree(&worktree_path, image_ids)
                .await?;

            // Update image paths in prompt with full worktree path
            prompt = ImageService::canonicalise_image_paths(&prompt, &worktree_path);
        }
    }

    let cleanup_action = project.cleanup_script.map(|script| {
        Box::new(ExecutorAction::new(
            ExecutorActionType::ScriptRequest(ScriptRequest {
                script,
                language: ScriptRequestLanguage::Bash,
                context: ScriptContext::CleanupScript,
            }),
            None,
        ))
    });

    let follow_up_request = CodingAgentFollowUpRequest {
        prompt,
        session_id,
        executor_profile_id,
    };

    let follow_up_action = ExecutorAction::new(
        ExecutorActionType::CodingAgentFollowUpRequest(follow_up_request),
        cleanup_action,
    );

    let execution_process = deployment
        .container()
        .start_execution(
            &task_attempt,
            &follow_up_action,
            &ExecutionProcessRunReason::CodingAgent,
        )
        .await?;

    // Clear any persisted follow-up draft for this attempt to avoid stale UI after manual send
    let _ = FollowUpDraft::clear_after_send(&deployment.db().pool, task_attempt.id).await;

    Ok(ResponseJson(ApiResponse::success(execution_process)))
}

// Follow-up draft APIs and queueing
#[derive(Debug, Serialize, TS)]
pub struct FollowUpDraftResponse {
    pub task_attempt_id: Uuid,
    pub prompt: String,
    pub queued: bool,
    pub variant: Option<String>,
    pub image_ids: Option<Vec<Uuid>>, // attachments
    pub version: i64,
}

#[derive(Debug, Deserialize, TS)]
pub struct UpdateFollowUpDraftRequest {
    pub prompt: Option<String>,
    // Present with null explicitly clears variant; absent leaves unchanged
    pub variant: Option<Option<String>>,
    pub image_ids: Option<Vec<Uuid>>, // send empty array to clear; omit to leave unchanged
    pub version: Option<i64>,         // optimistic concurrency
}

#[derive(Debug, Deserialize, TS)]
pub struct SetQueueRequest {
    pub queued: bool,
    pub expected_queued: Option<bool>,
    pub expected_version: Option<i64>,
}

async fn has_running_processes_for_attempt(
    pool: &sqlx::SqlitePool,
    attempt_id: Uuid,
) -> Result<bool, ApiError> {
    let processes = ExecutionProcess::find_by_task_attempt_id(pool, attempt_id).await?;
    Ok(processes.into_iter().any(|p| {
        matches!(
            p.status,
            db::models::execution_process::ExecutionProcessStatus::Running
        )
    }))
}

#[axum::debug_handler]
pub async fn get_follow_up_draft(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<FollowUpDraftResponse>>, ApiError> {
    let pool = &deployment.db().pool;
    let draft = FollowUpDraft::find_by_task_attempt_id(pool, task_attempt.id)
        .await?
        .map(|d| FollowUpDraftResponse {
            task_attempt_id: d.task_attempt_id,
            prompt: d.prompt,
            queued: d.queued,
            variant: d.variant,
            image_ids: d.image_ids,
            version: d.version,
        })
        .unwrap_or(FollowUpDraftResponse {
            task_attempt_id: task_attempt.id,
            prompt: "".to_string(),
            queued: false,
            variant: None,
            image_ids: None,
            version: 0,
        });
    Ok(ResponseJson(ApiResponse::success(draft)))
}

#[axum::debug_handler]
pub async fn save_follow_up_draft(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<UpdateFollowUpDraftRequest>,
) -> Result<ResponseJson<ApiResponse<FollowUpDraftResponse>>, ApiError> {
    let pool = &deployment.db().pool;

    // Enforce: cannot edit while queued
    let d = match FollowUpDraft::find_by_task_attempt_id(pool, task_attempt.id).await? {
        Some(d) => d,
        None => {
            // Create empty draft implicitly
            let id = uuid::Uuid::new_v4();
            sqlx::query(
                r#"INSERT INTO follow_up_drafts (id, task_attempt_id, prompt, queued, sending)
                   VALUES (?, ?, '', 0, 0)"#,
            )
            .bind(id)
            .bind(task_attempt.id)
            .execute(pool)
            .await?;
            FollowUpDraft::find_by_task_attempt_id(pool, task_attempt.id)
                .await?
                .ok_or(SqlxError::RowNotFound)?
        }
    };
    if d.queued {
        return Err(ApiError::Conflict(
            "Draft is queued; click Edit to unqueue before editing".to_string(),
        ));
    }

    // Optimistic concurrency check
    if let Some(expected_version) = payload.version
        && d.version != expected_version
    {
        return Err(ApiError::Conflict(
            "Draft changed, please retry with latest".to_string(),
        ));
    }

    if payload.prompt.is_none() && payload.variant.is_none() && payload.image_ids.is_none() {
        // nothing to change; return current
    } else {
        // Build a conservative UPDATE using positional binds to avoid SQL builder quirks
        let mut set_clauses: Vec<&str> = Vec::new();
        let mut has_variant_null = false;
        if payload.prompt.is_some() {
            set_clauses.push("prompt = ?");
        }
        if let Some(variant_opt) = &payload.variant {
            match variant_opt {
                Some(_) => set_clauses.push("variant = ?"),
                None => {
                    has_variant_null = true;
                    set_clauses.push("variant = NULL");
                }
            }
        }
        if payload.image_ids.is_some() {
            set_clauses.push("image_ids = ?");
        }
        // Always bump metadata when something changes
        set_clauses.push("updated_at = CURRENT_TIMESTAMP");
        set_clauses.push("version = version + 1");

        let mut sql = String::from("UPDATE follow_up_drafts SET ");
        sql.push_str(&set_clauses.join(", "));
        sql.push_str(" WHERE task_attempt_id = ?");

        let mut q = sqlx::query(&sql);
        if let Some(prompt) = &payload.prompt {
            q = q.bind(prompt);
        }
        if let Some(variant_opt) = &payload.variant
            && let Some(v) = variant_opt
        {
            q = q.bind(v);
        }
        if let Some(image_ids) = &payload.image_ids {
            let image_ids_json =
                serde_json::to_string(image_ids).unwrap_or_else(|_| "[]".to_string());
            q = q.bind(image_ids_json);
        }
        // WHERE bind
        q = q.bind(task_attempt.id);
        q.execute(pool).await?;
        let _ = has_variant_null; // silence unused (document intent)
    }

    // Ensure images are associated with the task for preview/loading
    if let Some(image_ids) = &payload.image_ids
        && !image_ids.is_empty()
    {
        // get parent task
        let task = task_attempt
            .parent_task(&deployment.db().pool)
            .await?
            .ok_or(SqlxError::RowNotFound)?;
        TaskImage::associate_many_dedup(pool, task.id, image_ids).await?;
    }

    // If queued and no process running for this attempt, attempt to start immediately.
    // Use an atomic sending lock to prevent duplicate starts when concurrent requests occur.
    let current = FollowUpDraft::find_by_task_attempt_id(pool, task_attempt.id).await?;
    let should_consider_start = current.as_ref().map(|c| c.queued).unwrap_or(false)
        && !has_running_processes_for_attempt(pool, task_attempt.id).await?;
    if should_consider_start {
        if FollowUpDraft::try_mark_sending(pool, task_attempt.id)
            .await
            .unwrap_or(false)
        {
            // Start follow up with saved draft
            let _ =
                start_follow_up_from_draft(&deployment, &task_attempt, current.as_ref().unwrap())
                    .await;
        } else {
            tracing::debug!(
                "Follow-up draft for attempt {} already being sent or not eligible",
                task_attempt.id
            );
        }
    }

    // Return current draft state (may have been cleared if started immediately)
    let current = FollowUpDraft::find_by_task_attempt_id(pool, task_attempt.id)
        .await?
        .map(|d| FollowUpDraftResponse {
            task_attempt_id: d.task_attempt_id,
            prompt: d.prompt,
            queued: d.queued,
            variant: d.variant,
            image_ids: d.image_ids,
            version: d.version,
        })
        .unwrap_or(FollowUpDraftResponse {
            task_attempt_id: task_attempt.id,
            prompt: "".to_string(),
            queued: false,
            variant: None,
            image_ids: None,
            version: 0,
        });

    Ok(ResponseJson(ApiResponse::success(current)))
}

#[axum::debug_handler]
pub async fn stream_follow_up_draft(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
) -> Result<
    Sse<impl futures_util::Stream<Item = Result<Event, Box<dyn std::error::Error + Send + Sync>>>>,
    ApiError,
> {
    let stream = deployment
        .events()
        .stream_follow_up_draft_for_attempt(task_attempt.id)
        .await
        .map_err(|e| ApiError::from(deployment::DeploymentError::from(e)))?;
    Ok(
        Sse::new(stream.map_err(|e| -> Box<dyn std::error::Error + Send + Sync> { Box::new(e) }))
            .keep_alive(KeepAlive::default()),
    )
}

#[axum::debug_handler]
pub async fn set_follow_up_queue(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<SetQueueRequest>,
) -> Result<ResponseJson<ApiResponse<FollowUpDraftResponse>>, ApiError> {
    let pool = &deployment.db().pool;
    let Some(d) = FollowUpDraft::find_by_task_attempt_id(pool, task_attempt.id).await? else {
        return Err(ApiError::Conflict("No draft to queue".to_string()));
    };

    // Optimistic concurrency: ensure caller's view matches current state (if provided)
    if let Some(expected) = payload.expected_queued
        && d.queued != expected
    {
        return Err(ApiError::Conflict(
            "Draft state changed, please refresh and try again".to_string(),
        ));
    }
    if let Some(expected_v) = payload.expected_version
        && d.version != expected_v
    {
        return Err(ApiError::Conflict(
            "Draft changed, please refresh and try again".to_string(),
        ));
    }

    if payload.queued {
        let should_queue = !d.prompt.trim().is_empty();
        sqlx::query(
            r#"UPDATE follow_up_drafts
                   SET queued = ?, updated_at = CURRENT_TIMESTAMP, version = version + 1
                 WHERE task_attempt_id = ?"#,
        )
        .bind(should_queue as i64)
        .bind(task_attempt.id)
        .execute(pool)
        .await?;
    } else {
        // Unqueue
        sqlx::query(
            r#"UPDATE follow_up_drafts
                   SET queued = 0, updated_at = CURRENT_TIMESTAMP, version = version + 1
                 WHERE task_attempt_id = ?"#,
        )
        .bind(task_attempt.id)
        .execute(pool)
        .await?;
    }

    // If queued and no process running for this attempt, attempt to start immediately.
    let current = FollowUpDraft::find_by_task_attempt_id(pool, task_attempt.id).await?;
    let should_consider_start = current.as_ref().map(|c| c.queued).unwrap_or(false)
        && !has_running_processes_for_attempt(pool, task_attempt.id).await?;
    if should_consider_start {
        if FollowUpDraft::try_mark_sending(pool, task_attempt.id)
            .await
            .unwrap_or(false)
        {
            let _ =
                start_follow_up_from_draft(&deployment, &task_attempt, current.as_ref().unwrap())
                    .await;
        } else {
            // Schedule a short delayed recheck to handle timing edges
            let deployment_clone = deployment.clone();
            let task_attempt_clone = task_attempt.clone();
            tokio::spawn(async move {
                use std::time::Duration;
                tokio::time::sleep(Duration::from_millis(1200)).await;
                let pool = &deployment_clone.db().pool;
                // Still no running process?
                let running =
                    match ExecutionProcess::find_by_task_attempt_id(pool, task_attempt_clone.id)
                        .await
                    {
                        Ok(procs) => procs.into_iter().any(|p| {
                            matches!(
                                p.status,
                                db::models::execution_process::ExecutionProcessStatus::Running
                            )
                        }),
                        Err(_) => true, // assume running on error to avoid duplicate starts
                    };
                if running {
                    return;
                }
                // Still queued and eligible?
                let draft =
                    match FollowUpDraft::find_by_task_attempt_id(pool, task_attempt_clone.id).await
                    {
                        Ok(Some(d)) if d.queued && !d.sending && !d.prompt.trim().is_empty() => d,
                        _ => return,
                    };
                if FollowUpDraft::try_mark_sending(pool, task_attempt_clone.id)
                    .await
                    .unwrap_or(false)
                {
                    let _ =
                        start_follow_up_from_draft(&deployment_clone, &task_attempt_clone, &draft)
                            .await;
                }
            });
        }
    }

    let d = FollowUpDraft::find_by_task_attempt_id(pool, task_attempt.id)
        .await?
        .ok_or(SqlxError::RowNotFound)?;
    let resp = FollowUpDraftResponse {
        task_attempt_id: d.task_attempt_id,
        prompt: d.prompt,
        queued: d.queued,
        variant: d.variant,
        image_ids: d.image_ids,
        version: d.version,
    };
    Ok(ResponseJson(ApiResponse::success(resp)))
}

async fn start_follow_up_from_draft(
    deployment: &DeploymentImpl,
    task_attempt: &TaskAttempt,
    draft: &FollowUpDraft,
) -> Result<ExecutionProcess, ApiError> {
    // Ensure worktree exists
    deployment
        .container()
        .ensure_container_exists(task_attempt)
        .await?;

    // Get latest session id (ignoring dropped)
    let session_id = ExecutionProcess::find_latest_session_id_by_task_attempt(
        &deployment.db().pool,
        task_attempt.id,
    )
    .await?
    .ok_or(ApiError::TaskAttempt(TaskAttemptError::ValidationError(
        "Couldn't find a prior session_id, please create a new task attempt".to_string(),
    )))?;

    // Get latest coding agent process to inherit executor profile
    let latest_execution_process = ExecutionProcess::find_latest_by_task_attempt_and_run_reason(
        &deployment.db().pool,
        task_attempt.id,
        &ExecutionProcessRunReason::CodingAgent,
    )
    .await?
    .ok_or(ApiError::TaskAttempt(TaskAttemptError::ValidationError(
        "Couldn't find initial coding agent process, has it run yet?".to_string(),
    )))?;
    let initial_executor_profile_id = match &latest_execution_process
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

    // Inherit executor profile; override variant if provided in draft
    let executor_profile_id = ExecutorProfileId {
        executor: initial_executor_profile_id.executor,
        variant: draft.variant.clone(),
    };

    // Get parent task -> project and cleanup action
    let task = task_attempt
        .parent_task(&deployment.db().pool)
        .await?
        .ok_or(SqlxError::RowNotFound)?;
    let project = task
        .parent_project(&deployment.db().pool)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    let cleanup_action = project.cleanup_script.map(|script| {
        Box::new(ExecutorAction::new(
            ExecutorActionType::ScriptRequest(ScriptRequest {
                script,
                language: ScriptRequestLanguage::Bash,
                context: ScriptContext::CleanupScript,
            }),
            None,
        ))
    });

    // Handle images: associate to task, copy to worktree, and canonicalize paths in prompt
    let mut prompt = draft.prompt.clone();
    if let Some(image_ids) = &draft.image_ids {
        TaskImage::associate_many_dedup(&deployment.db().pool, task_attempt.task_id, image_ids)
            .await?;
        if let Some(container_ref) = &task_attempt.container_ref {
            let worktree_path = std::path::PathBuf::from(container_ref);
            deployment
                .image()
                .copy_images_by_ids_to_worktree(&worktree_path, image_ids)
                .await?;
            prompt = ImageService::canonicalise_image_paths(&prompt, &worktree_path);
        }
    }

    let follow_up_request = CodingAgentFollowUpRequest {
        prompt,
        session_id,
        executor_profile_id,
    };

    let follow_up_action = ExecutorAction::new(
        ExecutorActionType::CodingAgentFollowUpRequest(follow_up_request),
        cleanup_action,
    );

    let execution_process = deployment
        .container()
        .start_execution(
            task_attempt,
            &follow_up_action,
            &ExecutionProcessRunReason::CodingAgent,
        )
        .await?;

    // Best-effort: clear the draft after scheduling the execution
    let _ = FollowUpDraft::clear_after_send(&deployment.db().pool, task_attempt.id).await;

    Ok(execution_process)
}

#[axum::debug_handler]
pub async fn replace_process(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<ReplaceProcessRequest>,
) -> Result<ResponseJson<ApiResponse<ReplaceProcessResult>>, ApiError> {
    let pool = &deployment.db().pool;
    let proc_id = payload.process_id;
    let force_when_dirty = payload.force_when_dirty.unwrap_or(false);
    let perform_git_reset = payload.perform_git_reset.unwrap_or(true);

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
        // Fallback: previous process's after_head_commit
        target_before_oid =
            ExecutionProcess::find_prev_after_head_commit(pool, task_attempt.id, proc_id).await?;
    }

    // Decide if Git reset is needed and apply it
    let mut git_reset_needed = false;
    let mut git_reset_applied = false;
    if perform_git_reset {
        if let Some(target_oid) = &target_before_oid {
            let container_ref = deployment
                .container()
                .ensure_container_exists(&task_attempt)
                .await?;
            let wt = std::path::Path::new(&container_ref);
            let head_oid = deployment.git().get_head_info(wt).ok().map(|h| h.oid);
            let is_dirty = deployment
                .container()
                .is_container_clean(&task_attempt)
                .await
                .map(|is_clean| !is_clean)
                .unwrap_or(false);
            if head_oid.as_deref() != Some(target_oid.as_str()) || is_dirty {
                git_reset_needed = true;
                if is_dirty && !force_when_dirty {
                    git_reset_applied = false; // cannot reset now
                } else if let Err(e) =
                    deployment
                        .git()
                        .reset_worktree_to_commit(wt, target_oid, force_when_dirty)
                {
                    tracing::error!("Failed to reset worktree: {}", e);
                    git_reset_applied = false;
                } else {
                    git_reset_applied = true;
                }
            }
        }
    } else {
        // Only compute necessity
        if let Some(target_oid) = &target_before_oid {
            let container_ref = deployment
                .container()
                .ensure_container_exists(&task_attempt)
                .await?;
            let wt = std::path::Path::new(&container_ref);
            let head_oid = deployment.git().get_head_info(wt).ok().map(|h| h.oid);
            let is_dirty = deployment
                .container()
                .is_container_clean(&task_attempt)
                .await
                .map(|is_clean| !is_clean)
                .unwrap_or(false);
            if head_oid.as_deref() != Some(target_oid.as_str()) || is_dirty {
                git_reset_needed = true;
            }
        }
    }

    // Stop any running processes for this attempt
    deployment.container().try_stop(&task_attempt).await;

    // Soft-drop the target process and all later processes
    let deleted_count = ExecutionProcess::drop_at_and_after(pool, task_attempt.id, proc_id).await?;

    // Build follow-up executor action using the original process profile
    let initial_executor_profile_id = match &process
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
            "Couldn't find profile from executor action".to_string(),
        ))),
    }?;

    let executor_profile_id = ExecutorProfileId {
        executor: initial_executor_profile_id.executor,
        variant: payload
            .variant
            .or(initial_executor_profile_id.variant.clone()),
    };

    // Use latest session_id from remaining (earlier) processes; if none exists, start a fresh initial request
    let latest_session_id =
        ExecutionProcess::find_latest_session_id_by_task_attempt(pool, task_attempt.id).await?;

    let action = if let Some(session_id) = latest_session_id {
        let follow_up_request = CodingAgentFollowUpRequest {
            prompt: payload.prompt.clone(),
            session_id,
            executor_profile_id,
        };
        ExecutorAction::new(
            ExecutorActionType::CodingAgentFollowUpRequest(follow_up_request),
            None,
        )
    } else {
        // No prior session (e.g., replacing the first run) → start a fresh initial request
        ExecutorAction::new(
            ExecutorActionType::CodingAgentInitialRequest(
                executors::actions::coding_agent_initial::CodingAgentInitialRequest {
                    prompt: payload.prompt.clone(),
                    executor_profile_id,
                },
            ),
            None,
        )
    };

    let execution_process = deployment
        .container()
        .start_execution(
            &task_attempt,
            &action,
            &ExecutionProcessRunReason::CodingAgent,
        )
        .await?;

    Ok(ResponseJson(ApiResponse::success(ReplaceProcessResult {
        deleted_count,
        git_reset_needed,
        git_reset_applied,
        target_before_oid,
        new_execution_id: Some(execution_process.id),
    })))
}

pub async fn get_task_attempt_diff(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
    // ) -> Result<ResponseJson<ApiResponse<Diff>>, ApiError> {
) -> Result<Sse<impl futures_util::Stream<Item = Result<Event, BoxError>>>, ApiError> {
    let stream = deployment.container().get_diff(&task_attempt).await?;

    Ok(Sse::new(stream.map_err(|e| -> BoxError { e.into() })).keep_alive(KeepAlive::default()))
}

#[derive(Debug, Serialize, TS)]
pub struct CommitInfo {
    pub sha: String,
    pub subject: String,
}

pub async fn get_commit_info(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<ResponseJson<ApiResponse<CommitInfo>>, ApiError> {
    let Some(sha) = params.get("sha").cloned() else {
        return Err(ApiError::TaskAttempt(TaskAttemptError::ValidationError(
            "Missing sha param".to_string(),
        )));
    };
    let container_ref = deployment
        .container()
        .ensure_container_exists(&task_attempt)
        .await?;
    let wt = std::path::Path::new(&container_ref);
    let subject = deployment.git().get_commit_subject(wt, &sha)?;
    Ok(ResponseJson(ApiResponse::success(CommitInfo {
        sha,
        subject,
    })))
}

#[derive(Debug, Serialize, TS)]
pub struct CommitCompareResult {
    pub head_oid: String,
    pub target_oid: String,
    pub ahead_from_head: usize,
    pub behind_from_head: usize,
    pub is_linear: bool,
}

pub async fn compare_commit_to_head(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<ResponseJson<ApiResponse<CommitCompareResult>>, ApiError> {
    let Some(target_oid) = params.get("sha").cloned() else {
        return Err(ApiError::TaskAttempt(TaskAttemptError::ValidationError(
            "Missing sha param".to_string(),
        )));
    };
    let container_ref = deployment
        .container()
        .ensure_container_exists(&task_attempt)
        .await?;
    let wt = std::path::Path::new(&container_ref);
    let head_info = deployment.git().get_head_info(wt)?;
    let (ahead_from_head, behind_from_head) =
        deployment
            .git()
            .ahead_behind_commits_by_oid(wt, &head_info.oid, &target_oid)?;
    let is_linear = behind_from_head == 0;
    Ok(ResponseJson(ApiResponse::success(CommitCompareResult {
        head_oid: head_info.oid,
        target_oid,
        ahead_from_head,
        behind_from_head,
        is_linear,
    })))
}

#[axum::debug_handler]
pub async fn merge_task_attempt(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let pool = &deployment.db().pool;

    let task = task_attempt
        .parent_task(pool)
        .await?
        .ok_or(ApiError::TaskAttempt(TaskAttemptError::TaskNotFound))?;
    let ctx = TaskAttempt::load_context(pool, task_attempt.id, task.id, task.project_id).await?;

    let container_ref = deployment
        .container()
        .ensure_container_exists(&task_attempt)
        .await?;
    let worktree_path = std::path::Path::new(&container_ref);

    let task_uuid_str = task.id.to_string();
    let first_uuid_section = task_uuid_str.split('-').next().unwrap_or(&task_uuid_str);

    // Create commit message with task title and description
    let mut commit_message = format!("{} (vibe-kanban {})", ctx.task.title, first_uuid_section);

    // Add description on next line if it exists
    if let Some(description) = &ctx.task.description
        && !description.trim().is_empty()
    {
        commit_message.push_str("\n\n");
        commit_message.push_str(description);
    }

    // Get branch name from task attempt
    let branch_name = ctx.task_attempt.branch.as_ref().ok_or_else(|| {
        ApiError::TaskAttempt(TaskAttemptError::ValidationError(
            "No branch found for task attempt".to_string(),
        ))
    })?;

    let merge_commit_id = deployment.git().merge_changes(
        &ctx.project.git_repo_path,
        worktree_path,
        branch_name,
        &ctx.task_attempt.base_branch,
        &commit_message,
    )?;

    Merge::create_direct(
        pool,
        task_attempt.id,
        &ctx.task_attempt.base_branch,
        &merge_commit_id,
    )
    .await?;
    Task::update_status(pool, ctx.task.id, TaskStatus::Done).await?;

    deployment
        .track_if_analytics_allowed(
            "task_attempt_merged",
            serde_json::json!({
                "task_id": ctx.task.id.to_string(),
                "project_id": ctx.project.id.to_string(),
                "attempt_id": task_attempt.id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(())))
}

pub async fn push_task_attempt_branch(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let github_config = deployment.config().read().await.github.clone();
    let Some(github_token) = github_config.token() else {
        return Err(GitHubServiceError::TokenInvalid.into());
    };

    let github_service = GitHubService::new(&github_token)?;
    github_service.check_token().await?;

    let branch_name = task_attempt.branch.as_ref().ok_or_else(|| {
        ApiError::TaskAttempt(TaskAttemptError::ValidationError(
            "No branch found for task attempt".to_string(),
        ))
    })?;
    let ws_path = PathBuf::from(
        deployment
            .container()
            .ensure_container_exists(&task_attempt)
            .await?,
    );

    deployment
        .git()
        .push_to_github(&ws_path, branch_name, &github_token)?;
    Ok(ResponseJson(ApiResponse::success(())))
}

pub async fn create_github_pr(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<CreateGitHubPrRequest>,
) -> Result<ResponseJson<ApiResponse<String, GitHubServiceError>>, ApiError> {
    let github_config = deployment.config().read().await.github.clone();
    let Some(github_token) = github_config.token() else {
        return Ok(ResponseJson(ApiResponse::error_with_data(
            GitHubServiceError::TokenInvalid,
        )));
    };
    // Create GitHub service instance
    let github_service = GitHubService::new(&github_token)?;
    if let Err(e) = github_service.check_token().await {
        if e.is_api_data() {
            return Ok(ResponseJson(ApiResponse::error_with_data(e)));
        } else {
            return Err(ApiError::GitHubService(e));
        }
    }
    // Get the task attempt to access the stored base branch
    let base_branch = request.base_branch.unwrap_or_else(|| {
        // Use the stored base branch from the task attempt as the default
        // Fall back to config default or "main" only if stored base branch is somehow invalid
        if !task_attempt.base_branch.trim().is_empty() {
            task_attempt.base_branch.clone()
        } else {
            github_config
                .default_pr_base
                .as_ref()
                .map_or_else(|| "main".to_string(), |b| b.to_string())
        }
    });

    let pool = &deployment.db().pool;
    let task = task_attempt
        .parent_task(pool)
        .await?
        .ok_or(ApiError::TaskAttempt(TaskAttemptError::TaskNotFound))?;
    let project = Project::find_by_id(pool, task.project_id)
        .await?
        .ok_or(ApiError::Project(ProjectError::ProjectNotFound))?;

    // Use GitService to get the remote URL, then create GitHubRepoInfo
    let repo_info = deployment
        .git()
        .get_github_repo_info(&project.git_repo_path)?;

    // Get branch name from task attempt
    let branch_name = task_attempt.branch.as_ref().ok_or_else(|| {
        ApiError::TaskAttempt(TaskAttemptError::ValidationError(
            "No branch found for task attempt".to_string(),
        ))
    })?;
    let workspace_path = PathBuf::from(
        deployment
            .container()
            .ensure_container_exists(&task_attempt)
            .await?,
    );

    // Push the branch to GitHub first
    if let Err(e) = deployment
        .git()
        .push_to_github(&workspace_path, branch_name, &github_token)
    {
        tracing::error!("Failed to push branch to GitHub: {}", e);
        let gh_e = GitHubServiceError::from(e);
        if gh_e.is_api_data() {
            return Ok(ResponseJson(ApiResponse::error_with_data(gh_e)));
        } else {
            return Ok(ResponseJson(ApiResponse::error(
                format!("Failed to push branch to GitHub: {}", gh_e).as_str(),
            )));
        }
    }

    let norm_base_branch_name = if matches!(
        deployment
            .git()
            .find_branch_type(&project.git_repo_path, &base_branch)?,
        BranchType::Remote
    ) {
        // Remote branches are formatted as {remote}/{branch} locally.
        // For PR APIs, we must provide just the branch name.
        let remote = deployment
            .git()
            .get_remote_name_from_branch_name(&workspace_path, &base_branch)?;
        let remote_prefix = format!("{}/", remote);
        base_branch
            .strip_prefix(&remote_prefix)
            .unwrap_or(&base_branch)
            .to_string()
    } else {
        base_branch
    };
    // Create the PR using GitHub service
    let pr_request = CreatePrRequest {
        title: request.title.clone(),
        body: request.body.clone(),
        head_branch: branch_name.clone(),
        base_branch: norm_base_branch_name.clone(),
    };

    match github_service.create_pr(&repo_info, &pr_request).await {
        Ok(pr_info) => {
            // Update the task attempt with PR information
            if let Err(e) = Merge::create_pr(
                pool,
                task_attempt.id,
                &norm_base_branch_name,
                pr_info.number,
                &pr_info.url,
            )
            .await
            {
                tracing::error!("Failed to update task attempt PR status: {}", e);
            }

            deployment
                .track_if_analytics_allowed(
                    "github_pr_created",
                    serde_json::json!({
                        "task_id": task.id.to_string(),
                        "project_id": project.id.to_string(),
                        "attempt_id": task_attempt.id.to_string(),
                    }),
                )
                .await;

            Ok(ResponseJson(ApiResponse::success(pr_info.url)))
        }
        Err(e) => {
            tracing::error!(
                "Failed to create GitHub PR for attempt {}: {}",
                task_attempt.id,
                e
            );
            if e.is_api_data() {
                Ok(ResponseJson(ApiResponse::error_with_data(e)))
            } else {
                Ok(ResponseJson(ApiResponse::error(
                    format!("Failed to create PR: {}", e).as_str(),
                )))
            }
        }
    }
}

#[derive(serde::Deserialize)]
pub struct OpenEditorRequest {
    editor_type: Option<String>,
    file_path: Option<String>,
}

pub async fn open_task_attempt_in_editor(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<Option<OpenEditorRequest>>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    // Get the task attempt to access the worktree path
    let attempt = &task_attempt;
    let base_path = attempt.container_ref.as_ref().ok_or_else(|| {
        tracing::error!(
            "No container ref found for task attempt {}",
            task_attempt.id
        );
        ApiError::TaskAttempt(TaskAttemptError::ValidationError(
            "No container ref found".to_string(),
        ))
    })?;

    // If a specific file path is provided, use it; otherwise use the base path
    let path = if let Some(file_path) = payload.as_ref().and_then(|req| req.file_path.as_ref()) {
        std::path::Path::new(base_path).join(file_path)
    } else {
        std::path::PathBuf::from(base_path)
    };

    let editor_config = {
        let config = deployment.config().read().await;
        let editor_type_str = payload.as_ref().and_then(|req| req.editor_type.as_deref());
        config.editor.with_override(editor_type_str)
    };

    match editor_config.open_file(&path.to_string_lossy()) {
        Ok(_) => {
            tracing::info!(
                "Opened editor for task attempt {} at path: {}",
                task_attempt.id,
                path.display()
            );
            Ok(ResponseJson(ApiResponse::success(())))
        }
        Err(e) => {
            tracing::error!(
                "Failed to open editor for attempt {}: {}",
                task_attempt.id,
                e
            );
            Err(ApiError::TaskAttempt(TaskAttemptError::ValidationError(
                format!("Failed to open editor: {}", e),
            )))
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct BranchStatus {
    pub commits_behind: Option<usize>,
    pub commits_ahead: Option<usize>,
    pub has_uncommitted_changes: Option<bool>,
    pub head_oid: Option<String>,
    pub uncommitted_count: Option<usize>,
    pub untracked_count: Option<usize>,
    pub base_branch_name: String,
    pub remote_commits_behind: Option<usize>,
    pub remote_commits_ahead: Option<usize>,
    pub merges: Vec<Merge>,
    /// True if a `git rebase` is currently in progress in this worktree
    pub is_rebase_in_progress: bool,
    /// Current conflict operation if any
    pub conflict_op: Option<ConflictOp>,
    /// List of files currently in conflicted (unmerged) state
    pub conflicted_files: Vec<String>,
}

pub async fn get_task_attempt_branch_status(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<BranchStatus>>, ApiError> {
    let pool = &deployment.db().pool;

    let task = task_attempt
        .parent_task(pool)
        .await?
        .ok_or(ApiError::TaskAttempt(TaskAttemptError::TaskNotFound))?;
    let ctx = TaskAttempt::load_context(pool, task_attempt.id, task.id, task.project_id).await?;
    let has_uncommitted_changes = deployment
        .container()
        .is_container_clean(&task_attempt)
        .await
        .ok()
        .map(|is_clean| !is_clean);
    let head_oid = {
        let container_ref = deployment
            .container()
            .ensure_container_exists(&task_attempt)
            .await?;
        let wt = std::path::Path::new(&container_ref);
        deployment.git().get_head_info(wt).ok().map(|h| h.oid)
    };
    // Detect conflicts and operation in progress (best-effort)
    let (is_rebase_in_progress, conflicted_files, conflict_op) = {
        let container_ref = deployment
            .container()
            .ensure_container_exists(&task_attempt)
            .await?;
        let wt = std::path::Path::new(&container_ref);
        let in_rebase = deployment.git().is_rebase_in_progress(wt).unwrap_or(false);
        let conflicts = deployment
            .git()
            .get_conflicted_files(wt)
            .unwrap_or_default();
        let op = if conflicts.is_empty() {
            None
        } else {
            deployment.git().detect_conflict_op(wt).unwrap_or(None)
        };
        (in_rebase, conflicts, op)
    };
    let (uncommitted_count, untracked_count) = {
        let container_ref = deployment
            .container()
            .ensure_container_exists(&task_attempt)
            .await?;
        let wt = std::path::Path::new(&container_ref);
        match deployment.git().get_worktree_change_counts(wt) {
            Ok((a, b)) => (Some(a), Some(b)),
            Err(_) => (None, None),
        }
    };

    let task_branch =
        task_attempt
            .branch
            .ok_or(ApiError::TaskAttempt(TaskAttemptError::ValidationError(
                "No branch found for task attempt".to_string(),
            )))?;
    let base_branch_type = deployment
        .git()
        .find_branch_type(&ctx.project.git_repo_path, &task_attempt.base_branch)?;

    let (commits_ahead, commits_behind) = if matches!(base_branch_type, BranchType::Local) {
        let (a, b) = deployment.git().get_branch_status(
            &ctx.project.git_repo_path,
            &task_branch,
            &task_attempt.base_branch,
        )?;
        (Some(a), Some(b))
    } else {
        (None, None)
    };
    // Fetch merges for this task attempt and add to branch status
    let merges = Merge::find_by_task_attempt_id(pool, task_attempt.id).await?;
    let mut branch_status = BranchStatus {
        commits_ahead,
        commits_behind,
        has_uncommitted_changes,
        head_oid,
        uncommitted_count,
        untracked_count,
        remote_commits_ahead: None,
        remote_commits_behind: None,
        merges,
        base_branch_name: task_attempt.base_branch.clone(),
        is_rebase_in_progress,
        conflict_op,
        conflicted_files,
    };
    let has_open_pr = branch_status.merges.first().is_some_and(|m| {
        matches!(
            m,
            Merge::Pr(PrMerge {
                pr_info: PullRequestInfo {
                    status: MergeStatus::Open,
                    ..
                },
                ..
            })
        )
    });

    // check remote status if the attempt has an open PR or the base_branch is a remote branch
    if has_open_pr || base_branch_type == BranchType::Remote {
        let github_config = deployment.config().read().await.github.clone();
        let token = github_config
            .token()
            .ok_or(ApiError::GitHubService(GitHubServiceError::TokenInvalid))?;

        // For an attempt with a remote base branch, we compare against that
        // After opening a PR, the attempt has a remote branch itself, so we use that
        let remote_base_branch = if base_branch_type == BranchType::Remote && !has_open_pr {
            Some(task_attempt.base_branch)
        } else {
            None
        };
        let (remote_commits_ahead, remote_commits_behind) =
            deployment.git().get_remote_branch_status(
                &ctx.project.git_repo_path,
                &task_branch,
                remote_base_branch.as_deref(),
                token,
            )?;
        branch_status.remote_commits_ahead = Some(remote_commits_ahead);
        branch_status.remote_commits_behind = Some(remote_commits_behind);
    }
    Ok(ResponseJson(ApiResponse::success(branch_status)))
}

#[axum::debug_handler]
pub async fn rebase_task_attempt(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
    request_body: Option<Json<RebaseTaskAttemptRequest>>,
) -> Result<ResponseJson<ApiResponse<(), GitOperationError>>, ApiError> {
    // Extract new base branch from request body if provided
    let new_base_branch = request_body.and_then(|body| body.new_base_branch.clone());

    let github_config = deployment.config().read().await.github.clone();

    let pool = &deployment.db().pool;

    let task = task_attempt
        .parent_task(pool)
        .await?
        .ok_or(ApiError::TaskAttempt(TaskAttemptError::TaskNotFound))?;
    let ctx = TaskAttempt::load_context(pool, task_attempt.id, task.id, task.project_id).await?;

    // Use the stored base branch if no new base branch is provided
    let effective_base_branch =
        new_base_branch.or_else(|| Some(ctx.task_attempt.base_branch.clone()));

    let container_ref = deployment
        .container()
        .ensure_container_exists(&task_attempt)
        .await?;
    let worktree_path = std::path::Path::new(&container_ref);

    let result = deployment.git().rebase_branch(
        &ctx.project.git_repo_path,
        worktree_path,
        effective_base_branch.clone().as_deref(),
        &ctx.task_attempt.base_branch.clone(),
        github_config.token(),
    );
    if let Err(e) = result {
        use services::services::git::GitServiceError;
        return match e {
            GitServiceError::MergeConflicts(msg) => Ok(ResponseJson(ApiResponse::<
                (),
                GitOperationError,
            >::error_with_data(
                GitOperationError::MergeConflicts {
                    message: msg,
                    op: ConflictOp::Rebase,
                },
            ))),
            GitServiceError::RebaseInProgress => Ok(ResponseJson(ApiResponse::<
                (),
                GitOperationError,
            >::error_with_data(
                GitOperationError::RebaseInProgress,
            ))),
            other => Err(ApiError::GitService(other)),
        };
    }

    if let Some(new_base_branch) = &effective_base_branch
        && new_base_branch != &ctx.task_attempt.base_branch
    {
        TaskAttempt::update_base_branch(&deployment.db().pool, task_attempt.id, new_base_branch)
            .await?;
    }

    Ok(ResponseJson(ApiResponse::success(())))
}

#[axum::debug_handler]
pub async fn abort_conflicts_task_attempt(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    // Resolve worktree path for this attempt
    let container_ref = deployment
        .container()
        .ensure_container_exists(&task_attempt)
        .await?;
    let worktree_path = std::path::Path::new(&container_ref);

    deployment.git().abort_conflicts(worktree_path)?;

    Ok(ResponseJson(ApiResponse::success(())))
}

#[derive(serde::Deserialize)]
pub struct DeleteFileQuery {
    file_path: String,
}

#[axum::debug_handler]
pub async fn delete_task_attempt_file(
    Extension(task_attempt): Extension<TaskAttempt>,
    Query(query): Query<DeleteFileQuery>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let container_ref = deployment
        .container()
        .ensure_container_exists(&task_attempt)
        .await?;
    let worktree_path = std::path::Path::new(&container_ref);

    // Use GitService to delete file and commit
    let _commit_id = deployment
        .git()
        .delete_file_and_commit(worktree_path, &query.file_path)
        .map_err(|e| {
            tracing::error!(
                "Failed to delete file '{}' from task attempt {}: {}",
                query.file_path,
                task_attempt.id,
                e
            );
            ApiError::GitService(e)
        })?;

    Ok(ResponseJson(ApiResponse::success(())))
}

#[axum::debug_handler]
pub async fn start_dev_server(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let pool = &deployment.db().pool;

    // Get parent task
    let task = task_attempt
        .parent_task(&deployment.db().pool)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    // Get parent project
    let project = task
        .parent_project(&deployment.db().pool)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    // Stop any existing dev servers for this project
    let existing_dev_servers =
        match ExecutionProcess::find_running_dev_servers_by_project(pool, project.id).await {
            Ok(servers) => servers,
            Err(e) => {
                tracing::error!(
                    "Failed to find running dev servers for project {}: {}",
                    project.id,
                    e
                );
                return Err(ApiError::TaskAttempt(TaskAttemptError::ValidationError(
                    e.to_string(),
                )));
            }
        };

    for dev_server in existing_dev_servers {
        tracing::info!(
            "Stopping existing dev server {} for project {}",
            dev_server.id,
            project.id
        );

        if let Err(e) = deployment.container().stop_execution(&dev_server).await {
            tracing::error!("Failed to stop dev server {}: {}", dev_server.id, e);
        }
    }

    if let Some(dev_server) = project.dev_script {
        // TODO: Derive script language from system config
        let executor_action = ExecutorAction::new(
            ExecutorActionType::ScriptRequest(ScriptRequest {
                script: dev_server,
                language: ScriptRequestLanguage::Bash,
                context: ScriptContext::DevServer,
            }),
            None,
        );

        deployment
            .container()
            .start_execution(
                &task_attempt,
                &executor_action,
                &ExecutionProcessRunReason::DevServer,
            )
            .await?
    } else {
        return Ok(ResponseJson(ApiResponse::error(
            "No dev server script configured for this project",
        )));
    };

    Ok(ResponseJson(ApiResponse::success(())))
}

pub async fn get_task_attempt_children(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<TaskRelationships>>, StatusCode> {
    match Task::find_relationships_for_attempt(&deployment.db().pool, &task_attempt).await {
        Ok(relationships) => Ok(ResponseJson(ApiResponse::success(relationships))),
        Err(e) => {
            tracing::error!(
                "Failed to fetch relationships for task attempt {}: {}",
                task_attempt.id,
                e
            );
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn stop_task_attempt_execution(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    deployment.container().try_stop(&task_attempt).await;
    Ok(ResponseJson(ApiResponse::success(())))
}

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let task_attempt_id_router = Router::new()
        .route("/", get(get_task_attempt))
        .route("/follow-up", post(follow_up))
        .route(
            "/follow-up-draft",
            get(get_follow_up_draft).put(save_follow_up_draft),
        )
        .route("/follow-up-draft/stream", get(stream_follow_up_draft))
        .route("/follow-up-draft/queue", post(set_follow_up_queue))
        .route("/replace-process", post(replace_process))
        .route("/commit-info", get(get_commit_info))
        .route("/commit-compare", get(compare_commit_to_head))
        .route("/start-dev-server", post(start_dev_server))
        .route("/branch-status", get(get_task_attempt_branch_status))
        .route("/diff", get(get_task_attempt_diff))
        .route("/merge", post(merge_task_attempt))
        .route("/push", post(push_task_attempt_branch))
        .route("/rebase", post(rebase_task_attempt))
        .route("/conflicts/abort", post(abort_conflicts_task_attempt))
        .route("/pr", post(create_github_pr))
        .route("/open-editor", post(open_task_attempt_in_editor))
        .route("/delete-file", post(delete_task_attempt_file))
        .route("/children", get(get_task_attempt_children))
        .route("/stop", post(stop_task_attempt_execution))
        .layer(from_fn_with_state(
            deployment.clone(),
            load_task_attempt_middleware,
        ));

    let task_attempts_router = Router::new()
        .route("/", get(get_task_attempts).post(create_task_attempt))
        .nest("/{id}", task_attempt_id_router);

    Router::new().nest("/task-attempts", task_attempts_router)
}
