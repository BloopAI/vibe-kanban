pub mod queue;
pub mod review;

use axum::{
    Extension, Json, Router,
    extract::{Query, State},
    middleware::from_fn_with_state,
    response::Json as ResponseJson,
    routing::{get, post},
};
use db::models::{
    coding_agent_turn::CodingAgentTurn,
    execution_process::{ExecutionProcess, ExecutionProcessRunReason},
    requests::UpdateSession,
    scratch::{Scratch, ScratchType},
    session::{CreateSession, Session, SessionError},
    workspace::{Workspace, WorkspaceError},
    workspace_repo::WorkspaceRepo,
};
use deployment::Deployment;
use executors::{
    actions::{
        ExecutorAction, ExecutorActionType, coding_agent_follow_up::CodingAgentFollowUpRequest,
    },
    executors::BaseCodingAgent,
    logs::{
        NormalizedEntry, NormalizedEntryType,
        messages::{PageParams, filter, final_assistant_message, page},
        rebuild::rebuild_entries,
    },
    profile::ExecutorConfig,
};
use futures_util::StreamExt;
use serde::Deserialize;
use services::services::container::ContainerService;
use ts_rs::TS;
use utils::{log_msg::LogMsg, response::ApiResponse};
use uuid::Uuid;

use crate::{
    DeploymentImpl, error::ApiError, middleware::load_session_middleware,
    routes::workspaces::execution::RunScriptError,
};

#[derive(Debug, Deserialize)]
pub struct SessionQuery {
    pub workspace_id: Uuid,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateSessionRequest {
    pub workspace_id: Uuid,
    pub executor: Option<String>,
    pub name: Option<String>,
}

pub async fn get_sessions(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<SessionQuery>,
) -> Result<ResponseJson<ApiResponse<Vec<Session>>>, ApiError> {
    let pool = &deployment.db().pool;
    let sessions = Session::find_by_workspace_id(pool, query.workspace_id).await?;
    Ok(ResponseJson(ApiResponse::success(sessions)))
}

pub async fn get_session(
    Extension(session): Extension<Session>,
) -> Result<ResponseJson<ApiResponse<Session>>, ApiError> {
    Ok(ResponseJson(ApiResponse::success(session)))
}

pub async fn create_session(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateSessionRequest>,
) -> Result<ResponseJson<ApiResponse<Session>>, ApiError> {
    let pool = &deployment.db().pool;

    // Verify workspace exists
    let _workspace = Workspace::find_by_id(pool, payload.workspace_id)
        .await?
        .ok_or(ApiError::Workspace(WorkspaceError::ValidationError(
            "Workspace not found".to_string(),
        )))?;

    let session = Session::create(
        pool,
        &CreateSession {
            executor: payload.executor,
            name: payload.name,
        },
        Uuid::new_v4(),
        payload.workspace_id,
    )
    .await?;

    Ok(ResponseJson(ApiResponse::success(session)))
}

pub async fn update_session(
    Extension(session): Extension<Session>,
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<UpdateSession>,
) -> Result<ResponseJson<ApiResponse<Session>>, ApiError> {
    let pool = &deployment.db().pool;

    Session::update(pool, session.id, request.name.as_deref()).await?;

    let updated = Session::find_by_id(pool, session.id)
        .await?
        .ok_or(ApiError::Session(SessionError::NotFound))?;

    Ok(ResponseJson(ApiResponse::success(updated)))
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateFollowUpAttempt {
    pub prompt: String,
    pub executor_config: ExecutorConfig,
    pub retry_process_id: Option<Uuid>,
    pub force_when_dirty: Option<bool>,
    pub perform_git_reset: Option<bool>,
}

#[derive(Debug, Deserialize, TS)]
pub struct ResetProcessRequest {
    pub process_id: Uuid,
    pub force_when_dirty: Option<bool>,
    pub perform_git_reset: Option<bool>,
}

pub async fn follow_up(
    Extension(session): Extension<Session>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateFollowUpAttempt>,
) -> Result<ResponseJson<ApiResponse<ExecutionProcess>>, ApiError> {
    let pool = &deployment.db().pool;

    // Load workspace from session
    let workspace = Workspace::find_by_id(pool, session.workspace_id)
        .await?
        .ok_or(ApiError::Workspace(WorkspaceError::ValidationError(
            "Workspace not found".to_string(),
        )))?;

    tracing::info!("{:?}", workspace);

    deployment
        .container()
        .ensure_container_exists(&workspace)
        .await?;

    let executor_profile_id = payload.executor_config.profile_id();

    // Validate executor matches session if session has prior executions
    let expected_executor: Option<String> =
        ExecutionProcess::latest_executor_profile_for_session(pool, session.id)
            .await?
            .map(|profile| profile.executor.to_string())
            .or_else(|| session.executor.clone());

    if let Some(expected) = expected_executor {
        let actual = executor_profile_id.executor.to_string();
        if expected != actual {
            return Err(ApiError::Session(SessionError::ExecutorMismatch {
                expected,
                actual,
            }));
        }
    }

    if session.executor.is_none() {
        Session::update_executor(pool, session.id, &executor_profile_id.executor.to_string())
            .await?;
    }

    // ─────────────────────────────────────────────────────────────────
    // CURSOR_MCP fast path: there is no real coding agent process to spawn.
    // The user's reply is delivered to the in-memory cursor-mcp rendezvous
    // (resolving the front pending `wait_for_user_input` call from Cursor's
    // Composer Agent). We still ensure a single placeholder
    // execution_process exists per session so the rest of the system —
    // queue, scratch, normalized-logs WS, etc. — has something to bind to.
    // See `services::cursor_mcp` and `routes::cursor_mcp` for the full
    // protocol.
    // ─────────────────────────────────────────────────────────────────
    if matches!(executor_profile_id.executor, BaseCodingAgent::CursorMcp) {
        let prompt = payload.prompt.clone();

        // 1. Try to resolve any front-of-queue wait with this user reply.
        //    `false` return means there was no pending wait — the service
        //    still appends the message to the in-memory conversation so
        //    the UI can show it.
        let _ = deployment
            .cursor_mcp()
            .resolve_with_user_reply(session.id, prompt.clone())
            .await;

        // 2. Make sure a placeholder execution_process exists. Skip if
        //    one is already on file.
        let prior = ExecutionProcess::find_by_session_id(pool, session.id, false).await?;
        if let Some(latest) = prior.into_iter().last() {
            // Push the user message into the existing execution_process
            // MsgStore so the standard normalized-logs WS renders it.
            crate::routes::cursor_mcp::push_user_reply_to_session_msgstore(
                &deployment,
                session.id,
                &prompt,
            )
            .await;

            // Best-effort scratch cleanup mirrors the normal happy path.
            if let Err(e) = Scratch::delete(pool, session.id, &ScratchType::DraftFollowUp).await {
                tracing::debug!(
                    "Failed to delete draft follow-up scratch for cursor-mcp session {}: {}",
                    session.id,
                    e
                );
            }
            return Ok(ResponseJson(ApiResponse::success(latest)));
        }

        // First-ever follow-up: spawn the placeholder via the standard
        // start_execution flow so its execution_process and MsgStore are
        // wired into the container layer like every other agent.
        let repos = WorkspaceRepo::find_repos_for_workspace(pool, workspace.id).await?;
        let cleanup_action = deployment.container().cleanup_actions_for_repos(&repos);
        let working_dir = session
            .agent_working_dir
            .as_ref()
            .filter(|dir| !dir.is_empty())
            .cloned();
        let initial = ExecutorActionType::CodingAgentInitialRequest(
            executors::actions::coding_agent_initial::CodingAgentInitialRequest {
                prompt: prompt.clone(),
                executor_config: payload.executor_config.clone(),
                working_dir,
            },
        );
        let action = ExecutorAction::new(initial, cleanup_action.map(Box::new));
        let (exec_result, failure_ctx) = deployment
            .container()
            .start_execution_with_context(
                &workspace,
                &session,
                &action,
                &ExecutionProcessRunReason::CodingAgent,
            )
            .await;
        let execution_process = exec_result
            .map_err(|e| crate::error::map_container_err_with_context(e, failure_ctx))?;
        // Now that the execution_process and its MsgStore exist, push the
        // user reply so it shows up in the chat.
        crate::routes::cursor_mcp::push_user_reply_to_session_msgstore(
            &deployment,
            session.id,
            &prompt,
        )
        .await;
        if let Err(e) = Scratch::delete(pool, session.id, &ScratchType::DraftFollowUp).await {
            tracing::debug!(
                "Failed to delete draft follow-up scratch for cursor-mcp session {}: {}",
                session.id,
                e
            );
        }
        return Ok(ResponseJson(ApiResponse::success(execution_process)));
    }

    if let Some(proc_id) = payload.retry_process_id {
        let force_when_dirty = payload.force_when_dirty.unwrap_or(false);
        let perform_git_reset = payload.perform_git_reset.unwrap_or(true);
        deployment
            .container()
            .reset_session_to_process(session.id, proc_id, perform_git_reset, force_when_dirty)
            .await?;
    }

    let latest_session_info = CodingAgentTurn::find_latest_session_info(pool, session.id).await?;

    let prompt = payload.prompt;

    let repos = WorkspaceRepo::find_repos_for_workspace(pool, workspace.id).await?;
    let cleanup_action = deployment.container().cleanup_actions_for_repos(&repos);

    let working_dir = session
        .agent_working_dir
        .as_ref()
        .filter(|dir| !dir.is_empty())
        .cloned();

    let action_type = if let Some(info) = latest_session_info {
        let is_reset = payload.retry_process_id.is_some();
        ExecutorActionType::CodingAgentFollowUpRequest(CodingAgentFollowUpRequest {
            prompt: prompt.clone(),
            session_id: info.session_id,
            reset_to_message_id: if is_reset { info.message_id } else { None },
            executor_config: payload.executor_config.clone(),
            working_dir: working_dir.clone(),
        })
    } else {
        ExecutorActionType::CodingAgentInitialRequest(
            executors::actions::coding_agent_initial::CodingAgentInitialRequest {
                prompt,
                executor_config: payload.executor_config.clone(),
                working_dir,
            },
        )
    };

    let action = ExecutorAction::new(action_type, cleanup_action.map(Box::new));

    let (exec_result, failure_ctx) = deployment
        .container()
        .start_execution_with_context(
            &workspace,
            &session,
            &action,
            &ExecutionProcessRunReason::CodingAgent,
        )
        .await;
    let execution_process =
        exec_result.map_err(|e| crate::error::map_container_err_with_context(e, failure_ctx))?;

    // Clear the draft follow-up scratch on successful spawn
    // This ensures the scratch is wiped even if the user navigates away quickly
    if let Err(e) = Scratch::delete(pool, session.id, &ScratchType::DraftFollowUp).await {
        // Log but don't fail the request - scratch deletion is best-effort
        tracing::debug!(
            "Failed to delete draft follow-up scratch for session {}: {}",
            session.id,
            e
        );
    }

    Ok(ResponseJson(ApiResponse::success(execution_process)))
}

pub async fn reset_process(
    Extension(session): Extension<Session>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<ResetProcessRequest>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let force_when_dirty = payload.force_when_dirty.unwrap_or(false);
    let perform_git_reset = payload.perform_git_reset.unwrap_or(true);

    deployment
        .container()
        .reset_session_to_process(
            session.id,
            payload.process_id,
            perform_git_reset,
            force_when_dirty,
        )
        .await?;

    Ok(ResponseJson(ApiResponse::success(())))
}

pub async fn run_setup_script(
    Extension(session): Extension<Session>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<ExecutionProcess, RunScriptError>>, ApiError> {
    let pool = &deployment.db().pool;

    let workspace = Workspace::find_by_id(pool, session.workspace_id)
        .await?
        .ok_or(ApiError::Workspace(WorkspaceError::ValidationError(
            "Workspace not found".to_string(),
        )))?;

    if ExecutionProcess::has_running_non_dev_server_processes_for_workspace(pool, workspace.id)
        .await?
    {
        return Ok(ResponseJson(ApiResponse::error_with_data(
            RunScriptError::ProcessAlreadyRunning,
        )));
    }

    deployment
        .container()
        .ensure_container_exists(&workspace)
        .await?;

    let repos = WorkspaceRepo::find_repos_for_workspace(pool, workspace.id).await?;
    let executor_action = match deployment.container().setup_actions_for_repos(&repos) {
        Some(action) => action,
        None => {
            return Ok(ResponseJson(ApiResponse::error_with_data(
                RunScriptError::NoScriptConfigured,
            )));
        }
    };

    let execution_process = deployment
        .container()
        .start_execution(
            &workspace,
            &session,
            &executor_action,
            &ExecutionProcessRunReason::SetupScript,
        )
        .await?;

    deployment
        .track_if_analytics_allowed(
            "setup_script_executed",
            serde_json::json!({
                "workspace_id": workspace.id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(execution_process)))
}

#[derive(Debug, Deserialize, TS)]
pub struct MessagesQuery {
    #[serde(default)]
    pub last_n: Option<u32>,
    #[serde(default)]
    pub from_index: Option<u32>,
    #[serde(default)]
    pub include_thinking: Option<bool>,
}

#[derive(Debug, serde::Serialize, TS)]
pub struct SessionMessage {
    pub index: u32,
    pub entry_type: String,
    pub content: String,
    pub timestamp: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, serde::Serialize, TS)]
pub struct SessionMessagesResponse {
    pub messages: Vec<SessionMessage>,
    pub total_count: u32,
    pub has_more: bool,
    pub final_assistant_message: Option<String>,
}

/// GET /api/sessions/{session_id}/messages
///
/// Returns a paginated slice of normalized conversation entries for the latest
/// execution process on the given session. See `executors::logs::messages` for
/// the filter/pagination contract the handler delegates to.
///
/// End-to-end coverage lands in Task 2.4 via the MCP `read_session_messages`
/// tool (exercised against a running server). Unit tests for the two pure
/// helpers live at the bottom of this file; no `test_support` scaffold for
/// integration-testing a live axum app exists in the server crate yet.
pub async fn get_session_messages(
    Extension(session): Extension<Session>,
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<MessagesQuery>,
) -> Result<ResponseJson<ApiResponse<SessionMessagesResponse>>, ApiError> {
    let pool = &deployment.db().pool;

    let execution_id = ExecutionProcess::find_latest_by_session_id(pool, session.id)
        .await?
        .ok_or_else(|| ApiError::BadRequest(format!("no execution for session {}", session.id)))?
        .id;

    let container = deployment.container();
    let mut msgs: Vec<LogMsg> = Vec::new();
    if let Some(mut stream) = container.stream_normalized_logs(&execution_id).await {
        while let Some(item) = stream.next().await {
            match item {
                Ok(m) => msgs.push(m),
                Err(_) => break,
            }
        }
    }
    let entries: Vec<NormalizedEntry> = rebuild_entries(&msgs);

    let include_thinking = query.include_thinking.unwrap_or(false);
    let params = PageParams {
        last_n: query.last_n,
        from_index: query.from_index,
        include_thinking,
    };
    let page = page(&entries, &params);

    let final_msg = {
        let filtered_all: Vec<NormalizedEntry> = filter(&entries, include_thinking)
            .into_iter()
            .cloned()
            .collect();
        final_assistant_message(&filtered_all)
    };

    let messages = page
        .entries
        .iter()
        .enumerate()
        .map(|(i, e)| SessionMessage {
            index: page.start_index + i as u32,
            entry_type: entry_type_discriminant(&e.entry_type),
            content: e.content.clone(),
            timestamp: e.timestamp.clone(),
            metadata: merged_metadata(e),
        })
        .collect();

    Ok(ResponseJson(ApiResponse::success(
        SessionMessagesResponse {
            messages,
            total_count: page.total_count,
            has_more: page.has_more,
            final_assistant_message: final_msg,
        },
    )))
}

/// Serialize `NormalizedEntryType` and extract the `"type"` tag — the snake_case
/// discriminant (e.g. `"user_message"`, `"assistant_message"`, `"tool_use"`).
fn entry_type_discriminant(t: &NormalizedEntryType) -> String {
    let v = serde_json::to_value(t).unwrap_or(serde_json::Value::Null);
    v.get("type")
        .and_then(|x| x.as_str())
        .unwrap_or("unknown")
        .to_string()
}

/// Combine the variant's inner fields (stripping the `"type"` tag) with any
/// sidecar `metadata` on the entry. Returns `None` when the result would be
/// an empty object (e.g. a bare `UserMessage` with no metadata).
fn merged_metadata(entry: &NormalizedEntry) -> Option<serde_json::Value> {
    let mut combined = serde_json::Map::new();
    if let Ok(v) = serde_json::to_value(&entry.entry_type)
        && let Some(obj) = v.as_object()
    {
        for (k, v) in obj {
            if k != "type" {
                combined.insert(k.clone(), v.clone());
            }
        }
    }
    if let Some(m) = &entry.metadata
        && let Some(obj) = m.as_object()
    {
        for (k, v) in obj {
            combined.insert(k.clone(), v.clone());
        }
    }
    if combined.is_empty() {
        None
    } else {
        Some(serde_json::Value::Object(combined))
    }
}

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let session_id_router = Router::new()
        .route("/", get(get_session).put(update_session))
        .route("/follow-up", post(follow_up))
        .route("/reset", post(reset_process))
        .route("/setup", post(run_setup_script))
        .route("/review", post(review::start_review))
        .route("/messages", get(get_session_messages))
        .layer(from_fn_with_state(
            deployment.clone(),
            load_session_middleware,
        ));

    let sessions_router = Router::new()
        .route("/", get(get_sessions).post(create_session))
        .nest("/{session_id}", session_id_router)
        .nest("/{session_id}/queue", queue::router(deployment));

    Router::new().nest("/sessions", sessions_router)
}

#[cfg(test)]
mod tests {
    use executors::logs::{NormalizedEntry, NormalizedEntryType};

    use super::*;

    fn mk(t: NormalizedEntryType, content: &str) -> NormalizedEntry {
        NormalizedEntry {
            timestamp: None,
            entry_type: t,
            content: content.into(),
            metadata: None,
        }
    }

    #[test]
    fn entry_type_discriminant_matches_serde_tag() {
        assert_eq!(
            entry_type_discriminant(&NormalizedEntryType::UserMessage),
            "user_message"
        );
        assert_eq!(
            entry_type_discriminant(&NormalizedEntryType::AssistantMessage),
            "assistant_message"
        );
        assert_eq!(
            entry_type_discriminant(&NormalizedEntryType::Thinking),
            "thinking"
        );
    }

    #[test]
    fn merged_metadata_none_when_bare_user_message() {
        let e = mk(NormalizedEntryType::UserMessage, "hi");
        assert!(merged_metadata(&e).is_none());
    }

    #[test]
    fn merged_metadata_includes_variant_inner_fields() {
        let e = mk(
            NormalizedEntryType::UserFeedback {
                denied_tool: "fs_write".into(),
            },
            "denied",
        );
        let meta = merged_metadata(&e).expect("UserFeedback has inner field");
        assert_eq!(
            meta.get("denied_tool").and_then(|v| v.as_str()),
            Some("fs_write")
        );
        assert!(meta.get("type").is_none()); // "type" tag stripped
    }

    #[test]
    fn merged_metadata_merges_variant_and_metadata_fields() {
        let mut e = mk(
            NormalizedEntryType::UserFeedback {
                denied_tool: "fs_write".into(),
            },
            "denied",
        );
        e.metadata = Some(serde_json::json!({ "extra": "info" }));
        let meta = merged_metadata(&e).unwrap();
        assert_eq!(
            meta.get("denied_tool").and_then(|v| v.as_str()),
            Some("fs_write")
        );
        assert_eq!(meta.get("extra").and_then(|v| v.as_str()), Some("info"));
    }
}
