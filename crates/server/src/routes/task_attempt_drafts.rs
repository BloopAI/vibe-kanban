use axum::{
    Extension, Json,
    extract::{
        State,
        ws::{WebSocket, WebSocketUpgrade},
    },
    response::{IntoResponse, Json as ResponseJson},
};
use db::models::{
    draft::{Draft, DraftType, UpsertDraft},
    execution_process::{ExecutionProcess, ExecutionProcessRunReason},
    image::TaskImage,
    task_attempt::{TaskAttempt, TaskAttemptError},
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
use futures_util::{SinkExt, StreamExt, TryStreamExt};
use serde::{Deserialize, Serialize};
use services::services::container::ContainerService;
use sqlx::Error as SqlxError;
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{
    DeploymentImpl,
    error::ApiError,
    routes::task_attempts_util::{
        ensure_worktree_path, handle_images_for_prompt, latest_executor_profile_for_attempt,
        require_latest_session_id,
    },
};

// =====================
// Types
// =====================

#[derive(Debug, Serialize, TS)]
pub struct DraftResponse {
    pub task_attempt_id: Uuid,
    pub draft_type: DraftType,
    pub retry_process_id: Option<Uuid>, // Only for retry drafts
    pub prompt: String,
    pub queued: bool,
    pub variant: Option<String>,
    pub image_ids: Option<Vec<Uuid>>,
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
pub struct UpdateRetryFollowUpDraftRequest {
    pub retry_process_id: Uuid,
    pub prompt: Option<String>,
    pub variant: Option<Option<String>>,
    pub image_ids: Option<Vec<Uuid>>,
    pub version: Option<i64>,
}

#[derive(Debug, Deserialize, TS)]
pub struct SetQueueRequest {
    pub queued: bool,
    pub expected_queued: Option<bool>,
    pub expected_version: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct DraftTypeQuery {
    #[serde(rename = "type")]
    pub draft_type: DraftType,
}

// =====================
// Helpers
// =====================

fn draft_to_response(d: Draft) -> DraftResponse {
    DraftResponse {
        task_attempt_id: d.task_attempt_id,
        draft_type: d.draft_type,
        retry_process_id: d.retry_process_id,
        prompt: d.prompt,
        queued: d.queued,
        variant: d.variant,
        image_ids: d.image_ids,
        version: d.version,
    }
}

async fn ensure_follow_up_draft_row(
    pool: &sqlx::SqlitePool,
    attempt_id: Uuid,
) -> Result<Draft, ApiError> {
    if let Some(d) =
        Draft::find_by_task_attempt_and_type(pool, attempt_id, DraftType::FollowUp).await?
    {
        return Ok(d);
    }
    let _ = Draft::upsert(
        pool,
        &UpsertDraft {
            task_attempt_id: attempt_id,
            draft_type: DraftType::FollowUp,
            retry_process_id: None,
            prompt: "".to_string(),
            queued: false,
            variant: None,
            image_ids: None,
        },
    )
    .await?;
    Draft::find_by_task_attempt_and_type(pool, attempt_id, DraftType::FollowUp)
        .await?
        .ok_or(SqlxError::RowNotFound.into())
}

async fn associate_images_for_task_if_any(
    pool: &sqlx::SqlitePool,
    task_id: Uuid,
    image_ids: &Option<Vec<Uuid>>,
) -> Result<(), ApiError> {
    if let Some(ids) = image_ids
        && !ids.is_empty()
    {
        TaskImage::associate_many_dedup(pool, task_id, ids).await?;
    }
    Ok(())
}

async fn has_running_processes_for_attempt(
    pool: &sqlx::SqlitePool,
    attempt_id: Uuid,
) -> Result<bool, ApiError> {
    let processes = ExecutionProcess::find_by_task_attempt_id(pool, attempt_id, false).await?;
    Ok(processes.into_iter().any(|p| {
        matches!(
            p.status,
            db::models::execution_process::ExecutionProcessStatus::Running
        )
    }))
}

async fn fetch_draft_response(
    pool: &sqlx::SqlitePool,
    task_attempt_id: Uuid,
    draft_type: DraftType,
) -> Result<DraftResponse, ApiError> {
    let d = Draft::find_by_task_attempt_and_type(pool, task_attempt_id, draft_type).await?;
    let resp = if let Some(d) = d {
        DraftResponse {
            task_attempt_id: d.task_attempt_id,
            draft_type: d.draft_type,
            retry_process_id: d.retry_process_id,
            prompt: d.prompt,
            queued: d.queued,
            variant: d.variant,
            image_ids: d.image_ids,
            version: d.version,
        }
    } else {
        DraftResponse {
            task_attempt_id,
            draft_type,
            retry_process_id: None,
            prompt: "".to_string(),
            queued: false,
            variant: None,
            image_ids: None,
            version: 0,
        }
    };
    Ok(resp)
}

async fn start_follow_up_from_draft(
    deployment: &DeploymentImpl,
    task_attempt: &TaskAttempt,
    draft: &Draft,
) -> Result<db::models::execution_process::ExecutionProcess, ApiError> {
    // Ensure worktree exists and get latest session id (ignoring dropped)
    let _ = ensure_worktree_path(deployment, task_attempt).await?;
    let session_id = require_latest_session_id(&deployment.db().pool, task_attempt.id).await?;

    // Inherit executor profile; override variant if provided in draft
    let base_profile =
        latest_executor_profile_for_attempt(&deployment.db().pool, task_attempt.id).await?;
    let executor_profile_id = ExecutorProfileId {
        executor: base_profile.executor,
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
        prompt = handle_images_for_prompt(
            deployment,
            task_attempt,
            task_attempt.task_id,
            image_ids,
            &prompt,
        )
        .await?;
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
    let _ =
        Draft::clear_after_send(&deployment.db().pool, task_attempt.id, DraftType::FollowUp).await;

    Ok(execution_process)
}

// =====================
// Handlers
// =====================

#[axum::debug_handler]
pub async fn save_follow_up_draft(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<UpdateFollowUpDraftRequest>,
) -> Result<ResponseJson<ApiResponse<DraftResponse>>, ApiError> {
    let pool = &deployment.db().pool;

    // Enforce: cannot edit while queued
    let d = ensure_follow_up_draft_row(pool, task_attempt.id).await?;
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
        // Partial update unified drafts row
        Draft::update_partial(
            pool,
            task_attempt.id,
            DraftType::FollowUp,
            payload.prompt.clone(),
            payload.variant.clone(),
            payload.image_ids.clone(),
            None,
        )
        .await?;
    }

    // Ensure images are associated with the task for preview/loading
    if let Some(task) = task_attempt.parent_task(&deployment.db().pool).await? {
        associate_images_for_task_if_any(pool, task.id, &payload.image_ids).await?;
    }

    // Return current draft state (may have been cleared if started immediately)
    let current = Draft::find_by_task_attempt_and_type(pool, task_attempt.id, DraftType::FollowUp)
        .await?
        .map(draft_to_response)
        .unwrap_or(DraftResponse {
            task_attempt_id: task_attempt.id,
            draft_type: DraftType::FollowUp,
            retry_process_id: None,
            prompt: "".to_string(),
            queued: false,
            variant: None,
            image_ids: None,
            version: 0,
        });

    Ok(ResponseJson(ApiResponse::success(current)))
}

#[axum::debug_handler]
pub async fn save_retry_follow_up_draft(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<UpdateRetryFollowUpDraftRequest>,
) -> Result<ResponseJson<ApiResponse<DraftResponse>>, ApiError> {
    let pool = &deployment.db().pool;
    let d = Draft::find_by_task_attempt_and_type(pool, task_attempt.id, DraftType::Retry).await?;

    // If queued and editing, block edits until unqueued
    if let Some(d) = &d {
        if d.queued {
            return Err(ApiError::Conflict(
                "Retry draft is queued; unqueue before editing".to_string(),
            ));
        }
        if let Some(expected_version) = payload.version
            && d.version != expected_version
        {
            return Err(ApiError::Conflict(
                "Retry draft changed, please retry with latest".to_string(),
            ));
        }
    }

    // Upsert or partial update
    if d.is_none() {
        // Create new retry draft with provided fields (prompt default empty)
        let draft = Draft::upsert(
            pool,
            &UpsertDraft {
                task_attempt_id: task_attempt.id,
                draft_type: DraftType::Retry,
                retry_process_id: Some(payload.retry_process_id),
                prompt: payload.prompt.clone().unwrap_or_default(),
                queued: false,
                variant: payload.variant.unwrap_or(None),
                image_ids: payload.image_ids.clone(),
            },
        )
        .await?;

        return Ok(ResponseJson(ApiResponse::success(draft_to_response(draft))));
    }

    // Partial update existing row
    if payload.prompt.is_none() && payload.variant.is_none() && payload.image_ids.is_none() {
        // nothing to change; return current
    } else {
        // Partial update unified drafts row
        Draft::update_partial(
            pool,
            task_attempt.id,
            DraftType::Retry,
            payload.prompt.clone(),
            payload.variant.clone(),
            payload.image_ids.clone(),
            Some(payload.retry_process_id),
        )
        .await?;
    }

    // Ensure images are associated with the task for preview/loading
    if let Some(task) = task_attempt.parent_task(&deployment.db().pool).await? {
        associate_images_for_task_if_any(pool, task.id, &payload.image_ids).await?;
    }

    let d = Draft::find_by_task_attempt_and_type(pool, task_attempt.id, DraftType::Retry)
        .await?
        .ok_or(SqlxError::RowNotFound)?;
    Ok(ResponseJson(ApiResponse::success(draft_to_response(d))))
}

#[axum::debug_handler]
pub async fn delete_retry_follow_up_draft(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let pool = &deployment.db().pool;
    sqlx::query("DELETE FROM drafts WHERE task_attempt_id = ? AND draft_type = ?")
        .bind(task_attempt.id)
        .bind(DraftType::Retry.as_str())
        .execute(pool)
        .await?;
    // Proactively emit a targeted deletion event so WS clients update immediately.
    // The SQLite update hook on DELETE does not reliably provide the attempt_id,
    // so this synthetic event prevents UI "stuck" states after cancel.
    deployment
        .events()
        .emit_deleted_retry_draft_for_attempt(task_attempt.id);
    Ok(ResponseJson(ApiResponse::success(())))
}

#[axum::debug_handler]
pub async fn stream_follow_up_draft_ws(
    ws: WebSocketUpgrade,
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| async move {
        if let Err(e) = handle_follow_up_draft_ws(socket, deployment, task_attempt.id).await {
            tracing::warn!("follow-up draft WS closed: {}", e);
        }
    })
}

async fn handle_follow_up_draft_ws(
    socket: WebSocket,
    deployment: DeploymentImpl,
    task_attempt_id: uuid::Uuid,
) -> anyhow::Result<()> {
    let mut stream = deployment
        .events()
        .stream_follow_up_draft_for_attempt_raw(task_attempt_id)
        .await?
        .map_ok(|msg| msg.to_ws_message_unchecked());

    // Split socket into sender and receiver
    let (mut sender, mut receiver) = socket.split();

    // Drain (and ignore) any client->server messages so pings/pongs work
    tokio::spawn(async move { while let Some(Ok(_)) = receiver.next().await {} });

    // Forward server messages
    while let Some(item) = stream.next().await {
        match item {
            Ok(msg) => {
                if sender.send(msg).await.is_err() {
                    break;
                }
            }
            Err(e) => {
                tracing::error!("stream error: {}", e);
                break;
            }
        }
    }
    Ok(())
}

#[axum::debug_handler]
pub async fn set_follow_up_queue(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<SetQueueRequest>,
) -> Result<ResponseJson<ApiResponse<DraftResponse>>, ApiError> {
    let pool = &deployment.db().pool;
    let Some(d) =
        Draft::find_by_task_attempt_and_type(pool, task_attempt.id, DraftType::FollowUp).await?
    else {
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
        Draft::set_queued(pool, task_attempt.id, DraftType::FollowUp, should_queue).await?;
    } else {
        // Unqueue
        Draft::set_queued(pool, task_attempt.id, DraftType::FollowUp, false).await?;
    }

    // If queued and no process running for this attempt, attempt to start immediately.
    let current =
        Draft::find_by_task_attempt_and_type(pool, task_attempt.id, DraftType::FollowUp).await?;
    let should_consider_start = current.as_ref().map(|c| c.queued).unwrap_or(false)
        && !has_running_processes_for_attempt(pool, task_attempt.id).await?;
    if should_consider_start {
        if Draft::try_mark_sending(pool, task_attempt.id, DraftType::FollowUp)
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
                let running = match ExecutionProcess::find_by_task_attempt_id(
                    pool,
                    task_attempt_clone.id,
                    false,
                )
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
                let draft = match Draft::find_by_task_attempt_and_type(
                    pool,
                    task_attempt_clone.id,
                    DraftType::FollowUp,
                )
                .await
                {
                    Ok(Some(d)) if d.queued && !d.sending && !d.prompt.trim().is_empty() => d,
                    _ => return,
                };
                if Draft::try_mark_sending(pool, task_attempt_clone.id, DraftType::FollowUp)
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

    let d = Draft::find_by_task_attempt_and_type(pool, task_attempt.id, DraftType::FollowUp)
        .await?
        .ok_or(SqlxError::RowNotFound)?;
    let resp = draft_to_response(d);
    Ok(ResponseJson(ApiResponse::success(resp)))
}

// =====================
// Unified draft endpoints (per attempt)
// =====================

#[axum::debug_handler]
pub async fn get_draft(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
    axum::extract::Query(q): axum::extract::Query<DraftTypeQuery>,
) -> Result<ResponseJson<ApiResponse<DraftResponse>>, ApiError> {
    let resp = fetch_draft_response(&deployment.db().pool, task_attempt.id, q.draft_type).await?;
    Ok(ResponseJson(ApiResponse::success(resp)))
}

#[axum::debug_handler]
pub async fn save_draft(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
    axum::extract::Query(q): axum::extract::Query<DraftTypeQuery>,
    Json(payload): Json<serde_json::Value>,
) -> Result<ResponseJson<ApiResponse<DraftResponse>>, ApiError> {
    match q.draft_type {
        DraftType::FollowUp => {
            let body: UpdateFollowUpDraftRequest =
                serde_json::from_value(payload).map_err(|e| {
                    ApiError::TaskAttempt(TaskAttemptError::ValidationError(e.to_string()))
                })?;
            save_follow_up_draft(Extension(task_attempt), State(deployment), Json(body)).await
        }
        DraftType::Retry => {
            let body: UpdateRetryFollowUpDraftRequest =
                serde_json::from_value(payload).map_err(|e| {
                    ApiError::TaskAttempt(TaskAttemptError::ValidationError(e.to_string()))
                })?;
            save_retry_follow_up_draft(Extension(task_attempt), State(deployment), Json(body)).await
        }
    }
}

#[axum::debug_handler]
pub async fn delete_draft(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
    axum::extract::Query(q): axum::extract::Query<DraftTypeQuery>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    match q.draft_type {
        DraftType::FollowUp => {
            // For follow-up drafts we do not support DELETE; use queue/edit flow
            Err(ApiError::TaskAttempt(TaskAttemptError::ValidationError(
                "Cannot delete follow-up draft; unqueue or edit instead".to_string(),
            )))
        }
        DraftType::Retry => {
            delete_retry_follow_up_draft(Extension(task_attempt), State(deployment)).await
        }
    }
}

#[axum::debug_handler]
pub async fn set_draft_queue(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
    axum::extract::Query(q): axum::extract::Query<DraftTypeQuery>,
    Json(payload): Json<SetQueueRequest>,
) -> Result<ResponseJson<ApiResponse<DraftResponse>>, ApiError> {
    if q.draft_type != DraftType::FollowUp {
        return Err(ApiError::TaskAttempt(TaskAttemptError::ValidationError(
            "Queue is only supported for follow-up drafts".to_string(),
        )));
    }
    // Delegate to existing follow-up queue handler
    set_follow_up_queue(Extension(task_attempt), State(deployment), Json(payload)).await
}
